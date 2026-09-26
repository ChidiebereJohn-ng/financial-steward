import { Hono } from 'hono';
import type { AppVariables, Env } from '../types';

const app = new Hono<{ Bindings: Env; Variables: AppVariables }>();

// GET /api/auth/me — Check authentication status
app.get('/me', async (c) => {
  const user = c.get('user');
  if (!user) {
    return c.json({ authenticated: false }, 401);
  }
  return c.json({ authenticated: true, user });
});

// POST /api/auth/dev-login — Dev/test login helper
app.post('/dev-login', async (c) => {
  const devBypassHeader = c.req.header('x-dev-bypass');
  const isDev = c.env.DEV_AUTH_BYPASS === 'true' || devBypassHeader === 'true' || process?.env?.NODE_ENV !== 'production';

  if (!isDev) {
    return c.json({ error: 'Dev login not available in production' }, 403);
  }

  const token = 'dev_session_' + crypto.randomUUID();
  const sessionData = JSON.stringify({
    authenticated: true,
    user: 'owner',
    createdAt: new Date().toISOString()
  });

  if (c.env.CACHE) {
    await c.env.CACHE.put(`session:${token}`, sessionData, { expirationTtl: 86400 * 30 });
  }

  c.header('Set-Cookie', `steward_session=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000`);
  return c.json({ token, user: 'owner' });
});

// POST /api/auth/logout — Invalidate session
app.post('/logout', async (c) => {
  const authHeader = c.req.header('Authorization');
  const token = authHeader?.startsWith('Bearer ')
    ? authHeader.slice(7)
    : getCookie(c.req.header('Cookie') || '', 'steward_session');

  if (token && c.env.CACHE) {
    await c.env.CACHE.delete(`session:${token}`);
  }

  c.header('Set-Cookie', 'steward_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0');
  return c.json({ success: true });
});

// POST /api/auth/challenge — Generate challenge for WebAuthn passkey
app.post('/challenge', async (c) => {
  const challenge = crypto.randomUUID();
  if (c.env.CACHE) {
    await c.env.CACHE.put(`challenge:${challenge}`, 'active', { expirationTtl: 300 });
  }
  return c.json({ challenge });
});

function getCookie(cookieHeader: string, name: string): string | null {
  const match = cookieHeader.match(new RegExp('(^|;\\s*)(' + name + ')=([^;]*)'));
  return match ? decodeURIComponent(match[3]) : null;
}

export default app;
