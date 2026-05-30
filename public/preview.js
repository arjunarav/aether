const state = {
  briefing: null,
  relationships: null,
  regret: null,
  sources: [],
  entries: [],
  askResult: null,
  mode: 'off',
  query: '',
  sourcePanel: null,
  consoleOpen: window.innerWidth >= 1180,
  phase: 'Connecting to sources...',
  graph: 'life'
};

const modes = [
  ['behind', 'I feel behind'],
  ['off', 'Something feels off'],
  ['decide', 'Help me decide'],
  ['debug', 'Debug my week']
];

const nav = [
  ['life', 'Life Graph'],
  ['autopilot', 'Autopilot'],
  ['people', 'People'],
  ['regret', 'Regret']
];

async function api(path, options) {
  const res = await fetch(path, options);
  if (!res.ok) throw new Error(path);
  return res.json();
}

function uniqueById(items) {
  const seen = new Set();
  return items.filter((item) => {
    if (!item || seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}

async function boot() {
  const [briefing, relationships, regret, sourceData] = await Promise.all([
    api('/api/briefing'),
    api('/api/relationships'),
    api('/api/regret'),
    api('/api/coral/sources')
  ]);
  state.briefing = briefing;
  state.relationships = relationships;
  state.regret = regret;
  state.sources = sourceData.sources;
  state.entries = uniqueById([...briefing.queries_run, ...relationships.queries_run, ...regret.queries_run]);
  state.phase = 'Reasoning complete - 3 insights surfaced';
  render();
}

function data() {
  return {
    briefing: state.askResult?.data?.briefing || state.briefing,
    relationships: state.askResult?.data?.relationships || state.relationships,
    regret: state.askResult?.data?.regret || state.regret
  };
}

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
}

function render() {
  const d = data();
  const insights = state.askResult?.insights || state.briefing.top_3_insights;
  const graph = state.askResult?.graph || state.graph;

  document.getElementById('root').innerHTML = `
    <main class="aether-shell ${state.consoleOpen ? 'console-open' : 'console-closed'}">
      <aside class="sidebar">
        <div class="brand-lockup">AETHER</div>
        <p class="sidebar-kicker">Personal OS</p>
        <nav>${nav.map(([id, label]) => `<button class="nav-item ${state.graph === id ? 'active' : ''}" data-nav="${id}">${label}</button>`).join('')}</nav>
        <div class="sidebar-metric"><span>Chaos</span><strong>${state.briefing.chaos_score}</strong></div>
      </aside>
      <section id="main-feed" class="main-feed">
        <header class="topbar">
          <div>
            <p class="eyebrow">A personal operating system powered by Coral.</p>
            <h1>Aether already has opinions about your week.</h1>
          </div>
          <div class="live-state"><span class="live-dot"></span>LIVE</div>
        </header>
        <section class="proactive-banner insight-card severity-watch">
          <div class="banner-copy">
            <p class="eyebrow">Proactive intelligence</p>
            <h2>Aether is tracking 3 risks this week.</h2>
          </div>
          <div class="chip-row">
            ${state.briefing.proactive_risks.map((risk) => `<button class="query-chip" data-query="${esc(risk.query)}">${esc(risk.label)}</button>`).join('')}
          </div>
        </section>
        <section class="ask-panel">
          <p class="ask-heading">How do you want to think right now?</p>
          <div class="mode-row">
            ${modes.map(([id, label]) => `<button class="mode-button ${state.mode === id ? 'active' : ''}" data-mode="${id}">${label}</button>`).join('')}
          </div>
          <form class="ask-form" id="ask-form">
            <input id="ask-input" value="${esc(state.query)}" placeholder="What is quietly becoming a problem?" />
            <button class="text-command" type="submit">Ask Aether -></button>
          </form>
        </section>
        ${state.askResult ? `<section class="aether-response insight-card severity-act"><p class="eyebrow">Aether says</p><p>${esc(state.askResult.response)}</p></section>` : ''}
        <section class="graph-shell chart-container">
          <div class="section-header"><p class="eyebrow">Context graph</p><h2>${graphTitle(graph)}</h2></div>
          ${graphHtml(graph, d)}
        </section>
        <section class="insight-stack">
          <div class="section-header"><p class="eyebrow">Intelligence feed</p><h2>What needs you most</h2></div>
          ${insights.map((insight) => insightCard(insight, state.askResult?.queries_run || state.briefing.queries_run)).join('')}
        </section>
        <section class="module-grid">
          ${autopilot(d.briefing)}
          ${peopleModule(d.relationships)}
          ${regretModule(d.regret)}
        </section>
      </section>
      ${consoleHtml()}
      ${state.sourcePanel ? sourcePanelHtml(state.sourcePanel) : ''}
    </main>
  `;

  bind();
  typeConsole();
}

function bind() {
  document.querySelectorAll('[data-query]').forEach((button) => {
    button.addEventListener('click', () => runAsk(button.dataset.query));
  });
  document.querySelectorAll('[data-mode]').forEach((button) => {
    button.addEventListener('click', () => {
      state.mode = button.dataset.mode;
      if (state.mode === 'debug') runAsk('Debug my week.');
      render();
    });
  });
  document.querySelectorAll('[data-nav]').forEach((button) => {
    button.addEventListener('click', () => {
      state.graph = button.dataset.nav;
      render();
    });
  });
  document.querySelectorAll('[data-source]').forEach((button) => {
    button.addEventListener('click', () => {
      state.sourcePanel = button.dataset.source;
      render();
    });
  });
  document.querySelector('[data-close]')?.addEventListener('click', () => {
    state.sourcePanel = null;
    render();
  });
  document.querySelectorAll('[data-console-toggle]').forEach((button) => {
    button.addEventListener('click', () => {
      state.consoleOpen = !state.consoleOpen;
      render();
    });
  });
  document.querySelector('[data-console-hide]')?.addEventListener('click', () => {
    state.consoleOpen = false;
    render();
  });
  document.getElementById('ask-form')?.addEventListener('submit', (event) => {
    event.preventDefault();
    runAsk(document.getElementById('ask-input').value);
  });
}

async function runAsk(query) {
  if (!query.trim()) return;
  state.query = query.trim();
  state.phase = 'Running queries across Calendar, Gmail, Notion, and health signals...';
  render();
  const result = await api('/api/ask', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: state.query, mode: state.mode })
  });
  state.askResult = result;
  state.entries = uniqueById([...result.queries_run, ...state.entries]);
  state.phase = `Reasoning complete - ${result.insights.length} insights surfaced`;
  render();
}

