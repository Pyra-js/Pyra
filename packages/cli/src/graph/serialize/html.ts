/**
 * HTML serializer with interactive viewer
 */

import type { DependencyGraph } from '../types.js';

/**
 * Serialize graph to interactive HTML
 */
export function serializeHtml(graph: DependencyGraph): string {
  const graphJson = JSON.stringify(graph, null, 2);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Dependency Graph - ${graph.root}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }

    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      background: #0a0e27;
      color: #e0e0e0;
      overflow: hidden;
    }

    #container { display: flex; height: 100vh; }

    #sidebar {
      width: 300px;
      background: #151934;
      border-right: 1px solid #2a2f4f;
      padding: 20px;
      overflow-y: auto;
      flex-shrink: 0;
    }

    #sidebar h1 { font-size: 20px; margin-bottom: 20px; color: #60a5fa; }

    .control-group { margin-bottom: 20px; }

    .control-group label {
      display: block;
      font-size: 12px;
      font-weight: 600;
      color: #9ca3af;
      margin-bottom: 8px;
      text-transform: uppercase;
    }

    .control-group input[type="text"] {
      width: 100%;
      padding: 8px;
      background: #0a0e27;
      border: 1px solid #2a2f4f;
      border-radius: 4px;
      color: #e0e0e0;
      font-size: 14px;
    }

    .control-group input[type="text"]:focus {
      outline: none;
      border-color: #60a5fa;
    }

    .checkbox-group { display: flex; flex-direction: column; gap: 8px; }

    .checkbox-group label {
      display: flex;
      align-items: center;
      font-size: 14px;
      color: #e0e0e0;
      text-transform: none;
      font-weight: normal;
      cursor: pointer;
    }

    .checkbox-group input[type="checkbox"] { margin-right: 8px; }

    #stats {
      padding: 12px;
      background: #0a0e27;
      border-radius: 4px;
      font-size: 12px;
      line-height: 1.8;
    }

    #stats div { display: flex; justify-content: space-between; }
    #stats .label { color: #9ca3af; }
    #stats .value { color: #60a5fa; font-weight: 600; }

    #graph-container { flex: 1; position: relative; overflow: hidden; }

    #canvas { width: 100%; height: 100%; cursor: grab; }
    #canvas:active { cursor: grabbing; }

    .legend {
      position: absolute;
      bottom: 20px;
      right: 20px;
      background: rgba(21, 25, 52, 0.95);
      padding: 16px;
      border-radius: 8px;
      border: 1px solid #2a2f4f;
      font-size: 12px;
      max-height: calc(100vh - 60px);
      overflow-y: auto;
    }

    .legend-title { font-weight: 600; margin-bottom: 10px; color: #60a5fa; }
    .legend-item { display: flex; align-items: center; margin-bottom: 7px; }
    .legend-color { width: 14px; height: 14px; border-radius: 3px; margin-right: 8px; flex-shrink: 0; }
    .legend-line { width: 20px; height: 2px; margin-right: 8px; flex-shrink: 0; }

    .tooltip {
      position: absolute;
      background: rgba(0, 0, 0, 0.92);
      color: white;
      padding: 12px;
      border-radius: 6px;
      font-size: 12px;
      pointer-events: none;
      display: none;
      z-index: 1000;
      max-width: 280px;
      border: 1px solid #60a5fa;
      line-height: 1.5;
    }

    .tooltip-title {
      font-weight: 600;
      font-size: 13px;
      margin-bottom: 8px;
      color: #60a5fa;
      word-break: break-all;
    }

    .tooltip-row { display: flex; justify-content: space-between; margin-bottom: 3px; gap: 12px; }
    .tooltip-label { color: #9ca3af; white-space: nowrap; }
    .tooltip-hint { margin-top: 8px; color: #6b7280; font-size: 10px; }

    .controls-bottom {
      position: absolute;
      bottom: 20px;
      left: 20px;
      display: flex;
      gap: 8px;
      align-items: center;
    }

    .btn {
      padding: 7px 14px;
      background: #2563eb;
      color: white;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      font-size: 13px;
      font-weight: 500;
    }

    .btn:hover { background: #1d4ed8; }
    .btn-secondary { background: #374151; }
    .btn-secondary:hover { background: #4b5563; }

    .hint {
      font-size: 11px;
      color: #6b7280;
      padding: 4px 8px;
      background: rgba(21,25,52,0.8);
      border-radius: 4px;
      border: 1px solid #2a2f4f;
    }
  </style>
</head>
<body>
  <div id="container">
    <div id="sidebar">
      <h1>Dependency Graph</h1>

      <div class="control-group">
        <label>Search</label>
        <input type="text" id="search" placeholder="Filter packages...">
      </div>

      <div class="control-group">
        <label>Node Types</label>
        <div class="checkbox-group">
          <label><input type="checkbox" id="show-internal" checked> Internal Packages</label>
          <label><input type="checkbox" id="show-external" checked> External Dependencies</label>
        </div>
      </div>

      <div class="control-group">
        <label>Dependency Types</label>
        <div class="checkbox-group">
          <label><input type="checkbox" id="show-prod" checked> Production</label>
          <label><input type="checkbox" id="show-dev" checked> Development</label>
          <label><input type="checkbox" id="show-peer" checked> Peer</label>
          <label><input type="checkbox" id="show-optional" checked> Optional</label>
        </div>
      </div>

      <div class="control-group">
        <label>Statistics</label>
        <div id="stats">
          <div><span class="label">Total Nodes:</span> <span class="value" id="stat-nodes">0</span></div>
          <div><span class="label">Internal:</span>    <span class="value" id="stat-internal">0</span></div>
          <div><span class="label">External:</span>    <span class="value" id="stat-external">0</span></div>
          <div><span class="label">Edges:</span>       <span class="value" id="stat-edges">0</span></div>
          <div><span class="label">Cycles:</span>      <span class="value" id="stat-cycles">0</span></div>
        </div>
      </div>
    </div>

    <div id="graph-container">
      <canvas id="canvas"></canvas>

      <div class="legend">
        <div class="legend-title">Edges</div>
        <div class="legend-item">
          <div class="legend-line" style="background:#e0e0e0;"></div> Production
        </div>
        <div class="legend-item">
          <div class="legend-line" style="background:#6b7280;border-top:2px dashed #6b7280;height:0;"></div> Development
        </div>
        <div class="legend-item">
          <div class="legend-line" style="background:#3b82f6;"></div> Peer
        </div>
        <div class="legend-item">
          <div class="legend-line" style="background:#f59e0b;"></div> Optional
        </div>
        <div class="legend-item">
          <div class="legend-line" style="background:#ef4444;"></div> Circular
        </div>
        <div id="legend-workspaces"></div>
      </div>

      <div class="controls-bottom">
        <button class="btn" id="btn-fit">Fit to View</button>
        <button class="btn btn-secondary" id="btn-reset">Reset</button>
        <span class="hint">Scroll to zoom · Click node to focus · Esc to clear</span>
      </div>

      <div class="tooltip" id="tooltip"></div>
    </div>
  </div>

  <script>
    const graphData = ${graphJson};

    // Workspace color palette — each internal package gets a distinct color
    const WS_COLORS = [
      '#60a5fa', '#34d399', '#fb923c', '#a78bfa',
      '#f472b6', '#facc15', '#2dd4bf', '#f87171',
      '#818cf8', '#4ade80', '#fbbf24', '#38bdf8',
    ];

    // Canvas setup
    const canvas = document.getElementById('canvas');
    const ctx = canvas.getContext('2d');
    const tooltip = document.getElementById('tooltip');

    let width = canvas.parentElement.clientWidth;
    let height = canvas.parentElement.clientHeight;
    canvas.width = width * window.devicePixelRatio;
    canvas.height = height * window.devicePixelRatio;
    canvas.style.width = width + 'px';
    canvas.style.height = height + 'px';
    ctx.scale(window.devicePixelRatio, window.devicePixelRatio);

    // Graph state
    let nodes = [];
    let edges = [];
    let transform = { x: width / 2, y: height / 2, scale: 1 };
    let isDragging = false;
    let dragStart = { x: 0, y: 0 };
    let mouseDownPos = { x: 0, y: 0 };
    let hoveredNode = null;
    let hoveredEdge = null;
    let selectedNode = null;
    let inDegree = new Map();

    // Initialize graph
    function initGraph() {
      const wsColorMap = new Map();
      let colorIdx = 0;

      nodes = graphData.nodes.map(node => {
        let color;
        if (node.type === 'internal') {
          const key = node.workspace || node.id;
          if (!wsColorMap.has(key)) wsColorMap.set(key, WS_COLORS[colorIdx++ % WS_COLORS.length]);
          color = wsColorMap.get(key);
        } else {
          color = '#9d7fe3'; // consistent muted purple for all external nodes
        }
        return { ...node, x: 0, y: 0, vx: 0, vy: 0, radius: node.type === 'internal' ? 5 : 3, color };
      });

      // Layered seeding: internal nodes in inner ring, external in outer ring
      const internals = nodes.filter(n => n.type === 'internal');
      const externals = nodes.filter(n => n.type === 'external');

      const innerR = Math.max(50, internals.length * 10);
      const outerR = Math.max(innerR + 80, externals.length * 6);

      internals.forEach((n, i) => {
        const angle = (i / Math.max(internals.length, 1)) * 2 * Math.PI;
        n.x = Math.cos(angle) * innerR + (Math.random() - 0.5) * 8;
        n.y = Math.sin(angle) * innerR + (Math.random() - 0.5) * 8;
      });

      externals.forEach((n, i) => {
        const angle = (i / Math.max(externals.length, 1)) * 2 * Math.PI;
        n.x = Math.cos(angle) * outerR + (Math.random() - 0.5) * 12;
        n.y = Math.sin(angle) * outerR + (Math.random() - 0.5) * 12;
      });

      edges = graphData.edges.map(e => ({
        ...e,
        source: nodes.find(n => n.id === e.from),
        target: nodes.find(n => n.id === e.to),
      })).filter(e => e.source && e.target);

      // Pre-compute in-degree (how many nodes depend on each)
      inDegree = new Map();
      for (const e of edges) inDegree.set(e.to, (inDegree.get(e.to) || 0) + 1);

      buildWorkspaceLegend(wsColorMap);
      updateStats();
      runSimulation();
      setTimeout(() => fitToView(), 50);
    }

    function buildWorkspaceLegend(wsColorMap) {
      const el = document.getElementById('legend-workspaces');
      if (!el || wsColorMap.size === 0) return;
      let html = '<div class="legend-title" style="margin-top:14px;">Workspaces</div>';
      wsColorMap.forEach((color, ws) => {
        const label = ws.split(/[\\/]/).pop() || ws;
        html += \`<div class="legend-item">
          <div class="legend-color" style="background:\${color};border-radius:50%;"></div>
          \${label}
        </div>\`;
      });
      html += '<div class="legend-item" style="margin-top:4px;">'
        + '<div class="legend-color" style="background:#9d7fe3;border-radius:50%;"></div>'
        + 'External</div>';
      el.innerHTML = html;
    }

    // Force-directed simulation with center gravity
    function runSimulation() {
      const iterations = 350;
      const k = 35;
      const damping = 0.15;
      const gravity = 0.04;

      for (let iter = 0; iter < iterations; iter++) {
        // Repulsion between every pair
        for (let i = 0; i < nodes.length; i++) {
          for (let j = i + 1; j < nodes.length; j++) {
            const dx = nodes[j].x - nodes[i].x;
            const dy = nodes[j].y - nodes[i].y;
            const dist = Math.sqrt(dx*dx + dy*dy) || 1;
            const force = (k * k) / dist;
            const fx = (dx / dist) * force;
            const fy = (dy / dist) * force;
            nodes[i].vx -= fx; nodes[i].vy -= fy;
            nodes[j].vx += fx; nodes[j].vy += fy;
          }
        }

        // Attraction along edges
        for (const e of edges) {
          const dx = e.target.x - e.source.x;
          const dy = e.target.y - e.source.y;
          const dist = Math.sqrt(dx*dx + dy*dy) || 1;
          const force = dist / k;
          const fx = (dx / dist) * force;
          const fy = (dy / dist) * force;
          e.source.vx += fx; e.source.vy += fy;
          e.target.vx -= fx; e.target.vy -= fy;
        }

        // Center gravity — prevents nodes drifting off-canvas
        for (const n of nodes) {
          n.vx -= n.x * gravity;
          n.vy -= n.y * gravity;
          n.x += n.vx;
          n.y += n.vy;
          n.vx *= (1 - damping);
          n.vy *= (1 - damping);
        }
      }

      render();
    }

    // Draw a filled arrowhead at the target end of an edge
    function drawArrowhead(sx, sy, tx, ty, targetR, color) {
      const dx = tx - sx;
      const dy = ty - sy;
      const len = Math.sqrt(dx*dx + dy*dy) || 1;
      const ux = dx / len, uy = dy / len;
      const px = -uy, py = ux; // perpendicular

      const tipX = tx - ux * (targetR + 1);
      const tipY = ty - uy * (targetR + 1);
      const arrowLen = 6, arrowWid = 2.5;

      ctx.beginPath();
      ctx.moveTo(tipX, tipY);
      ctx.lineTo(tipX - ux*arrowLen + px*arrowWid, tipY - uy*arrowLen + py*arrowWid);
      ctx.lineTo(tipX - ux*arrowLen - px*arrowWid, tipY - uy*arrowLen - py*arrowWid);
      ctx.closePath();
      ctx.fillStyle = color;
      ctx.fill();
    }

    function render() {
      ctx.clearRect(0, 0, width, height);
      ctx.save();
      ctx.translate(transform.x, transform.y);
      ctx.scale(transform.scale, transform.scale);

      // Build focus set when a node is selected
      const focused = new Set();
      if (selectedNode) {
        focused.add(selectedNode.id);
        for (const e of edges) {
          if (e.source === selectedNode) focused.add(e.target.id);
          if (e.target === selectedNode) focused.add(e.source.id);
        }
      }
      const hasFocus = focused.size > 0;

      // ── Edges ──────────────────────────────────────────────────────────────
      for (const e of edges) {
        if (!isEdgeVisible(e)) continue;

        const involvesFocus = hasFocus && (focused.has(e.source.id) || focused.has(e.target.id));
        ctx.globalAlpha = hasFocus ? (involvesFocus ? 0.9 : 0.08) : 0.75;

        const dx = e.target.x - e.source.x;
        const dy = e.target.y - e.source.y;
        const len = Math.sqrt(dx*dx + dy*dy) || 1;
        const ux = dx / len, uy = dy / len;

        const sx = e.source.x + ux * e.source.radius;
        const sy = e.source.y + uy * e.source.radius;
        // Line stops short of target so arrowhead sits cleanly on the node edge
        const ex = e.target.x - ux * (e.target.radius + 7);
        const ey = e.target.y - uy * (e.target.radius + 7);

        const color = e.circular ? '#ef4444' : getEdgeColor(e.type);

        ctx.beginPath();
        ctx.moveTo(sx, sy);
        ctx.lineTo(ex, ey);
        ctx.strokeStyle = color;
        ctx.lineWidth = (e === hoveredEdge) ? 2 : (e.circular ? 1.5 : 1);
        ctx.setLineDash(e.type === 'dev' ? [4, 4] : []);
        ctx.stroke();
        ctx.setLineDash([]);

        drawArrowhead(e.source.x, e.source.y, e.target.x, e.target.y, e.target.radius, color);

        // Version label in the middle of hovered edge
        if (e === hoveredEdge && e.versionRange) {
          ctx.globalAlpha = 1;
          const mx = (e.source.x + e.target.x) / 2;
          const my = (e.source.y + e.target.y) / 2;
          ctx.font = '9px sans-serif';
          ctx.textAlign = 'center';
          const tw = ctx.measureText(e.versionRange).width;
          ctx.fillStyle = 'rgba(10,14,39,0.85)';
          ctx.fillRect(mx - tw/2 - 4, my - 9, tw + 8, 14);
          ctx.fillStyle = '#fbbf24';
          ctx.fillText(e.versionRange, mx, my + 2);
        }
      }

      ctx.globalAlpha = 1;

      // ── Nodes ──────────────────────────────────────────────────────────────
      for (const n of nodes) {
        if (!isNodeVisible(n)) continue;

        const dimmed = hasFocus && !focused.has(n.id);
        ctx.globalAlpha = dimmed ? 0.12 : 1;

        // Node circle
        ctx.beginPath();
        ctx.arc(n.x, n.y, n.radius, 0, 2 * Math.PI);
        ctx.fillStyle = n.color;
        ctx.fill();

        // Selection ring (yellow) or hover ring (white)
        if (n === selectedNode) {
          ctx.strokeStyle = '#fbbf24';
          ctx.lineWidth = 2;
          ctx.stroke();
        } else if (n === hoveredNode && !dimmed) {
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 1.5;
          ctx.stroke();
        }

        // Label — only for internal or hovered external nodes to reduce clutter
        if (n.type === 'internal' || n === hoveredNode || n === selectedNode) {
          ctx.fillStyle = dimmed ? '#444' : '#e0e0e0';
          ctx.font = n.type === 'internal' ? '10px sans-serif' : '9px sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText(n.label, n.x, n.y - n.radius - 3);
        }

        // In-degree badge: shown when a node is depended upon by 2+ others
        const count = inDegree.get(n.id) || 0;
        if (count > 1 && !dimmed) {
          const bx = n.x + n.radius + 1;
          const by = n.y - n.radius - 1;
          ctx.beginPath();
          ctx.arc(bx, by, 6, 0, 2 * Math.PI);
          ctx.fillStyle = '#1e3a8a';
          ctx.fill();
          ctx.strokeStyle = '#60a5fa';
          ctx.lineWidth = 0.8;
          ctx.stroke();
          ctx.fillStyle = '#e0e0e0';
          ctx.font = 'bold 6.5px sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText(String(count), bx, by + 2.5);
        }

        ctx.globalAlpha = 1;
      }

      ctx.restore();
    }

    function getEdgeColor(type) {
      switch (type) {
        case 'prod':     return '#d1d5db';
        case 'dev':      return '#6b7280';
        case 'peer':     return '#3b82f6';
        case 'optional': return '#f59e0b';
        default:         return '#d1d5db';
      }
    }

    function isNodeVisible(n) {
      if (n.type === 'internal' && !document.getElementById('show-internal').checked) return false;
      if (n.type === 'external' && !document.getElementById('show-external').checked) return false;
      const q = document.getElementById('search').value.toLowerCase();
      if (q && !n.label.toLowerCase().includes(q)) return false;
      return true;
    }

    function isEdgeVisible(e) {
      if (!isNodeVisible(e.source) || !isNodeVisible(e.target)) return false;
      if (e.type === 'prod'     && !document.getElementById('show-prod').checked)     return false;
      if (e.type === 'dev'      && !document.getElementById('show-dev').checked)      return false;
      if (e.type === 'peer'     && !document.getElementById('show-peer').checked)     return false;
      if (e.type === 'optional' && !document.getElementById('show-optional').checked) return false;
      return true;
    }

    // Shortest distance from point P to line segment AB
    function distToSegment(px, py, ax, ay, bx, by) {
      const dx = bx - ax, dy = by - ay;
      const lenSq = dx*dx + dy*dy;
      if (lenSq === 0) return Math.hypot(px - ax, py - ay);
      const t = Math.max(0, Math.min(1, ((px-ax)*dx + (py-ay)*dy) / lenSq));
      return Math.hypot(px - (ax + t*dx), py - (ay + t*dy));
    }

    function updateStats() {
      const vn = nodes.filter(isNodeVisible);
      const ve = edges.filter(isEdgeVisible);
      document.getElementById('stat-nodes').textContent    = vn.length;
      document.getElementById('stat-internal').textContent = vn.filter(n => n.type === 'internal').length;
      document.getElementById('stat-external').textContent = vn.filter(n => n.type === 'external').length;
      document.getElementById('stat-edges').textContent    = ve.length;
      document.getElementById('stat-cycles').textContent   = ve.filter(e => e.circular).length;
    }

    // ── Mouse events ──────────────────────────────────────────────────────────

    canvas.addEventListener('mousedown', e => {
      mouseDownPos = { x: e.clientX, y: e.clientY };
      dragStart    = { x: e.clientX - transform.x, y: e.clientY - transform.y };
      isDragging   = false;
    });

    canvas.addEventListener('mousemove', e => {
      const moved = Math.abs(e.clientX - mouseDownPos.x) + Math.abs(e.clientY - mouseDownPos.y) > 4;

      if (e.buttons === 1 && (moved || isDragging)) {
        isDragging = true;
        canvas.style.cursor = 'grabbing';
        transform.x = e.clientX - dragStart.x;
        transform.y = e.clientY - dragStart.y;
        render();
        return;
      }

      const rect = canvas.getBoundingClientRect();
      const mx = (e.clientX - rect.left  - transform.x) / transform.scale;
      const my = (e.clientY - rect.top   - transform.y) / transform.scale;

      // Node hover (slightly enlarged hit area)
      hoveredNode = null;
      for (const n of nodes) {
        if (!isNodeVisible(n)) continue;
        if (Math.hypot(mx - n.x, my - n.y) < n.radius + 5) { hoveredNode = n; break; }
      }

      // Edge hover (only when no node hovered)
      hoveredEdge = null;
      if (!hoveredNode) {
        for (const e of edges) {
          if (!isEdgeVisible(e)) continue;
          if (distToSegment(mx, my, e.source.x, e.source.y, e.target.x, e.target.y) < 5) {
            hoveredEdge = e; break;
          }
        }
      }

      canvas.style.cursor = (hoveredNode || hoveredEdge) ? 'pointer' : 'grab';

      if (hoveredNode)      showNodeTooltip(e.clientX, e.clientY, hoveredNode);
      else if (hoveredEdge) showEdgeTooltip(e.clientX, e.clientY, hoveredEdge);
      else                  hideTooltip();

      render();
    });

    canvas.addEventListener('mouseup', e => {
      const wasDrag = isDragging;
      isDragging = false;
      canvas.style.cursor = 'grab';

      if (!wasDrag) {
        // Click — toggle node selection
        const rect = canvas.getBoundingClientRect();
        const mx = (e.clientX - rect.left  - transform.x) / transform.scale;
        const my = (e.clientY - rect.top   - transform.y) / transform.scale;

        let clicked = null;
        for (const n of nodes) {
          if (!isNodeVisible(n)) continue;
          if (Math.hypot(mx - n.x, my - n.y) < n.radius + 5) { clicked = n; break; }
        }

        selectedNode = (clicked && clicked !== selectedNode) ? clicked : null;
        if (hoveredNode) showNodeTooltip(e.clientX, e.clientY, hoveredNode);
        render();
      }
    });

    canvas.addEventListener('mouseleave', () => {
      isDragging = false;
      hoveredNode = null;
      hoveredEdge = null;
      hideTooltip();
      render();
    });

    // Zoom toward cursor position
    canvas.addEventListener('wheel', e => {
      e.preventDefault();
      const rect   = canvas.getBoundingClientRect();
      const mx     = e.clientX - rect.left;
      const my     = e.clientY - rect.top;
      const factor = e.deltaY > 0 ? 0.88 : 1.14;
      const newScale = Math.max(0.05, Math.min(10, transform.scale * factor));
      transform.x = mx - (mx - transform.x) * (newScale / transform.scale);
      transform.y = my - (my - transform.y) * (newScale / transform.scale);
      transform.scale = newScale;
      render();
    }, { passive: false });

    // Escape to clear selection
    window.addEventListener('keydown', e => {
      if (e.key === 'Escape') { selectedNode = null; render(); }
    });

    // ── Tooltips ──────────────────────────────────────────────────────────────

    function showNodeTooltip(x, y, n) {
      const deps  = edges.filter(e => e.from === n.id);
      const depBy = edges.filter(e => e.to   === n.id);
      tooltip.innerHTML = \`
        <div class="tooltip-title">\${n.label}</div>
        \${n.version     ? \`<div class="tooltip-row"><span class="tooltip-label">Version</span>\${n.version}</div>\`     : ''}
        \${n.description ? \`<div class="tooltip-row"><span class="tooltip-label">Description</span>\${n.description}</div>\` : ''}
        <div class="tooltip-row"><span class="tooltip-label">Type</span>\${n.type}</div>
        \${n.workspace   ? \`<div class="tooltip-row"><span class="tooltip-label">Workspace</span>\${n.workspace}</div>\` : ''}
        <div class="tooltip-row"><span class="tooltip-label">Depends on</span>\${deps.length}</div>
        <div class="tooltip-row"><span class="tooltip-label">Depended on by</span>\${depBy.length}</div>
        <div class="tooltip-hint">\${n === selectedNode ? 'Click to deselect' : 'Click to focus'}</div>
      \`;
      positionTooltip(x, y);
    }

    function showEdgeTooltip(x, y, e) {
      tooltip.innerHTML = \`
        <div class="tooltip-title">\${e.from} → \${e.to}</div>
        <div class="tooltip-row"><span class="tooltip-label">Type</span>\${e.type}</div>
        <div class="tooltip-row"><span class="tooltip-label">Range</span>\${e.versionRange}</div>
        \${e.resolvedVersion ? \`<div class="tooltip-row"><span class="tooltip-label">Resolved</span>\${e.resolvedVersion}</div>\` : ''}
        \${e.circular ? '<div style="margin-top:6px;color:#ef4444;font-weight:600;">⚠ Circular dependency</div>' : ''}
      \`;
      positionTooltip(x, y);
    }

    function positionTooltip(x, y) {
      tooltip.style.display = 'block';
      const tw = tooltip.offsetWidth  || 200;
      const th = tooltip.offsetHeight || 100;
      const left = (x + 14 + tw > window.innerWidth)  ? x - tw - 10 : x + 14;
      const top  = (y + 14 + th > window.innerHeight)  ? y - th - 10 : y + 14;
      tooltip.style.left = left + 'px';
      tooltip.style.top  = top  + 'px';
    }

    function hideTooltip() { tooltip.style.display = 'none'; }

    // ── Fit / Reset ───────────────────────────────────────────────────────────

    function fitToView() {
      const vn = nodes.filter(isNodeVisible);
      if (vn.length === 0) return;

      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      for (const n of vn) {
        minX = Math.min(minX, n.x - n.radius);
        maxX = Math.max(maxX, n.x + n.radius);
        minY = Math.min(minY, n.y - n.radius);
        maxY = Math.max(maxY, n.y + n.radius);
      }

      const pad  = 60;
      const scale = Math.min(
        (width  - pad * 2) / Math.max(maxX - minX, 1),
        (height - pad * 2) / Math.max(maxY - minY, 1),
        4
      );
      transform.scale = scale;
      transform.x = width  / 2 - ((minX + maxX) / 2) * scale;
      transform.y = height / 2 - ((minY + maxY) / 2) * scale;
      render();
    }

    // ── Controls ──────────────────────────────────────────────────────────────

    document.getElementById('search').addEventListener('input', () => { updateStats(); render(); });

    ['show-internal','show-external','show-prod','show-dev','show-peer','show-optional']
      .forEach(id => document.getElementById(id).addEventListener('change', () => { updateStats(); render(); }));

    document.getElementById('btn-fit').addEventListener('click', fitToView);

    document.getElementById('btn-reset').addEventListener('click', () => {
      transform  = { x: width / 2, y: height / 2, scale: 1 };
      selectedNode = null;
      render();
    });

    // ── Resize ────────────────────────────────────────────────────────────────

    window.addEventListener('resize', () => {
      width  = canvas.parentElement.clientWidth;
      height = canvas.parentElement.clientHeight;
      canvas.width  = width  * window.devicePixelRatio;
      canvas.height = height * window.devicePixelRatio;
      canvas.style.width  = width  + 'px';
      canvas.style.height = height + 'px';
      ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
      render();
    });

    initGraph();
  </script>
</body>
</html>`;
}
