# Layouts

Share common structure across pages without repeating yourself.

---

## What are Layouts?

Layouts are wrappers that surround your pages. If every page in your app has a navigation bar at the top and a footer at the bottom, you don't want to copy that HTML into every single page file. Instead, you put it in a layout, and Pyra automatically wraps your pages with it.

Think of a layout like a picture frame. The frame stays the same, but the picture inside changes depending on which page the user is viewing.

---

## The Root Layout

Every full-stack Pyra app needs a root layout at `src/routes/layout.tsx`. This wraps every page in your entire app. It's where you put your `<html>`, `<head>`, and `<body>` tags, global navigation, and anything else that should appear on every page.

```tsx
// src/routes/layout.tsx

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <title>My App</title>
        <link rel="stylesheet" href="/styles.css" />
      </head>
      <body>
        <nav>
          <a href="/">Home</a>
          <a href="/about">About</a>
          <a href="/dashboard">Dashboard</a>
        </nav>
        <main>{children}</main>
        <footer>Built with Pyra</footer>
      </body>
    </html>
  );
}
```

The key part is `{children}`. This is where the current page (or the next layout down) gets inserted. When a user visits `/about`, Pyra renders the about page and places it where `{children}` appears in the root layout.

---

## Creating a Layout

Create a `layout.tsx` (or `layout.jsx`, `layout.ts`, `layout.js`) file in any directory under `src/routes/`. That layout automatically wraps all pages in that directory and its subdirectories.

```
src/routes/
├── layout.tsx              # Root layout — wraps everything
├── page.tsx                # Home page (/)
├── about/
│   └── page.tsx            # About page (/about)
└── dashboard/
    ├── layout.tsx          # Dashboard layout — wraps dashboard pages
    ├── page.tsx            # Dashboard home (/dashboard)
    └── settings/
        └── page.tsx        # Settings (/dashboard/settings)
```

The dashboard layout might add a sidebar that only appears on dashboard pages:

```tsx
// src/routes/dashboard/layout.tsx

export default function DashboardLayout({ children }) {
  return (
    <div style={{ display: 'flex' }}>
      <aside>
        <nav>
          <a href="/dashboard">Overview</a>
          <a href="/dashboard/settings">Settings</a>
        </nav>
      </aside>
      <section style={{ flex: 1 }}>
        {children}
      </section>
    </div>
  );
}
```

---

## How Nesting Works

Layouts nest automatically. Pyra builds a chain of layouts from the root down to the matched route, and each layout wraps the next one.

When a user visits `/dashboard/settings`, the rendering looks like this:

```
RootLayout
  └── DashboardLayout
        └── SettingsPage
```

In practice, the HTML output is:

```html
<!-- From RootLayout -->
<html>
  <body>
    <nav>Home | About | Dashboard</nav>
    <main>
      <!-- From DashboardLayout -->
      <div style="display:flex">
        <aside>Overview | Settings</aside>
        <section>
          <!-- From SettingsPage -->
          <h1>Settings</h1>
          <form>...</form>
        </section>
      </div>
    </main>
    <footer>Built with Pyra</footer>
  </body>
</html>
```

When the same user visits `/about`, there's no dashboard layout — only the root layout wraps the about page:

```
RootLayout
  └── AboutPage
```

Pyra only includes layouts from directories that actually have a `layout.tsx` file. If a directory doesn't have one, it's skipped in the chain.

---

## Layouts with Route Groups

Route groups — directories wrapped in parentheses like `(marketing)` — don't affect the URL, but they can have their own layout. This lets you give different sections of your app different layouts without adding extra URL segments.

```
src/routes/
├── layout.tsx                    # Root layout
├── (marketing)/
│   ├── layout.tsx                # Full-width, hero-style layout
│   ├── pricing/
│   │   └── page.tsx              # /pricing — uses marketing layout
│   └── contact/
│       └── page.tsx              # /contact — uses marketing layout
└── (app)/
    ├── layout.tsx                # Compact layout with sidebar
    ├── dashboard/
    │   └── page.tsx              # /dashboard — uses app layout
    └── settings/
        └── page.tsx              # /settings — uses app layout
```

The URLs are `/pricing`, `/contact`, `/dashboard`, and `/settings` — the group names don't appear in the URL. But `/pricing` uses the marketing layout while `/dashboard` uses the app layout.

