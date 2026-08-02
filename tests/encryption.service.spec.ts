import { ConfigService } from '@nestjs/config';
import { EncryptionService } from '../src/encryption/encryption.service';

/** A valid 32-byte key as 64 hex chars. */
const TEST_KEY = 'a'.repeat(64);

function makeService(key = TEST_KEY): EncryptionService {
  const config = {
    get: (name: string) => (name === 'ENCRYPTION_KEY' ? key : undefined),
  } as unknown as ConfigService;
  return new EncryptionService(config);
}

describe('EncryptionService', () => {
  it('round-trips a buffer through AES-256-GCM', () => {
    const service = makeService();
    const plaintext = Buffer.from('To my daughter — remember you are loved.');

    const { ciphertext, iv, authTag } = service.encrypt(plaintext);
    expect(ciphertext).not.toEqual(plaintext);
    expect(iv).toHaveLength(24); // 12 bytes hex
    expect(authTag).toHaveLength(32); // 16 bytes hex

    const decrypted = service.decrypt(ciphertext, iv, authTag);
    expect(decrypted.equals(plaintext)).toBe(true);
  });

  it('round-trips a string', () => {
    const service = makeService();
    const message = 'Words can become lasting gifts.';
    const { ciphertext, iv, authTag } = service.encryptString(message);
    expect(service.decryptString(ciphertext, iv, authTag)).toBe(message);
  });

  it('produces a different IV each time (non-deterministic ciphertext)', () => {
    const service = makeService();
    const plaintext = Buffer.from('same input');
    const a = service.encrypt(plaintext);
    const b = service.encrypt(plaintext);
    expect(a.iv).not.toEqual(b.iv);
    expect(a.ciphertext.toString('hex')).not.toEqual(b.ciphertext.toString('hex'));
  });

  it('fails to decrypt when the auth tag is wrong (tamper detection)', () => {
    const service = makeService();
    const { ciphertext, iv } = service.encrypt(Buffer.from('secret'));
    const wrongTag = 'f'.repeat(32);
    expect(() => service.decrypt(ciphertext, iv, wrongTag)).toThrow();
  });

  it('rejects a key that is not 32 bytes', () => {
    expect(() => makeService('abcd')).toThrow(/32 bytes/);
  });
});
