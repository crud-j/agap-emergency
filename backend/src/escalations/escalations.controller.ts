import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  UseGuards,
  Request,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { EscalationsService } from './escalations.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '@agap/shared';

@ApiTags('escalations')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller({ path: 'escalations', version: '1' })
export class EscalationsController {
  constructor(private readonly escalationsService: EscalationsService) {}

  @Get()
  @Roles(UserRole.SUPERVISOR, UserRole.SYSTEM_ADMINISTRATOR)
  @ApiOperation({ summary: 'List escalations' })
  async findAll(
    @Query('status') status?: string,
    @Query('incidentId') incidentId?: string,
  ) {
    return this.escalationsService.findAll({
      ...(status && { status }),
      ...(incidentId && { incidentId }),
    });
  }

  @Get(':id')
  @Roles(UserRole.SUPERVISOR, UserRole.SYSTEM_ADMINISTRATOR)
  @ApiOperation({ summary: 'Get an escalation' })
  async findById(@Param('id', ParseUUIDPipe) id: string) {
    return this.escalationsService.findById(id);
  }

  @Post(':id/acknowledge')
  @Roles(UserRole.SUPERVISOR, UserRole.SYSTEM_ADMINISTRATOR)
  @ApiOperation({ summary: 'Acknowledge an escalation' })
  async acknowledge(@Param('id', ParseUUIDPipe) id: string, @Request() req: any) {
    return this.escalationsService.acknowledge(id, req.user.id);
  }

  @Post(':id/resolve')
  @Roles(UserRole.SUPERVISOR, UserRole.SYSTEM_ADMINISTRATOR)
  @ApiOperation({ summary: 'Resolve an escalation' })
  async resolve(@Param('id', ParseUUIDPipe) id: string, @Request() req: any) {
    return this.escalationsService.resolve(id, req.user.id);
  }
}
