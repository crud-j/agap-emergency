import { Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';

// TODO: Implement FalseAlerts service
@Injectable()
export class FalseAlertsService {
  constructor(private readonly prisma: PrismaService) {}
}
