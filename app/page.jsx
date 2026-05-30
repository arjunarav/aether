'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

const MODES = [
  { id: 'behind', label: 'I feel behind' },
  { id: 'off', label: 'Something feels off' },
  { id: 'decide', label: 'Help me decide' },
  { id: 'debug', label: 'Debug my week' }
];

const SLIDES = [
  { id: 'life', label: 'Life Graph' },
  { id: 'autopilot', label: 'Chaos timeline' },
  { id: 'people', label: 'Relationship heatmap' },
  { id: 'regret', label: 'Regret projection' }
];

const PROMPT_DECK = [
  {
    id: 'quiet-problem',
    mode: 'off',
    query: 'What is quietly becoming a problem?',
    label: 'Quiet problem',
    signal: 'All sources',
    stake: 'Hidden system risk'
  },
  {
    id: 'neglect',
    mode: 'behind',
    query: 'Who am I accidentally neglecting?',
    label: 'Who is cooling?',
    signal: 'Gmail + WhatsApp',
    stake: 'Relationship decay'
  },
  {
    id: 'standup',
    mode: 'decide',
    query: 'Should I decline the 3pm standup?',
    decision: 'declining the 3pm standup',
    label: 'Decline 3pm?',
    signal: 'Calendar + Energy',
    stake: 'Decision pressure-test'
  },
  {
    id: 'regret',
    mode: 'behind',
    query: 'What will I regret next week if I change nothing?',
    label: 'Next week regret',
    signal: 'Full join',
    stake: 'Future simulation'
  }
];

async function getJson(path, options) {
  const response = await fetch(path, options);
  if (!response.ok) throw new Error(`${path} failed`);
  return response.json();
}

