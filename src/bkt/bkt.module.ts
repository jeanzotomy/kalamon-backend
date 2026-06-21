import { Module } from '@nestjs/common';
import { BktService } from './bkt.service';

@Module({
  providers: [BktService],
  exports: [BktService],
})
export class BktModule {}
