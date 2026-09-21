import { Controller } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { FalseAlertsService } from './false-alerts.service';

@ApiTags('false-alerts')
@Controller({ path: 'false-alerts', version: '1' })
export class FalseAlertsController {
  constructor(private readonly falseAlertsService: FalseAlertsService) {}
}