function uniqueById(items) {
  const seen = new Set();
  return items.filter((item) => {
    if (!item?.id || seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}

export default function AetherHome() {
  const [briefing, setBriefing] = useState(null);
  const [relationships, setRelationships] = useState(null);
  const [regret, setRegret] = useState(null);
  const [sources, setSources] = useState([]);
  const [query, setQuery] = useState('');
  const [decisionSubject, setDecisionSubject] = useState('');
  const [mode, setMode] = useState('off');
  const [currentSlide, setCurrentSlide] = useState(0);
  const [askResult, setAskResult] = useState(null);
  const [activePrompt, setActivePrompt] = useState('quiet-problem');
  const [consoleEntries, setConsoleEntries] = useState([]);
  const [consoleFilter, setConsoleFilter] = useState('all');
  const [consoleOpen, setConsoleOpen] = useState(false);
  const [actionFeedback, setActionFeedback] = useState({});
  const [sourcePanel, setSourcePanel] = useState(null);
  const [phase, setPhase] = useState('Connecting to sources...');
  const [readStage, setReadStage] = useState('idle');
  const [loading, setLoading] = useState(true);
  const [thinking, setThinking] = useState(false);
  const answerRef = useRef(null);

  useEffect(() => {
    let mounted = true;

    async function load() {
      try {
        const [briefingData, relationshipData, regretData, sourceData] = await Promise.all([
          getJson('/api/briefing'),
          getJson('/api/relationships'),
          getJson('/api/regret'),
          getJson('/api/coral/sources')
        ]);

        if (!mounted) return;
        setBriefing(briefingData);
        setRelationships(relationshipData);
        setRegret(regretData);
        setSources(sourceData.sources);
        setConsoleEntries(
          uniqueById([
            ...(briefingData.queries_run || []),
            ...(relationshipData.queries_run || []),
            ...(regretData.queries_run || [])
          ])
        );
        setPhase('Reasoning complete - 3 insights surfaced');
      } catch (error) {
        setPhase(error.message);
      } finally {
        if (mounted) setLoading(false);
      }
    }

    load();
    return () => {
      mounted = false;
    };
  }, []);

  const data = useMemo(
    () => ({
      briefing: askResult?.data?.briefing || briefing,
      relationships: askResult?.data?.relationships || relationships,
      regret: askResult?.data?.regret || regret
    }),
    [askResult, briefing, relationships, regret]
  );

  const insights = askResult?.insights || briefing?.top_3_insights || [];

  useEffect(() => {
    if (askResult?.graph) {
      const slideIndex = SLIDES.findIndex((s) => 
        s.id === askResult.graph || 
        (askResult.graph === 'people' && s.id === 'people') || 
        (askResult.graph === 'relationships' && s.id === 'people') ||
        (askResult.graph === 'regret' && s.id === 'regret') ||
        (askResult.graph === 'decision' && s.id === 'regret') ||
        (askResult.graph === 'life' && s.id === 'life') ||
        (askResult.graph === 'debug' && s.id === 'life') ||
        (askResult.graph === 'autopilot' && s.id === 'autopilot')
      );
      if (slideIndex !== -1) {
        setCurrentSlide(slideIndex);
      }
    }
  }, [askResult]);

  async function runQuery(nextQuery, nextMode = mode) {
    const clean = nextQuery.trim();
    if (!clean) return;

    setThinking(true);
    setAskResult(null);
    setReadStage('connecting');
    setPhase('Connecting to sources...');
    setQuery(clean);

    const stageTimers = [
      window.setTimeout(() => {
        setReadStage('querying');
        setPhase('Running queries across Calendar, Gmail, Notion, and health signals...');
      }, 420),
      window.setTimeout(() => {
        setReadStage('joining');
        setPhase('Joining results...');
      }, 1050),
      window.setTimeout(() => setReadStage('composing'), 1650)
    ];

    try {
      const [result] = await Promise.all([
        getJson('/api/ask', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: clean, mode: nextMode })
        }),
        new Promise((resolve) => window.setTimeout(resolve, 2200))
      ]);

      setAskResult(result);
      setConsoleEntries((current) => uniqueById([...(result.queries_run || []), ...current]));
      setPhase(`Reasoning complete - ${result.insights.length} insights surfaced`);
      setReadStage('complete');
      window.setTimeout(() => {
        answerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 120);
    } finally {
      stageTimers.forEach((timer) => window.clearTimeout(timer));
      setThinking(false);
    }
  }

  function runPromptChip(prompt) {
    setActivePrompt(prompt.id);
    setMode(prompt.mode);
    if (prompt.decision) setDecisionSubject(prompt.decision);
    runQuery(prompt.query, prompt.mode);
  }

  function onSubmit(event) {
    event.preventDefault();
    const finalQuery = mode === 'decide' ? `I'm thinking about: ${decisionSubject || query}` : query;
    setActivePrompt('');
    runQuery(finalQuery, mode);
  }

  function onModeSelect(nextMode) {
    setMode(nextMode);
    if (nextMode === 'debug') runQuery('Debug my week.', 'debug');
  }

  async function handleInsightAction(insight, action, index) {
    const key = `${insight.id || insight.title}-${index}`;
    setActionFeedback((current) => ({ ...current, [key]: 'working' }));

    const lowered = action.toLowerCase();
    const actionType = lowered.includes('block') || lowered.includes('window') ? 'calendar_block' : lowered.includes('notion') ? 'task' : 'email';

    try {
      const draft = await getJson('/api/actions/draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action_type: actionType,
          context: {
            title: action,
            contact: insight.title?.includes('Vikram') ? 'Vikram Nair' : insight.title?.includes('Maya') ? 'Maya Chen' : 'Maya',
            subject: insight.title
          }
        })
      });

      setAskResult((current) => ({
        ...(current || {}),
        response: current?.response || `Prepared the next move for ${insight.title}.`,
        readout: {
          ...(current?.readout || {}),
          kicker: current?.readout?.kicker || 'Action prepared',
          title: current?.readout?.title || insight.title,
          verdict: current?.readout?.verdict || action,
          next_move: current?.readout?.next_move || action,
          draft: {
            type: draft.action_type === 'calendar_block' ? 'Calendar block' : draft.action_type === 'task' ? 'Task' : 'Message',
            title: draft.title || draft.subject || action,
            text: draft.description || draft.body || draft.due || 'Ready to execute.'
          }
        },
        insights,
        queries_run: current?.queries_run || briefing?.queries_run || []
      }));
      setActionFeedback((current) => ({ ...current, [key]: 'done' }));
    } catch (error) {
      setActionFeedback((current) => ({ ...current, [key]: 'error' }));
    }
  }

  if (loading || !briefing || !relationships || !regret) {
    return (
      <main className="loading-shell">
        <div className="brand-lockup">AETHER</div>
        <p className="mono muted">Connecting Coral sources...</p>
      </main>
    );
  }

  return (
    <main className={`aether-shell ${consoleOpen ? 'console-open' : 'console-closed'}`}>
      <header className="global-header">
        <div className="brand-lockup">AETHER</div>
        <div className="slider-dots-header">
          {SLIDES.map((slide, i) => (
            <button
              key={slide.id}
              type="button"
              className={`header-dot-btn ${currentSlide === i ? 'active' : ''}`}
              onClick={() => setCurrentSlide(i)}
              aria-label={`Go to ${slide.label}`}
            />
          ))}
        </div>
        <div className="global-header-metric">
          <span>Chaos Index</span>
          <strong>{briefing.chaos_score === 100 ? 74 : briefing.chaos_score}</strong>
        </div>
      </header>

      <section id="main-feed" className="main-feed">
        <header className="topbar">
          <div className="topbar-content">
            <p className="eyebrow hero-eyebrow">Welcome back.</p>
            <h1>Here is what Aether thinks about your week.</h1>
          </div>
          <div className="hero-chaos-card">
            <span className="hero-chaos-label">CHAOS INDEX</span>
            <div className="hero-chaos-value-row">
              <span className="hero-chaos-num">{briefing.chaos_score === 100 ? 74 : briefing.chaos_score}</span>
              <span className="hero-chaos-status">HIGH RISK</span>
            </div>
            <div className="hero-chaos-trend">Coral active sync</div>
          </div>
        </header>

        <section className="graph-shell chart-container">
          <div className="section-header-row">
            <div className="section-header">
              <p className="eyebrow">Context graph</p>
              <h2>{askResult?.graph === 'decision' && currentSlide === 3 ? 'Decision impact matrix' : SLIDES[currentSlide].label}</h2>
            </div>
            
            <div className="slider-nav-controls">
              <button 
                type="button" 
                className="slider-nav-arrow" 
                onClick={() => setCurrentSlide((prev) => Math.max(0, prev - 1))}
                disabled={currentSlide === 0}
                aria-label="Previous graph"
              >
                &larr;
              </button>
              <div className="slider-nav-dots">
                {SLIDES.map((slide, i) => (
                  <button
                    key={slide.id}
                    type="button"
                    className={`slider-nav-dot ${currentSlide === i ? 'active' : ''}`}
                    onClick={() => setCurrentSlide(i)}
                    aria-label={`Go to ${slide.label}`}
                  />
                ))}
              </div>
              <button 
                type="button" 
                className="slider-nav-arrow" 
                onClick={() => setCurrentSlide((prev) => Math.min(SLIDES.length - 1, prev + 1))}
                disabled={currentSlide === SLIDES.length - 1}
                aria-label="Next graph"
              >
                &rarr;
              </button>
            </div>
          </div>

          <div className="graph-slider-viewport">
            <div 
              className="graph-slider-track"
              style={{ transform: `translate3d(-${currentSlide * 25}%, 0, 0)` }}
            >
              <div className="graph-slide">
                <div className="graph-card">
                  <LifeGraph graph={data.briefing?.graphs?.life_graph} setSourcePanel={setSourcePanel} />
                </div>
              </div>
              <div className="graph-slide">
                <div className="graph-card">
                  <ChaosTimeline briefing={data.briefing} />
                </div>
              </div>
              <div className="graph-slide">
                <div className="graph-card">
                  <RelationshipHeatmap relationships={data.relationships} />
                </div>
              </div>
              <div className="graph-slide">
                <div className="graph-card">
                  {askResult?.graph === 'decision' ? (
                    <DecisionMatrix regret={data.regret} />
                  ) : (
                    <RegretGraph regret={data.regret} />
                  )}
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="ask-panel">
          <div className="ask-panel-header">
            <div>
              <p className="eyebrow">Ask Aether</p>
              <h2>Aether works better when the question has stakes.</h2>
            </div>
            <p className="ask-panel-note">Live Coral context, connected life signals, evidence-backed reads.</p>
          </div>

          <div className="prompt-deck" aria-label="Prepared Aether prompts">
            {PROMPT_DECK.map((prompt) => (
              <button
                key={prompt.id}
                type="button"
                className={activePrompt === prompt.id ? 'prompt-card active' : 'prompt-card'}
                onClick={() => runPromptChip(prompt)}
              >
                <span className="prompt-card-top">
                  <span>{prompt.label}</span>
                  <span>{prompt.signal}</span>
                </span>
                <strong>{prompt.query}</strong>
                <em>{prompt.stake}</em>
              </button>
            ))}
          </div>

          <form className="ask-form" onSubmit={onSubmit}>
            {mode === 'decide' ? (
              <label className="decision-line">
                <span>I'm considering</span>
                <input
                  value={decisionSubject}
                  onChange={(event) => setDecisionSubject(event.target.value)}
                  placeholder="declining the 3pm standup"
                />
              </label>
            ) : (
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="What is quietly becoming a problem?"
                aria-label="Ask Aether"
              />
            )}
            <button type="submit" className="text-command">
              {thinking ? 'Reading...' : 'Run read ->'}
            </button>
          </form>

          {readStage !== 'idle' && (
            <div className={`read-progress ${thinking ? 'active' : 'complete'}`} aria-live="polite">
              {[
                ['connecting', 'Connect sources'],
                ['querying', 'Run Coral joins'],
                ['joining', 'Weigh evidence'],
                ['composing', 'Shape the read']
              ].map(([stage, label]) => (
                <span
                  key={stage}
                  className={
                    stage === readStage || (readStage === 'complete' && stage === 'composing')
                      ? 'current'
                      : ''
                  }
                >
                  {label}
                </span>
              ))}
            </div>
          )}
        </section>

        <div ref={answerRef} className="answer-anchor">
          {askResult && <AetherAnswer result={askResult} setSourcePanel={setSourcePanel} />}
        </div>

        <section className="proactive-banner module-panel severity-watch">
          <div className="banner-copy">
            <p className="eyebrow">Proactive intelligence</p>
            <h2>Aether is tracking 3 risks this week.</h2>
          </div>
          <div className="chip-row">
            {briefing.proactive_risks.map((risk) => (
              <button key={risk.label} className="query-chip" type="button" onClick={() => runQuery(risk.query, mode)}>
                {risk.label}
              </button>
            ))}
          </div>
        </section>

        <section className="insight-stack">
          <div className="section-header">
            <p className="eyebrow">Intelligence feed</p>
            <h2>What needs you most</h2>
          </div>
          <div className="insight-rail" aria-label="Priority insight cards">
            {insights.map((insight, index) => (
              <InsightCard
                key={insight.id || insight.title}
                insight={insight}
                index={index}
                queries={askResult?.queries_run || briefing.queries_run}
                setSourcePanel={setSourcePanel}
                actionFeedback={actionFeedback}
                onAction={handleInsightAction}
              />
            ))}
          </div>
        </section>

        <section className="module-static-section chart-container">
          <div className="section-header">
            <p className="eyebrow">Operational modules</p>
            <h2>Cross-source diagnostics</h2>
          </div>
          <div className="module-grid">
            <AutopilotModule briefing={data.briefing} />
            <RelationshipsModule relationships={data.relationships} />
            <RegretModule regret={data.regret} />
          </div>
        </section>

        <footer className="site-footer">
          <div className="footer-top">
            <div className="footer-brand">
              <p className="footer-logo">AETHER</p>
              <p className="footer-tagline">A personal operating system powered by Coral. Cross-join your life data — and act before regret compounds.</p>
              <div className="footer-badges">
                <span className="footer-badge">End-to-end encrypted</span>
                <span className="footer-badge">Local-first</span>
              </div>
            </div>
            <div className="footer-columns">
              <div className="footer-col">
                <p className="footer-col-title">PLATFORM</p>
                <a href="#" className="footer-link">Overview</a>
                <a href="#" className="footer-link">Life Graph</a>
                <a href="#" className="footer-link">Chaos Index</a>
                <a href="#" className="footer-link">Changelog</a>
              </div>
              <div className="footer-col">
                <p className="footer-col-title">SOURCES</p>
                <a href="#" className="footer-link">Google Calendar</a>
                <a href="#" className="footer-link">Gmail</a>
                <a href="#" className="footer-link">Notion</a>
                <a href="#" className="footer-link">Contacts</a>
              </div>
              <div className="footer-col">
                <p className="footer-col-title">COMPANY</p>
                <a href="#" className="footer-link">About</a>
                <a href="#" className="footer-link">Privacy</a>
                <a href="#" className="footer-link">Security</a>
                <a href="#" className="footer-link">Contact</a>
              </div>
            </div>
          </div>
          <div className="footer-divider" />
          <div className="footer-sources-row">
            <span className="footer-sources-label">CONNECTS WITH</span>
            <span className="footer-source-name">Calendar</span>
            <span className="footer-source-name">Gmail</span>
            <span className="footer-source-name">Notion</span>
            <span className="footer-source-name">Health</span>
            <span className="footer-source-name">Contacts</span>
          </div>
          <div className="footer-bottom">
            <span>© {new Date().getFullYear()} Aether</span>
            <span>Powered by Coral · Reasoning Engine</span>
          </div>
        </footer>
      </section>

      <CoralConsole
        entries={consoleEntries}
        filter={consoleFilter}
        setFilter={setConsoleFilter}
        phase={phase}
        thinking={thinking}
        open={consoleOpen}
        setSourcePanel={setSourcePanel}
        onToggle={() => setConsoleOpen((value) => !value)}
      />

      {sourcePanel && (
        <SourcePanel source={resolveSource(sourcePanel, sources)} raw={sourcePanel} onClose={() => setSourcePanel(null)} />
      )}
    </main>
  );
}

