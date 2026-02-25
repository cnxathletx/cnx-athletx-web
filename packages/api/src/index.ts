import { Router } from 'itty-router';

interface Env {
  DB?: D1Database;
}

const router = Router();

router.get('/api/health', () => {
  return Response.json({
    ok: true,
    service: 'cnx-athletx-api',
    timestamp: new Date().toISOString(),
  });
});

router.get('/api/health/db', async (_request, env: Env) => {
  if (!env.DB) {
    return Response.json(
      {
        ok: false,
        error: 'D1 binding DB is not configured',
      },
      { status: 500 },
    );
  }

  const result = await env.DB.prepare('SELECT 1 AS ping').first<{ ping: number }>();

  return Response.json({
    ok: true,
    service: 'cnx-athletx-api',
    db: result?.ping === 1 ? 'connected' : 'unknown',
    timestamp: new Date().toISOString(),
  });
});

router.all('*', () => new Response('Not Found', { status: 404 }));

export default {
  fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> | Response {
    const instance = router as unknown as {
      fetch?: (request: Request, env: Env, ctx: ExecutionContext) => Promise<Response> | Response;
      handle?: (request: Request, env: Env, ctx: ExecutionContext) => Promise<Response> | Response;
    };

    if (instance.fetch) {
      return instance.fetch(request, env, ctx);
    }

    if (instance.handle) {
      return instance.handle(request, env, ctx);
    }

    return new Response('Router method is unavailable', { status: 500 });
  },
};
