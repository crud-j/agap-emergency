import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { memoryStorage } from 'multer';
import { randomUUID } from 'crypto';
import { extname } from 'path';
import { PrismaService } from '../common/prisma/prisma.service';

export const MULTER_MEMORY_STORAGE = memoryStorage();

const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'video/mp4']);
const MAX_FILE_SIZE = 10_485_760;

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

    await this.s3.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: file.buffer,
        ContentType: file.mimetype,
      }),
    );

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
}