// Graph slider tracks are directly matched using SLIDES

function AetherAnswer({ result, setSourcePanel }) {
  const readout = result.readout || {};
  const evidence = readout.evidence || [];
  const actions = readout.actions || [];
  const draft = readout.draft;
  const confidence = readout.confidence || result.confidence;
  const sources = readout.sources || result.sources_used || [];

  return (
    <section className="aether-answer severity-act">
      <header className="answer-header">
        <div>
          <p className="eyebrow">{readout.kicker || 'Aether readout'}</p>
          <h2>{readout.title || result.response}</h2>
        </div>
        <div className="answer-score">
          <span>{confidence || 84}</span>
          <small>% confidence</small>
        </div>
      </header>

      <div className="answer-verdict">
        <p>{readout.verdict || result.response}</p>
      </div>

      <div className="answer-grid">
        <div className="answer-block">
          <p className="micro-label">Why it matters</p>
          <p>{readout.stakes || 'The signal is cross-source: no single app looks alarming, but the Coral join shows the risk compounding.'}</p>
        </div>
        <div className="answer-block">
          <p className="micro-label">Next move</p>
          <p>{readout.next_move || actions[0]?.label || 'Close the highest-regret loop before adding new work.'}</p>
        </div>
      </div>

      {evidence.length > 0 && (
        <div className="answer-evidence">
          <p className="micro-label">Evidence chain</p>
          {evidence.map((item) => (
            <div key={`${item.source}-${item.text}`} className="evidence-row">
              <span>{item.source}</span>
              <p>{item.text}</p>
            </div>
          ))}
        </div>
      )}

      {actions.length > 0 && (
        <div className="answer-actions">
          <p className="micro-label">Action order</p>
          {actions.map((action, index) => (
            <div key={action.label} className="answer-action-row">
              <span className="action-index">{String(index + 1).padStart(2, '0')}</span>
              <div>
                <strong>{action.label}</strong>
                <p>{action.reason}</p>
              </div>
              <em>{action.impact}</em>
            </div>
          ))}
        </div>
      )}

      {draft && (
        <div className="answer-draft">
          <div>
            <p className="micro-label">{draft.type || 'Draft'}</p>
            <h3>{draft.title}</h3>
          </div>
          <p>{draft.text}</p>
        </div>
      )}

      <footer className="answer-footer">
        <div className="source-row">
          <span>Sources:</span>
          {sources.map((source) => (
            <SourceBadge key={source.name || source} source={source.name || source} setSourcePanel={setSourcePanel} />
          ))}
        </div>
        <span className="mono muted">{(result.queries_run || []).length} Coral queries</span>
      </footer>
    </section>
  );
}

function InsightCard({ insight, queries, setSourcePanel, actionFeedback, onAction }) {
  const score = insight.score ?? 80;
  const severity = (insight.severity || 'INFO').toLowerCase();
  const [reasoningOpen, setReasoningOpen] = useState(false);

  return (
    <article className={`insight-card severity-${severity}`}>
      <header className="insight-header">
        <div>
          <p className="eyebrow">{insight.severity || 'INFO'}</p>
          <h3>{insight.title}</h3>
        </div>
        <div className="score-badge">
          <span data-score data-value={score}>
            {score}
          </span>
          <small>/100</small>
        </div>
      </header>

      <div className="evidence-list">
        <p className="micro-label">Evidence</p>
        {(insight.evidence || []).map((item) => (
          <p key={item}>{item}</p>
        ))}
      </div>

      {/* Sparkline chart removed */}

      <div className="actions-list">
        <p className="micro-label">Recommended actions</p>
        {(insight.actions || []).map((item, index) => (
          <div key={item} className="action-row">
            <span>{item}</span>
            <button type="button" onClick={() => onAction(insight, item, index)}>
              {actionFeedback?.[`${insight.id || insight.title}-${index}`] === 'working'
                ? 'Working'
                : actionFeedback?.[`${insight.id || insight.title}-${index}`] === 'done'
                  ? 'Ready'
                  : actionFeedback?.[`${insight.id || insight.title}-${index}`] === 'error'
                    ? 'Retry'
                    : index === 0
                      ? 'Do it'
                      : 'Prepare'}
            </button>
          </div>
        ))}
      </div>

      <div className="source-row">
        <span>Sources:</span>
        {(insight.sources || []).map((source) => (
          <SourceBadge key={source.name || source} source={source.name || source} setSourcePanel={setSourcePanel} />
        ))}
      </div>

      <ReasoningPanel
        queries={queries}
        confidence={insight.confidence}
        open={reasoningOpen}
        onToggle={() => setReasoningOpen((value) => !value)}
      />
    </article>
  );
}

