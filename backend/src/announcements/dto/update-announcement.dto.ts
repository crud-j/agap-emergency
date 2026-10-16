import { PartialType } from '@nestjs/swagger';
import { CreateAnnouncementDto } from './create-announcement.dto';

/** PATCH body — same validation as create, every field optional. */
export class UpdateAnnouncementDto extends PartialType(CreateAnnouncementDto) {}
