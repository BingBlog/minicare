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
