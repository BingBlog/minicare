import {
  BadRequestException,
  Inject,
  Injectable,
  InternalServerErrorException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Pool } from 'mysql2/promise';
import * as bcrypt from 'bcryptjs';
import { DATABASE_POOL } from '../common/database/database.module';
import { CLOUDBASE_APP } from '../common/cloudbase/cloudbase.module';
import { PhoneProofDto } from './dto/phone-proof.dto';
import { SetPasswordDto } from './dto/set-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';

/** bcrypt 代价因子。纯 JS 实现 cost=10 约 100ms；成为瓶颈时可换 @node-rs/bcrypt */
const BCRYPT_ROUNDS = 10;

/** 连续密码错误达到该次数后锁定密码登录 */
const PWD_MAX_FAILS = 5;
/** 密码登录锁定时长（分钟）。**只作用于密码登录端点**，不影响验证码登录 */
const PWD_LOCK_MINUTES = 10;
/** 短信验证「新鲜」窗口（分钟）：窗口内设置/重置密码可免二次验证码 */
const SMS_FRESH_MINUTES = 10;

/** 密码错误统一文案（不区分「手机号不存在」与「密码错误」，避免账号枚举） */
const PWD_WRONG_MSG = '手机号或密码错误';

/** 未设置密码的错误码，前端据此自动切回验证码 Tab */
export const NO_PASSWORD_SET = 'NO_PASSWORD_SET';

export interface AuthResult {
  token: string;
  user: UserProfile;
  isNewUser: boolean;
  activatedFamilyIds: string[];
}

export interface PasswordStatus {
  hasPassword: boolean;
  passwordUpdatedAt: string | null;
  smsVerifiedRecently: boolean;
}

@Injectable()
export class AuthService {
  constructor(
    @Inject(DATABASE_POOL) private readonly db: Pool,
    @Inject(CLOUDBASE_APP) private readonly tcb: any,
    private readonly jwtService: JwtService,
  ) {}

  /** 测试模式：AUTH_TEST_MODE=true 时跳过短信，固定验证码 123456 */
  private get isTestMode(): boolean {
    return process.env.AUTH_TEST_MODE === 'true';
  }

  // ─────────────────────────────────────────────────────────────
  // 验证码登录（原有链路）
  // ─────────────────────────────────────────────────────────────

  /**
   * 发送 SMS 验证码（仅测试模式使用）
   * 生产模式：短信验证码由前端 CloudBase JS SDK 直接发送，不经过后端
   */
  async sendCode(phone: string): Promise<void> {
    if (!this.isTestMode) {
      throw new BadRequestException('请使用前端 SDK 发送验证码');
    }
    console.log(`[Auth] TEST MODE: sendCode to ${phone}, use code 123456`);
  }

  /**
   * 验证 OTP 并颁发 JWT（仅测试模式使用）
   * 生产模式：请使用 tcbLogin 接口（前端 SDK 完成验证后传 access_token）
   */
  async verifyCode(phone: string, code: string): Promise<AuthResult> {
    if (!this.isTestMode) {
      throw new BadRequestException('请使用前端 SDK 完成验证，再调用 /api/auth/tcb-login');
    }
    if (code !== '123456') {
      throw new UnauthorizedException('验证码错误（测试模式固定为 123456）');
    }
    console.log(`[Auth] TEST MODE: verifyCode passed for ${phone}`);
    const result = await this.findOrCreateUser(phone);
    // 记录「最近一次短信验证通过时间」：10min 内设置/重置密码可免二次验证码
    await this.markSmsVerified(result.user.id);
    return result;
  }

  /**
   * CloudBase Token 登录
   *
   * 流程（生产模式）：
   * 1. 前端用 @cloudbase/js-sdk 完成短信验证码发送 + 登录
   * 2. 前端拿到 session.access_token 发到此接口
   * 3. 后端调 CloudBase 验证 token 有效性，取出手机号
   * 4. 查/创 user_account，颁发自定义 JWT
   *
   * 注：`activatedFamilyIds` 恒为空数组（历史缺口，见 TECH-016 §0）。
   *     登录后是否进引导页由前端 `babyApi.getMine()` + `familyApi.getPendingInvites()` 决定。
   */
  async tcbLogin(accessToken: string): Promise<AuthResult> {
    let phone = '';
    try {
      phone = await this.verifyTcbToken(accessToken);
    } catch (err: any) {
      if (err instanceof UnauthorizedException || err instanceof BadRequestException) throw err;
      console.error('[Auth] tcbLogin error:', err);
      throw new InternalServerErrorException('登录验证失败，请重试');
    }

    const result = await this.findOrCreateUser(phone);
    await this.markSmsVerified(result.user.id);
    return result;
  }

  // ─────────────────────────────────────────────────────────────
  // 密码登录（TECH-016）
  // ─────────────────────────────────────────────────────────────

