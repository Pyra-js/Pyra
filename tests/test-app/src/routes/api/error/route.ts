import type { RequestContext } from 'pyrajs-shared';

export function GET(ctx: RequestContext) {
  throw new Error('Intentional API error');
}
