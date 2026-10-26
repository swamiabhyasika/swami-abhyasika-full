import { getDb } from '../db';
import { decryptText, encryptText } from '../crypto';

/*
 * Google Drive, using the "Connect" button (OAuth):
 *   1. The owner signs in to Google once and approves.
 *   2. Google gives the app a long-lived "refresh token". We store it ENCRYPTED in the database.
 *   3. Each backup swaps that token for a short-lived access token and uploads one file.
 * The permission asked for is `drive.file`: the app can only see files it created itself,
 * never the rest of the owner's Drive.
 */

const AUTH_URL = () => process.env.GOOGLE_AUTH_URL || 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = () => process.env.GOOGLE_TOKEN_URL || 'https://oauth2.googleapis.com/token';
const REVOKE_URL = () => process.env.GOOGLE_REVOKE_URL || 'https://oauth2.googleapis.com/revoke';
const API = () => process.env.GOOGLE_API_BASE || 'https://www.googleapis.com';
export const DRIVE_FOLDER_NAME = 'Swami Abhyasika Backups';
const SCOPES = 'https://www.googleapis.com/auth/drive.file openid email';

export class DriveError extends Error {
  constructor(message: string, public needsReconnect = false) {
    super(message);
  }
}

export interface DriveConnection {
  email: string;
  refreshTokenEnc: string;
  folderId?: string;
  connectedAt: string;
  needsReconnect?: boolean;
  lastError?: string;
}

export const driveConfigured = () => Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);

export function buildAuthUrl(redirectUri: string, state: string): string {
  const q = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID || '',
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: SCOPES,
    access_type: 'offline', // ask for a refresh token
    prompt: 'consent', // always show the approval screen so a refresh token is returned
    state,
  });
  return `${AUTH_URL()}?${q}`;
}

async function tokenRequest(params: Record<string, string>): Promise<Record<string, any>> {
  const res = await fetch(TOKEN_URL(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: process.env.GOOGLE_CLIENT_ID || '', client_secret: process.env.GOOGLE_CLIENT_SECRET || '', ...params }),
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, any>;
  if (!res.ok) {
    // "invalid_grant" while using a saved key means the owner removed access (or it expired); while signing in it just means a bad code.
    const revoked = json.error === 'invalid_grant' && params.grant_type === 'refresh_token';
    throw new DriveError(revoked ? 'Google Drive access was removed or has expired. Please connect Google Drive again.' : `Google sign-in failed (${json.error_description || json.error || res.status}).`, revoked);
  }
  return json;
}

function emailFromIdToken(idToken: string | undefined): string {
  try {
    const payload = JSON.parse(Buffer.from(String(idToken).split('.')[1], 'base64url').toString('utf8'));
    return String(payload.email || 'Google account');
  } catch {
    return 'Google account';
  }
}

export async function exchangeCode(code: string, redirectUri: string): Promise<{ refreshToken: string; email: string }> {
  const t = await tokenRequest({ grant_type: 'authorization_code', code, redirect_uri: redirectUri });
  if (!t.refresh_token) throw new DriveError('Google did not give permanent access. Remove the app from your Google account permissions and connect again.');
  return { refreshToken: t.refresh_token, email: emailFromIdToken(t.id_token) };
}

async function accessToken(conn: DriveConnection): Promise<string> {
  const t = await tokenRequest({ grant_type: 'refresh_token', refresh_token: decryptText(conn.refreshTokenEnc) });
  return t.access_token as string;
}

// ── stored connection ──

export async function getDriveConnection(): Promise<DriveConnection | null> {
  const db = await getDb();
  const [row] = await db.query<{ data: DriveConnection }>("select data from integrations where name = 'google_drive'");
  return row?.data ?? null;
}

export async function saveDriveConnection(conn: DriveConnection): Promise<void> {
  const db = await getDb();
  await db.query(
    `insert into integrations (name, data, updated_at) values ('google_drive', $1::jsonb, now())
     on conflict (name) do update set data = excluded.data, updated_at = now()`,
    [JSON.stringify(conn)],
  );
}

export async function connectDrive(refreshToken: string, email: string): Promise<void> {
  await saveDriveConnection({ email, refreshTokenEnc: encryptText(refreshToken), connectedAt: new Date().toISOString() });
}

export async function disconnectDrive(): Promise<void> {
  const conn = await getDriveConnection();
  if (conn) {
    // Best effort: tell Google to forget the permission too.
    await fetch(REVOKE_URL(), { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ token: decryptText(conn.refreshTokenEnc) }) }).catch(() => {});
  }
  const db = await getDb();
  await db.query("delete from integrations where name = 'google_drive'");
}

// ── upload ──

async function createFolder(token: string): Promise<string> {
  const res = await fetch(`${API()}/drive/v3/files?fields=id`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: DRIVE_FOLDER_NAME, mimeType: 'application/vnd.google-apps.folder' }),
  });
  const json = (await res.json().catch(() => ({}))) as any;
  if (!res.ok || !json.id) throw new DriveError(`Could not create the backup folder in Google Drive (${json?.error?.message || res.status}).`);
  return json.id as string;
}

async function upload(token: string, folderId: string, fileName: string, content: string): Promise<Response> {
  const boundary = 'swami' + Date.now().toString(36);
  const body =
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify({ name: fileName, parents: [folderId] })}\r\n` +
    `--${boundary}\r\nContent-Type: application/json\r\n\r\n${content}\r\n--${boundary}--`;
  return fetch(`${API()}/upload/drive/v3/files?uploadType=multipart&fields=id,name,size`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': `multipart/related; boundary=${boundary}` },
    body,
  });
}

/** Uploads one backup file into the "Swami Abhyasika Backups" folder (created on first use). */
export async function uploadBackup(conn: DriveConnection, fileName: string, content: string): Promise<{ fileId: string; folderId: string }> {
  const token = await accessToken(conn);
  let folderId = conn.folderId || (await createFolder(token));
  let res = await upload(token, folderId, fileName, content);
  if (res.status === 404 && conn.folderId) {
    // The owner deleted the folder in Drive: make a new one.
    folderId = await createFolder(token);
    res = await upload(token, folderId, fileName, content);
  }
  const json = (await res.json().catch(() => ({}))) as any;
  if (!res.ok || !json.id) throw new DriveError(`Google Drive upload failed (${json?.error?.message || res.status}).`);
  if (folderId !== conn.folderId) await saveDriveConnection({ ...conn, folderId, needsReconnect: false, lastError: undefined });
  return { fileId: json.id as string, folderId };
}
