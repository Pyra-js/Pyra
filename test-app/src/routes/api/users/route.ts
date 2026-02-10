// Users API route — GET and POST
import type { RequestContext } from "pyrajs-shared";

const users = [
  { id: "1", name: "Alice" },
  { id: "2", name: "Bob" },
];

export function GET(ctx: RequestContext) {
  return ctx.json({ users });
}

export function POST(ctx: RequestContext) {
  return ctx.json({ created: true, method: "POST" }, { status: 201 });
}
