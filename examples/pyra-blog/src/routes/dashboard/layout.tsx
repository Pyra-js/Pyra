import React from 'react';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', gap: '2rem' }}>
      <nav style={{ width: '180px', fontSize: '0.875rem' }}>
        <h3>Dashboard</h3>
        <ul style={{ listStyle: 'none', padding: 0 }}>
          <li><a href="/dashboard" style={{ textDecoration: 'none', color: '#6b7280' }}>Overview</a></li>
          <li><a href="/dashboard" style={{ textDecoration: 'none', color: '#6b7280' }}>Posts</a></li>
          <li><a href="/dashboard" style={{ textDecoration: 'none', color: '#6b7280' }}>Settings</a></li>
        </ul>
      </nav>
      <div style={{ flex: 1 }}>
        {children}
      </div>
    </div>
  );
}
