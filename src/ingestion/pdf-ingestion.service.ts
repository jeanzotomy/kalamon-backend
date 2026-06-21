// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdfParse = require('pdf-parse') as (buf: Buffer) => Promise<{ text: string; numpages: number }>;

import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AiProviderService } from '../kalamon/ai-provider.service';
import { Prisma } from '@prisma/client';

type IngestionJob = {
  id: string;
  organizationId: string;
  fileName: string;
  fileUrl: string;
  niveau: string;
  matiere: string;
  status: string;
  chunksCreated: number;
  error: string | null;
  createdAt: Date;
  updatedAt: Date;
};

@Injectable()
export class PdfIngestionService {
  private readonly logger = new Logger(PdfIngestionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ai: AiProviderService,
  ) {}

  async startIngestion(params: {
    organizationId: string;
    fileName: string;
    fileUrl: string;
    niveau: string;
    matiere: string;
    lessonTitre?: string;
  }): Promise<{ jobId: string }> {
    const job = await this.prisma.ingestionJob.create({
      data: {
        organizationId: params.organizationId,
        fileName: params.fileName,
        fileUrl: params.fileUrl,
        niveau: params.niveau,
        matiere: params.matiere,
        status: 'PENDING',
        chunksCreated: 0,
      },
    });

    // Fire-and-forget : ne pas await la promesse dans le controller
    void this.runIngestion(job.id, params);

    return { jobId: job.id };
  }

  async getJobStatus(organizationId: string, jobId: string): Promise<IngestionJob> {
    const job = await this.prisma.ingestionJob.findFirst({
      where: { id: jobId, organizationId },
    });
    if (!job) throw new NotFoundException('Job introuvable');
    return job as IngestionJob;
  }

