import { Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';

// TODO: Implement Media service
@Injectable()
export class MediaService {
  constructor(private readonly prisma: PrismaService) {}
}
