import { Module } from '@nestjs/common';
import { KalamonController } from './kalamon.controller';
import { RagService } from './rag.service';
import { AiProviderService } from './ai-provider.service';
import { BktModule } from '../bkt/bkt.module';

@Module({
  imports: [BktModule],
  controllers: [KalamonController],
  providers: [RagService, AiProviderService],
  // AiProviderService est exporté pour être injectable dans MemoryModule
  // (et tout autre module qui a besoin d'appeler le LLM via la même abstraction provider).
  exports: [AiProviderService],
})
export class KalamonModule {}
