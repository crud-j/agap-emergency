import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { QUEUE_NAMES } from '@agap/shared';
import { configuredOpsPhone } from '../barangay-coordination/barangay-notify.service';
import { SlaScheduleService } from '../sla-policies/sla-schedule.service';

const SMS_MAX = 160;

/** What the ops alert needs from a saved incident. */
export interface OpsAlertIncident {
  id: string;
  public_reference: string;
  category: string;
  /** Picks the SLA policy, so the checks run at this incident's own targets. */
  priority: string;
  submitted_at: Date;
}

/**
 * MOD-17 `AGAP|<reference>|<lat>,<lng>|<unix time>|<category>|C:<Y|N>`. `C:N` (with
 * 0,0) means the report has no GPS position. Always one SMS segment.
 */
export function buildOpsSmsPayload(
  incident: Pick<OpsAlertIncident, 'public_reference' | 'category' | 'submitted_at'>,
  coords: { lat: number; lng: number } | null,
): string {
  const lat = coords ? coords.lat.toFixed(4) : '0';
  const lng = coords ? coords.lng.toFixed(4) : '0';
  const unix = Math.floor(incident.submitted_at.getTime() / 1000);
  return `AGAP|${incident.public_reference}|${lat},${lng}|${unix}|${incident.category}|C:${coords ? 'Y' : 'N'}`
    .slice(0, SMS_MAX);
}

/**
 * Work that starts once a new report is saved (CLAUDE.md "Dual-Path Alert Delivery"):
 * - MOD-17: the SMS path to MDRRMO operations (Textbee), beside the HTTPS data path;
 * - MOD-41: the SLA checks (acknowledge, dispatch, on scene) at the incident's own
 *   targets, each raising an escalation if missed.
 *
 * Called only after the incident is in PostgreSQL. Never throws: a queue or SMS
 * failure must never affect the incident.
 */
@Injectable()
export class OpsAlertService {
  private readonly logger = new Logger(OpsAlertService.name);

  constructor(
    private readonly config: ConfigService,
    @InjectQueue(QUEUE_NAMES.SMS) private readonly smsQueue: Queue,
    private readonly slaSchedule: SlaScheduleService,
  ) {}

  async onIncidentSaved(incident: OpsAlertIncident, coords: { lat: number; lng: number } | null): Promise<void> {
    const opsPhone = configuredOpsPhone(this.config.get<string>('MDRRMO_OPS_PHONE'));
    if (opsPhone) {
      try {
        await this.smsQueue.add('emergency-sms', {
          phone: opsPhone,
          message: buildOpsSmsPayload(incident, coords),
          incidentId: incident.id,
        });
      } catch (err) {
        this.logger.error(`Ops SMS not queued for ${incident.public_reference}: ${String(err)}. Incident unaffected.`);
      }
    } else {
      this.logger.warn(`Ops SMS skipped for ${incident.public_reference}: MDRRMO_OPS_PHONE unset or placeholder`);
    }

    // Never throws (SlaScheduleService logs its own failures).
    await this.slaSchedule.scheduleForIncident(incident);
  }
}
