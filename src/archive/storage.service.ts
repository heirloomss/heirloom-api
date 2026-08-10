import { Injectable, Logger, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';

/**
 * Object storage for the encrypted archive, backed by Cloudflare R2 through the
 * S3-compatible API (the same client works against AWS S3 by swapping the
 * endpoint). Only ciphertext is ever written here — encryption happens in
 * ArchiveService before bytes reach this layer — and storage references are
 * opaque (`r2://<key>`), never public URLs. Downloads always stream back
 * through the API so access stays authenticated.
 *
 * If the R2 credentials are absent the service is "not configured": every
 * method throws ServiceUnavailableException (HTTP 503) so uploads/downloads
 * fail clearly instead of silently falling back to local disk.
 */
@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);

  private readonly bucket: string;
  private readonly configured: boolean;
  private readonly client?: S3Client;

  constructor(private readonly config: ConfigService) {
    const accountId = this.config.get<string>('R2_ACCOUNT_ID') ?? '';
    const accessKeyId = this.config.get<string>('R2_ACCESS_KEY_ID') ?? '';
    const secretAccessKey = this.config.get<string>('R2_SECRET_ACCESS_KEY') ?? '';
    this.bucket = this.config.get<string>('R2_BUCKET') ?? '';
    const endpoint =
      this.config.get<string>('R2_ENDPOINT') ??
      (accountId ? `https://${accountId}.r2.cloudflarestorage.com` : '');

    this.configured = Boolean(accessKeyId && secretAccessKey && this.bucket && endpoint);

    if (this.configured) {
      this.client = new S3Client({
        region: 'auto',
        endpoint,
        credentials: { accessKeyId, secretAccessKey },
        forcePathStyle: true,
      });
      this.logger.log(`StorageService connected to R2 bucket "${this.bucket}".`);
    } else {
      this.logger.warn(
        'StorageService is NOT configured (missing R2 credentials). ' +
          'Uploads and downloads will return 503 until set.',
      );
    }
  }

  /** Whether object storage is live. */
  isConfigured(): boolean {
    return this.configured;
  }

  /** Persist encrypted bytes under `key`. Returns an opaque storage reference. */
  async save(key: string, data: Buffer): Promise<string> {
    const client = this.requireClient();
    await client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: data,
        ContentType: 'application/octet-stream',
      }),
    );
    return `r2://${key}`;
  }

  /** Read encrypted bytes for `key`. */
  async read(key: string): Promise<Buffer> {
    const client = this.requireClient();
    try {
      const result = await client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
      if (!result.Body) {
        throw new NotFoundException('That file is no longer available.');
      }
      const bytes = await result.Body.transformToByteArray();
      return Buffer.from(bytes);
    } catch (error) {
      if (this.isNotFound(error)) {
        throw new NotFoundException('That file is no longer available.');
      }
      throw error;
    }
  }

  /** Delete stored bytes; a missing object is treated as already gone. */
  async delete(key: string): Promise<void> {
    const client = this.requireClient();
    try {
      await client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
    } catch (error) {
      if (this.isNotFound(error)) {
        return;
      }
      this.logger.warn(`Could not delete ${key}: ${(error as Error).message}`);
    }
  }

  /** Extract the storage key from a reference produced by save(). */
  keyFromUrl(fileUrl: string): string {
    return fileUrl.replace(/^r2:\/\//, '').replace(/^local:\/\/storage\//, '');
  }

  private requireClient(): S3Client {
    if (!this.client) {
      throw new ServiceUnavailableException(
        'File storage is not configured yet. Set the R2 credentials to enable ' +
          'uploads and downloads.',
      );
    }
    return this.client;
  }

  private isNotFound(error: unknown): boolean {
    const name = (error as { name?: string })?.name;
    const status = (error as { $metadata?: { httpStatusCode?: number } })?.$metadata
      ?.httpStatusCode;
    return name === 'NoSuchKey' || name === 'NotFound' || status === 404;
  }
}
