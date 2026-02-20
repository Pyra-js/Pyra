import React from 'react';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="layout">
      <link rel="stylesheet" href="/style.css" />
      <nav className="nav">
        <a href="/" className="nav-brand">{'{{PROJECT_NAME}}'}</a>
        <div className="nav-links">
          <a href="/">Home</a>
          <a href="/about">About</a>
        </div>
      </nav>
      <main className="main">
        {children}
      </main>
      <footer className="footer">
        Built with <a href="https://github.com/Simpleboi/Pyra">Pyra.js</a>
      </footer>
    </div>
  );
}
