export const prerender = true;

export default function About() {
  return (
    <div>
      <h1>About</h1>
      <p>This page is statically prerendered at build time.</p>
    </div>
  );
}