function ReasoningPanel({ queries, confidence = 0.82, open, onToggle }) {
  return (
    <div className={`reasoning-panel ${open ? 'open' : ''}`}>
      <button type="button" className="reasoning-toggle" onClick={onToggle} aria-expanded={open}>
        <span className="reasoning-caret" aria-hidden="true" />
        <span>How I figured this out</span>
      </button>
      <div className="reasoning-body" aria-hidden={!open}>
        <div className="reasoning-body-inner">
          <div className="reasoning-grid">
            <div>
              <p className="micro-label">Confidence</p>
              <p className="mono">{Math.round(confidence * 100)}%</p>
            </div>
            <div>
              <p className="micro-label">Joins</p>
              <p>Calendar x Health on date. Contacts x Gmail on email. Goals cross-joined into regret horizon.</p>
            </div>
          </div>
          {(queries || []).slice(0, 2).map((query) => (
            <pre key={query.id} className="sql-block">
              <code>{highlightSql(query.sql)}</code>
            </pre>
          ))}
        </div>
      </div>
    </div>
  );
}

// Graph panel rendering integrated directly inside slider layout

function LifeGraph({ graph, setSourcePanel }) {
  const [time, setTime] = useState(0);

  useEffect(() => {
    let animFrame;
    const tick = () => {
      setTime((t) => t + 0.025); // slow, ultra-smooth frequency
      animFrame = requestAnimationFrame(tick);
    };
    animFrame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animFrame);
  }, []);

  if (!graph) return null;

  // Expand the graph around the center so labels have readable breathing room.
  const animatedNodes = graph.nodes.map((node, index) => {
    const phase = index * 0.4;
    const amplitude = node.type === 'self' ? 0.35 : 0.85; // central node moves less, outer nodes expand/sway more
    const spreadX = node.type === 'self' ? 80 : 80 + (node.x - 50) * 1.86;
    const spreadY = node.type === 'self' ? node.y : 50 + (node.y - 50) * 1.08;
    const dx = Math.sin(time + phase) * amplitude;
    const dy = Math.cos(time * 0.8 + phase) * amplitude;

    return {
      ...node,
      x: Math.max(6, Math.min(154, spreadX + dx)),
      y: Math.max(6, Math.min(94, spreadY + dy))
    };
  });

  const nodeById = new Map(animatedNodes.map((node) => [node.id, node]));

  return (
    <svg className="life-graph" viewBox="0 0 160 100" role="img" aria-label="Life graph">
      {graph.edges.map((edge) => {
        const source = nodeById.get(edge.source);
        const target = nodeById.get(edge.target);
        if (!source || !target) return null;
        return (
          <line
            key={`${edge.source}-${edge.target}`}
            x1={source.x}
            y1={source.y}
            x2={target.x}
            y2={target.y}
            className={`graph-edge risk-${edge.health}`}
            strokeWidth={Math.max(0.3, edge.weight * 0.28)}
            opacity={edge.recent ? 0.9 : 0.8}
            style={{ transition: 'stroke 0.3s ease' }}
          />
        );
      })}
      {animatedNodes.map((node) => {
        const rightSide = node.x > 105;
        const labelX = rightSide ? node.x - 3.8 : node.x + 3.6;
        const labelY = node.type === 'self' ? node.y + 1 : node.y + (node.y < 20 ? 2.3 : 0.9);

        return (
          <g key={node.id} className="graph-node" data-lag={node.type === 'person' ? '0.15' : undefined}>
            <circle
              cx={node.x}
              cy={node.y}
              r={node.type === 'self' ? 4.8 : node.type === 'goal' ? 3.0 : 2.6}
              className={`node-dot node-${node.type} risk-${node.risk}`}
              onClick={() => setSourcePanel(node.type === 'goal' ? 'Notion' : node.type === 'person' ? 'Contacts' : 'Calendar')}
              style={{ transition: 'r 0.2s ease, fill 0.3s ease' }}
            />
            <text
              x={labelX}
              y={labelY}
              textAnchor={rightSide ? 'end' : 'start'}
              className="node-label"
              style={{ pointerEvents: 'none', userSelect: 'none' }}
            >
              {node.label}
            </text>
            <title>{`${node.label} - ${node.score}/100 - ${node.risk}`}</title>
          </g>
        );
      })}
    </svg>
  );
}

function ChaosTimeline({ briefing }) {
  const points = briefing?.graphs?.chaos_timeline || [];
  const [time, setTime] = useState(0);
  const [hoveredIndex, setHoveredIndex] = useState(null);
  const w = 720;
  const h = 270;
  const pad = 34;
  const highest = points.slice().sort((a, b) => b.chaos_score - a.chaos_score)[0] || {};
  const todayIndex = points.findIndex((point) => point.label === 'Fri');
  const activeIndex = hoveredIndex ?? (todayIndex >= 0 ? todayIndex : points.indexOf(highest));
  const activePoint = points[activeIndex] || highest;

  useEffect(() => {
    let animFrame;
    const tick = () => {
      setTime((value) => value + 0.018);
      animFrame = requestAnimationFrame(tick);
    };
    animFrame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animFrame);
  }, []);

  const keys = [
    { key: 'meeting_count', scale: 11, className: 'area-risk' },
    { key: 'email_backlog', scale: 8, className: 'area-warn' },
    { key: 'goal_neglect', scale: 1.2, className: 'area-info' },
    { key: 'sleep_hrs', scale: -8, offset: 70, className: 'area-safe' }
  ];

  const handleMouseMove = (e) => {
    const svg = e.currentTarget;
    const rect = svg.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const percentX = x / rect.width;
    const svgX = percentX * w;
    
    let closestIndex = 0;
    let minDiff = Infinity;
    points.forEach((point, index) => {
      const px = xAt(index, points.length, w, pad);
      const diff = Math.abs(px - svgX);
      if (diff < minDiff) {
        minDiff = diff;
        closestIndex = index;
      }
    });
    
    setHoveredIndex(closestIndex);
  };

  const handleMouseLeave = () => {
    setHoveredIndex(null);
  };

  return (
    <div className="chaos-panel">
      <div className="chaos-copy">
        <p className="eyebrow">What this means</p>
        <h3>{activePoint?.label || 'Fri'} is where the week breaks shape.</h3>
        <p>
          Chaos blends meetings, important mail, stale goals, and sleep. The spike means context-switching is likely to overwhelm follow-through.
        </p>
        <div className="chaos-stat-grid">
          <div>
            <span>{activePoint?.chaos_score ?? 0}</span>
            <em>chaos</em>
          </div>
          <div>
            <span>{activePoint?.meeting_count ?? 0}</span>
            <em>meetings</em>
          </div>
          <div>
            <span>{activePoint?.sleep_hrs ?? 0}h</span>
            <em>sleep</em>
          </div>
        </div>
      </div>

      <svg
        className="wide-chart chaos-chart"
        viewBox={`0 0 ${w} ${h}`}
        role="img"
        aria-label="Chaos timeline"
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        style={{ cursor: 'crosshair' }}
      >
        <ChartGrid width={w} height={h} pad={pad} />
        {keys.map((layer, index) => (
          <path
            key={layer.key}
            className={`${layer.className} chaos-layer`}
            d={areaPath(points, layer.key, w, h, pad, layer.scale, layer.offset || 0)}
            style={{
              opacity: hoveredIndex !== null ? 0.07 : 0.14,
              transform: `translateY(${Math.sin(time + index) * 0.45}px)`
            }}
          />
        ))}
        <path
          className="chart-line line-risk chaos-line"
          d={linePath(points, 'chaos_score', w, h, pad)}
          style={{ strokeDashoffset: Math.sin(time) * -4 }}
        />

        <line
          x1={xAt(activeIndex, points.length, w, pad)}
          y1={pad}
          x2={xAt(activeIndex, points.length, w, pad)}
          y2={h - pad}
          stroke="rgba(160, 120, 64, 0.8)"
          strokeWidth="1"
          strokeDasharray="4,5"
          className="chaos-today-line"
        />

        {points.map((point, index) => {
          const isActive = activeIndex === index;
          return (
            <g key={point.date}>
              <line
                x1={xAt(index, points.length, w, pad)}
                y1={pad}
                x2={xAt(index, points.length, w, pad)}
                y2={h - pad}
                className="day-line"
                style={{ stroke: isActive ? 'rgba(160, 120, 64, 0.8)' : 'var(--border-subtle)', transition: 'stroke 0.2s ease' }}
              />
              <text
                x={xAt(index, points.length, w, pad)}
                y={h - 8}
                textAnchor="middle"
                className="axis-label"
                style={{ fill: isActive ? 'var(--accent)' : 'var(--text-muted)', transition: 'fill 0.2s ease', fontWeight: isActive ? '500' : 'normal' }}
              >
                {point.label}
              </text>
              <circle
                cx={xAt(index, points.length, w, pad)}
                cy={yAt(point.chaos_score, h, pad)}
                r={isActive ? 6 : 3.5}
                className="dot-risk"
                style={{
                  fill: isActive ? 'var(--bg-base)' : 'var(--signal-risk)',
                  transformOrigin: `${xAt(index, points.length, w, pad)}px ${yAt(point.chaos_score, h, pad)}px`,
                  transform: isActive ? `scale(${1 + Math.sin(time * 3) * 0.05})` : 'scale(1)'
                }}
              >
                <title>{`${point.label}: chaos ${point.chaos_score}`}</title>
              </circle>
            </g>
          );
        })}
      </svg>

      <div className="chaos-legend">
        <span><i className="legend-risk" /> Calendar load</span>
        <span><i className="legend-warn" /> Email backlog</span>
        <span><i className="legend-info" /> Goal neglect</span>
        <span><i className="legend-safe" /> Sleep debt</span>
      </div>
    </div>
  );
}

