import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { FastifyRequest } from 'fastify';

export interface AuthUser {
  userId: string;
  organizationId: string;
  role: string;
}

// Récupère l'utilisateur authentifié injecté par JwtAuthGuard.
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthUser => {
    const req = ctx.switchToHttp().getRequest<FastifyRequest & { user: AuthUser }>();
    return req.user;
  },
);
