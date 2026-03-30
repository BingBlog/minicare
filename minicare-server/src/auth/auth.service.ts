import {
  BadRequestException,
  Inject,
  Injectable,
  InternalServerErrorException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Pool } from 'mysql2/promise';
import { DATABASE_POOL } from '../common/database/database.module';
import { CLOUDBASE_APP } from '../common/cloudbase/cloudbase.module';

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
  async verifyCode(phone: string, code: string): Promise<{ token: string; user: UserProfile }> {
    if (!this.isTestMode) {
      throw new BadRequestException('请使用前端 SDK 完成验证，再调用 /api/auth/tcb-login');
    }
    if (code !== '123456') {
      throw new UnauthorizedException('验证码错误（测试模式固定为 123456）');
    }
    console.log(`[Auth] TEST MODE: verifyCode passed for ${phone}`);
    return this.findOrCreateUser(phone);
  }

  /**
   * CloudBase Token 登录
   *
   * 流程（生产模式）：
   * 1. 前端用 @cloudbase/js-sdk 完成短信验证码发送 + 登录
   * 2. 前端拿到 session.access_token 发到此接口
   * 3. 后端用 Node SDK queryUserInfo 验证 token 有效性，取出手机号
   * 4. 查/创 user_account，颁发自定义 JWT
   */
  async tcbLogin(accessToken: string): Promise<{ token: string; user: UserProfile }> {
    // 用 CloudBase HTTP API 验证 access_token，获取用户信息（含手机号）
    let phone = '';
    try {
      const envId = process.env.TCB_ENV_ID!;
      const apiUrl = `https://${envId}.api.tcloudbasegateway.com/v1/auth/users/me`;
      // Node.js 18+ 内置 fetch
      const resp = await fetch(apiUrl, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!resp.ok) {
        const body = await resp.text();
        console.error('[Auth] tcbLogin: HTTP API 验证失败', resp.status, body);
        throw new UnauthorizedException('CloudBase Token 无效');
      }
      const data = await resp.json() as any;
      // 响应结构：{ data: { user: { phone, uid, ... } } }
      const tcbUser = data?.data?.user ?? data?.user ?? data;
      phone = tcbUser?.phone ?? tcbUser?.phone_number;
      if (!phone) {
        console.error('[Auth] tcbLogin: 未获取到手机号', JSON.stringify(data));
        throw new BadRequestException('无法获取手机号，请确认已绑定手机号');
      }
      // 去除区号前缀，如 +8613800000000 → 13800000000
      phone = phone.replace(/^\+?86/, '');
    } catch (err: any) {
      if (err instanceof UnauthorizedException || err instanceof BadRequestException) throw err;
      console.error('[Auth] tcbLogin error:', err);
      throw new InternalServerErrorException('登录验证失败，请重试');
    }

    return this.findOrCreateUser(phone);
  }

  /** 查找或创建 user_account，颁发 JWT */
  private async findOrCreateUser(phone: string): Promise<{ token: string; user: UserProfile }> {
    const conn = await this.db.getConnection();
    try {
      const [rows] = await conn.execute<any[]>(
        'SELECT id, phone, nickname, avatar_url FROM user_account WHERE phone = ?',
        [phone],
      );

      let user: UserProfile;
      if (rows.length > 0) {
        user = rows[0] as UserProfile;
      } else {
        // 首次登录：自动注册（id 为 char(36)，需手动传入 UUID）
        const { v4: uuidv4 } = await import('uuid');
        await conn.execute(
          'INSERT INTO user_account (id, phone, nickname) VALUES (?, ?, ?)',
          [uuidv4(), phone, `用户_${phone.slice(-4)}`],
        );
        const [newRows] = await conn.execute<any[]>(
          'SELECT id, phone, nickname, avatar_url FROM user_account WHERE phone = ?',
          [phone],
        );
        if (newRows.length === 0) {
          throw new InternalServerErrorException('用户创建失败');
        }
        user = newRows[0] as UserProfile;
      }

      // 颁发 JWT（有效期 30 天）
      const token = await this.jwtService.signAsync(
        { sub: user.id },
        { expiresIn: '30d', secret: process.env.JWT_SECRET },
      );

      return { token, user };
    } finally {
      conn.release();
    }
  }

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
}

export interface UserProfile {
  id: string;
  phone: string;
  nickname: string;
  avatar_url: string | null;
}
