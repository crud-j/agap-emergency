import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { CreateContactDto } from './dto/create-contact.dto';
import { UpdateContactDto } from './dto/update-contact.dto';

@Injectable()
export class EmergencyContactsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(userId: string) {
    return this.prisma.emergencyContact.findMany({
      where: { user_id: userId, is_active: true },
      orderBy: { priority_order: 'asc' },
    });
  }

  async create(userId: string, dto: CreateContactDto) {
    return this.prisma.emergencyContact.create({
      data: {
        user_id: userId,
        contact_name: dto.contactName,
        relationship: dto.relationship ?? null,
        phone_number: dto.phoneNumber,
        email: dto.email ?? null,
        priority_order: dto.priorityOrder ?? 1,
        notify_on_alert: dto.notifyOnAlert ?? true,
      },
    });
  }

  async update(id: string, userId: string, dto: UpdateContactDto) {
    await this.verifyOwnership(id, userId);
    return this.prisma.emergencyContact.update({
      where: { id },
      data: {
        ...(dto.contactName !== undefined && { contact_name: dto.contactName }),
        ...(dto.relationship !== undefined && { relationship: dto.relationship }),
        ...(dto.phoneNumber !== undefined && { phone_number: dto.phoneNumber }),
        ...(dto.email !== undefined && { email: dto.email }),
        ...(dto.priorityOrder !== undefined && { priority_order: dto.priorityOrder }),
        ...(dto.notifyOnAlert !== undefined && { notify_on_alert: dto.notifyOnAlert }),
      },
    });
  }

  async remove(id: string, userId: string) {
    await this.verifyOwnership(id, userId);
    await this.prisma.emergencyContact.update({
      where: { id },
      data: { is_active: false },
    });
  }

  async reorderPriority(id: string, userId: string, newPriority: number) {
    await this.verifyOwnership(id, userId);
    return this.prisma.emergencyContact.update({
      where: { id },
      data: { priority_order: newPriority },
    });
  }

  private async verifyOwnership(id: string, userId: string) {
    const contact = await this.prisma.emergencyContact.findUnique({ where: { id } });
    if (!contact) throw new NotFoundException('Contact not found');
    if (contact.user_id !== userId) {
      throw new ForbiddenException('You do not own this contact');
    }
    return contact;
  }
}
