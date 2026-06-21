import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { randomUUID } from 'crypto';
import { env } from '../config/env';

/**
 * Stockage médias sur Cloudflare R2 (API S3-compatible, egress gratuit — idéal Afrique).
 * Abstraction simple : upload(buffer) -> { key, url }.
 */
@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private client: S3Client | null = null;

  private get s3(): S3Client {
    if (!env.R2_ACCOUNT_ID || !env.R2_ACCESS_KEY_ID || !env.R2_SECRET_ACCESS_KEY) {
      throw new ServiceUnavailableException('R2 non configuré (R2_ACCOUNT_ID / clés)');
    }
    if (!this.client) {
      this.client = new S3Client({
        region: 'auto',
        endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
        credentials: {
          accessKeyId: env.R2_ACCESS_KEY_ID,
          secretAccessKey: env.R2_SECRET_ACCESS_KEY,
        },
      });
    }
    return this.client;
  }

  async upload(
    buffer: Buffer,
    contentType: string,
    prefix = 'uploads',
  ): Promise<{ key: string; url: string | null }> {
    const ext = contentType.split('/')[1]?.replace('jpeg', 'jpg') ?? 'bin';
    const key = `${prefix}/${randomUUID()}.${ext}`;
    await this.s3.send(
      new PutObjectCommand({
        Bucket: env.R2_BUCKET,
        Key: key,
        Body: buffer,
        ContentType: contentType,
      }),
    );
    const url = env.R2_PUBLIC_BASE ? `${env.R2_PUBLIC_BASE.replace(/\/$/, '')}/${key}` : null;
    return { key, url };
  }
}
