import http from 'node:http';
import { randomUUID } from 'node:crypto';
import { SignJWT, exportJWK, generateKeyPair } from 'jose';

/** A tiny pretend Supabase Auth server, so login code can be tested without a real Supabase project. */
export interface MockUser {
  id: string;
  email: string;
  password: string;
  confirmed: boolean;
}

export async function startMockGoTrue(port = 0) {
  const { publicKey, privateKey } = await generateKeyPair('ES256');
  const jwk = { ...(await exportJWK(publicKey)), kid: 'test-key', alg: 'ES256', use: 'sig' };
  const users: MockUser[] = [];
  const refreshTokens = new Map<string, string>(); // refresh token → user id
  let server!: http.Server;
  let url = '';
  const state = { accessTtl: 3600, logouts: 0, refreshCalls: 0 };

  const issuer = () => `${url}/auth/v1`;
  async function mint(user: MockUser, ttl = state.accessTtl) {
    const now = Math.floor(Date.now() / 1000);
    return new SignJWT({ email: user.email, role: 'authenticated', aud: 'authenticated', session_id: randomUUID() })
      .setProtectedHeader({ alg: 'ES256', kid: 'test-key', typ: 'JWT' })
      .setIssuer(issuer())
      .setSubject(user.id)
      .setIssuedAt(now)
      .setExpirationTime(now + ttl)
      .sign(privateKey);
  }
  async function sessionFor(user: MockUser) {
    const refresh = randomUUID();
    refreshTokens.set(refresh, user.id);
    return {
      access_token: await mint(user),
      token_type: 'bearer',
      expires_in: state.accessTtl,
      expires_at: Math.floor(Date.now() / 1000) + state.accessTtl,
      refresh_token: refresh,
      user: {
        id: user.id, aud: 'authenticated', role: 'authenticated', email: user.email,
        email_confirmed_at: user.confirmed ? new Date().toISOString() : null,
        app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString(),
      },
    };
  }
  const send = (res: http.ServerResponse, code: number, body: unknown) => {
    res.writeHead(code, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(body));
  };

  server = http.createServer(async (req, res) => {
    const u = new URL(req.url || '/', 'http://x');
    const chunks: Buffer[] = [];
    for await (const c of req) chunks.push(c as Buffer);
    const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString() || '{}') : {};

    // Test-only helper: mint a token for a known user (used to make an already-expired one).
    if (u.pathname === '/__mint') {
      const user = users.find((x) => x.email === u.searchParams.get('email'));
      return user ? send(res, 200, { token: await mint(user, Number(u.searchParams.get('ttl') || 3600)) }) : send(res, 404, {});
    }
    if (u.pathname === '/auth/v1/.well-known/jwks.json') return send(res, 200, { keys: [jwk] });
    if (u.pathname === '/auth/v1/token' && u.searchParams.get('grant_type') === 'password') {
      const user = users.find((x) => x.email === String(body.email).toLowerCase());
      if (!user || user.password !== body.password) return send(res, 400, { code: 400, error_code: 'invalid_credentials', msg: 'Invalid login credentials' });
      if (!user.confirmed) return send(res, 400, { code: 400, error_code: 'email_not_confirmed', msg: 'Email not confirmed' });
      return send(res, 200, await sessionFor(user));
    }
    if (u.pathname === '/auth/v1/token' && u.searchParams.get('grant_type') === 'refresh_token') {
      state.refreshCalls++;
      const id = refreshTokens.get(body.refresh_token);
      const user = users.find((x) => x.id === id);
      if (!user) return send(res, 400, { code: 400, error_code: 'refresh_token_not_found', msg: 'Invalid Refresh Token: Refresh Token Not Found' });
      return send(res, 200, await sessionFor(user));
    }
    if (u.pathname === '/auth/v1/logout') {
      state.logouts++;
      return send(res, 204, {});
    }
    send(res, 404, { msg: 'not found: ' + u.pathname });
  });
  await new Promise<void>((r) => server.listen(port, '127.0.0.1', r));
  url = `http://127.0.0.1:${(server.address() as { port: number }).port}`;

  return {
    url,
    state,
    addUser(email: string, password: string, confirmed = true): MockUser {
      const user = { id: randomUUID(), email: email.toLowerCase(), password, confirmed };
      users.push(user);
      return user;
    },
    /** An access token that is already expired (to test automatic renewal). */
    expiredToken: (user: MockUser) => mint(user, -60),
    revokeRefreshTokens: () => refreshTokens.clear(),
    /** Forget every user (so each test starts with a clean slate). */
    reset: () => {
      users.length = 0;
      refreshTokens.clear();
    },
    close: () => new Promise<void>((r) => server.close(() => r())),
  };
}
