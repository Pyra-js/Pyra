export default function Home() {
  return (
    <div className="hero">
      <span className="hero-badge">Full-Stack Ready</span>
      <h1>Welcome to {'{{PROJECT_NAME}}'}</h1>
      <p>
        Your full-stack Pyra.js project is ready.
        Edit <code>src/routes/page.tsx</code> to get started.
      </p>
      <div className="cards">
        <div className="card">
          <h3>File Routing</h3>
          <p>Pages in <code>src/routes/</code> become URLs automatically.</p>
        </div>
        <div className="card">
          <h3>Server Rendering</h3>
          <p>Every page is server-rendered and hydrated on the client.</p>
        </div>
        <div className="card">
          <h3>API Routes</h3>
          <p>Add <code>route.ts</code> files to create API endpoints.</p>
        </div>
      </div>
    </div>
  );
}
