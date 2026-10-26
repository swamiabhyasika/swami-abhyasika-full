import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { appSecret } from './auth';

/**
 * Keeps secrets (such as the Google Drive "refresh token") unreadable inside the database.
 * AES-256-GCM: the scrambled text also carries a tag, so any tampering is detected on decryption.
 * The key comes from BACKUP_ENCRYPTION_KEY if set, otherwise from the app's AUTH_SECRET.
 */
function key(): Buffer {
  const material = process.env.BACKUP_ENCRYPTION_KEY || Buffer.from(appSecret()).toString('hex');
  return createHash('sha256').update('swami-abhyasika:v1:' + material).digest();
}

export function encryptText(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(), iv);
  const body = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return ['v1', iv.toString('base64'), cipher.getAuthTag().toString('base64'), body.toString('base64')].join('.');
}

export function decryptText(payload: string): string {
  const [version, iv, tag, body] = payload.split('.');
  if (version !== 'v1' || !iv || !tag || !body) throw new Error('Unreadable encrypted value');
  const decipher = createDecipheriv('aes-256-gcm', key(), Buffer.from(iv, 'base64'));
  decipher.setAuthTag(Buffer.from(tag, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(body, 'base64')), decipher.final()]).toString('utf8');
}
