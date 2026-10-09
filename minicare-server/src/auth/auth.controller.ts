import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { IsString, IsNotEmpty } from 'class-validator';
import { AuthService } from './auth.service';
import { JwtGuard } from './jwt.guard';
import { SendCodeDto } from './dto/send-code.dto';
import { VerifyCodeDto } from './dto/verify-code.dto';
import { LoginByPasswordDto } from './dto/login-by-password.dto';
import { SetPasswordDto } from './dto/set-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { CurrentUser } from '../common/decorators/current-user.decorator';

class TcbLoginDto {
  @IsString()
  @IsNotEmpty()
  accessToken!: string;
}

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  /**
   * POST /auth/send-code
   * 向手机号发送 6 位 SMS 验证码
   */
  @Post('send-code')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '发送短信验证码' })
  async sendCode(@Body() dto: SendCodeDto) {
    await this.authService.sendCode(dto.phone);
    return { message: '验证码已发送' };
  }

  /**
   * POST /auth/verify-code
   * 验证 OTP，返回 JWT token 和用户信息
   */
  @Post('verify-code')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '验证短信验证码，完成登录/注册' })
  async verifyCode(@Body() dto: VerifyCodeDto) {
    return this.authService.verifyCode(dto.phone, dto.code);
  }

  /**
   * POST /auth/tcb-login
   * 前端 SDK 完成短信登录后，传 CloudBase access_token，换取自定义 JWT
   */
  @Post('tcb-login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '使用 CloudBase Token 登录，换取自定义 JWT' })
  async tcbLogin(@Body() dto: TcbLoginDto) {
    return this.authService.tcbLogin(dto.accessToken);
  }

  /**
   * POST /auth/login-by-password
   * 手机号 + 密码登录（不承担注册；未设置密码的账号会被拒绝并返回 code=NO_PASSWORD_SET）
   *
   * 返回体与 /auth/verify-code 完全同构，前端可复用同一段登录后跳转逻辑。
   */
  @Post('login-by-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '手机号 + 密码登录' })
  async loginByPassword(@Body() dto: LoginByPasswordDto) {
    return this.authService.loginByPassword(dto.phone, dto.password);
  }

  /**
   * GET /auth/password-status
   * 查询当前账号是否已设置密码，供「我的 → 账号与安全」决定展示「设置密码」还是「修改密码」
   */
  @Get('password-status')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '查询当前账号密码状态' })
  async passwordStatus(@CurrentUser() userId: string) {
    return this.authService.getPasswordStatus(userId);
  }

  /**
   * POST /auth/password
   * 设置 / 修改密码（需登录）
   *
   * 放行条件（满足其一）：① 原密码正确 ② phoneProof 通过 ③ 10 分钟内短信验证过
   *
   * ⚠️ 会返回新签发的 token：改密使 token_version +1，当前设备手上的 token 同步失效。
   */
  @Post('password')
  @UseGuards(JwtGuard)
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: '设置 / 修改密码' })
  async setPassword(@CurrentUser() userId: string, @Body() dto: SetPasswordDto) {
    return this.authService.setOrChangePassword(userId, dto);
  }

  /**
   * POST /auth/reset-password
   * 忘记密码 · 重置（公开，无需登录）
   *
   * 成功后 token_version +1（踢掉该账号所有旧会话）并直接下发新 token 自动登录。
   */
  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '忘记密码 · 通过短信验证码重置密码' })
  async resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto);
  }

  /**
   * GET /auth/me
   * 获取当前登录用户信息（需要 JWT）
   */
  @Get('me')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '获取当前用户信息' })
  async getMe(@CurrentUser() userId: string) {
    return this.authService.getProfile(userId);
  }
}
