import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  Headers,
  BadRequestException,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { z } from 'zod';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { ConceptService } from './concept.service';

// ---------- Zod schemas ----------

const CreateConceptSchema = z.object({
  matiere: z.string().min(1),
  niveau: z.string().min(1),
  code: z.string().min(1),
  label: z.string().min(1),
  description: z.string().optional(),
});

const AddPrerequisiteSchema = z.object({
  matiere: z.string().min(1),
  conceptCode: z.string().min(1),
  prerequisiteCode: z.string().min(1),
});

const ListQuerySchema = z.object({
  matiere: z.string().min(1),
  niveau: z.string().optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(50).default(20),
});

const NextConceptQuerySchema = z.object({
  eleveId: z.string().min(1),
  matiere: z.string().min(1),
  niveau: z.string().min(1),
});

const UnmasteredQuerySchema = z.object({
  eleveId: z.string().min(1),
  matiere: z.string().min(1),
  conceptCode: z.string().min(1),
});

// ---------- Controller ----------

@ApiTags('concepts')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('concepts')
export class ConceptController {
  constructor(private readonly conceptService: ConceptService) {}

  // IMPORTANT : routes fixes AVANT :id (pattern Fastify)
  // GET /concepts/next et /concepts/unmastered déclarés avant tout :id éventuel

  @Get('next')
  @ApiOperation({ summary: 'Recommande le prochain concept à apprendre pour un élève' })
  async getNextConcept(
    @Headers('x-organization-id') rawOrgId: string | undefined,
    @Query() rawQuery: Record<string, string>,
  ) {
    const orgId = this.requireOrgId(rawOrgId);
    const query = NextConceptQuerySchema.parse(rawQuery);
    const concept = await this.conceptService.getNextConcept(
      orgId,
      query.eleveId,
      query.matiere,
      query.niveau,
    );
    return { concept };
  }

  @Get('unmastered')
  @ApiOperation({ summary: 'Liste les prérequis non maîtrisés avant un concept cible' })
  async getUnmasteredPrerequisites(
    @Headers('x-organization-id') rawOrgId: string | undefined,
    @Query() rawQuery: Record<string, string>,
  ) {
    const orgId = this.requireOrgId(rawOrgId);
    const query = UnmasteredQuerySchema.parse(rawQuery);
    const items = await this.conceptService.getUnmasteredPrerequisites(
      orgId,
      query.eleveId,
      query.matiere,
      query.conceptCode,
    );
    return { items };
  }

  @Get()
  @ApiOperation({ summary: 'Liste tous les concepts par matière (avec pagination)' })
  async findAll(
    @Headers('x-organization-id') rawOrgId: string | undefined,
    @Query() rawQuery: Record<string, string>,
  ) {
    const orgId = this.requireOrgId(rawOrgId);
    const query = ListQuerySchema.parse(rawQuery);
    return this.conceptService.findAll(
      orgId,
      query.matiere,
      query.niveau,
      query.page,
      query.limit,
    );
  }

  @Post()
  @ApiOperation({ summary: 'Crée un nouveau concept dans le graphe de connaissances' })
  async createConcept(
    @Headers('x-organization-id') rawOrgId: string | undefined,
    @Body() body: unknown,
  ) {
    const orgId = this.requireOrgId(rawOrgId);
    const dto = CreateConceptSchema.parse(body);
    return this.conceptService.createConcept(orgId, dto);
  }

  @Post('prereq')
  @ApiOperation({ summary: 'Ajoute une arête prérequis entre deux concepts' })
  @ApiResponse({ status: 404, description: 'Concept ou prérequis introuvable' })
  async addPrerequisite(
    @Headers('x-organization-id') rawOrgId: string | undefined,
    @Body() body: unknown,
  ) {
    const orgId = this.requireOrgId(rawOrgId);
    const dto = AddPrerequisiteSchema.parse(body);
    await this.conceptService.addPrerequisite(
      orgId,
      dto.matiere,
      dto.conceptCode,
      dto.prerequisiteCode,
    );
    return { ok: true };
  }

  // ---------- Utilitaire ----------

  private requireOrgId(rawOrgId: string | undefined): string {
    if (!rawOrgId) {
      throw new BadRequestException('Header x-organization-id manquant.');
    }
    return rawOrgId;
  }
}
