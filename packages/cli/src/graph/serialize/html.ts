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
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      background: #0a0e27;
      color: #e0e0e0;
      overflow: hidden;
    }

    #container {
      display: flex;
      height: 100vh;
    }

    #sidebar {
      width: 300px;
      background: #151934;
      border-right: 1px solid #2a2f4f;
      padding: 20px;
      overflow-y: auto;
    }

    #sidebar h1 {
      font-size: 20px;
      margin-bottom: 20px;
      color: #60a5fa;
    }

    .control-group {
      margin-bottom: 20px;
    }

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

    .checkbox-group {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .checkbox-group label {
      display: flex;
      align-items: center;
      font-size: 14px;
      color: #e0e0e0;
      text-transform: none;
      font-weight: normal;
      cursor: pointer;
    }

    .checkbox-group input[type="checkbox"] {
      margin-right: 8px;
    }

    #stats {
      padding: 12px;
      background: #0a0e27;
      border-radius: 4px;
      font-size: 12px;
      line-height: 1.8;
    }

    #stats div {
      display: flex;
      justify-content: space-between;
    }

    #stats .label {
      color: #9ca3af;
    }

    #stats .value {
      color: #60a5fa;
      font-weight: 600;
    }

    #graph-container {
      flex: 1;
      position: relative;
      overflow: hidden;
    }

    #canvas {
      width: 100%;
      height: 100%;
      cursor: grab;
    }

    #canvas:active {
      cursor: grabbing;
    }

    .legend {
      position: absolute;
      bottom: 20px;
      right: 20px;
      background: rgba(21, 25, 52, 0.95);
      padding: 16px;
      border-radius: 8px;
      border: 1px solid #2a2f4f;
      font-size: 12px;
    }

    .legend-title {
      font-weight: 600;
      margin-bottom: 12px;
      color: #60a5fa;
    }

    .legend-item {
      display: flex;
      align-items: center;
      margin-bottom: 8px;
    }

    .legend-color {
      width: 16px;
      height: 16px;
      border-radius: 3px;
      margin-right: 8px;
    }

    .legend-line {
      width: 20px;
      height: 2px;
      margin-right: 8px;
    }

    .tooltip {
      position: absolute;
      background: rgba(0, 0, 0, 0.9);
      color: white;
      padding: 12px;
      border-radius: 4px;
      font-size: 12px;
      pointer-events: none;
      display: none;
      z-index: 1000;
      max-width: 300px;
      border: 1px solid #60a5fa;
    }

    .tooltip-title {
      font-weight: 600;
      font-size: 14px;
      margin-bottom: 8px;
      color: #60a5fa;
    }

    .tooltip-row {
      display: flex;
      justify-content: space-between;
      margin-bottom: 4px;
    }

    .tooltip-label {
      color: #9ca3af;
      margin-right: 12px;
    }

    .controls-bottom {
      position: absolute;
      bottom: 20px;
      left: 20px;
      display: flex;
      gap: 8px;
    }

    .btn {
      padding: 8px 16px;
      background: #2563eb;
      color: white;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      font-size: 14px;
      font-weight: 500;
    }

    .btn:hover {
      background: #1d4ed8;
    }

    .btn-secondary {
      background: #374151;
    }

    .btn-secondary:hover {
      background: #4b5563;
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
          <label>
            <input type="checkbox" id="show-internal" checked>
            Internal Packages
          </label>
          <label>
            <input type="checkbox" id="show-external" checked>
            External Dependencies
          </label>
        </div>
      </div>

      <div class="control-group">
        <label>Dependency Types</label>
        <div class="checkbox-group">
          <label>
            <input type="checkbox" id="show-prod" checked>
            Production
          </label>
          <label>
            <input type="checkbox" id="show-dev" checked>
            Development
          </label>
          <label>
            <input type="checkbox" id="show-peer" checked>
            Peer
          </label>
          <label>
            <input type="checkbox" id="show-optional" checked>
            Optional
          </label>
        </div>
      </div>

      <div class="control-group">
        <label>Statistics</label>
        <div id="stats">
          <div><span class="label">Total Nodes:</span> <span class="value" id="stat-nodes">0</span></div>
          <div><span class="label">Internal:</span> <span class="value" id="stat-internal">0</span></div>
          <div><span class="label">External:</span> <span class="value" id="stat-external">0</span></div>
          <div><span class="label">Edges:</span> <span class="value" id="stat-edges">0</span></div>
          <div><span class="label">Cycles:</span> <span class="value" id="stat-cycles">0</span></div>
        </div>
      </div>
    </div>

    <div id="graph-container">
      <canvas id="canvas"></canvas>

      <div class="legend">
        <div class="legend-title">Nodes</div>
        <div class="legend-item">
          <div class="legend-color" style="background: #60a5fa;"></div>
          Internal Package
        </div>
        <div class="legend-item">
          <div class="legend-color" style="background: #c084fc;"></div>
          External Dependency
        </div>
        <div class="legend-title" style="margin-top: 12px;">Edges</div>
        <div class="legend-item">
          <div class="legend-line" style="background: #e0e0e0;"></div>
          Production
        </div>
        <div class="legend-item">
          <div class="legend-line" style="background: #6b7280; opacity: 0.5;"></div>
          Development
        </div>
        <div class="legend-item">
          <div class="legend-line" style="background: #3b82f6;"></div>
          Peer
        </div>
        <div class="legend-item">
          <div class="legend-line" style="background: #f59e0b;"></div>
          Optional
        </div>
        <div class="legend-item">
          <div class="legend-line" style="background: #ef4444;"></div>
          Circular
        </div>
      </div>

      <div class="controls-bottom">
        <button class="btn" id="btn-fit">Fit to View</button>
        <button class="btn btn-secondary" id="btn-reset">Reset Zoom</button>
      </div>

      <div class="tooltip" id="tooltip"></div>
    </div>
  </div>

  <script>
    const graphData = ${graphJson};

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
    let hoveredNode = null;

    // Initialize graph
    function initGraph() {
      // More compact initial positioning
      nodes = graphData.nodes.map((node, i) => ({
        ...node,
        x: Math.random() * 80 - 40,
        y: Math.random() * 80 - 40,
        vx: 0,
        vy: 0,
        radius: node.type === 'internal' ? 5 : 3,
      }));

      edges = graphData.edges.map(edge => ({
        ...edge,
        source: nodes.find(n => n.id === edge.from),
        target: nodes.find(n => n.id === edge.to),
      })).filter(e => e.source && e.target);

      updateStats();
      runSimulation();

      // Auto-fit to view after simulation
      setTimeout(() => fitToView(), 50);
    }

    // Force-directed layout (simplified)
    function runSimulation() {
      const iterations = 300;
      const k = 35; // Ideal spring length — smaller = more compact layout
      const c = 0.15; // Damping

      for (let iter = 0; iter < iterations; iter++) {
        // Repulsive forces between all nodes
        for (let i = 0; i < nodes.length; i++) {
          for (let j = i + 1; j < nodes.length; j++) {
            const dx = nodes[j].x - nodes[i].x;
            const dy = nodes[j].y - nodes[i].y;
            const dist = Math.sqrt(dx * dx + dy * dy) || 1;
            const force = (k * k) / dist;

            const fx = (dx / dist) * force;
            const fy = (dy / dist) * force;

            nodes[i].vx -= fx;
            nodes[i].vy -= fy;
            nodes[j].vx += fx;
            nodes[j].vy += fy;
          }
        }

        // Attractive forces along edges
        for (const edge of edges) {
          const dx = edge.target.x - edge.source.x;
          const dy = edge.target.y - edge.source.y;
          const dist = Math.sqrt(dx * dx + dy * dy) || 1;
          const force = dist / k;

          const fx = (dx / dist) * force;
          const fy = (dy / dist) * force;

          edge.source.vx += fx;
          edge.source.vy += fy;
          edge.target.vx -= fx;
          edge.target.vy -= fy;
        }

        // Update positions
        for (const node of nodes) {
          node.x += node.vx;
          node.y += node.vy;
          node.vx *= (1 - c);
          node.vy *= (1 - c);
        }
      }

      render();
    }

    // Render graph
    function render() {
      ctx.clearRect(0, 0, width, height);
      ctx.save();
      ctx.translate(transform.x, transform.y);
      ctx.scale(transform.scale, transform.scale);

      // Draw edges
      for (const edge of edges) {
        if (!isEdgeVisible(edge)) continue;

        ctx.beginPath();
        ctx.moveTo(edge.source.x, edge.source.y);
        ctx.lineTo(edge.target.x, edge.target.y);

        if (edge.circular) {
          ctx.strokeStyle = '#ef4444';
          ctx.lineWidth = 2;
        } else {
          ctx.strokeStyle = getEdgeColor(edge.type);
          ctx.lineWidth = 1;
          if (edge.type === 'dev') {
            ctx.setLineDash([5, 5]);
          } else {
            ctx.setLineDash([]);
          }
        }

        ctx.stroke();
        ctx.setLineDash([]);
      }

      // Draw nodes
      for (const node of nodes) {
        if (!isNodeVisible(node)) continue;

        ctx.beginPath();
        ctx.arc(node.x, node.y, node.radius, 0, 2 * Math.PI);
        ctx.fillStyle = node.type === 'internal' ? '#60a5fa' : '#c084fc';
        ctx.fill();

        if (node === hoveredNode) {
          ctx.strokeStyle = '#fbbf24';
          ctx.lineWidth = 2;
          ctx.stroke();
        }

        // Draw label
        ctx.fillStyle = '#e0e0e0';
        ctx.font = node.type === 'internal' ? '10px sans-serif' : '9px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(node.label, node.x, node.y - node.radius - 3);
      }

      ctx.restore();
    }

    function getEdgeColor(type) {
      switch (type) {
        case 'prod': return '#e0e0e0';
        case 'dev': return '#6b7280';
        case 'peer': return '#3b82f6';
        case 'optional': return '#f59e0b';
        default: return '#e0e0e0';
      }
    }

    function isNodeVisible(node) {
      if (node.type === 'internal' && !document.getElementById('show-internal').checked) return false;
      if (node.type === 'external' && !document.getElementById('show-external').checked) return false;

      const search = document.getElementById('search').value.toLowerCase();
      if (search && !node.label.toLowerCase().includes(search)) return false;

      return true;
    }

    function isEdgeVisible(edge) {
      if (!isNodeVisible(edge.source) || !isNodeVisible(edge.target)) return false;
      if (edge.type === 'prod' && !document.getElementById('show-prod').checked) return false;
      if (edge.type === 'dev' && !document.getElementById('show-dev').checked) return false;
      if (edge.type === 'peer' && !document.getElementById('show-peer').checked) return false;
      if (edge.type === 'optional' && !document.getElementById('show-optional').checked) return false;
      return true;
    }

    function updateStats() {
      const visibleNodes = nodes.filter(isNodeVisible);
      const visibleEdges = edges.filter(isEdgeVisible);
      const cycles = edges.filter(e => e.circular && isEdgeVisible(e));

      document.getElementById('stat-nodes').textContent = visibleNodes.length;
      document.getElementById('stat-internal').textContent = visibleNodes.filter(n => n.type === 'internal').length;
      document.getElementById('stat-external').textContent = visibleNodes.filter(n => n.type === 'external').length;
      document.getElementById('stat-edges').textContent = visibleEdges.length;
      document.getElementById('stat-cycles').textContent = cycles.length;
    }

    // Mouse events
    canvas.addEventListener('mousedown', (e) => {
      isDragging = true;
      dragStart = { x: e.clientX - transform.x, y: e.clientY - transform.y };
    });

    canvas.addEventListener('mousemove', (e) => {
      if (isDragging) {
        transform.x = e.clientX - dragStart.x;
        transform.y = e.clientY - dragStart.y;
        render();
        return;
      }

      // Check hover
      const rect = canvas.getBoundingClientRect();
      const mx = (e.clientX - rect.left - transform.x) / transform.scale;
      const my = (e.clientY - rect.top - transform.y) / transform.scale;

      hoveredNode = null;
      for (const node of nodes) {
        if (!isNodeVisible(node)) continue;
        const dx = mx - node.x;
        const dy = my - node.y;
        if (dx * dx + dy * dy < node.radius * node.radius) {
          hoveredNode = node;
          break;
        }
      }

      if (hoveredNode) {
        showTooltip(e.clientX, e.clientY, hoveredNode);
      } else {
        hideTooltip();
      }

      render();
    });

    canvas.addEventListener('mouseup', () => {
      isDragging = false;
    });

    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      const delta = e.deltaY > 0 ? 0.9 : 1.1;
      transform.scale *= delta;
      transform.scale = Math.max(0.1, Math.min(5, transform.scale));
      render();
    });

    function showTooltip(x, y, node) {
      tooltip.style.display = 'block';
      tooltip.style.left = (x + 10) + 'px';
      tooltip.style.top = (y + 10) + 'px';

      const deps = edges.filter(e => e.from === node.id);
      const depBy = edges.filter(e => e.to === node.id);

      tooltip.innerHTML = \`
        <div class="tooltip-title">\${node.label}</div>
        \${node.version ? \`<div class="tooltip-row"><span class="tooltip-label">Version:</span> \${node.version}</div>\` : ''}
        \${node.description ? \`<div class="tooltip-row"><span class="tooltip-label">Description:</span> \${node.description}</div>\` : ''}
        <div class="tooltip-row"><span class="tooltip-label">Type:</span> \${node.type}</div>
        <div class="tooltip-row"><span class="tooltip-label">Dependencies:</span> \${deps.length}</div>
        <div class="tooltip-row"><span class="tooltip-label">Dependents:</span> \${depBy.length}</div>
      \`;
    }

    function hideTooltip() {
      tooltip.style.display = 'none';
    }

    function fitToView() {
      const visibleNodes = nodes.filter(isNodeVisible);
      if (visibleNodes.length === 0) return;

      // Calculate bounding box
      let minX = Infinity, maxX = -Infinity;
      let minY = Infinity, maxY = -Infinity;

      for (const node of visibleNodes) {
        minX = Math.min(minX, node.x - node.radius);
        maxX = Math.max(maxX, node.x + node.radius);
        minY = Math.min(minY, node.y - node.radius);
        maxY = Math.max(maxY, node.y + node.radius);
      }

      const graphWidth = maxX - minX;
      const graphHeight = maxY - minY;
      const padding = 50;

      // Calculate scale to fit
      const scaleX = (width - padding * 2) / graphWidth;
      const scaleY = (height - padding * 2) / graphHeight;
      const scale = Math.min(scaleX, scaleY, 2); // Cap at 2x zoom

      // Center the graph
      const centerX = (minX + maxX) / 2;
      const centerY = (minY + maxY) / 2;

      transform.scale = scale;
      transform.x = width / 2 - centerX * scale;
      transform.y = height / 2 - centerY * scale;

      render();
    }

    // Controls
    document.getElementById('search').addEventListener('input', () => {
      updateStats();
      render();
    });

    ['show-internal', 'show-external', 'show-prod', 'show-dev', 'show-peer', 'show-optional'].forEach(id => {
      document.getElementById(id).addEventListener('change', () => {
        updateStats();
        render();
      });
    });

    document.getElementById('btn-fit').addEventListener('click', fitToView);

    document.getElementById('btn-reset').addEventListener('click', () => {
      transform = { x: width / 2, y: height / 2, scale: 1 };
      render();
    });

    // Initialize
    initGraph();

    // Resize handler
    window.addEventListener('resize', () => {
      width = canvas.parentElement.clientWidth;
      height = canvas.parentElement.clientHeight;
      canvas.width = width * window.devicePixelRatio;
      canvas.height = height * window.devicePixelRatio;
      canvas.style.width = width + 'px';
      canvas.style.height = height + 'px';
      ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
      render();
    });
  </script>
</body>
</html>`;
}
