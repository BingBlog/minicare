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

  /**
   * 发送 SMS 验证码
   * 通过 CloudBase Auth OTP API 向指定手机号发送 6 位验证码
   */
  async sendCode(phone: string): Promise<void> {
    try {
      await this.tcb.auth().sendPhoneCode(phone);
    } catch (err: any) {
      console.error('[Auth] sendCode error:', err);
      throw new InternalServerErrorException('短信发送失败，请稍后重试');
    }
  }

  /**
   * 验证 OTP 并颁发 JWT
   *
   * 流程：
   * 1. 调用 CloudBase Auth 验证验证码
   * 2. 查找或创建 user_account 记录
   * 3. 颁发 JWT（有效期 30 天）
   */
  async verifyCode(phone: string, code: string): Promise<{ token: string; user: UserProfile }> {
    // ① 验证 OTP
    let tcbUser: any;
    try {
      tcbUser = await this.tcb.auth().verifyPhoneCode({ phone, code });
    } catch (err: any) {
      console.error('[Auth] verifyCode OTP error:', err);
      throw new UnauthorizedException('验证码错误或已过期');
    }

    if (!tcbUser?.uid) {
      throw new BadRequestException('验证失败');
    }

    // ② 查/创 user_account
    const conn = await this.db.getConnection();
    try {
      const [rows] = await conn.execute<any[]>(
        'SELECT id, phone, name, avatar_url FROM user_account WHERE phone = ?',
        [phone],
      );

      let user: UserProfile;
      if (rows.length > 0) {
        user = rows[0] as UserProfile;
      } else {
        // 首次登录：自动注册
        const [result] = await conn.execute(
          'INSERT INTO user_account (phone, name) VALUES (?, ?)',
          [phone, `用户_${phone.slice(-4)}`],
        );
        const insertId = (result as any).insertId;
        // UUID 主键，需要回查
        const [newRows] = await conn.execute<any[]>(
          'SELECT id, phone, name, avatar_url FROM user_account WHERE id = LAST_INSERT_ID() OR phone = ?',
          [phone],
        );
        user = (newRows[0] ?? { id: String(insertId), phone, name: `用户_${phone.slice(-4)}`, avatar_url: null }) as UserProfile;
      }

      // ③ 颁发 JWT
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
      'SELECT id, phone, name, avatar_url FROM user_account WHERE id = ?',
      [userId],
    );
    if (rows.length === 0) throw new UnauthorizedException('用户不存在');
    return rows[0] as UserProfile;
  }
}

export interface UserProfile {
  id: string;
  phone: string;
  name: string;
  avatar_url: string | null;
}
