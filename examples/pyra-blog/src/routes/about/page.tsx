export const prerender = true;

export default function About() {
  return (
    <div>
      <h1>About Pyra Blog</h1>
      <p>This is a reference application built with Pyra.js, demonstrating:</p>
      <ul>
        <li>Server-side rendering (SSR) with <code>load()</code></li>
        <li>Static site generation (SSG) with <code>prerender</code></li>
        <li>API routes for CRUD operations</li>
        <li>Middleware for request logging and auth</li>
        <li>Nested layouts</li>
        <li>Error boundaries and custom 404 pages</li>
        <li>Cache control headers</li>
      </ul>
    </div>
  );
}
