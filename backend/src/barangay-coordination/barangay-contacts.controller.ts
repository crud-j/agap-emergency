import {
  BadRequestException,
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@agap/shared';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import {
  BarangayContactNotFoundError,
  BarangayContactRefusedError,
  BarangayContactsService,
} from './barangay-contacts.service';
import { CreateBarangayContactDto, UpdateBarangayContactDto } from './dto/barangay-contact.dto';

/** Phase 6: the barangay phone directory, edited by MDRRMO administrators (audited). */
@ApiTags('barangay-coordination')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ORG_ADMINISTRATOR, UserRole.SYSTEM_ADMINISTRATOR)
@Controller({ path: 'barangays/contacts', version: '1' })
export class BarangayContactsController {
  constructor(private readonly contacts: BarangayContactsService) {}

  @Get()
  @ApiOperation({ summary: 'Every barangay with all its contacts, including inactive ones' })
  list() {
    return this.contacts.listAll();
  }

  @Post()
  @ApiOperation({ summary: 'Add a barangay contact number (audited)' })
  async create(@Body() dto: CreateBarangayContactDto, @Request() req: any) {
    try {
      return await this.contacts.create(dto, req.user.id);
    } catch (err) {
      throw mapError(err);
    }
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Change role, label, active, verified or demo flag (audited)' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateBarangayContactDto,
    @Request() req: any,
  ) {
    try {
      return await this.contacts.update(id, dto, req.user.id);
    } catch (err) {
      throw mapError(err);
    }
  }
}

function mapError(err: unknown): unknown {
  if (err instanceof BarangayContactNotFoundError) return new NotFoundException(err.message);
  if (err instanceof BarangayContactRefusedError) return new BadRequestException(err.message);
  return err;
}
