import { Controller, Post, Body, UseGuards, Request, Headers } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiResponse } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { Public } from '../common/decorators/public.decorator';
import { RegisterDto } from './dto/register.dto';
import { RegisterGuestDto } from './dto/register-guest.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { ChangePasswordDto } from './dto/change-password.dto';

@ApiTags('auth')
@Controller({ path: 'auth', version: '1' })
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  @Public()
  @ApiOperation({ summary: 'Register a new user account' })
  @ApiResponse({ status: 201, description: 'User registered' })
  async register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Post('register/guest')
  @Public()
  @ApiOperation({ summary: 'Create a short-lived guest reporter account' })
  async registerGuest(@Body() dto: RegisterGuestDto) {
    return this.authService.registerGuest(dto);
  }

  @Post('login')
  @Public()
  @UseGuards(AuthGuard('local'))
  @ApiOperation({ summary: 'Login with email/password' })
  async login(@Request() req: any) {
    return this.authService.login(req.user);
  }

  @Post('login/phone')
  @Public()
  @ApiOperation({ summary: 'Login with phone number and OTP' })
  async loginPhone(@Body() _dto: import('./dto/login-phone.dto').LoginPhoneDto) {
    // Phone/OTP login shares the OTP verification pipeline; kept minimal here.
    return { message: 'Phone login not yet enabled' };
  }

  @Post('refresh')
  @Public()
  @ApiOperation({ summary: 'Rotate access + refresh tokens' })
  async refresh(@Body() dto: RefreshTokenDto) {
    return this.authService.refreshToken(dto.refreshToken);
  }

  @Post('logout')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Revoke current session' })
  async logout(@Request() req: any, @Headers('authorization') auth?: string) {
    const token = auth?.replace('Bearer ', '');
    return this.authService.logout(req.user.id, token);
  }

  @Post('verify/email')
  @Public()
  @ApiOperation({ summary: 'Verify email with OTP' })
  async verifyEmail(@Body() dto: VerifyOtpDto) {
    return this.authService.verifyOtp({ ...dto, type: 'EMAIL' });
  }

  @Post('verify/phone')
  @Public()
  @ApiOperation({ summary: 'Verify phone with OTP' })
  async verifyPhone(@Body() dto: VerifyOtpDto) {
    return this.authService.verifyOtp({ ...dto, type: 'PHONE' });
  }

  @Post('forgot-password')
  @Public()
  @ApiOperation({ summary: 'Request a password reset token' })
  async forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.authService.forgotPassword(dto);
  }

  @Post('reset-password')
  @Public()
  @ApiOperation({ summary: 'Reset password with token' })
  async resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto);
  }

  @Post('change-password')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Change password (authenticated)' })
  async changePassword(@Request() req: any, @Body() dto: ChangePasswordDto) {
    return this.authService.changePassword(req.user.id, dto);
  }
}
