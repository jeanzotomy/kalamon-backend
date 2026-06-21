import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { FastifyRequest } from 'fastify';
import { env } from '../../config/env';
import { AuthUser } from '../decorators/current-user.decorator';

// Lit le JWT depuis le cookie httpOnly (PAS depuis localStorage).
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly jwt: JwtService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context
      .switchToHttp()
      .getRequest<
        FastifyRequest & {
          cookies?: Record<string, string>;
          headers: Record<string, string | undefined>;
          user?: AuthUser;
        }
      >();

    // Web : cookie httpOnly. Mobile (Expo) : Authorization: Bearer <token>.
    const authHeader = req.headers['authorization'];
    const bearer =
      authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7) : undefined;
    const token = bearer ?? req.cookies?.[env.COOKIE_NAME];
    if (!token) {
      throw new UnauthorizedException('Non authentifié');
    }

    try {
      const payload = await this.jwt.verifyAsync<AuthUser>(token);
      // Invariant multi-tenant : tout endpoint dérive l'orgId du token, jamais du body.
      req.user = {
        userId: payload.userId,
        organizationId: payload.organizationId,
        role: payload.role,
      };
      return true;
    } catch {
      throw new UnauthorizedException('Session invalide');
    }
  }
}
