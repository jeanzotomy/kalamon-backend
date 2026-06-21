import { Module } from '@nestjs/common';
import { MemoryService } from './memory.service';
import { KalamonModule } from '../kalamon/kalamon.module';

// PrismaService est fourni globalement via PrismaModule (@Global) — pas besoin de l'importer.
//
// AiProviderService est déclaré dans KalamonModule. Ce module doit l'exporter
// pour que MemoryModule puisse l'injecter dans MemoryService.
// Si KalamonModule n'exporte pas AiProviderService, ajouter exports: [AiProviderService]
// dans kalamon.module.ts (voir note ci-dessous).

@Module({
  imports: [KalamonModule],
  providers: [MemoryService],
  exports: [MemoryService],
})
export class MemoryModule {}