```tsx
// src/routes/(marketing)/layout.tsx
export default function MarketingLayout({ children }) {
  return (
    <div className="marketing">
      <header className="hero">...</header>
      {children}
      <section className="cta">Sign up today</section>
    </div>
  );
}

// src/routes/(app)/layout.tsx
export default function AppLayout({ children }) {
  return (
    <div className="app" style={{ display: 'flex' }}>
      <aside className="sidebar">...</aside>
      <main>{children}</main>
    </div>
  );
}
```

---

## Nearest Ancestor Layout

Each route uses the nearest layout walking up the directory tree. If a route's own directory has a `layout.tsx`, that's used. If not, Pyra walks up to the parent, then the grandparent, and so on until it finds one.

```
src/routes/
├── layout.tsx                   # Used by /about (nearest ancestor)
├── about/
│   └── page.tsx                 # No layout here, uses root layout
├── blog/
│   ├── layout.tsx               # Used by /blog and /blog/:slug
│   ├── page.tsx                 # /blog — uses blog layout
│   └── [slug]/
│       └── page.tsx             # /blog/:slug — uses blog layout (nearest ancestor)
└── dashboard/
    ├── layout.tsx               # Used by everything under /dashboard
    ├── page.tsx
    └── settings/
        ├── layout.tsx           # Used by /dashboard/settings specifically
        └── page.tsx
```

For `/dashboard/settings`, the chain is: root layout, dashboard layout, settings layout. All three nest together.

For `/blog/hello-world`, the chain is: root layout, blog layout. The `[slug]` directory doesn't have its own layout, so the blog layout is the nearest ancestor.

---

## Layouts Only Wrap Pages

Layouts apply to page routes (`page.tsx`), not API routes (`route.ts`). API routes return JSON or other data directly — they don't need an HTML wrapper. If you have:

```
src/routes/
├── layout.tsx
├── api/
│   └── users/
│       └── route.ts     # Returns JSON, no layout applied
└── users/
    └── page.tsx          # Returns HTML, wrapped by root layout
```

The layout wraps `/users` but not `/api/users`. Middleware, on the other hand, applies to both pages and API routes.

---

## What Layouts Can't Do

- **No `load()` function.** Only pages can export `load()` to fetch data. Layouts are purely structural — they receive `children` and render them. If you need data in a layout, fetch it in the page's `load()` and pass it down through props or context.
- **No `prerender`, `cache`, or `metadata` exports.** These are page-level features.
- **No changing the layout per-request.** The layout chain is determined by the directory structure, not by runtime conditions. If you need conditional layout behavior, handle it inside the layout component itself.

---

## A Full Example

Here's a realistic layout structure for a SaaS application:

```
src/routes/
├── layout.tsx                     # HTML shell, global styles
├── page.tsx                       # Landing page (/)
│
├── (marketing)/
│   ├── layout.tsx                 # Marketing header + CTA footer
│   ├── pricing/
│   │   └── page.tsx               # /pricing
│   ├── about/
│   │   └── page.tsx               # /about
│   └── blog/
│       ├── page.tsx               # /blog (list)
│       └── [slug]/
│           └── page.tsx           # /blog/:slug (post)
│
└── (app)/
    ├── layout.tsx                 # App shell with sidebar
    ├── middleware.ts              # Auth check for all app routes
    ├── dashboard/
    │   └── page.tsx               # /dashboard
    ├── settings/
    │   ├── layout.tsx             # Settings sub-nav
    │   ├── page.tsx               # /settings (general)
    │   └── billing/
    │       └── page.tsx           # /settings/billing
    └── profile/
        └── page.tsx               # /profile
```

A request to `/settings/billing` renders:

```
RootLayout → AppLayout → SettingsLayout → BillingPage
```

A request to `/blog/hello-world` renders:

```
RootLayout → MarketingLayout → BlogPostPage
```

Same root layout, completely different inner layouts — all determined by the directory structure.

---

## Tips

- **Put global elements in the root layout.** Navigation, footer, meta tags, and global styles belong in `src/routes/layout.tsx`.
- **Use nested layouts for section-specific structure.** A dashboard sidebar, a blog reading-width container, a settings sub-navigation — these are all good candidates for nested layouts.
- **Use route groups for layout boundaries.** If your marketing pages and app pages need different layouts, put them in `(marketing)/` and `(app)/` route groups.
- **Keep layouts simple.** Layouts should handle structure and navigation. Business logic, data fetching, and complex state belong in pages.
- **Don't over-nest.** Every layout adds a level of wrapping. Most apps need 2-3 layout levels at most. If you find yourself going deeper, consider simplifying.
