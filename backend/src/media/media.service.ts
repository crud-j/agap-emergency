import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ServiceUnavailableException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  CreateBucketCommand,
  HeadBucketCommand,
} from '@aws-sdk/client-s3';
import type { Readable } from 'stream';
import { memoryStorage } from 'multer';
import { randomUUID } from 'crypto';
import { extname } from 'path';
import { PrismaService } from '../common/prisma/prisma.service';

export const MULTER_MEMORY_STORAGE = memoryStorage();

const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'video/mp4']);
const ANNOUNCEMENT_IMAGE_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MAX_FILE_SIZE = 10_485_760;
const MAX_ANNOUNCEMENT_IMAGE_SIZE = 5_242_880; // 5 MB

// ─── Tier 1 photo validation (MOD-25) ───────────────────────────────────────
// Trusted capture provenance stamped on-device at the shutter (not from mutable
// EXIF). The checks below are pure, local computations — no external calls — and
// produce an ADVISORY score + flags. They never block storage or dispatch.

/** Capture provenance sent by the mobile client alongside the photo. */
export interface PhotoCaptureMeta {
  capturedAt?: number | undefined; // ms since epoch, device clock at the shutter
  lat?: number | undefined;
  lng?: number | undefined;
  accuracy?: number | undefined;
  source?: string | undefined; // 'live-camera' from the AGAP app
}

// Bocaue municipal bounds [west, south, east, north] — mirrors mobile bocaue-geo.
const BOCAUE_BOUNDS = { west: 120.885, south: 14.755, east: 120.965, north: 14.835 };
const FRESH_WINDOW_MS = 15 * 60 * 1000; // photo older than this vs the report → stale
const FUTURE_SKEW_MS = 2 * 60 * 1000;   // capture time this far after report → suspicious
const LOCATION_MISMATCH_METERS = 500;   // capture GPS this far from the incident → flag

