import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser, AuthUser } from '../common/decorators/current-user.decorator';
import { PdfIngestionService } from './pdf-ingestion.service';

const StartIngestionSchema = z.object({
  fileName: z.string().min(1).max(255),
  fileUrl: z.string().url(),
  niveau: z.string().min(1).max(100),
  matiere: z.string().min(1).max(100),
  lessonTitre: z.string().max(255).optional(),
});

const ListJobsQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
});

@ApiTags('ingestion')
@UseGuards(JwtAuthGuard)
@Controller('ingestion')
export class IngestionController {
  constructor(private readonly ingestion: PdfIngestionService) {}

  @Post()
  @ApiOperation({ summary: "Lancer l'ingestion d'un PDF curriculum" })
  async start(
    @Body() body: unknown,
    @CurrentUser() user: AuthUser,
  ): Promise<{ jobId: string }> {
    if (!user.organizationId) throw new BadRequestException('organizationId manquant');

    const dto = StartIngestionSchema.parse(body);
    return this.ingestion.startIngestion({
      organizationId: user.organizationId,
      ...dto,
    });
  }

  @Get()
  @ApiOperation({ summary: "Lister les jobs d'ingestion de l'organisation" })
  async list(@CurrentUser() user: AuthUser, @Query() query: unknown) {
    if (!user.organizationId) throw new BadRequestException('organizationId manquant');

    const { page } = ListJobsQuerySchema.parse(query);
    return this.ingestion.listJobs(user.organizationId, page);
  }

  @Get(':jobId')
  @ApiOperation({ summary: "Statut d'un job d'ingestion" })
  @ApiResponse({ status: 404, description: 'Job introuvable' })
  async getStatus(
    @Param('jobId') jobId: string,
    @CurrentUser() user: AuthUser,
  ) {
    if (!user.organizationId) throw new BadRequestException('organizationId manquant');
    return this.ingestion.getJobStatus(user.organizationId, jobId);
  }
}
