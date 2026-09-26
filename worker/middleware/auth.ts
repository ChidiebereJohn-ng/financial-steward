import type { MiddlewareHandler } from 'hono';
import type { AppVariables, Env } from '../types';

export const authMiddleware: MiddlewareHandler<{ Bindings: Env; Variables: AppVariables }> = async (c, next) => {
  // Allow health check and auth routes without authentication
  const path = c.req.path;
  if (path === '/api/health' || path.startsWith('/api/auth/')) {
    return await next();
  }

  // Check for local dev bypass
  const devBypassHeader = c.req.header('x-dev-bypass');
  if (c.env.DEV_AUTH_BYPASS === 'true' || devBypassHeader === 'true') {
    c.set('user', { authenticated: true, mode: 'dev_bypass' });
    return await next();
  }

  // Check Bearer token or session cookie
  const authHeader = c.req.header('Authorization');
  const token = authHeader?.startsWith('Bearer ')
    ? authHeader.slice(7)
    : getCookie(c.req.header('Cookie') || '', 'steward_session');

  if (!token) {
    return c.json({ error: 'Unauthorized: authentication required' }, 401);
  }

  // Validate session token against KV cache
  if (c.env.CACHE) {
    const sessionData = await c.env.CACHE.get(`session:${token}`);
    if (sessionData) {
      c.set('user', JSON.parse(sessionData));
      return await next();
    }
  }

  return c.json({ error: 'Unauthorized: invalid or expired session' }, 401);
};

function getCookie(cookieHeader: string, name: string): string | null {
  const match = cookieHeader.match(new RegExp('(^|;\\s*)(' + name + ')=([^;]*)'));
  return match ? decodeURIComponent(match[3]) : null;
}