function haversineMeters(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

/**
 * Cross-checks capture provenance against the incident's report time + location.
 * Returns an advisory score (0–100) and flag codes. Isolated + total — any missing
 * input degrades gracefully to a lower-confidence result, never an error.
 */
function assessAuthenticity(
  meta: PhotoCaptureMeta | undefined,
  incident: { submitted_at: Date; lat: number | null; lng: number | null } | null,
): { score: number | null; flags: string[] } {
  if (!meta || meta.capturedAt == null) {
    return { score: null, flags: ['NO_PROVENANCE'] };
  }

  const flags: string[] = [];
  let score = 100;

  if (meta.source && meta.source !== 'live-camera') {
    flags.push('NOT_LIVE_CAPTURE');
    score -= 40;
  }

  const reportMs = incident ? incident.submitted_at.getTime() : Date.now();
  if (meta.capturedAt - reportMs > FUTURE_SKEW_MS) {
    flags.push('FUTURE_TIMESTAMP');
    score -= 30;
  } else if (reportMs - meta.capturedAt > FRESH_WINDOW_MS) {
    flags.push('STALE_PHOTO');
    score -= 25;
  }

  if (meta.lat != null && meta.lng != null) {
    const inBocaue =
      meta.lng >= BOCAUE_BOUNDS.west && meta.lng <= BOCAUE_BOUNDS.east &&
      meta.lat >= BOCAUE_BOUNDS.south && meta.lat <= BOCAUE_BOUNDS.north;
    if (!inBocaue) {
      flags.push('OUTSIDE_BOCAUE');
      score -= 20;
    }
    if (incident?.lat != null && incident?.lng != null) {
      const dist = haversineMeters(meta.lat, meta.lng, incident.lat, incident.lng);
      if (dist > LOCATION_MISMATCH_METERS) {
        flags.push('PHOTO_LOCATION_MISMATCH');
        score -= 20;
      }
    }
  } else {
    flags.push('NO_CAPTURE_GPS');
    score -= 5;
  }

  return { score: Math.max(0, Math.min(100, score)), flags };
}

@Injectable()
export class MediaService {
  private readonly logger = new Logger(MediaService.name);
  private readonly s3: S3Client;
  private readonly bucket: string;
  private readonly endpoint: string;

  private readonly publicUrl: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {
    this.endpoint = this.config.get<string>('STORAGE_ENDPOINT', 'http://localhost:9000');
    this.bucket = this.config.get<string>('STORAGE_BUCKET', 'agap-media');
    // PUBLIC_STORAGE_URL is the browser-accessible base URL for stored files.
    // Separate from STORAGE_ENDPOINT so Docker internal URLs don't leak into the DB.
    this.publicUrl = this.config.get<string>('PUBLIC_STORAGE_URL', this.endpoint);

    this.s3 = new S3Client({
      endpoint: this.endpoint,
      region: this.config.get<string>('STORAGE_REGION', 'us-east-1'),
      credentials: {
        accessKeyId: this.config.get<string>('STORAGE_ACCESS_KEY', 'devkey'),
        secretAccessKey: this.config.get<string>('STORAGE_SECRET_KEY', 'devsecret'),
      },
      forcePathStyle: true,
    });
  }

  /**
   * Ensures the configured S3 bucket exists, creating it if not.
   * Throws ServiceUnavailableException if the storage server is unreachable.
   */
  private async ensureBucket(): Promise<void> {
    try {
      await this.s3.send(new HeadBucketCommand({ Bucket: this.bucket }));
    } catch (headErr: unknown) {
      const code = (headErr as { name?: string })?.name;
      // NoSuchBucket / NotFound means bucket is absent — create it.
      if (code === 'NoSuchBucket' || code === 'NotFound' || code === '404') {
        try {
          await this.s3.send(new CreateBucketCommand({ Bucket: this.bucket }));
          this.logger.log(`Created S3 bucket: ${this.bucket}`);
          return;
        } catch (createErr: unknown) {
          this.logger.error(`Failed to create bucket ${this.bucket}: ${String(createErr)}`);
        }
      }
      // Any other error (ECONNREFUSED, bad credentials, …) means storage is down.
      this.logger.error(`Object storage unreachable at ${this.endpoint}: ${String(headErr)}`);
      throw new ServiceUnavailableException(
        `Object storage is unavailable. Start the storage service (docker compose up minio) and try again.`,
      );
    }
  }

  async uploadIncidentPhoto(
    file: Express.Multer.File,
    incidentId: string,
    uploadedById?: string,
    capture?: PhotoCaptureMeta,
  ) {
    if (!file) throw new BadRequestException('No file provided.');

    if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
      throw new BadRequestException(
        `Unsupported file type "${file.mimetype}". Allowed: ${[...ALLOWED_MIME_TYPES].join(', ')}`,
      );
    }

    if (file.size > MAX_FILE_SIZE) {
      throw new BadRequestException(
        `File too large (${file.size} bytes). Maximum is ${MAX_FILE_SIZE} bytes (10 MB).`,
      );
    }

    const rawExt = extname(file.originalname).replace('.', '').toLowerCase();
    const ext = rawExt || (file.mimetype.split('/')[1] ?? 'bin');
    const key = `incidents/${incidentId}/${randomUUID()}.${ext}`;

    await this.ensureBucket();

    try {
      await this.s3.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: key,
          Body: file.buffer,
          ContentType: file.mimetype,
        }),
      );
    } catch (err: unknown) {
      this.logger.error(`S3 upload failed for incident ${incidentId}: ${String(err)}`);
      throw new ServiceUnavailableException(
        `File upload failed. Ensure the storage service is running on ${this.endpoint}.`,
      );
    }

    // Use publicUrl (PUBLIC_STORAGE_URL) so browsers can load the image directly.
    const storageUrl = `${this.publicUrl}/${this.bucket}/${key}`;

    // Advisory authenticity assessment (Tier 1). Best-effort — a failure here must
    // never prevent the attachment from being stored.
    let score: number | null = null;
    let flags: string[] = [];
    try {
      const incident = await this.prisma.incident.findUnique({
        where: { id: incidentId },
        select: {
          submitted_at: true,
          incident_locations: { select: { latitude: true, longitude: true } },
        },
      });
      const loc = incident?.incident_locations;
      ({ score, flags } = assessAuthenticity(capture, incident
        ? {
            submitted_at: incident.submitted_at,
            lat: loc ? Number(loc.latitude) : null,
            lng: loc ? Number(loc.longitude) : null,
          }
        : null));
    } catch (err: unknown) {
      this.logger.warn(`Authenticity check skipped for incident ${incidentId}: ${String(err)}`);
    }

    const attachment = await this.prisma.incidentAttachment.create({
      data: {
        incident_id: incidentId,
        uploaded_by_id: uploadedById ?? null,
        file_name: file.originalname,
        file_type: file.mimetype,
        file_size_bytes: file.size,
        storage_bucket: this.bucket,
        storage_key: key,
        storage_url: storageUrl,
        capture_timestamp: capture?.capturedAt != null ? new Date(capture.capturedAt) : null,
        capture_latitude: capture?.lat ?? null,
        capture_longitude: capture?.lng ?? null,
        capture_accuracy_meters: capture?.accuracy ?? null,
        capture_source: capture?.source ?? null,
        authenticity_score: score,
        authenticity_flags: flags,
        authenticity_checked_at: new Date(),
      },
    });

    this.logger.log(
      `Uploaded attachment ${attachment.id} for incident ${incidentId} ` +
      `(authenticity ${score ?? 'n/a'}${flags.length ? `, flags: ${flags.join(',')}` : ''})`,
    );
    return attachment;
  }

  async uploadAnnouncementImage(
    file: Express.Multer.File,
    announcementId: string,
  ): Promise<{ image_url: string; image_storage_key: string }> {
    if (!file) throw new BadRequestException('No file provided.');

    if (!ANNOUNCEMENT_IMAGE_MIME_TYPES.has(file.mimetype)) {
      throw new BadRequestException(
        `Unsupported file type "${file.mimetype}". Allowed: jpeg, png, webp.`,
      );
    }

    if (file.size > MAX_ANNOUNCEMENT_IMAGE_SIZE) {
      throw new BadRequestException(
        `Image too large (${file.size} bytes). Maximum is 5 MB.`,
      );
    }

    // Verify the announcement exists before touching storage — gives a clear 404
    // instead of a confusing P2025 after a successful S3 upload.
    const existing = await this.prisma.announcement.findUnique({
      where: { id: announcementId },
      select: { id: true, status: true },
    });
    if (!existing) {
      throw new NotFoundException(`Announcement ${announcementId} not found.`);
    }
    // A published notice must not change silently — issue a correction instead.
    if (existing.status !== 'DRAFT') {
      throw new BadRequestException('Images can only be changed while the announcement is a draft.');
    }

    const rawExt = extname(file.originalname).replace('.', '').toLowerCase();
    const ext = rawExt || (file.mimetype.split('/')[1] ?? 'jpg');
    const key = `announcements/${announcementId}/${randomUUID()}.${ext}`;

    await this.ensureBucket();

    try {
      await this.s3.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: key,
          Body: file.buffer,
          ContentType: file.mimetype,
        }),
      );
    } catch (err: unknown) {
      this.logger.error(`S3 upload failed for announcement ${announcementId}: ${String(err)}`);
      throw new ServiceUnavailableException(
        `File upload failed. Ensure the storage service is running on ${this.endpoint}.`,
      );
    }

    const imageUrl = `${this.publicUrl}/${this.bucket}/${key}`;

    const previous = await this.prisma.announcement.findUnique({
      where: { id: announcementId },
      select: { image_storage_key: true },
    });

    await this.prisma.announcement.update({
      where: { id: announcementId },
      data: { image_url: imageUrl, image_storage_key: key },
    });

    // Replacing an image leaves the old object orphaned — remove it best-effort.
    if (previous?.image_storage_key && previous.image_storage_key !== key) {
      this.s3
        .send(new DeleteObjectCommand({ Bucket: this.bucket, Key: previous.image_storage_key }))
        .catch((err: unknown) =>
          this.logger.warn(`Could not delete replaced announcement image: ${String(err)}`),
        );
    }

    this.logger.log(`Uploaded image for announcement ${announcementId}: ${key}`);
    return { image_url: imageUrl, image_storage_key: key };
  }

  /**
   * Streams a stored announcement image back through the API. Clients (the
   * citizen app especially) load images via the backend URL they already reach,
   * so the storage host never has to be exposed to phones on the network.
   */
  async getAnnouncementImage(
    key: string,
  ): Promise<{ stream: Readable; contentType: string; contentLength?: number }> {
    if (!key.startsWith('announcements/')) {
      throw new NotFoundException('Image not found.');
    }
    try {
      const res = await this.s3.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
      if (!res.Body) throw new NotFoundException('Image not found.');
      return {
        stream: res.Body as Readable,
        contentType: res.ContentType ?? 'image/jpeg',
        ...(res.ContentLength !== undefined && { contentLength: res.ContentLength }),
      };
    } catch (err: unknown) {
      if (err instanceof NotFoundException) throw err;
      const code = (err as { name?: string })?.name;
      if (code === 'NoSuchKey' || code === 'NotFound') {
        throw new NotFoundException('Image not found.');
      }
      this.logger.error(`Announcement image read failed for ${key}: ${String(err)}`);
      throw new ServiceUnavailableException('Object storage is unavailable.');
    }
  }
}
