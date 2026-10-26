import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export const MAX_IMAGE_BYTES = 400 * 1024; // the app already compresses photos to ~250 KB
const DATA_URL_RE = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=\r\n]+)$/i;
const EXT: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

export const UPLOAD_DIR = path.join(process.cwd(), 'data', 'uploads');

export class ImageError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}

export function cloudinaryConfigured() {
  return Boolean(process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET);
}

async function uploadToCloudinary(dataUrl: string): Promise<string> {
  const { CLOUDINARY_CLOUD_NAME: cloud, CLOUDINARY_API_KEY: key, CLOUDINARY_API_SECRET: secret } = process.env;
  const folder = process.env.CLOUDINARY_FOLDER || '';
  const timestamp = Math.round(Date.now() / 1000);
  const toSign = folder ? `folder=${folder}&timestamp=${timestamp}` : `timestamp=${timestamp}`;
  const signature = crypto.createHash('sha1').update(toSign + secret).digest('hex');

  const body = new URLSearchParams({ file: dataUrl, api_key: key!, timestamp: String(timestamp), signature });
  if (folder) body.set('folder', folder);

  const res = await fetch(`https://api.cloudinary.com/v1_1/${cloud}/image/upload`, { method: 'POST', body });
  const json: any = await res.json().catch(() => ({}));
  if (!res.ok) throw new ImageError(json?.error?.message || `Cloudinary upload failed (${res.status})`, 502);
  return json.secure_url as string;
}

/** Validates a data:image URI and stores it. Returns a URL the browser can load. */
export async function storeImage(dataUrl: string): Promise<string> {
  const m = typeof dataUrl === 'string' ? dataUrl.match(DATA_URL_RE) : null;
  if (!m) throw new ImageError('Please upload a valid JPG, PNG or WEBP image.');
  const base64 = m[2].replace(/\s/g, '');
  const bytes = Math.floor((base64.length * 3) / 4) - ((base64.match(/=*$/) || [''])[0].length);
  if (bytes > MAX_IMAGE_BYTES) throw new ImageError('Image is too large. Please let the app compress it and try again.', 413);

  if (cloudinaryConfigured()) return uploadToCloudinary(dataUrl);

  // No Cloudinary yet (local development): keep the file on disk and serve it through /api/uploads/<file>.
  const name = `${crypto.createHash('sha1').update(base64).digest('hex')}.${EXT[m[1].toLowerCase()]}`;
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  const file = path.join(UPLOAD_DIR, name);
  if (!fs.existsSync(file)) fs.writeFileSync(file, Buffer.from(base64, 'base64'));
  return `/api/uploads/${name}`;
}
