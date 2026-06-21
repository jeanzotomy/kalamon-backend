import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { version } = require('../../package.json') as { version: string };

interface HealthResponse {
  status: 'ok' | 'error';
  version: string;
  timestamp: string;
  db: 'connected' | 'disconnected';
}

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @ApiOperation({ summary: 'Liveness probe — verifie DB et retourne la version' })
  @ApiResponse({ status: 200, description: 'Service operationnel' })
  @ApiResponse({ status: 503, description: 'Base de donnees inaccessible' })
  async check(): Promise<HealthResponse> {
    let dbStatus: 'connected' | 'disconnected' = 'disconnected';

    try {
      await this.prisma.$queryRaw(Prisma.sql`SELECT 1`);
      dbStatus = 'connected';
    } catch {
      // DB inaccessible — retourner 503
      throw new ServiceUnavailableException({
        status: 'error',
        version,
        timestamp: new Date().toISOString(),
        db: 'disconnected',
      } satisfies HealthResponse);
    }

    return {
      status: 'ok',
      version,
      timestamp: new Date().toISOString(),
      db: dbStatus,
    };
  }
}
