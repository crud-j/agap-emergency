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
  CreateBucketCommand,
  HeadBucketCommand,
} from '@aws-sdk/client-s3';
import { memoryStorage } from 'multer';
import { randomUUID } from 'crypto';
import { extname } from 'path';
import { PrismaService } from '../common/prisma/prisma.service';

export const MULTER_MEMORY_STORAGE = memoryStorage();

const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'video/mp4']);
const ANNOUNCEMENT_IMAGE_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MAX_FILE_SIZE = 10_485_760;
const MAX_ANNOUNCEMENT_IMAGE_SIZE = 5_242_880; // 5 MB

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
      },
    });

    this.logger.log(`Uploaded attachment ${attachment.id} for incident ${incidentId}`);
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
      select: { id: true },
    });
    if (!existing) {
      throw new NotFoundException(`Announcement ${announcementId} not found.`);
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

    await this.prisma.announcement.update({
      where: { id: announcementId },
      data: { image_url: imageUrl, image_storage_key: key },
    });

    this.logger.log(`Uploaded image for announcement ${announcementId}: ${key}`);
    return { image_url: imageUrl, image_storage_key: key };
  }
}
