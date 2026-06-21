// Dépendances WebSocket requises (installer si absent) :
//   npm install @nestjs/websockets @nestjs/platform-socket.io socket.io
//   npm install -D @types/socket.io

import { Module } from '@nestjs/common';
import { VoiceGateway } from './voice.gateway';

@Module({
  providers: [VoiceGateway],
  exports: [VoiceGateway],
})
export class VoiceModule {}