  async listJobs(
    organizationId: string,
    page = 1,
  ): Promise<{ data: IngestionJob[]; total: number }> {
    const limit = 20;
    const [data, total] = await Promise.all([
      this.prisma.ingestionJob.findMany({
        where: { organizationId },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.ingestionJob.count({ where: { organizationId } }),
    ]);
    return { data: data as IngestionJob[], total };
  }

  // --- Processus async complet (fire-and-forget depuis startIngestion) ---

  private async runIngestion(
    jobId: string,
    params: {
      organizationId: string;
      fileName: string;
      fileUrl: string;
      niveau: string;
      matiere: string;
      lessonTitre?: string;
    },
  ): Promise<void> {
    try {
      await this.prisma.ingestionJob.update({
        where: { id: jobId },
        data: { status: 'PROCESSING' },
      });

      // 1. Télécharger le PDF
      const buffer = await this.downloadPdf(params.fileUrl);

      // 2. Extraire le texte
      const { text } = await pdfParse(buffer);

      // 3. Chunking adaptatif
      const rawChunks = this.chunkText(text);

      // 4. Trouver ou créer une Lesson de référence pour rattacher les chunks
      let lesson = await this.prisma.lesson.findFirst({
        where: {
          organizationId: params.organizationId,
          niveau: params.niveau,
          matiere: params.matiere,
          deletedAt: null,
        },
        select: { id: true },
      });

      if (!lesson) {
        lesson = await this.prisma.lesson.create({
          data: {
            organizationId: params.organizationId,
            niveau: params.niveau,
            matiere: params.matiere,
            titre: params.lessonTitre ?? params.fileName.replace(/\.pdf$/i, ''),
            contenu: rawChunks[0] ?? '',
          },
          select: { id: true },
        });
      }

      const lessonId = lesson.id;

      // 5. Pour chaque chunk : embedding + création CurriculumChunk
      let chunksCreated = 0;
      for (const chunk of rawChunks) {
        if (!chunk.trim()) continue;

        const embedding = await this.ai.embed(chunk);
        const vecLiteral = `[${embedding.join(',')}]`;

        const created = await this.prisma.curriculumChunk.create({
          data: {
            lessonId,
            contenu: chunk,
            // embedding posé en SQL brut (type vector non géré par Prisma)
          },
          select: { id: true },
        });

        await this.prisma.$executeRaw(
          Prisma.sql`UPDATE curriculum_chunks SET embedding = ${vecLiteral}::vector WHERE id = ${created.id}`,
        );

        chunksCreated += 1;
      }

      // 6. Marquer DONE
      await this.prisma.ingestionJob.update({
        where: { id: jobId },
        data: { status: 'DONE', chunksCreated },
      });

      this.logger.log({ msg: 'Ingestion complete', jobId, chunksCreated });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error({ msg: 'Ingestion failed', jobId, error: message });
      await this.prisma.ingestionJob.update({
        where: { id: jobId },
        data: { status: 'FAILED', error: message },
      });
    }
  }

  // --- Téléchargement du PDF depuis une URL publique ou signée ---

  private async downloadPdf(fileUrl: string): Promise<Buffer> {
    const response = await fetch(fileUrl, { signal: AbortSignal.timeout(30_000) });
    if (!response.ok) {
      throw new Error(`Impossible de telecharger le PDF : ${response.status} ${response.statusText}`);
    }
    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }

  // --- Chunking adaptatif ---
  // 1. Split sur double saut de ligne ou headers markdown (#)
  // 2. Si segment > maxWords : split en sous-chunks de maxWords mots
  // 3. Si segment < minWords : fusionner avec le suivant
  // 4. Inclure le titre de section courant dans chaque chunk

  private chunkText(text: string, maxWords = 450, minWords = 80): string[] {
    // Normaliser les sauts de ligne
    const normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

    // Split sur double saut de ligne ou sur header markdown (## ou #)
    const segments = normalized.split(/\n{2,}|(?=^#{1,3}\s)/m).filter((s) => s.trim().length > 0);

    const result: string[] = [];
    let currentSectionTitle = '';
    let pending = '';

    for (const segment of segments) {
      const trimmed = segment.trim();

      // Détecter un titre de section markdown
      const headerMatch = /^(#{1,3})\s+(.+)/.exec(trimmed);
      if (headerMatch) {
        // Vider le pending avant de changer de section
        if (pending.trim()) {
          result.push(...this.splitByWordCount(pending.trim(), maxWords, currentSectionTitle));
          pending = '';
        }
        currentSectionTitle = trimmed;
        continue;
      }

      const wordCount = trimmed.split(/\s+/).length;

      if (wordCount >= maxWords) {
        // Vider le pending d'abord
        if (pending.trim()) {
          result.push(...this.splitByWordCount(pending.trim(), maxWords, currentSectionTitle));
          pending = '';
        }
        result.push(...this.splitByWordCount(trimmed, maxWords, currentSectionTitle));
      } else if (wordCount < minWords) {
        // Trop court : accumuler
        pending = pending ? `${pending}\n\n${trimmed}` : trimmed;
        // Si le pending accumulé est maintenant assez grand, le vider
        const pendingWordCount = pending.split(/\s+/).length;
        if (pendingWordCount >= minWords) {
          result.push(...this.splitByWordCount(pending.trim(), maxWords, currentSectionTitle));
          pending = '';
        }
      } else {
        // Vider le pending en le fusionnant avec ce segment si ça tient
        if (pending.trim()) {
          const merged = `${pending}\n\n${trimmed}`;
          const mergedWords = merged.split(/\s+/).length;
          if (mergedWords <= maxWords) {
            pending = merged;
          } else {
            result.push(...this.splitByWordCount(pending.trim(), maxWords, currentSectionTitle));
            pending = trimmed;
          }
        } else {
          pending = trimmed;
        }
      }
    }

    // Vider ce qui reste
    if (pending.trim()) {
      result.push(...this.splitByWordCount(pending.trim(), maxWords, currentSectionTitle));
    }

    return result.filter((c) => c.trim().length > 0);
  }

  private splitByWordCount(text: string, maxWords: number, sectionTitle: string): string[] {
    const words = text.split(/\s+/);
    const chunks: string[] = [];
    const prefix = sectionTitle ? `${sectionTitle}\n\n` : '';

    for (let i = 0; i < words.length; i += maxWords) {
      const slice = words.slice(i, i + maxWords).join(' ');
      chunks.push(`${prefix}${slice}`);
    }

    return chunks;
  }
}