  /**
   * 手机号 + 密码登录（公开接口）
   *
   * 返回体与 verify-code / tcb-login **完全同构**，使前端可复用同一段登录后跳转逻辑。
   * 密码登录不承担注册：`password_hash IS NULL` 的账号一律拒绝并给出专属错误码。
   */
  async loginByPassword(phone: string, password: string): Promise<AuthResult> {
    const [rows] = await this.db.execute<any[]>(
      `SELECT id, phone, nickname, avatar_url, password_hash, token_version,
              pwd_fail_count,
              (pwd_locked_until IS NOT NULL AND pwd_locked_until > NOW()) AS locked
         FROM user_account
        WHERE phone = ?`,
      [phone],
    );

    // 手机号不存在 → 与密码错误同一文案，避免账号枚举
    if (!rows || rows.length === 0) {
      throw new UnauthorizedException(PWD_WRONG_MSG);
    }

    const row = rows[0];

    if (row.locked) {
      throw new UnauthorizedException(
        `密码错误次数过多，请 ${PWD_LOCK_MINUTES} 分钟后再试，或改用验证码登录`,
      );
    }

    // 未设置密码 → 明确提示（前端据此自动切回验证码 Tab）
    if (!row.password_hash) {
      throw new BadRequestException({
        statusCode: 400,
        code: NO_PASSWORD_SET,
        message: '该账号未设置密码，请使用验证码登录',
      });
    }

    const matched = await bcrypt.compare(password, String(row.password_hash));

    if (!matched) {
      const fails = Number(row.pwd_fail_count ?? 0) + 1;
      if (fails >= PWD_MAX_FAILS) {
        await this.db.execute(
          `UPDATE user_account
              SET pwd_fail_count = ?, pwd_locked_until = DATE_ADD(NOW(), INTERVAL ? MINUTE)
            WHERE id = ?`,
          [fails, PWD_LOCK_MINUTES, row.id],
        );
        console.warn(`[Auth] password login locked for user ${row.id} after ${fails} fails`);
        throw new UnauthorizedException(
          `密码错误次数过多，账号已锁定 ${PWD_LOCK_MINUTES} 分钟，请改用验证码登录`,
        );
      }
      await this.db.execute('UPDATE user_account SET pwd_fail_count = ? WHERE id = ?', [
        fails,
        row.id,
      ]);
      throw new UnauthorizedException(
        `${PWD_WRONG_MSG}（还可尝试 ${PWD_MAX_FAILS - fails} 次）`,
      );
    }

    // 成功：清零失败计数与锁定
    await this.db.execute(
      'UPDATE user_account SET pwd_fail_count = 0, pwd_locked_until = NULL WHERE id = ?',
      [row.id],
    );

    const user = this.toProfile(row);
    const token = await this.issueToken(user.id, Number(row.token_version ?? 0));
    return { token, user, isNewUser: false, activatedFamilyIds: [] };
  }

  /** 密码状态（需 JwtGuard）—— 供「我的 → 账号与安全」决定展示「设置密码」还是「修改密码」 */
  async getPasswordStatus(userId: string): Promise<PasswordStatus> {
    const [rows] = await this.db.execute<any[]>(
      `SELECT (password_hash IS NOT NULL) AS has_password,
              password_updated_at,
              (sms_verified_at IS NOT NULL
               AND sms_verified_at > DATE_SUB(NOW(), INTERVAL ? MINUTE)) AS sms_fresh
         FROM user_account
        WHERE id = ?`,
      [SMS_FRESH_MINUTES, userId],
    );
    if (!rows || rows.length === 0) throw new UnauthorizedException('用户不存在');

    const row = rows[0];
    return {
      hasPassword: !!row.has_password,
      passwordUpdatedAt: row.password_updated_at ?? null,
      smsVerifiedRecently: !!row.sms_fresh,
    };
  }