function graphTitle(type) {
  if (type === 'relationships' || type === 'people') return 'Relationship heatmap';
  if (type === 'regret') return 'Regret projection';
  if (type === 'decision') return 'Decision impact matrix';
  if (type === 'life' || type === 'debug') return 'Life graph';
  return 'Chaos timeline';
}

function insightCard(insight, queries) {
  const severity = String(insight.severity || 'INFO').toLowerCase();
  return `
    <article class="insight-card severity-${severity}">
      <header class="insight-header">
        <div><p class="eyebrow">${esc(insight.severity || 'INFO')}</p><h3>${esc(insight.title)}</h3></div>
        <div class="score-badge"><span>${esc(insight.score || 80)}</span><small>/100</small></div>
      </header>
      <div class="evidence-list"><p class="micro-label">Evidence</p>${(insight.evidence || []).map((item) => `<p>- ${esc(item)}</p>`).join('')}</div>
      <div class="mini-graph">${inlineSignal(insight.score || 80)}</div>
      <div class="actions-list"><p class="micro-label">Recommended actions</p>${(insight.actions || []).map((item, i) => `<div class="action-row"><span>-> ${esc(item)}</span><button>${i === 0 ? 'Do it ->' : 'Draft ->'}</button></div>`).join('')}</div>
      <div class="source-row"><span>Sources:</span>${(insight.sources || []).map((source) => `<button class="source-badge" data-source="${esc(source.name || source)}">${esc(source.name || source)}</button>`).join('')}</div>
      <details class="reasoning-panel">
        <summary>How I figured this out</summary>
        <div class="reasoning-grid"><div><p class="micro-label">Confidence</p><p class="mono">${Math.round((insight.confidence || 0.82) * 100)}%</p></div><div><p class="micro-label">Joins</p><p>Calendar x Health on date. Contacts x Gmail on email. Goals cross-joined into regret horizon.</p></div></div>
        ${(queries || []).slice(0, 2).map((query) => `<pre class="sql-block"><code>${esc(query.sql)}</code></pre>`).join('')}
      </details>
    </article>
  `;
}

function graphHtml(type, d) {
  if (type === 'relationships' || type === 'people') return relationshipHeatmap(d.relationships);
  if (type === 'regret') return regretGraph(d.regret);
  if (type === 'decision') return decisionMatrix(d.regret);
  if (type === 'life' || type === 'debug') return lifeGraph(d.briefing.graphs.life_graph);
  return chaosTimeline(d.briefing);
}

