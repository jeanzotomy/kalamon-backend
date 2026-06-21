// P2 — Stub WebSocket gateway pour la couche voix (Pipecat v1.0 requis en prod).
// Dépendances attendues : @nestjs/websockets @nestjs/platform-socket.io socket.io
// Installer si absent : npm install @nestjs/websockets @nestjs/platform-socket.io socket.io

import { Injectable, Logger } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';

interface AudioChunkPayload {
  eleveId: string;
  audioBase64: string;
  sessionId: string;
}

interface SessionStartPayload {
  eleveId: string;
  sessionId: string;
}

@Injectable()
@WebSocketGateway({ namespace: '/voice', cors: { origin: '*' } })
export class VoiceGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(VoiceGateway.name);

  handleConnection(client: Socket): void {
    this.logger.log({ msg: 'Voice client connected', socketId: client.id });
  }

  handleDisconnect(client: Socket): void {
    this.logger.log({ msg: 'Voice client disconnected', socketId: client.id });
  }

  /**
   * Recoit un chunk audio (base64 WAV/PCM), retourne une reponse texte (stub).
   *
   * En production : pipeline Pipecat v1.0 (STT -> LLM -> TTS), latence cible 800-950 ms.
   * La voix sera deployee sur un sidecar dedié pour isoler la charge temps-réel
   * du reste de l'API NestJS.
   *
   * P2 — non integre, retourne un placeholder.
   */
  @SubscribeMessage('audio_chunk')
  async handleAudioChunk(
    @MessageBody() data: AudioChunkPayload,
    @ConnectedSocket() client: Socket,
  ): Promise<void> {
    this.logger.debug({
      msg: 'Audio chunk received (stub)',
      sessionId: data.sessionId,
      eleveId: data.eleveId,
      audioBase64Length: data.audioBase64?.length ?? 0,
    });

    // STUB P2 — en attente integration Pipecat v1.0
    // TODO (P2) : router vers le pipeline STT (Whisper) -> RagService -> TTS (ElevenLabs/Coqui)
    client.emit('voice_response', {
      sessionId: data.sessionId,
      texte: '[Voice P2 — non encore integre. Pipecat v1.0 requis.]',
      audioUrl: null,
      latencyMs: 0,
    });
  }

  /**
   * Demarre une session voix.
   * En production : initialise le contexte Pipecat, pre-charge le profil de l'eleve.
   */
  @SubscribeMessage('session_start')
  handleSessionStart(
    @MessageBody() data: SessionStartPayload,
    @ConnectedSocket() client: Socket,
  ): void {
    this.logger.log({
      msg: 'Voice session started (stub)',
      sessionId: data.sessionId,
      eleveId: data.eleveId,
    });

    // STUB P2 — en production : valider eleveId via JwtAuthGuard WebSocket
    client.emit('session_ready', {
      sessionId: data.sessionId,
      status: 'STUB',
    });
  }
}