  /**
   * 设置 / 修改密码（需 JwtGuard）
   *
   * 放行矩阵见 `dto/set-password.dto.ts`：
   *   ① 已设置密码且 currentPassword 正确
   *   ② phoneProof 通过（test: code 123456 / sms: CloudBase accessToken）
   *   ③ 最近 10 分钟内做过短信验证（免二次验证码）
   *
   * 🚨 必须返回新签发的 token —— `token_version` 已 +1，当前设备手上的 token 也失效了。
   */
  async setOrChangePassword(
    userId: string,
    dto: SetPasswordDto,
  ): Promise<{ ok: true; token: string; user: UserProfile }> {
    const [rows] = await this.db.execute<any[]>(
      `SELECT id, phone, nickname, avatar_url, password_hash, token_version,
              (sms_verified_at IS NOT NULL
               AND sms_verified_at > DATE_SUB(NOW(), INTERVAL ? MINUTE)) AS sms_fresh
         FROM user_account
        WHERE id = ?`,
      [SMS_FRESH_MINUTES, userId],
    );
    if (!rows || rows.length === 0) throw new UnauthorizedException('用户不存在');

    const row = rows[0];
    const hasPassword = !!row.password_hash;
    let allowed = false;

    // ① 原密码正确
    if (hasPassword && dto.currentPassword) {
      allowed = await bcrypt.compare(dto.currentPassword, String(row.password_hash));
    }

    // ② 手机所有权凭证（失败直接抛 401）
    if (!allowed && (dto.code || dto.accessToken)) {
      await this.assertPhoneProof(row.phone, dto);
      allowed = true;
    }

    // ③ 最近 10 分钟内做过短信验证
    if (!allowed && row.sms_fresh) {
      allowed = true;
    }

    if (!allowed) {
      throw new UnauthorizedException(
        hasPassword ? '原密码错误，请重新输入或改用验证码验证' : '请先通过短信验证码验证',
      );
    }

    // 新旧密码相同 → 拒绝（避免"改了个寂寞"）
    if (hasPassword && (await bcrypt.compare(dto.newPassword, String(row.password_hash)))) {
      throw new BadRequestException('新密码不能与原密码相同');
    }

    const hash = await bcrypt.hash(dto.newPassword, BCRYPT_ROUNDS);
    const nextVersion = Number(row.token_version ?? 0) + 1;
    await this.db.execute(
      `UPDATE user_account
          SET password_hash = ?, password_updated_at = NOW(),
              pwd_fail_count = 0, pwd_locked_until = NULL,
              token_version = ?
        WHERE id = ?`,
      [hash, nextVersion, userId],
    );

    const user = this.toProfile(row);
    console.log(
      `[Auth] password ${hasPassword ? 'changed' : 'set'} for user ${userId}, token_version → ${nextVersion}`,
    );
    const token = await this.issueToken(userId, nextVersion);
    return { ok: true, token, user };
  }

  /**
   * 忘记密码 · 重置（公开接口）
   *
   * 顺序很关键：**先验凭证、再看账号是否存在**。
   * 否则未持有手机的人可用「该手机号尚未注册」这条提示枚举已注册手机号；
   * 通过凭证校验即已证明手机所有权，此时再告知注册状态无信息泄露风险。
   */
  async resetPassword(
    dto: ResetPasswordDto,
  ): Promise<{ ok: true; token: string; user: UserProfile }> {
    await this.assertPhoneProof(dto.phone, dto);

    const [rows] = await this.db.execute<any[]>(
      'SELECT id, phone, nickname, avatar_url, token_version FROM user_account WHERE phone = ?',
      [dto.phone],
    );
    if (!rows || rows.length === 0) {
      throw new BadRequestException('该手机号尚未注册，请使用验证码登录');
    }

    const row = rows[0];
    const hash = await bcrypt.hash(dto.newPassword, BCRYPT_ROUNDS);
    const nextVersion = Number(row.token_version ?? 0) + 1;
    await this.db.execute(
      `UPDATE user_account
          SET password_hash = ?, password_updated_at = NOW(),
              sms_verified_at = NOW(),
              pwd_fail_count = 0, pwd_locked_until = NULL,
              token_version = ?
        WHERE id = ?`,
      [hash, nextVersion, row.id],
    );

    const user = this.toProfile(row);
    console.log(`[Auth] password reset for user ${row.id}, token_version → ${nextVersion}`);
    const token = await this.issueToken(row.id, nextVersion);
    return { ok: true, token, user };
  }

  // ─────────────────────────────────────────────────────────────
  // 用户档案
  // ─────────────────────────────────────────────────────────────

  /**
   * 获取当前用户信息
   */
  async getProfile(userId: string): Promise<UserProfile> {
    const [rows] = await this.db.execute<any[]>(
      'SELECT id, phone, nickname, avatar_url FROM user_account WHERE id = ?',
      [userId],
    );
    if (rows.length === 0) throw new UnauthorizedException('用户不存在');
    return rows[0] as UserProfile;
  }

  // ─────────────────────────────────────────────────────────────
  // 私有工具
  // ─────────────────────────────────────────────────────────────