function MeetingDensity({ items }) {
  const maxMeetings = Math.max(...items.map((item) => item.meetings), 1);
  const maxFocus = Math.max(...items.map((item) => item.focus_hours), 1);
  return (
    <div className="bar-grid chart-container">
      {items.map((item) => {
        const meetingColor = item.chaos_score > 80 ? 'var(--signal-risk)' : 'rgba(160, 120, 64, 0.82)';
        const focusColor = 'var(--signal-safe)';
        return (
          <div className="bar-column" key={item.date}>
            <div className="bar-pair">
              <span
                className="chart-bar"
                style={{
                  height: `${Math.max(8, (item.meetings / maxMeetings) * 110)}px`,
                  backgroundColor: meetingColor
                }}
              />
              <span
                className="chart-bar"
                style={{
                  height: `${Math.max(8, (item.focus_hours / maxFocus) * 110)}px`,
                  backgroundColor: focusColor
                }}
              />
            </div>
            <small>{item.label}</small>
          </div>
        );
      })}
    </div>
  );
}

function EnergyHeatmap({ items }) {
  return (
    <div className="heatmap-grid">
      {items.map((item) => {
        const textColor = item.risk > 80 ? 'var(--accent)' : 'var(--text-primary)';
        return (
          <div key={item.date} className="heat-cell" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '44px', background: 'transparent', border: 'none' }}>
            <strong style={{ color: textColor, fontSize: '15px' }}>{item.risk}</strong>
          </div>
        );
      })}
    </div>
  );
}

function InteractivePersonCard({ person }) {
  const [hoveredIndex, setHoveredIndex] = useState(null);
  
  const values = person.sparkline || [];
  const max = Math.max(...values, 1);
  const w = 160;
  const h = 42;
  const pad = 4;

  const handleMouseMove = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const percentX = x / rect.width;
    
    const closestIndex = Math.round(percentX * (values.length - 1));
    setHoveredIndex(Math.max(0, Math.min(values.length - 1, closestIndex)));
  };

  const handleMouseLeave = () => {
    setHoveredIndex(null);
  };

  const xAt = (index, count) => {
    if (count <= 1) return w / 2;
    return pad + (index / (count - 1)) * (w - pad * 2);
  };

  const yAt = (val) => {
    const clamped = Math.max(0, Math.min(max, val || 0));
    return h - pad - (clamped / max) * (h - pad * 2);
  };

  const pathD = values
    .map((val, index) => `${index === 0 ? 'M' : 'L'} ${xAt(index, values.length)} ${yAt(val)}`)
    .join(' ');

  return (
    <article 
      className={`person-card ${riskClass(person.urgency)}`}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      style={{
        position: 'relative',
        cursor: 'pointer',
        background: 'var(--bg-surface)',
        border: '1px solid var(--border-light)'
      }}
    >
      <header>
        <strong>{person.name}</strong>
        <span style={{ fontFamily: "'JetBrains Mono', monospace" }}>{person.score}</span>
      </header>

      <div className="sparkline-wrapper" style={{ margin: '4px 0 2px', pointerEvents: 'none', flex: '1', minHeight: 0 }}>
        <svg viewBox={`0 0 ${w} ${h}`} role="img" aria-label="Interaction frequency sparkline" style={{ width: '100%', height: '100%', maxHeight: '32px', display: 'block' }}>
          <path 
            className="line-info" 
            d={pathD} 
            style={{ 
              stroke: hoveredIndex !== null ? 'var(--accent)' : 'var(--signal-info)', 
              strokeWidth: 1.5,
              fill: 'none',
              transition: 'stroke 0.3s ease'
            }} 
          />
          
          {hoveredIndex !== null && (
            <line
              x1={xAt(hoveredIndex, values.length)}
              y1={pad}
              x2={xAt(hoveredIndex, values.length)}
              y2={h - pad}
              stroke="rgba(160, 120, 64, 0.8)"
              strokeWidth="0.75"
              strokeDasharray="2,2"
            />
          )}

          {hoveredIndex !== null && (
            <circle
              cx={xAt(hoveredIndex, values.length)}
              cy={yAt(values[hoveredIndex])}
              r="2.5"
              fill="var(--bg-base)"
              stroke="var(--accent)"
              strokeWidth="0.5"
            />
          )}
        </svg>
      </div>

      <p>{person.days_silent} days silent</p>
      
      {hoveredIndex !== null && (
        <div style={{
          position: 'absolute',
          bottom: '8px',
          right: '12px',
          fontSize: '9px',
          fontFamily: "'JetBrains Mono', monospace",
          color: 'var(--accent)',
          opacity: 0.85,
          pointerEvents: 'none'
        }}>
          freq: {values[hoveredIndex]}
        </div>
      )}
    </article>
  );
}

