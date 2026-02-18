export const prerender = true;

export default function About() {
  return (
    <div className="content">
      <h1>About</h1>
      <p>This page is statically prerendered at build time using SSG.</p>
      <p>
        When you run <code>pyra build</code>, Pyra renders this page to static HTML
        so it loads instantly without waiting for a server round-trip.
      </p>
    </div>
  );
}
