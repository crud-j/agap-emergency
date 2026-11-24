import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HeadBucketCommand, S3Client } from '@aws-sdk/client-s3';

export interface StorageProbeResult {
  /** STORAGE_ENDPOINT, STORAGE_BUCKET and both keys are set. */
  configured: boolean;
  /** A provider name from the endpoint's host, never the endpoint or the bucket. */
  provider: string;
  /** STORAGE_LOCAL_FALLBACK: uploads go to local disk when the bucket fails. */
  localFallback: boolean;
}

/**
 * Object storage check for the admin health page (MOD-49): one HeadBucket against the
 * same bucket and credentials MediaService uses. Never returns the endpoint (an R2
 * endpoint carries the account ID), the bucket name or a key.
 */
@Injectable()
export class StorageProbe {
  private client: S3Client | null = null;

  constructor(private readonly config: ConfigService) {}

  describe(): StorageProbeResult {
    const endpoint = this.get('STORAGE_ENDPOINT');
    return {
      configured: Boolean(endpoint && this.get('STORAGE_BUCKET') && this.get('STORAGE_ACCESS_KEY') && this.get('STORAGE_SECRET_KEY')),
      provider: storageProviderName(endpoint),
      localFallback: this.get('STORAGE_LOCAL_FALLBACK') !== 'false',
    };
  }

  /** Resolves when the bucket answers; rejects otherwise (the caller applies the timeout). */
  async headBucket(): Promise<void> {
    const bucket = this.get('STORAGE_BUCKET') ?? 'agap-media';
    await this.s3().send(new HeadBucketCommand({ Bucket: bucket }));
  }

  private s3(): S3Client {
    if (!this.client) {
      this.client = new S3Client({
        endpoint: this.get('STORAGE_ENDPOINT') ?? 'http://localhost:9000',
        region: this.get('STORAGE_REGION') ?? 'us-east-1',
        credentials: {
          accessKeyId: this.get('STORAGE_ACCESS_KEY') ?? 'devkey',
          secretAccessKey: this.get('STORAGE_SECRET_KEY') ?? 'devsecret',
        },
        forcePathStyle: true,
        maxAttempts: 1,
      });
    }
    return this.client;
  }

  private get(key: string): string | undefined {
    const value = this.config.get<string>(key)?.trim();
    return value ? value : undefined;
  }
}

export function storageProviderName(endpoint: string | undefined): string {
  if (!endpoint) return 'Not set';
  let host: string;
  try {
    host = new URL(endpoint).hostname.toLowerCase();
  } catch {
    return 'S3-compatible';
  }
  if (host.endsWith('r2.cloudflarestorage.com')) return 'Cloudflare R2';
  if (host.endsWith('amazonaws.com')) return 'Amazon S3';
  if (host === 'localhost' || host === '127.0.0.1' || host.endsWith('.internal')) return 'Local S3 (development)';
  return 'S3-compatible';
}
