import React from 'react';
import './style.css';

export default function RootLayout({ children }) {
  return (
    <div className="layout">
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
