import { Module } from '@nestjs/common';
import { MemoryService } from './memory.service';
import { AiProviderService } from '../kalamon/ai-provider.service';

// AiProviderService n'a aucune dépendance injectée (lit env directement) — on peut
// le fournir directement ici pour éviter une dépendance circulaire avec KalamonModule.
@Module({
  providers: [MemoryService, AiProviderService],
  exports: [MemoryService],
})
export class MemoryModule {}
