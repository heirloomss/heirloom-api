import { Injectable, Logger } from '@nestjs/common';
import { promises as fs } from 'fs';
import { join, resolve } from 'path';

/**
 * Local storage for encrypted bytes. Writes ciphertext to ./storage.
 *
 * This is a deliberately small stub so the app runs with zero external
 * dependencies. A real object store (Cloudflare R2 or AWS S3) swaps in behind
 * this same interface — save/read/delete by key — without touching callers.
 */
@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private readonly root = resolve(process.cwd(), 'storage');

  private async ensureRoot(): Promise<void> {
    await fs.mkdir(this.root, { recursive: true });
  }

  /** Persist encrypted bytes under `key`. Returns a storage URL/reference. */
  async save(key: string, data: Buffer): Promise<string> {
    await this.ensureRoot();
    const path = join(this.root, key);
    await fs.writeFile(path, data);
    // Never expose raw storage paths to clients; downloads go through the API.
    return `local://storage/${key}`;
  }

  /** Read encrypted bytes for `key`. */
  async read(key: string): Promise<Buffer> {
    const path = join(this.root, key);
    return fs.readFile(path);
  }

  /** Delete stored bytes; missing files are ignored. */
  async delete(key: string): Promise<void> {
    const path = join(this.root, key);
    try {
      await fs.unlink(path);
    } catch (error) {
      this.logger.warn(`Could not delete ${key}: ${(error as Error).message}`);
    }
  }

  /** Extract the storage key from a fileUrl produced by save(). */
  keyFromUrl(fileUrl: string): string {
    return fileUrl.replace(/^local:\/\/storage\//, '');
  }
}
