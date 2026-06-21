import { z } from 'zod';

export const ComplexityLevel = z.enum(['SIMPLE', 'COLLEGE', 'LYCEE', 'TECHNIQUE']);
export type ComplexityLevel = z.infer<typeof ComplexityLevel>;

export const ChatSchema = z.object({
  eleveId: z.string().uuid(),
  question: z.string().min(1).max(2000),
  complexite: ComplexityLevel.optional(),
  skillCode: z.string().optional(),      // ex: "math:fractions" pour BKT
  demandeIndice: z.boolean().default(false),
  niveauIndice: z.number().int().min(1).max(3).optional(), // 1=vague, 2=guidé, 3=solution partielle
});

export type ChatInput = z.infer<typeof ChatSchema>;

export interface ChatResult {
  reponse: string;
  source: string;     // CACHE | PRECALCUL | RAG_LIVE | HINT
  sourceChunkIds: string[];
  complexite?: ComplexityLevel;
  bktUpdate?: {
    skill: string;
    probMastery: number;
    mastered: boolean;
  };
}
