import { Injectable, NotFoundException } from '@nestjs/common';
import { AuditAction } from '@agap/shared';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { MediaService } from '../../media/media.service';
import { ACTIVE_RESPONDER_PHOTO_CONSENT, reporterPhotoAvailable } from '../../common/utils/reporter-photo';

/** Same answer whatever the reason, so the response never says whether the reporter has a photo. */
const NO_PHOTO = 'No reporter photo for this incident.';

/**
 * MOD-01 / MOD-22 / MOD-32: the REPORTER's profile photo for the incident's staff and
 * assigned crew, so a crew can find the person who called. Never the patient's (rule 2).
 *
 * Served only while the reporter consents and the incident is active. The caller's
 * access to the incident is checked by the controller; every image served is audited.
 */
@Injectable()
export class ReporterPhotoService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly media: MediaService,
    private readonly audit: AuditService,
  ) {}

  /** Whether {@link read} would serve a photo right now. */
  async isAvailable(incidentId: string): Promise<boolean> {
    return (await this.load(incidentId)).available;
  }

  /** The reporter's photo as JPEG bytes; 404 when it may not be shown. */
  async read(incidentId: string, actor: { id: string; role: string }): Promise<Buffer> {
    const { available, location } = await this.load(incidentId);
    if (!available || !location) throw new NotFoundException(NO_PHOTO);
    const jpeg = await this.media.getPrivateObject(location);

    // MOD-46: who saw whose face, for which incident. Never the image or where it is stored.
    void this.audit.log({
      action: AuditAction.READ,
      actorId: actor.id,
      actorRole: actor.role,
      entityType: 'ReporterPhoto',
      entityId: incidentId,
      incidentId,
      moduleId: 'MOD-01',
    });
    return jpeg;
  }

  private async load(incidentId: string): Promise<{ available: boolean; location: string | null }> {
    const incident = await this.prisma.incident.findUnique({
      where: { id: incidentId },
      select: {
        status: true,
        incident_reporters: {
          select: {
            is_guest: true,
            users: {
              select: {
                profile_photo_location: true,
                profile_photo_updated_at: true,
                consent_records: ACTIVE_RESPONDER_PHOTO_CONSENT,
              },
            },
          },
        },
      },
    });
    const reporter = incident?.incident_reporters ?? null;
    const available = reporterPhotoAvailable(reporter, incident?.status);
    return { available, location: available ? reporter?.users?.profile_photo_location ?? null : null };
  }
}
