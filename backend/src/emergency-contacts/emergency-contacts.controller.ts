import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  UseGuards,
  Request,
  ParseUUIDPipe,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { EmergencyContactsService } from './emergency-contacts.service';
import { CreateContactDto } from './dto/create-contact.dto';
import { UpdateContactDto } from './dto/update-contact.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@ApiTags('contacts')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller({ path: 'emergency-contacts', version: '1' })
export class EmergencyContactsController {
  constructor(private readonly emergencyContactsService: EmergencyContactsService) {}

  @Get()
  @ApiOperation({ summary: 'List my emergency contacts' })
  async findAll(@Request() req: any) {
    return this.emergencyContactsService.findAll(req.user.id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Add an emergency contact' })
  async create(@Request() req: any, @Body() dto: CreateContactDto) {
    return this.emergencyContactsService.create(req.user.id, dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update an emergency contact' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Request() req: any,
    @Body() dto: UpdateContactDto,
  ) {
    return this.emergencyContactsService.update(id, req.user.id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete an emergency contact' })
  async remove(@Param('id', ParseUUIDPipe) id: string, @Request() req: any) {
    await this.emergencyContactsService.remove(id, req.user.id);
  }

  @Patch(':id/priority')
  @ApiOperation({ summary: 'Reorder contact priority' })
  async reorder(
    @Param('id', ParseUUIDPipe) id: string,
    @Request() req: any,
    @Body() body: { priorityOrder: number },
  ) {
    return this.emergencyContactsService.reorderPriority(id, req.user.id, body.priorityOrder);
  }
}