function lifeGraph(graph) {
  const nodes = new Map(graph.nodes.map((node) => [node.id, node]));
  return `<svg class="life-graph" viewBox="0 0 100 100">${graph.edges.map((edge) => {
    const a = nodes.get(edge.source);
    const b = nodes.get(edge.target);
    return `<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" class="graph-edge risk-${edge.health}" stroke-width="${Math.max(0.3, edge.weight * 0.28)}" opacity="${edge.recent ? 0.82 : 0.36}"></line>`;
  }).join('')}${graph.nodes.map((node) => `<g><circle cx="${node.x}" cy="${node.y}" r="${node.type === 'self' ? 5 : 3}" class="node-dot node-${node.type} risk-${node.risk}"></circle><text x="${node.x + 3.8}" y="${node.y + 0.8}" class="node-label">${esc(node.label)}</text></g>`).join('')}</svg>`;
}

function chaosTimeline(briefing) {
  const points = briefing.graphs.chaos_timeline;
  const w = 720;
  const h = 270;
  const pad = 34;
  return `<svg class="wide-chart chart-line" viewBox="0 0 ${w} ${h}">
    ${grid(w, h, pad)}
    <path class="line-risk" d="${linePath(points, 'chaos_score', w, h, pad)}"></path>
    ${points.map((p, i) => `<text x="${xAt(i, points.length, w, pad)}" y="${h - 8}" text-anchor="middle" class="axis-label">${p.label}</text><circle cx="${xAt(i, points.length, w, pad)}" cy="${yAt(p.chaos_score, h, pad)}" r="3.5" class="dot-risk"></circle>`).join('')}
  </svg>`;
}

function relationshipHeatmap(relationships) {
  return `<div class="relationship-grid">${relationships.heatmap.map((person) => `<article class="person-card ${riskClass(person.urgency)}"><header><strong>${esc(person.name)}</strong><span>${person.score}</span></header>${spark(person.sparkline)}<p>${person.days_silent} days silent</p></article>`).join('')}</div>`;
}

function regretGraph(regret) {
  const points = regret.future_simulation;
  const w = 720;
  const h = 270;
  const pad = 34;
  return `<svg class="wide-chart regret-graph chart-line" viewBox="0 0 ${w} ${h}">
    ${grid(w, h, pad)}
    <path class="line-no-action line-risk" d="${linePath(points, 'no_action', w, h, pad)}"></path>
    <path class="line-with-action line-safe" d="${linePath(points, 'with_action', w, h, pad)}"></path>
    ${points.map((p, i) => `<text x="${xAt(i, points.length, w, pad)}" y="${h - 8}" text-anchor="middle" class="axis-label">${p.label}</text>`).join('')}
    <text x="${w - 160}" y="54" class="line-label">If nothing changes</text>
    <text x="${w - 170}" y="154" class="line-label">If you take action</text>
  </svg>`;
}

function decisionMatrix(regret) {
  return `<svg class="wide-chart" viewBox="0 0 640 320">
    <line x1="70" y1="260" x2="590" y2="260" class="axis-line"></line><line x1="70" y1="260" x2="70" y2="40" class="axis-line"></line>
    <line x1="330" y1="260" x2="330" y2="40" class="grid-line"></line><line x1="70" y1="150" x2="590" y2="150" class="grid-line"></line>
    ${regret.decision_risks.map((risk) => {
      const x = 70 + (risk.effort / 100) * 520;
      const y = 260 - (risk.regret / 100) * 220;
      return `<circle cx="${x}" cy="${y}" r="5" class="${risk.regret > 75 ? 'dot-risk' : 'dot-warn'}"></circle><text x="${x + 8}" y="${y + 4}" class="node-label">${esc(risk.issue)}</text>`;
    }).join('')}
  </svg>`;
}

function autopilot(briefing) {
  return `<article class="module-panel"><p class="eyebrow">Life Autopilot</p><h3>Chaos and energy risk</h3><div class="heatmap-grid">${briefing.graphs.energy_heatmap.map((item) => `<div class="heat-cell ${riskClass(item.risk)}"><span>${item.label}</span><strong>${item.risk}</strong><small>${item.sleep_hrs}h</small></div>`).join('')}</div></article>`;
}

function peopleModule(relationships) {
  return `<article class="module-panel"><p class="eyebrow">Human Relationship CRM</p><h3>Cooling relationships</h3><div class="mini-list">${relationships.neglected.slice(0, 4).map((person) => `<p><strong>${person.relationship_score}</strong> ${esc(person.name)} - ${person.days_silent} days silent</p>`).join('')}</div></article>`;
}

function regretModule(regret) {
  return `<article class="module-panel"><p class="eyebrow">Regret Minimizer</p><h3>Recommended actions</h3><div class="mini-list">${regret.recommended_actions.map((item) => `<p><strong>${item.impact}</strong> ${esc(item.label)}</p>`).join('')}</div></article>`;
}

function consoleHtml() {
  const sources = [...new Set(state.entries.flatMap((entry) => entry.sources || []))].slice(0, 6);
  return `<aside id="coral-console" class="coral-console ${state.consoleOpen ? 'open' : 'closed'}"><button class="console-drawer-toggle" data-console-toggle aria-label="${state.consoleOpen ? 'Close Coral Console' : 'Open Coral Console'}">${state.consoleOpen ? '&gt;' : '&lt;'}</button><header><div><p class="eyebrow">Coral Console</p><h2>Live query feed</h2></div><div class="console-actions"><span class="console-status">LIVE</span><button class="console-close" data-console-hide>Hide -&gt;</button></div></header><p class="console-phase"><span>&gt;</span> ${esc(state.phase)}</p><div class="console-source-row">${sources.map((source) => `<button data-source="${esc(source)}">${esc(source)}</button>`).join('')}</div><div class="query-feed">${state.entries.slice(0, 12).map((entry) => `<article class="query-entry"><p class="query-meta">${esc(entry.insight_powered)}</p><pre data-sql="${esc(entry.sql)}"><code></code></pre><p class="query-result">-> ${entry.rows_returned} rows found [${entry.execution_ms}ms]</p></article>`).join('')}</div></aside>`;
}

function sourcePanelHtml(raw) {
  const norm = raw.toLowerCase();
  const spec = state.sources.find((item) => item.name.toLowerCase().includes(norm) || item.table_name.toLowerCase().includes(norm) || norm.includes(item.name.toLowerCase().replace('google ', ''))) || {};
  return `<div class="source-panel"><div class="source-card"><button class="close-button" data-close>Close</button><p class="eyebrow">Coral source spec</p><h2>${esc(spec.name || raw)}</h2><dl><div><dt>Table</dt><dd>${esc(spec.table_name || 'coral_source')}</dd></div><div><dt>Last sync</dt><dd>${spec.last_sync ? new Date(spec.last_sync).toLocaleString() : 'Live'}</dd></div><div><dt>Rows</dt><dd>${esc(spec.row_count || 'n/a')}</dd></div></dl><div class="schema-grid">${(spec.schema || []).map((field) => `<span>${esc(field.column)}<em>${esc(field.type)}</em></span>`).join('')}</div><pre class="sample-row">${esc(JSON.stringify(spec.sample_row || {}, null, 2))}</pre></div></div>`;
}

function typeConsole() {
  document.querySelectorAll('[data-sql]').forEach((pre) => {
    const text = pre.dataset.sql;
    const code = pre.querySelector('code');
    let i = 0;
    const timer = setInterval(() => {
      i += 6;
      code.textContent = text.slice(0, i);
      if (i >= text.length) clearInterval(timer);
    }, 18);
  });
}

function inlineSignal(score) {
  const values = [score - 24, score - 10, score - 16, score - 2, score - 8, score].map((v) => Math.max(8, Math.min(100, v)));
  const data = values.map((value) => ({ value }));
  return `<svg viewBox="0 0 220 64"><path class="line-warn" d="${linePath(data, 'value', 220, 64, 8)}"></path></svg>`;
}

function spark(values) {
  return `<svg viewBox="0 0 160 42"><path class="line-info" d="${linePath(values.map((value) => ({ value })), 'value', 160, 42, 4, Math.max(...values, 1))}"></path></svg>`;
}

function grid(w, h, pad) {
  return [0, 25, 50, 75, 100].map((tick) => `<line x1="${pad}" y1="${yAt(tick, h, pad)}" x2="${w - pad}" y2="${yAt(tick, h, pad)}" class="grid-line"></line><text x="8" y="${yAt(tick, h, pad) + 4}" class="axis-label">${tick}</text>`).join('');
}

function linePath(items, key, width, height, pad, domainMax = 100) {
  return items.map((item, i) => `${i === 0 ? 'M' : 'L'} ${xAt(i, items.length, width, pad)} ${yAt(item[key], height, pad, domainMax)}`).join(' ');
}

function xAt(i, count, width, pad) {
  return count <= 1 ? width / 2 : pad + (i / (count - 1)) * (width - pad * 2);
}

function yAt(value, height, pad, domainMax = 100) {
  return height - pad - (Math.max(0, Math.min(domainMax, value || 0)) / domainMax) * (height - pad * 2);
}

function riskClass(value) {
  if (value >= 75) return 'risk-high';
  if (value >= 50) return 'risk-mid';
  return 'risk-low';
}

boot().catch((error) => {
  document.getElementById('root').innerHTML = `<main class="loading-shell"><div class="brand-lockup">AETHER</div><p class="mono muted">${esc(error.message)}</p></main>`;
});