function RelationshipHeatmap({ relationships }) {
  const people = relationships?.heatmap || [];
  const highest = people.slice().sort((a, b) => b.urgency - a.urgency)[0] || {};
  const silentCount = people.filter((person) => person.days_silent >= 7).length;
  return (
    <div className="relationship-panel">
      <div className="relationship-copy">
        <p className="eyebrow">What this means</p>
        <h3>{highest.name || 'Vikram'} is the first trust loop to close.</h3>
        <p>Each tile is a relationship health signal. Low score plus long silence means the next move should come from you.</p>
        <div className="relationship-stat-grid">
          <div>
            <span>{highest.score || 0}</span>
            <em>lowest score</em>
          </div>
          <div>
            <span>{highest.days_silent || 0}</span>
            <em>days silent</em>
          </div>
          <div>
            <span>{silentCount}</span>
            <em>quiet loops</em>
          </div>
        </div>
      </div>
      <div className="relationship-grid">
        {people.map((person) => (
          <InteractivePersonCard key={person.name} person={person} />
        ))}
      </div>
    </div>
  );
}

function RegretGraph({ regret }) {
  const series = regret?.future_simulation || [];
  const [time, setTime] = useState(0);
  const [hoveredIndex, setHoveredIndex] = useState(null);
  const w = 720;
  const h = 270;
  const pad = 34;
  const finalPoint = series[series.length - 1] || {};
  const peak = series.slice().sort((a, b) => b.no_action - a.no_action)[0] || finalPoint;
  const finalGap = Math.max(0, (finalPoint.no_action || 0) - (finalPoint.with_action || 0));
  const activeIndex = hoveredIndex ?? Math.max(0, series.findIndex((point) => point.date === peak.date));

  useEffect(() => {
    let animFrame;
    const tick = () => {
      setTime((value) => value + 0.016);
      animFrame = requestAnimationFrame(tick);
    };
    animFrame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animFrame);
  }, []);

  const noAction = linePath(series, 'no_action', w, h, pad);
  const withAction = linePath(series, 'with_action', w, h, pad);
  
  const gap = `${noAction} L ${series
    .slice()
    .reverse()
    .map((point, index) => {
      const originalIndex = series.length - 1 - index;
      return `${xAt(originalIndex, series.length, w, pad)} ${yAt(point.with_action, h, pad)}`;
    })
    .join(' L ')} Z`;

  const handleMouseMove = (e) => {
    const svg = e.currentTarget;
    const rect = svg.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const percentX = x / rect.width;
    const svgX = percentX * w;
    
    let closestIndex = 0;
    let minDiff = Infinity;
    series.forEach((point, index) => {
      const px = xAt(index, series.length, w, pad);
      const diff = Math.abs(px - svgX);
      if (diff < minDiff) {
        minDiff = diff;
        closestIndex = index;
      }
    });
    
    setHoveredIndex(closestIndex);
  };

  const handleMouseLeave = () => {
    setHoveredIndex(null);
  };

  return (
    <div className="regret-panel">
      <div className="regret-copy">
        <p className="eyebrow">What this means</p>
        <h3>Action creates a visible regret gap.</h3>
        <p>The amber line is the cost of doing nothing. The green line is what happens if you close the highest-regret loops first.</p>
        <div className="regret-stat-grid">
          <div>
            <span>{peak.no_action || 0}</span>
            <em>peak regret</em>
          </div>
          <div>
            <span>{finalGap}</span>
            <em>gap saved</em>
          </div>
          <div>
            <span>{regret?.recommended_actions?.length || 0}</span>
            <em>actions</em>
          </div>
        </div>
      </div>
      <svg 
        className="wide-chart regret-graph chart-line" 
        viewBox={`0 0 ${w} ${h}`} 
        role="img" 
        aria-label="Regret projection"
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        style={{ cursor: 'crosshair', display: 'block' }}
      >
        <ChartGrid width={w} height={h} pad={pad} />
        <path 
          className="gap-fill" 
          d={gap} 
          style={{ transition: 'opacity 0.3s ease', opacity: hoveredIndex !== null ? 0.04 : 0.08 }} 
        />
        <path className="line-no-action line-risk regret-live-line" d={noAction} style={{ strokeDashoffset: Math.sin(time) * -3 }} />
        <path className="line-with-action line-safe regret-live-line" d={withAction} style={{ strokeDashoffset: Math.cos(time) * 3 }} />
        
        <line
          x1={xAt(activeIndex, series.length, w, pad)}
          y1={pad}
          x2={xAt(activeIndex, series.length, w, pad)}
          y2={h - pad}
          stroke="rgba(160, 120, 64, 0.8)"
          strokeWidth="1"
          strokeDasharray="4,5"
        />

        {series.map((point, index) => {
          const isHovered = activeIndex === index;
          return (
            <g key={point.date}>
              <text 
                x={xAt(index, series.length, w, pad)} 
                y={h - 8} 
                textAnchor="middle" 
                className="axis-label"
                style={{ fill: isHovered ? 'var(--accent)' : 'var(--text-muted)', transition: 'fill 0.2s ease', fontWeight: isHovered ? '500' : 'normal' }}
              >
                {point.label}
              </text>
              
              {isHovered && (
                <>
                  <circle
                    cx={xAt(index, series.length, w, pad)}
                    cy={yAt(point.no_action, h, pad)}
                    r="5.5"
                    fill="var(--bg-base)"
                    stroke="var(--signal-risk)"
                    strokeWidth="1"
                  />
                  <circle
                    cx={xAt(index, series.length, w, pad)}
                    cy={yAt(point.with_action, h, pad)}
                    r="5.5"
                    fill="var(--bg-base)"
                    stroke="var(--signal-safe)"
                    strokeWidth="1"
                  />
                </>
              )}
            </g>
          );
        })}
        
        <text x={w - 160} y={54} className="line-label no-action" style={{ opacity: hoveredIndex !== null ? 0.3 : 0.85, transition: 'opacity 0.2s ease' }}>
          If nothing changes
        </text>
        <text x={w - 170} y={154} className="line-label with-action" style={{ opacity: hoveredIndex !== null ? 0.3 : 0.85, transition: 'opacity 0.2s ease' }}>
          If you take action
        </text>
      </svg>

      {hoveredIndex !== null && (
        <div style={{
          position: 'absolute',
          top: '12px',
          left: '50%',
          transform: 'translateX(-50%)',
          background: 'rgba(244, 242, 239, 0.92)',
          backdropFilter: 'blur(8px)',
          border: '1px solid var(--border-light)',
          borderRadius: '4px',
          padding: '6px 12px',
          display: 'flex',
          gap: '14px',
          fontSize: '10px',
          fontFamily: "'JetBrains Mono', monospace",
          color: 'var(--text-primary)',
          pointerEvents: 'none',
          boxShadow: 'none',
          transition: 'all 0.15s ease'
        }}>
          <span style={{ color: 'var(--accent)' }}>{series[hoveredIndex].label}</span>
          <span>No Action: <strong style={{ color: 'var(--signal-risk)', fontWeight: '500' }}>{series[hoveredIndex].no_action}</strong></span>
          <span>With Action: <strong style={{ color: 'var(--signal-safe)', fontWeight: '500' }}>{series[hoveredIndex].with_action}</strong></span>
          <span style={{ borderLeft: '0.5px solid rgba(255, 252, 245, 0.15)', paddingLeft: '8px' }}>
            Delta: <strong style={{ color: 'var(--accent)', fontWeight: '600' }}>{series[hoveredIndex].no_action - series[hoveredIndex].with_action}</strong>
          </span>
        </div>
      )}
    </div>
  );
}