  /**
   * 用 CloudBase access_token 换取手机号
   *
   * 由 tcbLogin 与 assertPhoneProof 共用 —— 避免"两处实现、一处先腐烂"。
   */
  private async verifyTcbToken(accessToken: string): Promise<string> {
    const envId = process.env.TCB_ENV_ID!;
    // CloudBase JS SDK v2 颁发的 access_token 需通过以下地址验证
    // 响应格式：{ sub, name, phone_number, user_id, ... }
    const apiUrl = `https://${envId}.ap-shanghai.tcb-api.tencentcloudapi.com/auth/v1/user/me`;
    const resp = await fetch(apiUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!resp.ok) {
      const body = await resp.text();
      console.error('[Auth] verifyTcbToken: HTTP API 验证失败', resp.status, body);
      throw new UnauthorizedException('CloudBase Token 无效');
    }
    const data = (await resp.json()) as any;
    // 响应直接是用户对象，phone_number 格式为 "+86 13146989718"
    const raw = data?.phone_number ?? data?.phone;
    if (!raw) {
      console.error('[Auth] verifyTcbToken: 未获取到手机号', JSON.stringify(data));
      throw new BadRequestException('无法获取手机号，请确认已绑定手机号');
    }
    // 去除区号前缀及空格，如 "+86 13146989718" → "13146989718"
    return String(raw).replace(/^\+?86\s*/, '');
  }

  /**
   * 断言请求方持有该手机号的所有权（phoneProof）
   *
   * - test 模式：`code === '123456'`（与 verify-code 测试模式一致），手机号以请求体为准
   * - sms 模式 ：CloudBase accessToken 换回手机号，并**断言与请求体 phone 一致**
   *              （防止拿 A 的 token 去改 B 的密码）
   */
  private async assertPhoneProof(phone: string, proof: PhoneProofDto): Promise<void> {
    if (this.isTestMode) {
      if (proof?.code !== '123456') {
        throw new UnauthorizedException('验证码错误或已过期');
      }
      return;
    }

    if (!proof?.accessToken) {
      throw new UnauthorizedException('验证码错误或已过期');
    }

    let provedPhone: string;
    try {
      provedPhone = await this.verifyTcbToken(proof.accessToken);
    } catch (err: any) {
      if (err instanceof UnauthorizedException || err instanceof BadRequestException) throw err;
      console.error('[Auth] assertPhoneProof error:', err);
      throw new InternalServerErrorException('验证失败，请重试');
    }

    if (provedPhone !== phone) {
      console.warn('[Auth] assertPhoneProof: 凭证手机号与请求手机号不一致');
      throw new UnauthorizedException('验证凭证与手机号不匹配');
    }
  }

  /** 记录「最近一次短信验证通过时间」（verify-code / tcb-login 成功后调用） */
  private async markSmsVerified(userId: string): Promise<void> {
    try {
      await this.db.execute('UPDATE user_account SET sms_verified_at = NOW() WHERE id = ?', [
        userId,
      ]);
    } catch (err) {
      // 该字段只影响"能否免二次验证码"，写入失败不应阻断登录
      console.warn('[Auth] markSmsVerified failed:', err);
    }
  }

  /** 签发 JWT（payload 增加 tv = token_version，用于改密后失效旧 token） */
  private async issueToken(userId: string, tokenVersion: number): Promise<string> {
    return this.jwtService.signAsync(
      { sub: userId, tv: tokenVersion },
      { expiresIn: '30d', secret: process.env.JWT_SECRET },
    );
  }

  /** DB 行 → 对外用户结构（避免把 password_hash / token_version 泄漏给前端） */
  private toProfile(row: any): UserProfile {
    return {
      id: row.id,
      phone: row.phone,
      nickname: row.nickname,
      avatar_url: row.avatar_url ?? null,
    };
  }

  /**
   * 查找或创建 user_account，颁发 JWT
   */
  private async findOrCreateUser(phone: string): Promise<AuthResult> {
    const conn = await this.db.getConnection();
    try {
      const [rows] = await conn.execute<any[]>(
        'SELECT id, phone, nickname, avatar_url, token_version FROM user_account WHERE phone = ?',
        [phone],
      );

      let user: UserProfile;
      let isNewUser = false;
      let tokenVersion = 0;

      if (rows.length > 0) {
        user = rows[0] as UserProfile;
        tokenVersion = Number(rows[0].token_version ?? 0);
      } else {
        isNewUser = true;
        const { v4: uuidv4 } = await import('uuid');
        await conn.execute(
          'INSERT INTO user_account (id, phone, nickname) VALUES (?, ?, ?)',
          [uuidv4(), phone, `用户_${phone.slice(-4)}`],
        );
        const [newRows] = await conn.execute<any[]>(
          'SELECT id, phone, nickname, avatar_url, token_version FROM user_account WHERE phone = ?',
          [phone],
        );
        if (newRows.length === 0) {
          throw new InternalServerErrorException('用户创建失败');
        }
        user = newRows[0] as UserProfile;
        tokenVersion = Number(newRows[0].token_version ?? 0);
      }

      const token = await this.issueToken(user.id, tokenVersion);

      return { token, user, isNewUser, activatedFamilyIds: [] };
    } finally {
      conn.release();
    }
  }
}

export interface UserProfile {
  id: string;
  phone: string;
  nickname: string;
  avatar_url: string | null;
}
