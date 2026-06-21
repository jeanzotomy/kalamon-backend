import { Injectable, Logger } from '@nestjs/common';
import { AiProviderService } from '../kalamon/ai-provider.service';

export type NiveauIndice = 1 | 2 | 3;

interface GenerateHintParams {
  question: string;
  matiere: string;
  curriculumContext: string;
  niveauIndice: NiveauIndice;
  eleveNiveau: string;
}

const HINT_SYSTEM_PROMPTS: Record<NiveauIndice, string> = {
  1:
    "Tu es Kalamon, tuteur scolaire bienveillant. Donne un seul indice très général sans révéler la réponse. " +
    "Oriente l'élève vers le bon domaine de pensée. Max 2 phrases.",
  2:
    "Tu es Kalamon, tuteur scolaire bienveillant. Donne un indice plus précis qui guide l'élève vers la méthode à utiliser. " +
    "Pose une question de relance. Max 3 phrases.",
  3:
    "Tu es Kalamon, tuteur scolaire bienveillant. Montre la première étape de résolution sans donner la réponse complète. " +
    "Explique ce premier pas. Max 4 phrases.",
};

const HINT_LEVEL_LABELS: Record<NiveauIndice, string> = {
  1: 'vague',
  2: 'guidé',
  3: 'solution partielle',
};

@Injectable()
export class HintService {
  private readonly logger = new Logger(HintService.name);

  constructor(private readonly aiProvider: AiProviderService) {}

  /**
   * Génère un indice progressif à 3 niveaux pour une question donnée.
   *
   * Niveau 1 : indice vague — oriente sans révéler
   * Niveau 2 : indice guidé — méthode + question de relance
   * Niveau 3 : solution partielle — première étape expliquée
   */
  async generateHint(params: GenerateHintParams): Promise<string> {
    const { question, matiere, curriculumContext, niveauIndice, eleveNiveau } =
      params;

    this.logger.log({
      msg: 'Generating hint',
      matiere,
      eleveNiveau,
      niveauIndice,
      level: HINT_LEVEL_LABELS[niveauIndice],
    });

    const systemPrompt = HINT_SYSTEM_PROMPTS[niveauIndice];

    // Construction du prompt en utilisant le contexte curriculum déjà récupéré par le RAG
    const contextSection =
      curriculumContext.trim().length > 0
        ? `\n\nCONTEXTE DU PROGRAMME (niveau ${eleveNiveau}, ${matiere}):\n${curriculumContext}`
        : '';

    const hintPrompt =
      `${systemPrompt}${contextSection}\n\n` +
      `Matière : ${matiere}\nNiveau : ${eleveNiveau}\n\n` +
      `QUESTION DE L'ÉLÈVE :\n${question}\n\n` +
      `Formule ton indice de niveau ${niveauIndice} (${HINT_LEVEL_LABELS[niveauIndice]}) :`;

    // On réutilise generateGrounded pour rester ancré dans le curriculum
    const result = await this.aiProvider.generateGrounded(question, [
      hintPrompt,
    ]);

    this.logger.log({
      msg: 'Hint generated',
      niveauIndice,
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
      model: result.model,
    });

    return result.text;
  }
}
