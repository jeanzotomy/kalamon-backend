import {
  ConflictException,
  Injectable,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { PrismaService } from '../prisma/prisma.service';
import { RegisterInput, LoginInput } from './dto/auth.dto';
import { Role } from '@prisma/client';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  async register(input: RegisterInput): Promise<{ token: string; userId: string }> {
    const exists = await this.prisma.user.findFirst({
      where: { organizationId: input.organizationId, email: input.email, deletedAt: null },
    });
    if (exists) throw new ConflictException('Email déjà utilisé dans cette organisation');

    if (input.role === 'ELEVE' && !input.niveau) {
      throw new BadRequestException('niveau requis pour un élève');
    }

    const passwordHash = await argon2.hash(input.password);
    const country = (input.country ?? 'GN').toUpperCase();

    const user = await this.prisma.user.create({
      data: {
        organizationId: input.organizationId,
        email: input.email,
        passwordHash,
        fullName: input.fullName,
        role: input.role as Role,
        phone: input.phone,
        country,
        ...(input.role === 'ELEVE'
          ? {
              eleveProfile: {
                create: {
                  organizationId: input.organizationId,
                  niveau: input.niveau as string,
                  country,
                },
              },
            }
          : {}),
      },
    });

    const token = await this.sign(user.id, user.organizationId, user.role);
    return { token, userId: user.id };
  }

  async login(input: LoginInput): Promise<{ token: string; userId: string }> {
    const user = await this.prisma.user.findFirst({
      where: { organizationId: input.organizationId, email: input.email, deletedAt: null },
    });
    if (!user) throw new UnauthorizedException('Identifiants invalides');

    const ok = await argon2.verify(user.passwordHash, input.password);
    if (!ok) throw new UnauthorizedException('Identifiants invalides');

    const token = await this.sign(user.id, user.organizationId, user.role);
    return { token, userId: user.id };
  }

  async me(organizationId: string, userId: string) {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, organizationId, deletedAt: null },
      select: {
        id: true,
        email: true,
        fullName: true,
        role: true,
        country: true,
        phone: true,
        eleveProfile: { select: { id: true, niveau: true, country: true } },
      },
    });
    if (!user) throw new UnauthorizedException('Session invalide');
    return {
      userId: user.id,
      email: user.email,
      fullName: user.fullName,
      role: user.role,
      country: user.country,
      phone: user.phone,
      eleve: user.eleveProfile
        ? { eleveId: user.eleveProfile.id, niveau: user.eleveProfile.niveau, country: user.eleveProfile.country }
        : null,
    };
  }

  private sign(userId: string, organizationId: string, role: string): Promise<string> {
    return this.jwt.signAsync({ userId, organizationId, role });
  }
}
