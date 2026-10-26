import http from 'node:http';

/** A tiny pretend Google (sign-in + Drive), so the backup upload code can be tested without a Google account. */
export async function startMockGoogle() {
  const files: { id: string; name: string; parents: string[]; content: string }[] = [];
  const folders: { id: string; name: string }[] = [];
  const state = { refreshTokenValid: true, failUploadsWith: 0 as number, tokenCalls: 0, revoked: 0, folderGone: false };
  let n = 0;
  let server!: http.Server;
  const send = (res: http.ServerResponse, code: number, body: unknown) => {
    res.writeHead(code, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(body));
  };

  server = http.createServer(async (req, res) => {
    const u = new URL(req.url || '/', 'http://x');
    const chunks: Buffer[] = [];
    for await (const c of req) chunks.push(c as Buffer);
    const raw = Buffer.concat(chunks).toString();

    if (u.pathname === '/token') {
      state.tokenCalls++;
      const form = new URLSearchParams(raw);
      if (form.get('grant_type') === 'authorization_code') {
        if (form.get('code') !== 'good-code') return send(res, 400, { error: 'invalid_grant', error_description: 'Bad code' });
        const idToken = ['x', Buffer.from(JSON.stringify({ email: 'owner@gmail.com' })).toString('base64url'), 'y'].join('.');
        return send(res, 200, { access_token: 'access-1', refresh_token: 'refresh-secret-123', id_token: idToken, expires_in: 3600 });
      }
      if (form.get('grant_type') === 'refresh_token') {
        if (!state.refreshTokenValid || form.get('refresh_token') !== 'refresh-secret-123') return send(res, 400, { error: 'invalid_grant', error_description: 'Token has been expired or revoked.' });
        return send(res, 200, { access_token: 'access-' + ++n, expires_in: 3600 });
      }
    }
    if (u.pathname === '/revoke') {
      state.revoked++;
      return send(res, 200, {});
    }
    if (!req.headers.authorization?.startsWith('Bearer access-')) return send(res, 401, { error: { message: 'Invalid Credentials' } });

    if (u.pathname === '/drive/v3/files' && req.method === 'POST') {
      const meta = JSON.parse(raw);
      const folder = { id: 'folder-' + ++n, name: meta.name };
      folders.push(folder);
      state.folderGone = false;
      return send(res, 200, { id: folder.id });
    }
    if (u.pathname === '/upload/drive/v3/files' && req.method === 'POST') {
      if (state.failUploadsWith) return send(res, state.failUploadsWith, { error: { message: 'Backend Error' } });
      const parts = raw.split(/--swami[a-z0-9]+/).filter((p) => p.includes('Content-Type'));
      const meta = JSON.parse(parts[0].split('\r\n\r\n')[1].trim());
      const content = parts[1].split('\r\n\r\n').slice(1).join('\r\n\r\n').replace(/\r\n$/, '');
      if (state.folderGone || !folders.some((f) => f.id === meta.parents[0])) return send(res, 404, { error: { message: 'File not found: ' + meta.parents[0] } });
      const file = { id: 'file-' + ++n, name: meta.name, parents: meta.parents, content };
      files.push(file);
      return send(res, 200, { id: file.id, name: file.name, size: String(content.length) });
    }
    send(res, 404, { error: { message: 'not found ' + u.pathname } });
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;

  return {
    base,
    files,
    folders,
    state,
    env: { GOOGLE_CLIENT_ID: 'cid', GOOGLE_CLIENT_SECRET: 'csecret', GOOGLE_TOKEN_URL: `${base}/token`, GOOGLE_REVOKE_URL: `${base}/revoke`, GOOGLE_API_BASE: base, GOOGLE_AUTH_URL: `${base}/auth` },
    close: () => new Promise<void>((r) => server.close(() => r())),
  };
}
