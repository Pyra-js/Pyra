/** Default HTML document shell used when the adapter provides none. */
export const DEFAULT_SHELL = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <!--pyra-head-->
</head>
<body>
  <div id="__CONTAINER_ID__"><!--pyra-outlet--></div>
</body>
</html>`;

/** Generic 500 error page for production (no details exposed). */
export function getErrorHTML(): string {
  return `<!DOCTYPE html>
<html><head><title>500 Internal Server Error</title>
<style>
  body { font-family: system-ui, sans-serif; background: #1a1a2e; color: #e0e0e0;
         display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; }
  .container { text-align: center; }
  h1 { font-size: 4rem; color: #ff6b35; margin: 0; }
  p { color: #999; margin-top: 1rem; }
</style></head>
<body>
  <div class="container">
    <h1>500</h1>
    <p>Internal Server Error</p>
  </div>
</body></html>`;
}

/** Generic 404 page shown when no custom 404 route is configured. */
export function get404HTML(pathname: string): string {
  return `<!DOCTYPE html>
<html><head><title>404 Not Found</title>
<style>
  body { font-family: system-ui, sans-serif; background: #1a1a2e; color: #e0e0e0;
         display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; }
  .container { text-align: center; }
  h1 { font-size: 4rem; color: #ff6b35; margin: 0; }
  p { color: #999; margin-top: 1rem; }
  code { color: #4fc3f7; }
</style></head>
<body>
  <div class="container">
    <h1>404</h1>
    <p>Page <code>${pathname}</code> not found</p>
  </div>
</body></html>`;
}
