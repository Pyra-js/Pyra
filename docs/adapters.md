# Adapters

How Pyra connects to UI frameworks without being tied to any of them.

---

## What is an Adapter?

Pyra's core handles routing, middleware, data loading, the dev server, the build system, and request tracing. But it doesn't know how to render a React component, a Svelte component, or a Vue component. That's the adapter's job.

An adapter is a small plugin that bridges Pyra's core and a specific UI framework. It tells Pyra three things:

1. **How to render components to HTML on the server** (for SSR)
2. **How to make the page interactive in the browser** (hydration)
3. **What file types to look for** (`.tsx` for React, `.svelte` for Svelte, etc.)

This separation is what makes Pyra framework-agnostic. The core never imports React, Svelte, Vue, or any other UI library. It passes opaque component objects to the adapter and lets the adapter handle the rendering.

---

## Why This Matters

Most full-stack frameworks are permanently locked to one UI library. Next.js is React. Nuxt is Vue. SvelteKit is Svelte. If you want to switch, you switch the entire framework.

Pyra takes a different approach. The routing, middleware, data loading, build system, and request tracing are all framework-independent. The UI layer is pluggable. Today Pyra ships with a React adapter. Post-v1.0, official adapters for Svelte, Vue, Solid, and others are planned. When those arrive, you get the same Pyra features — file-based routing, `load()` functions, middleware stacking, request tracing — with a different UI framework.

---

## How Pyra Uses the Adapter

Here's what happens when a request comes in for a page, step by step:

1. **Route scanning** — at startup, Pyra uses the adapter's `fileExtensions` to know which files count as pages and layouts. For React, it looks for `.tsx` and `.jsx` files. For a Svelte adapter, it would look for `.svelte` files.

2. **Build compilation** — Pyra calls `esbuildPlugins()` to get any esbuild plugins the framework needs. React doesn't need any (esbuild handles JSX natively), but Svelte would need a compiler plugin to transform `.svelte` files.

3. **Server rendering** — when a request matches a page route, Pyra loads the component module, runs `load()` if it exists, and then calls the adapter's `renderToHTML()`. It passes the component, the data from `load()`, and a render context with the URL, params, and layout components. The adapter renders everything to an HTML string.

4. **Document assembly** — Pyra gets the HTML shell from `getDocumentShell()`. This is a template with two markers: `<!--pyra-head-->` (where CSS links and meta tags go) and `<!--pyra-outlet-->` (where the rendered HTML goes). Pyra injects the adapter's rendered HTML and any asset tags into the shell.

5. **Client hydration** — Pyra calls `getHydrationScript()` to get the JavaScript that runs in the browser to make the page interactive. For React, this imports the component and calls `hydrateRoot()`. Pyra injects this script into the HTML as a `<script type="module">` tag.

Throughout this entire flow, Pyra's core never touches React or any framework code. It only calls adapter methods.

---

## The React Adapter

The React adapter (`@pyra/adapter-react`) is the first and currently only adapter. Here's what it does:

- **File extensions:** `.tsx` and `.jsx`
- **esbuild plugins:** None needed — esbuild compiles JSX natively
- **Server rendering:** Uses `renderToString()` from `react-dom/server` to convert React components to HTML. Wraps the page in layout components using `createElement()`.
- **Client hydration:** Generates a script that imports the component (and layouts) and calls `hydrateRoot()` from `react-dom/client`. Load data is read from a `<script id="__pyra_data">` tag embedded in the HTML.
- **Document shell:** Returns a basic HTML template with the `<!--pyra-head-->` and `<!--pyra-outlet-->` markers.

As a Pyra user, you don't need to configure the React adapter manually. The CLI sets it up automatically when you run `pyra dev` or `pyra build`.

---

## The PyraAdapter Interface

Every adapter implements this interface. If you're curious about what each method does, or if you're thinking about building an adapter for another framework, here's the contract:

### `name`

A human-readable label like `"react"` or `"svelte"`. Used in logs, the build manifest, and diagnostic output.

### `fileExtensions`

An array of file extensions this adapter handles. Pyra uses this during route scanning to know which files are pages and layouts.

```ts
// React
fileExtensions: ['.tsx', '.jsx']

// Svelte (hypothetical)
fileExtensions: ['.svelte']
```

