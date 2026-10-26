import { afterEach, describe, expect, it } from 'vitest';
import { decryptText, encryptText } from '@/lib/crypto';

afterEach(() => {
  delete process.env.BACKUP_ENCRYPTION_KEY;
});

describe('encryptText / decryptText', () => {
  it('round-trips text', () => expect(decryptText(encryptText('refresh-token-123'))).toBe('refresh-token-123'));
  it('does not contain the secret in readable form', () => expect(encryptText('refresh-token-123')).not.toContain('refresh-token'));
  it('gives different output every time (random IV)', () => expect(encryptText('same')).not.toBe(encryptText('same')));
  it('detects tampering', () => {
    const parts = encryptText('secret').split('.');
    parts[3] = Buffer.from('tampered').toString('base64');
    expect(() => decryptText(parts.join('.'))).toThrow();
  });
  it('cannot be read with a different key', () => {
    const sealed = encryptText('secret');
    process.env.BACKUP_ENCRYPTION_KEY = 'another-key';
    expect(() => decryptText(sealed)).toThrow();
  });
  it('rejects values that are not in the expected format', () => expect(() => decryptText('garbage')).toThrow());
});
