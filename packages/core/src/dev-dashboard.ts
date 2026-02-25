// ── getDashboardHTML ──────────────────────────────────────────────────────────

/**
 * Return the full HTML for the Pyra.js dev dashboard at `/_pyra`.
 * Pure function — no host dependency.
 */
export function getDashboardHTML(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Pyra.js Dev Dashboard</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; background: #0a0a0a; color: #e0e0e0; line-height: 1.6; }
    .container { max-width: 1400px; margin: 0 auto; padding: 20px; }
    header { background: linear-gradient(135deg, #ff6b35 0%, #f7931e 100%); padding: 30px; border-radius: 12px; margin-bottom: 30px; box-shadow: 0 4px 20px rgba(255, 107, 53, 0.3); }
    h1 { font-size: 2.5rem; font-weight: 700; margin-bottom: 10px; }
    .subtitle { font-size: 1.1rem; opacity: 0.9; }
    .stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 20px; margin-bottom: 30px; }
    .stat-card { background: #1a1a1a; border: 1px solid #333; border-radius: 12px; padding: 25px; }
    .stat-label { font-size: 0.9rem; color: #888; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 10px; }
    .stat-value { font-size: 2.5rem; font-weight: 700; color: #ff6b35; }
    .stat-unit { font-size: 1.2rem; color: #aaa; margin-left: 5px; }
    .section { background: #1a1a1a; border: 1px solid #333; border-radius: 12px; padding: 25px; margin-bottom: 25px; }
    .section-title { font-size: 1.5rem; font-weight: 600; margin-bottom: 20px; color: #ff6b35; }
    .empty-state { text-align: center; padding: 60px 20px; color: #666; }
    /* Traces table */
    .traces-table { width: 100%; border-collapse: collapse; font-size: 0.875rem; }
    .traces-table th { text-align: left; padding: 10px 14px; color: #888; font-weight: 500; text-transform: uppercase; font-size: 0.75rem; letter-spacing: 0.05em; border-bottom: 1px solid #2a2a2a; }
    .traces-table td { padding: 10px 14px; border-bottom: 1px solid #1f1f1f; vertical-align: top; }
    .traces-table tr:last-child td { border-bottom: none; }
    .traces-table tr:hover td { background: #1f1f1f; }
    /* Method badges */
    .method { display: inline-block; padding: 2px 7px; border-radius: 4px; font-size: 0.75rem; font-weight: 700; letter-spacing: 0.05em; }
    .method-GET    { background: #1a3a2a; color: #4ade80; }
    .method-POST   { background: #1a2a3a; color: #60a5fa; }
    .method-PUT    { background: #2a2a1a; color: #facc15; }
    .method-PATCH  { background: #2a1f1a; color: #fb923c; }
    .method-DELETE { background: #3a1a1a; color: #f87171; }
    /* Status badges */
    .status { display: inline-block; padding: 2px 7px; border-radius: 4px; font-size: 0.75rem; font-weight: 700; }
    .status-2 { background: #1a3a2a; color: #4ade80; }
    .status-3 { background: #1a2a3a; color: #60a5fa; }
    .status-4 { background: #2a2a1a; color: #facc15; }
    .status-5 { background: #3a1a1a; color: #f87171; }
    /* Pipeline stages */
    .stages { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 4px; }
    .stage { font-size: 0.7rem; color: #666; }
    .stage-name { color: #888; }
    .stage-dur { color: #aaa; }
    .stage-slow { color: #facc15; }
    .stage-very-slow { color: #f87171; }
    .path-cell { font-family: monospace; color: #e0e0e0; }
    .route-id { font-size: 0.75rem; color: #666; margin-top: 2px; font-family: monospace; }
    .dur-cell { font-family: monospace; color: #aaa; white-space: nowrap; }
    .time-cell { color: #555; font-size: 0.8rem; white-space: nowrap; }
    /* Build history rows */
    .build-row { display: flex; align-items: center; gap: 16px; padding: 10px 0; border-bottom: 1px solid #1f1f1f; font-size: 0.875rem; }
    .build-row:last-child { border-bottom: none; }
    .build-time { color: #555; font-size: 0.8rem; width: 70px; flex-shrink: 0; }
    .build-dur { font-family: monospace; color: #ff6b35; width: 70px; flex-shrink: 0; }
    .build-size { font-family: monospace; color: #aaa; width: 80px; flex-shrink: 0; }
    .build-files { color: #666; font-size: 0.8rem; }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <h1>Pyra.js Dev Dashboard</h1>
      <div class="subtitle">Build metrics and request traces, updates every 2s</div>
    </header>

    <div class="stats-grid">
      <div class="stat-card">
        <div class="stat-label">Latest Build</div>
        <div class="stat-value" id="latestBuildTime">--<span class="stat-unit">ms</span></div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Avg Build Time</div>
        <div class="stat-value" id="avgBuildTime">--<span class="stat-unit">ms</span></div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Total Builds</div>
        <div class="stat-value" id="totalBuilds">--</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">Bundle Size</div>
        <div class="stat-value" id="bundleSize">--<span class="stat-unit">KB</span></div>
      </div>
    </div>

    <div class="section">
      <div class="section-title">Recent Requests</div>
      <div id="tracesContainer"><div class="empty-state">No requests yet, make a request to your app to see traces here</div></div>
    </div>

    <div class="section">
      <div class="section-title">Build History</div>
      <div id="buildHistory"><div class="empty-state">No builds yet, save a source file to trigger an HMR rebuild</div></div>
    </div>
  </div>

  <script>
    function timeAgo(ts) {
      const s = Math.floor((Date.now() - ts) / 1000);
      if (s < 5) return 'just now';
      if (s < 60) return s + 's ago';
      return Math.floor(s / 60) + 'm ago';
    }

    function methodBadge(m) {
      return '<span class="method method-' + m + '">' + m + '</span>';
    }

    function statusBadge(code) {
      const cls = 'status-' + Math.floor(code / 100);
      return '<span class="status ' + cls + '">' + code + '</span>';
    }

    function stagesHtml(stages, totalMs) {
      if (!stages || stages.length === 0) return '';
      return '<div class="stages">' + stages.map(function(s) {
        const ratio = totalMs > 0 ? s.durationMs / totalMs : 0;
        const durClass = ratio > 0.8 ? 'stage-very-slow' : ratio > 0.5 ? 'stage-slow' : 'stage-dur';
        const detail = s.detail ? ' ' + s.detail : '';
        return '<span class="stage"><span class="stage-name">' + s.name + '</span> <span class="' + durClass + '">' + s.durationMs + 'ms</span><span style="color:#555">' + detail + '</span></span>';
      }).join('<span style="color:#333"> · </span>') + '</div>';
    }

    async function fetchTraces() {
      try {
        const res = await fetch('/_pyra/api/traces');
        const traces = await res.json();
        const container = document.getElementById('tracesContainer');
        if (!traces || traces.length === 0) {
          container.innerHTML = '<div class="empty-state">No requests yet, make a request to your app to see traces here</div>';
          return;
        }
        // Newest first, cap at 50
        const rows = traces.slice().reverse().slice(0, 50).map(function(t) {
          const routeLabel = t.routeId && t.routeId !== t.pathname
            ? '<div class="route-id">' + t.routeId + '</div>' : '';
          return '<tr>' +
            '<td class="time-cell">' + timeAgo(t.timestamp) + '</td>' +
            '<td>' + methodBadge(t.method) + '</td>' +
            '<td class="path-cell">' + t.pathname + routeLabel + '</td>' +
            '<td>' + statusBadge(t.status) + '</td>' +
            '<td class="dur-cell">' + t.totalMs + 'ms</td>' +
            '<td>' + stagesHtml(t.stages, t.totalMs) + '</td>' +
            '</tr>';
        }).join('');
        container.innerHTML = '<table class="traces-table">' +
          '<thead><tr><th>When</th><th>Method</th><th>Path</th><th>Status</th><th>Duration</th><th>Pipeline</th></tr></thead>' +
          '<tbody>' + rows + '</tbody></table>';
      } catch(e) {}
    }

    async function fetchMetrics() {
      try {
        const res = await fetch('/_pyra/api/metrics');
        const data = await res.json();
        const s = data.summary;

        document.getElementById('latestBuildTime').innerHTML = s.latestBuild
          ? Math.round(s.latestBuild.totalDuration) + '<span class="stat-unit">ms</span>'
          : '--<span class="stat-unit">ms</span>';
        document.getElementById('avgBuildTime').innerHTML = s.totalBuilds > 0
          ? Math.round(s.averageBuildTime) + '<span class="stat-unit">ms</span>'
          : '--<span class="stat-unit">ms</span>';
        document.getElementById('totalBuilds').textContent = s.totalBuilds || '--';
        document.getElementById('bundleSize').innerHTML = s.latestBuild && s.latestBuild.bundleSize > 0
          ? (s.latestBuild.bundleSize / 1024).toFixed(1) + '<span class="stat-unit">KB</span>'
          : '--<span class="stat-unit">KB</span>';

        const history = data.buildHistory || [];
        const buildEl = document.getElementById('buildHistory');
        if (history.length === 0) {
          buildEl.innerHTML = '<div class="empty-state">No builds yet, save a source file to trigger an HMR rebuild</div>';
        } else {
          buildEl.innerHTML = history.slice().reverse().map(function(b) {
            const size = b.bundleSize > 0 ? (b.bundleSize / 1024).toFixed(1) + ' KB' : '--';
            const fileCount = b.files && b.files.length > 0 ? b.files.length + ' file' + (b.files.length === 1 ? '' : 's') : '';
            return '<div class="build-row">' +
              '<span class="build-time">' + timeAgo(b.timestamp) + '</span>' +
              '<span class="build-dur">' + Math.round(b.totalDuration) + 'ms</span>' +
              '<span class="build-size">' + size + '</span>' +
              '<span class="build-files">' + fileCount + '</span>' +
            '</div>';
          }).join('');
        }
      } catch(e) {}
    }

    function refresh() {
      fetchTraces();
      fetchMetrics();
    }

    refresh();
    setInterval(refresh, 2000);
  </script>
</body>
</html>`;
}
