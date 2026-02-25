import { describe, it, expect, vi } from 'vitest';
import { runMiddleware } from '../middleware.js';
import type { RequestContext, Middleware } from 'pyrajs-shared';

function makeContext(): RequestContext {
  return {} as RequestContext;
}

const okResponse = () => Promise.resolve(new Response('ok', { status: 200 }));

describe('runMiddleware', () => {
  it('calls the final handler when the chain is empty', async () => {
    const handler = vi.fn(okResponse);
    const res = await runMiddleware([], makeContext(), handler);
    expect(handler).toHaveBeenCalledOnce();
    expect(res.status).toBe(200);
  });

  it('passes context to a single middleware and then calls the handler', async () => {
    const ctx = makeContext();
    const handler = vi.fn(okResponse);
    const mw: Middleware = vi.fn(async (_ctx, next) => next());

    await runMiddleware([mw], ctx, handler);

    expect(mw).toHaveBeenCalledOnce();
    expect(mw).toHaveBeenCalledWith(ctx, expect.any(Function));
    expect(handler).toHaveBeenCalledOnce();
  });

  it('short-circuits when a middleware returns without calling next()', async () => {
    const handler = vi.fn(okResponse);
    const blocked: Middleware = async () => new Response('blocked', { status: 403 });

    const res = await runMiddleware([blocked], makeContext(), handler);

    expect(handler).not.toHaveBeenCalled();
    expect(res.status).toBe(403);
  });

  it('executes middleware in declaration order (outermost first)', async () => {
    const order: number[] = [];
    const make = (n: number): Middleware => async (_ctx, next) => {
      order.push(n);
      return next();
    };

    await runMiddleware([make(1), make(2), make(3)], makeContext(), okResponse);
    expect(order).toEqual([1, 2, 3]);
  });

  it('stops at the first short-circuiting middleware', async () => {
    const order: number[] = [];
    const pass: Middleware = async (_ctx, next) => { order.push(1); return next(); };
    const stop: Middleware = async () => { order.push(2); return new Response('stop'); };
    const never: Middleware = async () => { order.push(3); return new Response('never'); };
    const handler = () => { order.push(4); return okResponse(); };

    await runMiddleware([pass, stop, never], makeContext(), handler);
    expect(order).toEqual([1, 2]);
  });

  it('propagates context mutations to subsequent middleware', async () => {
    const ctx = makeContext() as unknown as Record<string, unknown>;

    const mutate: Middleware = async (_ctx, next) => {
      (ctx as any).injected = 'value';
      return next();
    };
    const read: Middleware = async (_ctx, next) => {
      expect((ctx as any).injected).toBe('value');
      return next();
    };

    await runMiddleware([mutate, read], ctx as unknown as RequestContext, okResponse);
  });

  it('normalizes synchronous middleware returns to promises', async () => {
    const syncMw: Middleware = (_ctx, _next) => new Response('sync', { status: 200 });
    const res = await runMiddleware([syncMw], makeContext(), vi.fn(okResponse));
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('sync');
  });

  it('propagates errors thrown inside middleware', async () => {
    const errorMw: Middleware = async () => { throw new Error('mw error'); };
    await expect(runMiddleware([errorMw], makeContext(), okResponse)).rejects.toThrow('mw error');
  });

  it('propagates errors thrown inside the final handler', async () => {
    const handler = async () => { throw new Error('handler error'); };
    await expect(runMiddleware([], makeContext(), handler)).rejects.toThrow('handler error');
  });
});
