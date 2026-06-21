import { Injectable, Logger } from '@nestjs/common';
import { env } from '../config/env';

export interface LlmResult {
  text: string;
  inputTokens: number;
  outputTokens: number;
  model: string;
}

/**
 * Couche d'abstraction IA. Provider-agnostique via env (anthropic | azure-openai).
 *
 * IMPORTANT : ce service n'est appelé QUE par le chemin RAG_LIVE du RagService,
 * c.-à-d. ~30 % des questions (les vraiment nouvelles). Le reste est servi par
 * le cache/pré-calcul — c'est ce qui maintient le coût à ~0,40 $/élève/mois.
 *
 * Les appels réels sont des stubs à brancher (clé API requise en env).
 */
@Injectable()
export class AiProviderService {
  private readonly logger = new Logger(AiProviderService.name);

  /** Embedding d'un texte (pour recherche pgvector + cache sémantique). */
  async embed(text: string): Promise<number[]> {
    // TODO: appel réel selon EMBEDDING_PROVIDER (openai | azure-openai).
    // openai: POST https://api.openai.com/v1/embeddings { model: EMBEDDING_MODEL, input }
    // azure : POST {AZURE_OPENAI_ENDPOINT}/openai/deployments/{dep}/embeddings
    if (!this.embeddingConfigured()) {
      this.logger.warn('Embeddings non configurés — retour vecteur nul (dev).');
      return new Array(env.EMBEDDING_DIM).fill(0);
    }
    // Placeholder déterministe en attendant le branchement réel.
    void text;
    return new Array(env.EMBEDDING_DIM).fill(0);
  }

  /**
   * Génération ANCRÉE : le contexte = chunks de curriculum récupérés.
   * Le prompt système impose : "réponds uniquement à partir du contexte fourni".
   *
   * @param complexiteHint  Instruction de niveau de complexité (optionnel).
   *                        Fourni par RagService depuis detectComplexite() ou input.complexite.
   */
  async generateGrounded(
    question: string,
    contextChunks: string[],
    complexiteHint?: string,
  ): Promise<LlmResult> {
    const complexiteInstruction = complexiteHint
      ? `\n\nNIVEAU D'ADAPTATION : ${complexiteHint}`
      : '';
    const system =
      "Tu es Kalamon, tuteur scolaire bienveillant. Réponds UNIQUEMENT à partir du " +
      'contexte fourni (programme officiel). Si le contexte ne suffit pas, dis-le ' +
      `simplement et propose de poser la question autrement.${complexiteInstruction}`;
    const context = contextChunks.join('\n---\n');
    const prompt = `${system}\n\nCONTEXTE:\n${context}\n\nQUESTION:\n${question}`;

    if (!this.llmConfigured()) {
      this.logger.warn('LLM non configuré — réponse stub (dev).');
      return {
        text:
          contextChunks.length > 0
            ? `D'après ta leçon : ${contextChunks[0].slice(0, 180)}…`
            : "Je n'ai pas encore le contenu de cette leçon. Pose-moi une question sur un cours déjà disponible.",
        inputTokens: Math.ceil(prompt.length / 4),
        outputTokens: 60,
        model: `${env.LLM_PROVIDER}:${env.LLM_MODEL} (stub)`,
      };
    }

    // TODO: appel réel.
    // anthropic: client.messages.create({ model: env.LLM_MODEL, system,
    //            messages:[{role:'user',content: `CONTEXTE:\n${context}\n\nQUESTION:\n${question}`}] })
    //            + cache_control sur le préfixe système (lecture ~0,1x).
    // azure-openai: POST {endpoint}/openai/deployments/{dep}/chat/completions
    void prompt;
    return {
      text: 'Réponse ancrée (brancher le provider IA).',
      inputTokens: Math.ceil(prompt.length / 4),
      outputTokens: 60,
      model: `${env.LLM_PROVIDER}:${env.LLM_MODEL}`,
    };
  }

  /** Coût estimé en USD selon le modèle (tarifs juin 2026, par 1M tokens). */
  estimateCost(inputTokens: number, outputTokens: number): number {
    const price: Record<string, { in: number; out: number }> = {
      'claude-haiku-4-5': { in: 1, out: 5 },
      'claude-sonnet-4-6': { in: 3, out: 15 },
      'claude-opus-4-8': { in: 5, out: 25 },
    };
    const p = price[env.LLM_MODEL] ?? { in: 1, out: 5 };
    return (inputTokens * p.in + outputTokens * p.out) / 1_000_000;
  }

  private llmConfigured(): boolean {
    return env.LLM_PROVIDER === 'anthropic'
      ? Boolean(env.ANTHROPIC_API_KEY)
      : Boolean(env.AZURE_OPENAI_ENDPOINT && env.AZURE_OPENAI_API_KEY);
  }

  private embeddingConfigured(): boolean {
    return env.EMBEDDING_PROVIDER === 'openai'
      ? Boolean(env.OPENAI_API_KEY)
      : Boolean(env.AZURE_OPENAI_ENDPOINT && env.AZURE_OPENAI_API_KEY);
  }
}