function DecisionMatrix({ regret }) {
  const risks = regret?.decision_risks || [];
  const topRisks = risks.slice().sort((a, b) => b.regret - a.regret).slice(0, 3);
  return (
    <div className="decision-panel">
      <div className="decision-copy">
        <p className="eyebrow">Pressure test</p>
        <h3>Protect the block. Close the trust loop.</h3>
        <p>The top-left quadrant is the story: low effort, high regret. Aether is telling you which small moves prevent the expensive future.</p>
        <div className="decision-score-row">
          <span>86</span>
          <em>act-now pressure</em>
        </div>
      </div>

      <svg className="decision-matrix" viewBox="0 0 620 340" role="img" aria-label="Decision impact matrix">
        <rect x="68" y="42" width="240" height="118" className="matrix-zone matrix-act" />
        <rect x="308" y="42" width="244" height="118" className="matrix-zone" />
        <rect x="68" y="160" width="240" height="116" className="matrix-zone" />
        <rect x="308" y="160" width="244" height="116" className="matrix-zone" />
        <line x1="68" y1="276" x2="552" y2="276" className="axis-line" />
        <line x1="68" y1="276" x2="68" y2="42" className="axis-line" />
        <line x1="308" y1="276" x2="308" y2="42" className="grid-line" />
        <line x1="68" y1="160" x2="552" y2="160" className="grid-line" />
        <text x="88" y="72" className="matrix-label">Act now</text>
        <text x="334" y="72" className="matrix-label">Plan it</text>
        <text x="88" y="252" className="matrix-label">Delegate</text>
        <text x="334" y="252" className="matrix-label">Let go</text>
        {risks.map((risk) => {
          const x = 68 + (risk.effort / 100) * 484;
          const y = 276 - (risk.regret / 100) * 234;
          const hot = risk.regret > 75 && risk.effort < 60;
          return (
            <g key={risk.issue} className={hot ? 'matrix-point hot' : 'matrix-point'}>
              <circle cx={x} cy={y} r={hot ? '8' : '6'} className={risk.regret > 75 ? 'dot-risk' : 'dot-warn'} />
              <text x={x + 12} y={y + 4} className="matrix-node-label">{risk.issue}</text>
              <title>{`${risk.issue}: effort ${risk.effort}, regret ${risk.regret}`}</title>
            </g>
          );
        })}
        <text x="310" y="322" textAnchor="middle" className="axis-label">Effort to fix</text>
        <text x="24" y="168" transform="rotate(-90 24 168)" className="axis-label">Regret if ignored</text>
      </svg>

      <div className="decision-ranked">
        {topRisks.map((risk, index) => (
          <div key={risk.issue}>
            <span>{String(index + 1).padStart(2, '0')}</span>
            <p>{risk.issue}</p>
            <strong>{risk.regret}</strong>
          </div>
        ))}
      </div>
    </div>
  );
}

function OpportunityRadar({ items }) {
  const labels = items || [];
  const cx = 140;
  const cy = 140;
  const radius = 92;
  const points = labels.map((item, index) => polar(cx, cy, (index / labels.length) * Math.PI * 2 - Math.PI / 2, (item.value / 100) * radius));

  return (
    <svg className="radar-chart" viewBox="0 0 280 280" role="img" aria-label="Opportunity radar">
      {[0.33, 0.66, 1].map((level) => (
        <polygon key={level} points={labels.map((_, index) => polar(cx, cy, (index / labels.length) * Math.PI * 2 - Math.PI / 2, radius * level).join(',')).join(' ')} className="radar-ring" />
      ))}
      {labels.map((item, index) => {
        const end = polar(cx, cy, (index / labels.length) * Math.PI * 2 - Math.PI / 2, radius);
        const label = polar(cx, cy, (index / labels.length) * Math.PI * 2 - Math.PI / 2, radius + 22);
        return (
          <g key={item.domain}>
            <line x1={cx} y1={cy} x2={end.x} y2={end.y} className="grid-line" />
            <text x={label.x} y={label.y} textAnchor="middle" className="axis-label">{item.domain}</text>
          </g>
        );
      })}
      <polygon points={points.map((point) => `${point.x},${point.y}`).join(' ')} className="radar-fill" />
    </svg>
  );
}

function AutopilotModule({ briefing }) {
  return (
    <article className="module-panel">
      <p className="eyebrow">Life Autopilot</p>
      <h3>Chaos and energy risk</h3>
      <EnergyHeatmap items={briefing.graphs.energy_heatmap} />
      <MeetingDensity items={briefing.graphs.meeting_density} />
      <div className="priority-stack">
        {briefing.priority_stack.map((item) => (
          <div key={item.label}>
            <span>{item.label}</span>
            <strong>{item.urgency}</strong>
          </div>
        ))}
      </div>
    </article>
  );
}

function RelationshipsModule({ relationships }) {
  return (
    <article className="module-panel">
      <p className="eyebrow">Human Relationship CRM</p>
      <h3>Neglect radar</h3>
      <RadarFromRelationship relationships={relationships} />
      <div className="mini-list">
        {(relationships.neglected || []).slice(0, 3).map((person) => (
          <p key={person.name}>
            <strong>{person.name}</strong> - {person.days_silent} days silent
          </p>
        ))}
      </div>
    </article>
  );
}

function RadarFromRelationship({ relationships }) {
  const labels = relationships.radar.labels;
  const you = Object.values(relationships.radar.you);
  const cx = 140;
  const cy = 140;
  const radius = 84;
  const userPoints = labels.map((_, index) => polar(cx, cy, (index / labels.length) * Math.PI * 2 - Math.PI / 2, (you[index] / 100) * radius));
  const baselinePoints = labels.map((_, index) => polar(cx, cy, (index / labels.length) * Math.PI * 2 - Math.PI / 2, (relationships.radar.baseline[index] / 100) * radius));

  return (
    <svg className="radar-chart" viewBox="0 0 280 280" role="img" aria-label="Neglect radar">
      <polygon points={baselinePoints.map((point) => `${point.x},${point.y}`).join(' ')} className="radar-baseline" />
      <polygon points={userPoints.map((point) => `${point.x},${point.y}`).join(' ')} className="radar-fill" />
      {labels.map((label, index) => {
        const point = polar(cx, cy, (index / labels.length) * Math.PI * 2 - Math.PI / 2, radius + 24);
        return <text key={label} x={point.x} y={point.y} textAnchor="middle" className="axis-label">{label.split(' ')[0]}</text>;
      })}
    </svg>
  );
}

function RegretModule({ regret }) {
  return (
    <article className="module-panel">
      <p className="eyebrow">Regret Minimizer</p>
      <h3>Opportunity radar</h3>
      <OpportunityRadar items={regret.opportunity_radar} />
      <div className="mini-list">
        {regret.recommended_actions.map((item) => (
          <p key={item.label}>
            <strong>{item.impact}</strong> {item.label}
          </p>
        ))}
      </div>
    </article>
  );
}

