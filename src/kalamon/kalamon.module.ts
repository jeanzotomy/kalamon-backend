import { Module } from '@nestjs/common';
import { KalamonController } from './kalamon.controller';
import { RagService } from './rag.service';
import { AiProviderService } from './ai-provider.service';
import { BktModule } from '../bkt/bkt.module';
import { MemoryModule } from '../memory/memory.module';
import { HintModule } from '../hint/hint.module';

@Module({
  imports: [BktModule, MemoryModule, HintModule],
  controllers: [KalamonController],
  providers: [RagService, AiProviderService],
  exports: [AiProviderService],
})
export class KalamonModule {}
