import type { RequestContext } from 'pyrajs-shared';

export default async function authCheck(ctx: RequestContext, next: () => Promise<Response>) {
  const authToken = ctx.cookies.get('auth_token');
  if (!authToken) {
    return ctx.redirect('/');
  }
  return next();
}