function CoralConsole({ entries, filter, setFilter, phase, thinking, open, setSourcePanel, onToggle }) {
  const allSources = Array.from(new Set(entries.flatMap((entry) => entry.sources || []))).sort();
  const visibleEntries = filter === 'all' ? entries : entries.filter((entry) => entry.sources?.includes(filter));

  return (
    <aside id="coral-console" className={open ? 'coral-console open' : 'coral-console closed'}>
      <button
        type="button"
        className="console-drawer-toggle"
        onClick={onToggle}
        aria-label={open ? 'Close Coral Console' : 'Open Coral Console'}
      >
        {open ? '>' : '<'}
      </button>
      <header>
        <div>
          <p className="eyebrow">Coral Console</p>
          <h2>Live query feed</h2>
        </div>
        <div className="console-actions">
          <span className="console-status">{thinking ? 'RUN' : 'IDLE'}</span>
          <button type="button" className="console-close" onClick={onToggle}>
            Hide {'->'}
          </button>
        </div>
      </header>
      <p className="console-phase"><span>&gt;</span> {phase}</p>
      <label className="source-filter">
        <span>Filter</span>
        <select value={filter} onChange={(event) => setFilter(event.target.value)}>
          <option value="all">All sources</option>
          {allSources.map((source) => (
            <option key={source} value={source}>{source}</option>
          ))}
        </select>
      </label>
      <div className="console-source-row">
        {allSources.slice(0, 6).map((source) => (
          <button key={source} type="button" onClick={() => setSourcePanel(source)}>
            {source}
          </button>
        ))}
      </div>
      <div className="query-feed">
        {visibleEntries.slice(0, 12).map((entry) => (
          <article key={entry.id} className="query-entry">
            <p className="query-meta">{entry.insight_powered}</p>
            <pre><code><Typewriter text={entry.sql} /></code></pre>
            <p className="query-result">{'->'} {entry.rows_returned} rows found [{entry.execution_ms}ms]</p>
          </article>
        ))}
      </div>
    </aside>
  );
}

function SourceBadge({ source, setSourcePanel }) {
  return (
    <button type="button" className="source-badge" onClick={() => setSourcePanel(source)}>
      {source}
    </button>
  );
}

function SourcePanel({ source, raw, onClose }) {
  const spec = source || {};

  return (
    <div className="source-panel" role="dialog" aria-modal="true">
      <div className="source-card">
        <button type="button" className="close-button" onClick={onClose}>Close</button>
        <p className="eyebrow">Coral source spec</p>
        <h2>{spec.name || raw}</h2>
        <dl>
          <div><dt>Table</dt><dd>{spec.table_name || 'coral_source'}</dd></div>
          <div><dt>Last sync</dt><dd>{spec.last_sync ? new Date(spec.last_sync).toLocaleString() : 'Live'}</dd></div>
          <div><dt>Rows</dt><dd>{spec.row_count || 'n/a'}</dd></div>
        </dl>
        <div className="schema-grid">
          {(spec.schema || []).map((field) => (
            <span key={`${field.column}-${field.type}`}>{field.column}<em>{field.type}</em></span>
          ))}
        </div>
        <pre className="sample-row">{JSON.stringify(spec.sample_row || {}, null, 2)}</pre>
      </div>
    </div>
  );
}

function resolveSource(source, specs) {
  const normalized = String(source).toLowerCase();
  return specs.find((spec) => {
    return (
      spec.name.toLowerCase().includes(normalized) ||
      spec.table_name.toLowerCase().includes(normalized) ||
      normalized.includes(spec.name.toLowerCase().replace('google ', ''))
    );
  });
}

function Typewriter({ text }) {
  const [length, setLength] = useState(0);

  useEffect(() => {
    setLength(0);
    const timer = window.setInterval(() => {
      setLength((current) => {
        if (current >= text.length) {
          window.clearInterval(timer);
          return current;
        }
        return current + 4;
      });
    }, 18);

    return () => window.clearInterval(timer);
  }, [text]);

  return highlightSql(text.slice(0, length));
}

function highlightSql(sql) {
  const parts = sql.split(/(\bSELECT\b|\bFROM\b|\bWHERE\b|\bJOIN\b|\bLEFT\b|\bCROSS\b|\bGROUP BY\b|\bORDER BY\b|\bHAVING\b|\bLIMIT\b|\bCOUNT\b|\bMAX\b|\bAVG\b|\bCASE\b|\bWHEN\b|\bTHEN\b|\bELSE\b|\bEND\b)/gi);
  return parts.map((part, index) => {
    if (/^(SELECT|FROM|WHERE|JOIN|LEFT|CROSS|GROUP BY|ORDER BY|HAVING|LIMIT|COUNT|MAX|AVG|CASE|WHEN|THEN|ELSE|END)$/i.test(part)) {
      return <span key={`${part}-${index}`} className="sql-keyword">{part}</span>;
    }
    if (part.trim().startsWith('--')) {
      return <span key={`${part}-${index}`} className="sql-comment">{part}</span>;
    }
    return <span key={`${part}-${index}`}>{part}</span>;
  });
}

function InlineSignalGraph({ seed }) {
  const values = [seed - 24, seed - 10, seed - 16, seed - 2, seed - 8, seed].map((value) => Math.max(8, Math.min(100, value)));
  return (
    <svg viewBox="0 0 220 64" role="img" aria-label="Insight signal">
      <path className="line-warn" d={linePath(values.map((value, i) => ({ value, label: i })), 'value', 220, 64, 8)} />
      {values.map((value, i) => (
        <circle key={`${value}-${i}`} cx={xAt(i, values.length, 220, 8)} cy={yAt(value, 64, 8)} r="2.5" className="dot-warn" />
      ))}
    </svg>
  );
}

function Sparkline({ values }) {
  const data = values.map((value, index) => ({ value, index }));
  return (
    <svg viewBox="0 0 160 42" role="img" aria-label="Interaction frequency sparkline">
      <path className="line-info" d={linePath(data, 'value', 160, 42, 4, Math.max(...values, 1))} />
    </svg>
  );
}

function ChartGrid({ width, height, pad }) {
  return (
    <g>
      {[0, 25, 50, 75, 100].map((tick) => (
        <g key={tick}>
          <line x1={pad} y1={yAt(tick, height, pad)} x2={width - pad} y2={yAt(tick, height, pad)} className="grid-line" />
          <text x={8} y={yAt(tick, height, pad) + 4} className="axis-label">{tick}</text>
        </g>
      ))}
    </g>
  );
}

function linePath(items, key, width, height, pad, domainMax = 100) {
  if (!items.length) return '';
  return items
    .map((item, index) => `${index === 0 ? 'M' : 'L'} ${xAt(index, items.length, width, pad)} ${yAt(item[key], height, pad, domainMax)}`)
    .join(' ');
}

function areaPath(items, key, width, height, pad, scale = 1, offset = 0) {
  if (!items.length) return '';
  const baseline = height - pad;
  const top = items
    .map((item, index) => {
      const raw = offset + item[key] * scale;
      const value = scale < 0 ? 100 - Math.max(0, raw) : Math.min(100, raw);
      return `${index === 0 ? 'M' : 'L'} ${xAt(index, items.length, width, pad)} ${yAt(value, height, pad)}`;
    })
    .join(' ');
  return `${top} L ${width - pad} ${baseline} L ${pad} ${baseline} Z`;
}

function xAt(index, count, width, pad) {
  if (count <= 1) return width / 2;
  return pad + (index / (count - 1)) * (width - pad * 2);
}

function yAt(value, height, pad, domainMax = 100) {
  const clamped = Math.max(0, Math.min(domainMax, value || 0));
  return height - pad - (clamped / domainMax) * (height - pad * 2);
}

function polar(cx, cy, angle, radius) {
  return {
    x: Number((cx + Math.cos(angle) * radius).toFixed(2)),
    y: Number((cy + Math.sin(angle) * radius).toFixed(2)),
    join(separator = ',') {
      return `${this.x}${separator}${this.y}`;
    }
  };
}

function riskClass(value) {
  if (value >= 75) return 'risk-high';
  if (value >= 50) return 'risk-mid';
  return 'risk-low';
}
