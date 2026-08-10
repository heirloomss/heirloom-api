import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

/**
 * Result of an encrypt operation. `iv` and `authTag` are hex-encoded and must
 * be stored alongside the ciphertext to allow later decryption.
 */
export interface EncryptedPayload {
  ciphertext: Buffer;
  iv: string;
  authTag: string;
}

/**
 * AES-256-GCM encryption for document and message content. The key is read
 * from ENCRYPTION_KEY (32 bytes as 64 hex chars). GCM gives us both
 * confidentiality and integrity (the auth tag).
 */
@Injectable()
export class EncryptionService {
  private static readonly ALGORITHM = 'aes-256-gcm';
  private static readonly IV_LENGTH = 12; // 96-bit nonce, recommended for GCM
  private readonly key: Buffer;

  constructor(config: ConfigService) {
    const hexKey = config.get<string>('ENCRYPTION_KEY');
    if (!hexKey) {
      throw new Error('ENCRYPTION_KEY is not configured.');
    }
    this.key = Buffer.from(hexKey, 'hex');
    if (this.key.length !== 32) {
      throw new Error('ENCRYPTION_KEY must decode to exactly 32 bytes (64 hex chars).');
    }
  }

  /** Encrypt a buffer. Returns ciphertext plus hex iv and auth tag. */
  encrypt(plaintext: Buffer): EncryptedPayload {
    const iv = randomBytes(EncryptionService.IV_LENGTH);
    const cipher = createCipheriv(EncryptionService.ALGORITHM, this.key, iv);
    const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    const authTag = cipher.getAuthTag();
    return {
      ciphertext,
      iv: iv.toString('hex'),
      authTag: authTag.toString('hex'),
    };
  }

  /** Decrypt a buffer using its stored hex iv and auth tag. */
  decrypt(ciphertext: Buffer, ivHex: string, authTagHex: string): Buffer {
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');
    const decipher = createDecipheriv(EncryptionService.ALGORITHM, this.key, iv);
    decipher.setAuthTag(authTag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  }

  /** Convenience for string content (messages). Returns hex ciphertext. */
  encryptString(plaintext: string): { ciphertext: string; iv: string; authTag: string } {
    const payload = this.encrypt(Buffer.from(plaintext, 'utf8'));
    return {
      ciphertext: payload.ciphertext.toString('hex'),
      iv: payload.iv,
      authTag: payload.authTag,
    };
  }

  /** Convenience for string content (messages). Consumes hex ciphertext. */
  decryptString(ciphertextHex: string, ivHex: string, authTagHex: string): string {
    return this.decrypt(Buffer.from(ciphertextHex, 'hex'), ivHex, authTagHex).toString('utf8');
  }
}
