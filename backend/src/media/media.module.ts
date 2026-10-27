import { Module } from '@nestjs/common';
import { MediaController } from './media.controller';
import { MediaService } from './media.service';
import { EvidenceAiReviewService } from './evidence-ai-review.service';

@Module({
  controllers: [MediaController],
  providers: [MediaService, EvidenceAiReviewService],
  exports: [MediaService],
})
export class MediaModule {}
