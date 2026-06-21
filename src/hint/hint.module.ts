import { Module } from '@nestjs/common';
import { HintService } from './hint.service';
import { AiProviderService } from '../kalamon/ai-provider.service';

@Module({
  providers: [HintService, AiProviderService],
  exports: [HintService],
})
export class HintModule {}
