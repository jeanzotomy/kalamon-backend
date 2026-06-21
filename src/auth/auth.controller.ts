import { Body, Controller, Post, Get, Res, HttpCode, UseGuards } from '@nestjs/common';
import { FastifyReply } from 'fastify';
import { ApiTags } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { RegisterSchema, LoginSchema } from './dto/auth.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser, AuthUser } from '../common/decorators/current-user.decorator';
import { env } from '../config/env';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  // token renvoyé pour le mobile (Bearer/SecureStore) ; cookie posé pour le web.
  @Post('register')
  async register(
    @Body() body: unknown,
    @Res({ passthrough: true }) res: FastifyReply,
  ): Promise<{ userId: string; token: string }> {
    const input = RegisterSchema.parse(body);
    const { token, userId } = await this.auth.register(input);
    this.setCookie(res, token);
    return { userId, token };
  }

  @Post('login')
  @HttpCode(200)
  async login(
    @Body() body: unknown,
    @Res({ passthrough: true }) res: FastifyReply,
  ): Promise<{ userId: string; token: string }> {
    const input = LoginSchema.parse(body);
    const { token, userId } = await this.auth.login(input);
    this.setCookie(res, token);
    return { userId, token };
  }

  // Restauration de session (mobile au démarrage, web au refresh).
  @UseGuards(JwtAuthGuard)
  @Get('me')
  me(@CurrentUser() user: AuthUser) {
    return this.auth.me(user.organizationId, user.userId);
  }

  @Post('logout')
  @HttpCode(200)
  logout(@Res({ passthrough: true }) res: FastifyReply): { ok: boolean } {
    res.clearCookie(env.COOKIE_NAME, { path: '/' });
    return { ok: true };
  }

  // Le token est TOUJOURS posé en cookie httpOnly (jamais renvoyé dans le body).
  private setCookie(res: FastifyReply, token: string): void {
    res.setCookie(env.COOKIE_NAME, token, {
      httpOnly: true,
      secure: env.COOKIE_SECURE,
      sameSite: 'lax',
      path: '/',
    });
  }
}
