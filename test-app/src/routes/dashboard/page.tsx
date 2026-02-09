export async function load(ctx: any) {
  return {
    method: ctx.request.method,
    pathname: ctx.url.pathname,
    hasHeaders: ctx.headers instanceof Headers,
    userAgent: ctx.headers.get("user-agent") || "unknown",
    mode: ctx.mode,
    routeId: ctx.routeId,
    hasCookies: typeof ctx.cookies.get === "function",
    hasEnv: typeof ctx.env === "object",
    hasJsonHelper: typeof ctx.json === "function",
    hasRedirectHelper: typeof ctx.redirect === "function",
  };
}

export default function Dashboard(props: any) {
  return (
    <div>
      <h1>Dashboard</h1>
      <ul>
        <li data-field="method">Method: {props.method}</li>
        <li data-field="pathname">Path: {props.pathname}</li>
        <li data-field="hasHeaders">Headers: {String(props.hasHeaders)}</li>
        <li data-field="userAgent">UA: {props.userAgent}</li>
        <li data-field="mode">Mode: {props.mode}</li>
        <li data-field="routeId">Route: {props.routeId}</li>
        <li data-field="hasCookies">Cookies: {String(props.hasCookies)}</li>
        <li data-field="hasEnv">Env: {String(props.hasEnv)}</li>
        <li data-field="hasJsonHelper">json(): {String(props.hasJsonHelper)}</li>
        <li data-field="hasRedirectHelper">redirect(): {String(props.hasRedirectHelper)}</li>
      </ul>
    </div>
  );
}