### `esbuildPlugins()`

Returns an array of esbuild plugins needed to compile the framework's file types. Called once during build setup and once during dev server initialization.

React doesn't need any plugins because esbuild handles JSX natively. A Svelte adapter would return a plugin that runs the Svelte compiler on `.svelte` files.

### `renderToHTML(component, data, context)`

The core rendering method. Takes three arguments:

- `component` — the page component (the default export from `page.tsx`). Pyra treats this as an opaque value — it doesn't know or care what it is. The adapter knows how to render it.
- `data` — whatever `load()` returned, or `null` if there's no `load()` function.
- `context` — a render context with:
  - `context.url` — the request URL
  - `context.params` — route parameters
  - `context.pushHead(tag)` — call this to add tags to `<head>`
  - `context.layouts` — an array of layout components to wrap the page (outermost first)

Returns an HTML string — just the page body, not the full document. Pyra wraps it in the document shell.

### `getHydrationScript(clientEntryPath, containerId, layoutClientPaths?)`

Returns JavaScript code that the browser runs to make the static HTML interactive.

- `clientEntryPath` — the URL path to the client-side page module
- `containerId` — the DOM element ID where the app is mounted (default: `"app"`)
- `layoutClientPaths` — optional array of client-side layout module paths

For React, this generates code that imports the component and calls `hydrateRoot()`.

### `getDocumentShell()`

Returns the HTML template for the page. Must include two markers:

- `<!--pyra-head-->` — where Pyra injects CSS links, meta tags, and other head content
- `<!--pyra-outlet-->` — where Pyra injects the rendered page HTML

If not provided, Pyra uses a sensible default.

---

## What a Custom Adapter Looks Like

Here's a conceptual sketch of what a Svelte adapter might look like. This isn't working code — it's meant to show the shape of an adapter:

```ts
import type { PyraAdapter } from '@pyra/shared';

export function createSvelteAdapter(): PyraAdapter {
  return {
    name: 'svelte',
    fileExtensions: ['.svelte'],

    esbuildPlugins() {
      // Return an esbuild plugin that compiles .svelte files
      return [svelteEsbuildPlugin()];
    },

    renderToHTML(component, data, context) {
      // Use Svelte's server-side render API
      const { html, head } = component.render({ data, params: context.params });

      // Push any head tags Svelte generated
      if (head) context.pushHead(head);

      return html;
    },

    getHydrationScript(clientEntryPath, containerId) {
      return `
        import Component from "${clientEntryPath}";

        const target = document.getElementById("${containerId}");
        const dataEl = document.getElementById("__pyra_data");
        const data = dataEl ? JSON.parse(dataEl.textContent || "{}") : {};

        new Component({ target, hydrate: true, props: data });
      `;
    },

    getDocumentShell() {
      return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <!--pyra-head-->
</head>
<body>
  <div id="app"><!--pyra-outlet--></div>
</body>
</html>`;
    },
  };
}
```

The key insight: the adapter is the only place where framework-specific code lives. Everything else in Pyra — routing, middleware, `load()`, tracing, the build system — works the same regardless of which adapter is plugged in.

---

## Current Status

Through v1.0, Pyra ships with React as the only supported adapter. The adapter interface exists and is designed to be framework-agnostic, but no second adapter is being built until after v1.0 is stable. The reasons:

- Building one adapter well is hard enough. React SSR has edge cases around hydration mismatches, error handling during render, and streaming (future work). Getting these right for one framework before spreading attention across two means a better result for everyone.
- The adapter interface will need refinements discovered through real usage. It's better to find those with one adapter, adjust the interface, then build the second adapter against the stable contract.
- React has the largest user base, maximizing early adoption and feedback.

After v1.0, the first planned addition is a Svelte adapter. If it works without modifying core, the framework-agnostic architecture is validated.

---

## Tips

- **As an app developer, you don't need to think about adapters.** The React adapter is set up automatically by the CLI. You just write your pages and routes.
- **The adapter is specified in `pyra.config.ts`** via the `adapter` field, but the CLI handles this for you. You only need to touch it if you're using a custom adapter.
- **If you're interested in building an adapter** for another framework, the React adapter source code at `packages/adapter-react/src/adapter.ts` is the reference implementation. It's under 120 lines.
