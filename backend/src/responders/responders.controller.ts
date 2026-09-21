import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  UseGuards,
  Request,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { RespondersService } from './responders.service';
import { UpdateAssignmentStatusDto } from './dto/update-assignment-status.dto';
import { DeclineAssignmentDto } from './dto/decline-assignment.dto';
import { TrackLocationDto } from '../locations/dto/track-location.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '@agap/shared';

@ApiTags('responders')
@ApiBearerAuth()
@Controller({ path: 'responders', version: '1' })
export class RespondersController {
  constructor(private readonly respondersService: RespondersService) {}

  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.DISPATCHER, UserRole.SUPERVISOR)
  @ApiOperation({ summary: 'List responders' })
  async findAll() {
    return this.respondersService.findAll({});
  }

  @Get('me/assignments')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.RESPONDER)
  @ApiOperation({ summary: 'Get my active assignments' })
  async myAssignments(@Request() req: any) {
    return this.respondersService.getMyAssignments(req.user.id);
  }

  @Get('assignments/:id')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Get an assignment' })
  async getAssignment(@Param('id', ParseUUIDPipe) id: string) {
    return this.respondersService.getAssignment(id);
  }

  @Post('assignments/:id/accept')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.RESPONDER)
  @ApiOperation({ summary: 'Accept an assignment' })
  async accept(@Param('id', ParseUUIDPipe) id: string, @Request() req: any) {
    return this.respondersService.acceptAssignment(id, req.user.id);
  }

  @Post('assignments/:id/decline')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.RESPONDER)
  @ApiOperation({ summary: 'Decline an assignment' })
  async decline(
    @Param('id', ParseUUIDPipe) id: string,
    @Request() req: any,
    @Body() dto: DeclineAssignmentDto,
  ) {
    return this.respondersService.declineAssignment(id, req.user.id, dto.reason);
  }

  @Patch('assignments/:id/status')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.RESPONDER)
  @ApiOperation({ summary: 'Update assignment status' })
  async updateStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Request() req: any,
    @Body() dto: UpdateAssignmentStatusDto,
  ) {
    return this.respondersService.updateStatus(id, req.user.id, dto);
  }

  @Post('location')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.RESPONDER)
  @ApiOperation({ summary: 'Push my location' })
  async pushLocation(@Body() dto: TrackLocationDto, @Request() req: any) {
    return this.respondersService.pushLocation(dto, req.user.id);
  }
}
