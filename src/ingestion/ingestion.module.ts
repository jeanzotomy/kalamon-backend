import { Module } from '@nestjs/common';
import { IngestionController } from './ingestion.controller';
import { PdfIngestionService } from './pdf-ingestion.service';
import { KalamonModule } from '../kalamon/kalamon.module';

// PrismaModule est Global — pas besoin de l'importer explicitement.
// StorageModule est Global — pas besoin non plus.
// KalamonModule exporte AiProviderService (embed + generateGrounded).

@Module({
  imports: [KalamonModule],
  controllers: [IngestionController],
  providers: [PdfIngestionService],
  exports: [PdfIngestionService],
})
export class IngestionModule {}
