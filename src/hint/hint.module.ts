import { Module } from '@nestjs/common';
import { KalamonModule } from '../kalamon/kalamon.module';
import { HintService } from './hint.service';

@Module({
  imports: [KalamonModule],
  providers: [HintService],
  exports: [HintService],
})
export class HintModule {}
