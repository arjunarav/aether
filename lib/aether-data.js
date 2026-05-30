import fs from 'node:fs';
import path from 'node:path';

const APP_TODAY = new Date(process.env.AETHER_TODAY || '2026-05-29T09:00:00+05:30');
const DAY_MS = 24 * 60 * 60 * 1000;
const ROOT = process.cwd();

function readJson(file) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, 'mock', file), 'utf8'));
}

function data() {
  return {
    health: readJson('health_sleep.json'),
    transactions: readJson('bank_transactions.json'),
    subscriptions: readJson('subscriptions.json'),
    contacts: readJson('contacts.json'),
    emails: readJson('emails.json'),
    calendar: readJson('calendar_events.json'),
    goals: readJson('notion_goals.json'),
    whatsapp: readJson('whatsapp_messages.json'),
    discord: readJson('discord_activity.json'),
    locations: readJson('location_events.json')
  };
}

function isoDay(date) {
  return new Date(date).toISOString().slice(0, 10);
}

function diffDays(dateLike, anchor = APP_TODAY) {
  return Math.max(0, Math.floor((anchor - new Date(dateLike)) / DAY_MS));
}

function addDays(date, amount) {
  const d = new Date(date);
  d.setDate(d.getDate() + amount);
  return d;
}

function dayName(date) {
  return new Intl.DateTimeFormat('en-US', { weekday: 'short' }).format(new Date(`${date}T12:00:00+05:30`));
}

function formatMonthDay(date) {
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(new Date(`${date}T12:00:00+05:30`));
}

function weekDates() {
  return Array.from({ length: 7 }, (_, i) => isoDay(addDays('2026-05-25T12:00:00+05:30', i)));
}

function stableId(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function queryStore() {
  if (!globalThis.__AETHER_QUERY_LOG__) {
    globalThis.__AETHER_QUERY_LOG__ = [];
  }
  return globalThis.__AETHER_QUERY_LOG__;
}

export function resetQueryLog() {
  globalThis.__AETHER_QUERY_LOG__ = [];
}

export function getQueryLog() {
  return queryStore().slice().sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
}

function logQuery({ sql, sources, rows, ms, insight, triggeredBy }) {
  const entry = {
    id: stableId('cq'),
    timestamp: new Date().toISOString(),
    sql,
    sources,
    rows_returned: rows,
    execution_ms: ms,
    insight_powered: insight,
    triggered_by: triggeredBy
  };
  queryStore().unshift(entry);
  globalThis.__AETHER_QUERY_LOG__ = queryStore().slice(0, 80);
  return entry;
}

const SQL = {
  overload: `-- Running: overload detection
SELECT date,
       COUNT(cal.id) as meeting_count,
       AVG(h.sleep_hrs) as avg_sleep,
       COUNT(e.id) FILTER (
         WHERE e.importance = 'high' AND e.replied = false
       ) as urgent_unreplied
FROM calendar_events cal
JOIN health_sleep h ON h.date = cal.date
LEFT JOIN emails e ON e.date = cal.date
WHERE cal.date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '7 days'
GROUP BY date
HAVING meeting_count > 4 OR avg_sleep < 6
ORDER BY date;`,
  relationshipDecay: `-- Running: relationship decay scan
SELECT c.name, c.email, c.relationship_score,
       MAX(e.date) as last_email,
       MAX(w.timestamp) as last_whatsapp,
       DATEDIFF(NOW(), GREATEST(MAX(e.date), MAX(w.timestamp))) as days_silent
FROM contacts c
LEFT JOIN emails e ON e.sender_email = c.email OR e.recipient_email = c.email
LEFT JOIN whatsapp_messages w ON w.contact = c.name
GROUP BY c.name, c.email, c.relationship_score
HAVING days_silent > 14
ORDER BY c.relationship_score DESC;`,
  staleGoals: `-- Running: stale high-priority goal scan
SELECT title, status, priority, last_edited,
       DATEDIFF(CURRENT_DATE, last_edited) as days_idle
FROM notion_goals
WHERE status IN ('in_progress', 'blocked')
  AND priority IN ('high', 'medium')
ORDER BY days_idle DESC;`,
  regret: `-- Running: regret risk composite
SELECT date,
       (COUNT(cal.id) * 10) +
       (CASE WHEN h.sleep_hrs < 6 THEN 20 ELSE 0 END) +
       (COUNT(e.id) FILTER (
         WHERE e.importance='high' AND e.replied=false
       ) * 15) +
       (DATEDIFF(CURRENT_DATE, MAX(g.last_edited)) * 2) as regret_score
FROM calendar_events cal
JOIN health_sleep h ON h.date = cal.date
LEFT JOIN emails e ON e.date = cal.date
CROSS JOIN notion_goals g
WHERE g.status = 'in_progress'
GROUP BY date, h.sleep_hrs
ORDER BY date;`,
  sourceJoin: `-- Running: unified life graph join
SELECT node_id, node_type, score, last_signal_at, connected_to
FROM coral_life_graph
WHERE last_signal_at > CURRENT_DATE - INTERVAL '45 days'
ORDER BY score DESC;`,
  decision: `-- Running: decision pressure-test
SELECT issue, effort_to_fix, regret_if_ignored, source_count
FROM open_loops
WHERE source_count >= 2
ORDER BY regret_if_ignored DESC, effort_to_fix ASC;`,
  sourceSpecs: `-- Running: source spec inventory
SELECT table_name, source, row_count, last_sync_at
FROM coral_registered_sources
ORDER BY table_name;`
};

export function getSources() {
  const d = data();
  const sourceMap = [
    ['calendar_events', 'Google Calendar API', d.calendar, ['id:text', 'title:text', 'date:date', 'start:timestamp', 'end:timestamp', 'attendees:text[]', 'type:text']],
    ['emails', 'Gmail API', d.emails, ['id:text', 'subject:text', 'sender:text', 'sender_email:text', 'recipient_email:text', 'date:date', 'importance:text', 'replied:boolean']],
    ['notion_goals', 'Notion API', d.goals, ['id:text', 'title:text', 'status:text', 'last_edited:date', 'priority:text', 'next_action:text']],
    ['contacts', 'Google Contacts', d.contacts, ['id:text', 'name:text', 'email:text', 'role:text', 'relationship_score:int', 'importance:text']],
    ['health_sleep', 'Health', d.health, ['date:date', 'sleep_hrs:float', 'hrv:int', 'energy_score:int', 'workout:boolean']],
    ['bank_transactions', 'Banking', d.transactions, ['date:date', 'amount:int', 'category:text', 'merchant:text', 'note:text']],
    ['subscriptions', 'Banking', d.subscriptions, ['name:text', 'amount:int', 'billing_date:date', 'used_last_30d:boolean']],
    ['whatsapp_messages', 'WhatsApp', d.whatsapp, ['id:text', 'contact:text', 'message:text', 'timestamp:timestamp', 'direction:text', 'type:text']],
    ['discord_activity', 'Discord', d.discord, ['id:text', 'server:text', 'channel:text', 'timestamp:timestamp', 'type:text', 'count:int']],
    ['location_events', 'Location', d.locations, ['id:text', 'place:text', 'arrival:timestamp', 'departure:timestamp', 'category:text']]
  ];

  const specs = sourceMap.map(([table, source, rows, schema]) => ({
    name: source,
    table_name: table,
    schema: schema.map((item) => {
      const [column, type] = item.split(':');
      return { column, type };
    }),
    last_sync: new Date(APP_TODAY.getTime() - (table.length % 6) * 9 * 60 * 1000).toISOString(),
    row_count: rows.length,
    sample_row: rows[0]
  }));

  logQuery({
    sql: SQL.sourceSpecs,
    sources: ['Coral'],
    rows: specs.length,
    ms: 8,
    insight: 'Source spec display',
    triggeredBy: 'source-panel'
  });

  return specs;
}

function urgentUnrepliedByDate(emails, date) {
  return emails.filter((email) => email.date === date && email.importance === 'high' && !email.replied);
}

function staleGoalPenalty(goals) {
  return goals
    .filter((goal) => goal.status !== 'done')
    .reduce((sum, goal) => {
      const weight = goal.priority === 'high' ? 1.4 : goal.priority === 'medium' ? 0.8 : 0.35;
      return sum + Math.min(28, diffDays(goal.last_edited) * weight);
    }, 0);
}

function dayStats() {
  const d = data();
  const stalePenalty = staleGoalPenalty(d.goals);

  return weekDates().map((date) => {
    const events = d.calendar.filter((event) => event.date === date);
    const meetings = events.filter((event) => event.type === 'meeting');
    const focusHours = events
      .filter((event) => event.type === 'focus')
      .reduce((sum, event) => sum + (new Date(event.end) - new Date(event.start)) / (60 * 60 * 1000), 0);
    const sleep = d.health.find((entry) => entry.date === date) || { sleep_hrs: 6, energy_score: 60 };
    const urgent = urgentUnrepliedByDate(d.emails, date);
    const lateDiscord = d.discord.filter((item) => item.timestamp.startsWith(date) && item.type === 'late_night');
    const lateSpend = d.transactions.filter((item) => item.date === date && ['impulse', 'food'].includes(item.category));
    const chaos = Math.min(
      100,
      Math.round(
        meetings.length * 9 +
          urgent.length * 14 +
          (focusHours < 1 ? 14 : 0) +
          Math.max(0, 6 - sleep.sleep_hrs) * 12 +
          Math.min(18, stalePenalty / 9) +
          lateDiscord.length * 5 +
          lateSpend.length * 3
      )
    );

    return {
      date,
      label: dayName(date),
      display: formatMonthDay(date),
      meeting_count: meetings.length,
      focus_hours: Number(focusHours.toFixed(1)),
      sleep_hrs: sleep.sleep_hrs,
      energy_score: sleep.energy_score,
      urgent_unreplied: urgent.length,
      goal_neglect: Math.round(stalePenalty / 4),
      email_backlog: d.emails.filter((email) => !email.replied && email.date <= date).length,
      chaos_score: chaos,
      energy_risk: Math.min(100, Math.round(100 - sleep.energy_score + meetings.length * 5 + (focusHours < 1 ? 10 : 0)))
    };
  });
}

function relationshipRows() {
  const d = data();

  return d.contacts.map((contact) => {
    const emailTouches = d.emails
      .filter((email) => email.sender_email === contact.email || email.recipient_email === contact.email)
      .map((email) => ({ at: `${email.date}T12:00:00+05:30`, type: 'email', direction: email.sender_email === contact.email ? 'inbound' : 'outbound', text: email.snippet }));
    const whatsappTouches = d.whatsapp
      .filter((message) => message.contact === contact.name)
      .map((message) => ({ at: message.timestamp, type: message.type, direction: message.direction, text: message.message }));
    const calendarTouches = d.calendar
      .filter((event) => event.attendees.includes(contact.name) && new Date(event.end) <= APP_TODAY)
      .map((event) => ({ at: event.end, type: 'meeting', direction: 'shared', text: event.title }));
    const touches = [...emailTouches, ...whatsappTouches, ...calendarTouches].sort((a, b) => new Date(b.at) - new Date(a.at));
    const lastTouch = touches[0];
    const daysSilent = lastTouch ? diffDays(lastTouch.at) : 90;
    const unanswered = [...d.emails, ...d.whatsapp]
      .filter((item) => {
        if ('sender_email' in item) return item.sender_email === contact.email && !item.replied;
        return item.contact === contact.name && item.direction === 'inbound';
      })
      .sort((a, b) => new Date('date' in b ? b.date : b.timestamp) - new Date('date' in a ? a.date : a.timestamp))[0];
    const trendDrop = Math.max(0, contact.baseline_score - contact.relationship_score);
    const decayUrgency = Math.min(100, Math.round(daysSilent * 2 + trendDrop * 1.3 + (contact.importance === 'high' ? 12 : 0)));
    const sparkline = Array.from({ length: 12 }, (_, i) => {
      const base = Math.max(1, Math.round((contact.baseline_score - i * trendDrop * 0.08) / 18));
      const recentFade = i > 7 ? Math.max(0, 10 - daysSilent / 3) : 0;
      return Math.max(0, Math.round(base + recentFade - (i % 3 === 0 ? 1 : 0)));
    });

    return {
      ...contact,
      last_contacted_at: lastTouch?.at || null,
      last_contact_label: lastTouch ? formatMonthDay(isoDay(lastTouch.at)) : 'No record',
      days_silent: daysSilent,
      decay_urgency: decayUrgency,
      last_interaction_type: lastTouch?.type || 'unknown',
      last_message: unanswered?.snippet || unanswered?.message || lastTouch?.text || 'No recent message',
      sparkline,
      radar: {
        response_time: Math.max(18, 95 - daysSilent * 4),
        initiative: Math.max(20, contact.relationship_score - 8),
        emotional_continuity: Math.max(15, contact.relationship_score - trendDrop),
        follow_through: unanswered ? 38 : Math.max(40, contact.relationship_score),
        frequency: Math.max(10, 90 - daysSilent * 3)
      }
    };
  }).sort((a, b) => b.decay_urgency - a.decay_urgency);
}

function lifeGraph() {
  const d = data();
  const rel = relationshipRows().slice(0, 6);
  const goals = d.goals.slice(0, 5);
  const eventNodes = d.calendar.filter((event) => event.date >= '2026-05-28').slice(0, 6);
  const health = d.health.slice(-5);

  const nodes = [
    { id: 'you', label: 'You', type: 'self', score: 100, risk: 'center', x: 50, y: 48 },
    ...rel.map((item, i) => ({
      id: item.id,
      label: item.name,
      type: 'person',
      score: item.relationship_score,
      risk: item.decay_urgency > 70 ? 'critical' : item.decay_urgency > 45 ? 'watch' : 'safe',
      x: [25, 18, 74, 80, 32, 70][i],
      y: [22, 58, 24, 60, 78, 82][i]
    })),
    ...goals.map((goal, i) => ({
      id: goal.id,
      label: goal.title,
      type: 'goal',
      score: Math.max(15, 100 - diffDays(goal.last_edited)),
      risk: diffDays(goal.last_edited) > 30 ? 'critical' : diffDays(goal.last_edited) > 12 ? 'watch' : 'safe',
      x: [47, 59, 42, 63, 54][i],
      y: [14, 34, 88, 74, 8][i]
    })),
    ...eventNodes.map((event, i) => ({
      id: event.id,
      label: event.title,
      type: 'event',
      score: event.type === 'meeting' ? 60 : 76,
      risk: event.date === '2026-05-29' && event.type === 'meeting' ? 'watch' : 'info',
      x: [10, 88, 12, 90, 16, 84][i],
      y: [38, 42, 70, 72, 10, 12][i]
    })),
    ...health.map((entry, i) => ({
      id: `health_${entry.date}`,
      label: `${entry.sleep_hrs}h`,
      type: 'health',
      score: entry.energy_score,
      risk: entry.sleep_hrs < 5.5 ? 'critical' : 'watch',
      x: [31, 41, 52, 63, 73][i],
      y: [35, 24, 34, 24, 35][i]
    }))
  ];

  const edges = nodes
    .filter((node) => node.id !== 'you')
    .map((node, i) => ({
      source: 'you',
      target: node.id,
      weight: Math.max(1, Math.round(node.score / 25)),
      health: node.risk,
      recent: i % 4 === 0
    }));

  return { nodes, edges };
}

function sourceBadges(names) {
  return names.map((name) => ({ name, key: name.toLowerCase().replaceAll(' ', '_') }));
}

export function getBriefing(triggeredBy = 'auto-briefing') {
  const d = data();
  const stats = dayStats();
  const highest = stats.slice().sort((a, b) => b.chaos_score - a.chaos_score)[0];
  const staleGoals = d.goals
    .filter((goal) => goal.status !== 'done')
    .map((goal) => ({ ...goal, days_idle: diffDays(goal.last_edited) }))
    .sort((a, b) => b.days_idle - a.days_idle);
  const mentorEmail = d.emails.find((email) => email.sender === 'Maya Chen' && !email.replied);
  const urgentEmails = d.emails.filter((email) => email.importance === 'high' && !email.replied);

  const queries = [
    logQuery({
      sql: SQL.overload,
      sources: ['Google Calendar', 'Gmail', 'Health'],
      rows: stats.filter((day) => day.meeting_count > 4 || day.sleep_hrs < 6).length,
      ms: 12,
      insight: 'High chaos day',
      triggeredBy
    }),
    logQuery({
      sql: SQL.staleGoals,
      sources: ['Notion'],
      rows: staleGoals.length,
      ms: 9,
      insight: 'Goal neglect',
      triggeredBy
    }),
    logQuery({
      sql: SQL.relationshipDecay,
      sources: ['Gmail', 'WhatsApp', 'Google Contacts'],
      rows: relationshipRows().filter((row) => row.days_silent > 14).length,
      ms: 15,
      insight: 'Relationship decay',
      triggeredBy
    })
  ];

  return {
    date: isoDay(APP_TODAY),
    chaos_score: highest.chaos_score,
    proactive_risks: [
      {
        label: `${highest.label} looks dangerous -> ${highest.meeting_count} meetings, ${highest.focus_hours} focus hours`,
        query: 'Debug my week.',
        severity: 'critical'
      },
      {
        label: `Mentor email unanswered - ${mentorEmail ? diffDays(mentorEmail.date) : 0} days`,
        query: 'Who am I accidentally neglecting?',
        severity: 'act'
      },
      {
        label: `${staleGoals[0].title} untouched since ${formatMonthDay(staleGoals[0].last_edited)}`,
        query: 'What will I regret next week if I change nothing?',
        severity: 'watch'
      }
    ],
    top_3_insights: [
      {
        id: 'insight_chaos',
        severity: 'CRITICAL',
        title: `High chaos - ${highest.label}`,
        score: highest.chaos_score,
        evidence: [
          `${highest.meeting_count} calendar meetings with ${highest.focus_hours}h focus time`,
          `${urgentEmails.length} high-importance emails remain unreplied`,
          `Sleep averaged ${average(d.health.slice(-7).map((item) => item.sleep_hrs)).toFixed(1)}h over the last week`
        ],
        actions: ['Block a 90min focus window before the deadline', 'Decline or compress the lowest-priority standup', 'Reply to Maya Chen before opening new work'],
        sources: sourceBadges(['Calendar', 'Gmail', 'Notion', 'Health']),
        graph: 'chaos'
      },
      {
        id: 'insight_relationship',
        severity: 'ACT',
        title: 'Relationship cooling - Vikram Nair',
        score: 41,
        evidence: [
          'Last warm message offered a reference and is unanswered',
          'Relationship score dropped from 78 to 41 this month',
          'No meaningful touch in more than three weeks'
        ],
        actions: ['Send a three-line update', 'Ask whether the reference offer still stands'],
        sources: sourceBadges(['Gmail', 'WhatsApp', 'Contacts']),
        graph: 'relationships'
      },
      {
        id: 'insight_orion',
        severity: 'WATCH',
        title: 'Project Orion is becoming invisible',
        score: Math.max(0, 100 - staleGoals[0].days_idle),
        evidence: [
          `${staleGoals[0].days_idle} days since the page changed`,
          'Calendar has no protected block for it this week',
          'Aether detected more urgent surface work replacing strategic work'
        ],
        actions: ['Create a 45min benchmark memo block', 'Write a visible next action in Notion'],
        sources: sourceBadges(['Notion', 'Calendar']),
        graph: 'regret'
      }
    ],
    energy_forecast: stats.map((day) => ({ date: day.date, label: day.label, risk: day.energy_risk, sleep_hrs: day.sleep_hrs })),
    priority_stack: [
      { label: 'Submit hackathon URL by 5:15pm', source: 'Calendar + Gmail', urgency: 96 },
      { label: 'Reply to Maya Chen with the product narrative', source: 'Gmail', urgency: 88 },
      { label: 'Create one uninterrupted focus block', source: 'Calendar + Health', urgency: 82 },
      { label: 'Send Vikram a concise update', source: 'Gmail + WhatsApp', urgency: 77 }
    ],
    graphs: {
      chaos_timeline: stats,
      meeting_density: stats.map((day) => ({ date: day.date, label: day.label, meetings: day.meeting_count, focus_hours: day.focus_hours, chaos_score: day.chaos_score })),
      energy_heatmap: stats.map((day) => ({ date: day.date, label: day.label, risk: day.energy_risk, sleep_hrs: day.sleep_hrs })),
      life_graph: lifeGraph()
    },
    queries_run: queries
  };
}

function average(values) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function getRelationships(triggeredBy = 'relationships') {
  const rows = relationshipRows();
  const neglected = rows.filter((row) => row.days_silent > 14 || row.decay_urgency > 60);
  const query = logQuery({
    sql: SQL.relationshipDecay,
    sources: ['Gmail', 'WhatsApp', 'Discord', 'Google Contacts'],
    rows: neglected.length,
    ms: 14,
    insight: 'Relationship heatmap',
    triggeredBy
  });

  return {
    relationship_scores: rows,
    neglected,
    reconnection_suggestions: neglected.slice(0, 4).map((person) => ({
      contact: person.name,
      reason: person.last_message,
      draft: `Hey ${person.name.split(' ')[0]}, wanted to send a real update instead of vanishing. ${person.last_meaningful_context} I appreciated that and wanted to reconnect this week.`
    })),
    heatmap: rows.map((person) => ({
      name: person.name,
      score: person.relationship_score,
      urgency: person.decay_urgency,
      days_silent: person.days_silent,
      sparkline: person.sparkline
    })),
    radar: {
      labels: ['Response time', 'Initiative', 'Emotional continuity', 'Follow-through', 'Frequency'],
      you: rows[0]?.radar || {},
      baseline: [82, 76, 78, 80, 74]
    },
    queries_run: [query]
  };
}

export function getRegret(triggeredBy = 'regret') {
  const d = data();
  const stats = dayStats();
  const stale = d.goals
    .filter((goal) => goal.status !== 'done')
    .map((goal) => ({ ...goal, days_idle: diffDays(goal.last_edited) }))
    .sort((a, b) => b.days_idle - a.days_idle);
  const relationships = relationshipRows();
  const regretSeries = stats.map((day, i) => {
    const base = Math.min(100, Math.round(day.chaos_score * 0.55 + day.goal_neglect * 0.8 + day.urgent_unreplied * 10 + i * 4));
    return {
      date: day.date,
      label: day.label,
      no_action: Math.min(100, base + i * 5),
      with_action: Math.max(18, base - 18 - i * 2)
    };
  });
  const decisionRisks = [
    { issue: 'Maya Chen reply', effort: 18, regret: 92, source_count: 3, quadrant: 'Act now' },
    { issue: 'Friday focus block', effort: 35, regret: 86, source_count: 4, quadrant: 'Act now' },
    { issue: 'Project Orion memo', effort: 54, regret: 78, source_count: 2, quadrant: 'Plan it' },
    { issue: 'Vikram update', effort: 22, regret: 74, source_count: 2, quadrant: 'Act now' },
    { issue: 'Unused gym plan', effort: 12, regret: 36, source_count: 1, quadrant: 'Delegate' },
    { issue: 'Discord participation', effort: 68, regret: 32, source_count: 1, quadrant: 'Let go' }
  ];
  const opportunities = [
    { domain: 'Career', value: 83, label: 'Founder update window' },
    { domain: 'Health', value: 71, label: 'Sleep reset before the deadline crash' },
    { domain: 'Relationships', value: 91, label: 'Mentor/reference replies' },
    { domain: 'Finance', value: 44, label: 'Cancel unused subscriptions' },
    { domain: 'Goals', value: 79, label: 'Orion memo' }
  ];

  const query = logQuery({
    sql: SQL.regret,
    sources: ['Calendar', 'Gmail', 'Notion', 'Health', 'Banking', 'WhatsApp'],
    rows: regretSeries.length,
    ms: 19,
    insight: 'Regret projection',
    triggeredBy
  });

  return {
    regret_score: regretSeries[regretSeries.length - 1].no_action,
    top_predicted_regret: `You will most regret letting Maya's mentor thread and the Project Orion memo disappear under deadline urgency.`,
    evidence_chain: [
      `Maya email has been unanswered for ${diffDays('2026-05-11')} days.`,
      `${stale[0].title} has been untouched for ${stale[0].days_idle} days.`,
      `${relationships[0].name} has the highest decay urgency in your relationship graph.`,
      `Sleep has stayed below 5.5h for ${d.health.slice(-5).filter((item) => item.sleep_hrs < 5.5).length} of the last 5 nights.`
    ],
    future_simulation: regretSeries,
    opportunity_radar: opportunities,
    decision_risks: decisionRisks,
    recommended_actions: [
      { label: 'Reply to Maya with the product story and ask for one sharp note', impact: 94 },
      { label: 'Block 45 minutes for Project Orion after the submission window', impact: 78 },
      { label: 'Send Vikram a lightweight update and close the reference loop', impact: 74 }
    ],
    drafted_outputs: [
      {
        type: 'email',
        title: 'Maya reply',
        text: 'Hey Maya - you were right that the architecture reveal is the interesting part. I have the Coral console showing live SQL for each insight now. Could I send you the 90-second product arc for one sharp note before tonight?'
      }
    ],
    queries_run: [query]
  };
}

export function draftAction(body = {}) {
  const { action_type: actionType, context = {} } = body;
  const contact = context.contact || 'Maya';

  if (actionType === 'calendar_block') {
    return {
      action_type: 'calendar_block',
      title: context.title || 'Protected focus block',
      start: context.start || '2026-05-29T14:15:00+05:30',
      end: context.end || '2026-05-29T15:45:00+05:30',
      description: 'Created by Aether from overload and sleep-risk signals.'
    };
  }

  if (actionType === 'task') {
    return {
      action_type: 'task',
      title: context.title || 'Write Project Orion benchmark memo',
      priority: context.priority || 'high',
      due: context.due || '2026-05-30',
      source: 'Notion'
    };
  }

  return {
    action_type: 'email',
    to: context.email || `${contact.toLowerCase().replaceAll(' ', '.')}@example.com`,
    subject: context.subject || 'Quick update',
    body:
      context.body ||
      `Hey ${contact.split(' ')[0]}, wanted to send a proper update instead of leaving this open. Aether is finally pulling Calendar, Gmail, Notion, and Coral query evidence into one flow. I appreciated your offer to help, and I would value one quick thought if you have room today.`
  };
}

function queryProfile(query, mode) {
  const q = `${query} ${mode}`.toLowerCase();
  if (q.includes('neglect') || q.includes('relationship') || q.includes('who')) return 'relationships';
  if (q.includes('regret') || q.includes('next week') || q.includes('change nothing')) return 'regret';
  if (q.includes('today') || q.includes('should i') || q.includes('decide') || mode === 'decide') return 'decision';
  if (q.includes('debug') || mode === 'debug') return 'debug';
  return 'quiet';
}

export function askAether(body = {}) {
  const query = body.query || 'What is quietly becoming a problem?';
  const mode = body.mode || 'off';
  const profile = queryProfile(query, mode);
  const before = new Set(queryStore().map((entry) => entry.id));

  const briefing = getBriefing(query);
  const relationships = profile === 'relationships' || profile === 'debug' || profile === 'quiet' ? getRelationships(query) : null;
  const regret = profile === 'regret' || profile === 'decision' || profile === 'debug' || profile === 'quiet' ? getRegret(query) : null;

  const decisionQuery = profile === 'decision'
    ? logQuery({
        sql: SQL.decision,
        sources: ['Calendar', 'Gmail', 'Notion', 'Health'],
        rows: regret.decision_risks.length,
        ms: 11,
        insight: 'Decision impact matrix',
        triggeredBy: query
      })
    : null;

  const insightMap = {
    relationships: {
      response:
        'You are not broadly neglecting everyone. The risk is concentrated in a few high-trust relationships where the last inbound message required emotional follow-through.',
      readout: {
        kicker: 'Relationship read',
        title: 'Two relationships are cooling for different reasons.',
        verdict:
          'This is not a social backlog problem. Vikram needs closure on an offer he made for you, while Mom needs a warmer response than logistics.',
        stakes:
          'Both threads have emotional asymmetry: they gave you care or leverage, and the next move is yours. That makes silence feel heavier than a normal unread message.',
        next_move: 'Send Vikram a three-line update first, then call Mom for 12 minutes tonight.',
        confidence: 87,
        sources: ['Gmail', 'WhatsApp', 'Google Contacts', 'Calendar'],
        evidence: [
          { source: 'Gmail', text: 'Vikram offered reference help and the thread has no outbound follow-up in 22 days.' },
          { source: 'WhatsApp', text: 'Mom sent a voice note about a medical appointment; your reply was short and non-committal.' },
          { source: 'Contacts', text: 'Both contacts are high-importance relationships with decay urgency above the weekly baseline.' }
        ],
        actions: [
          { label: 'Reply to Vikram', reason: 'Closes the reference loop while it is still recoverable.', impact: 'High trust recovery' },
          { label: 'Call Mom tonight', reason: 'A short voice call fixes what another text will not.', impact: 'Low effort, high warmth' },
          { label: 'Add a Sunday check-in', reason: 'Prevents the same relationship debt from reappearing next week.', impact: 'Recurring guardrail' }
        ],
        draft: {
          type: 'Message draft',
          title: 'Vikram update',
          text:
            'Hey Vikram, I owed you a real update. Aether is finally coherent: Coral is powering a live life graph and query console. I really appreciated your offer around the reference; if it still makes sense, I would value one quick pointer this week.'
        }
      },
      graph: 'relationships',
      insights: [
        {
          title: 'Vikram Nair is the sharpest decay signal',
          severity: 'ACT',
          score: 41,
          confidence: 0.87,
          evidence: ['Reference offer is unanswered', 'Score fell 37 points from baseline', 'No warm outbound message since early May'],
          sources: sourceBadges(['Gmail', 'WhatsApp', 'Contacts']),
          actions: ['Send a three-line update', 'Ask whether the reference offer still stands']
        },
        {
          title: 'Mom needs a real reply, not logistics',
          severity: 'ACT',
          score: 52,
          confidence: 0.81,
          evidence: ['Voice note about a medical appointment', 'Outbound reply was one word', 'No scheduled follow-up until Sunday'],
          sources: sourceBadges(['WhatsApp', 'Calendar']),
          actions: ['Call for 12 minutes tonight', 'Ask one concrete question from the voice note']
        }
      ]
    },
    regret: {
      response:
        'The most expensive inaction is emotional, not operational: you will recover from a rough workday faster than from letting the mentor/reference loops go cold.',
      readout: {
        kicker: 'Regret simulation',
        title: 'Next week, the painful regret is not the polish.',
        verdict:
          'If nothing changes, the regret cluster is Maya, Vikram, and Project Orion. The work can be imperfect; these loops become harder to reopen after silence compounds.',
        stakes:
          'Aether is weighting regret by reversibility. Polish debt is recoverable tomorrow. Trust debt and strategic-goal drift are more expensive after the window closes.',
        next_move: 'Reply to Maya before doing more product polish.',
        confidence: 90,
        sources: ['Gmail', 'Notion', 'Calendar', 'Health', 'WhatsApp'],
        evidence: [
          { source: 'Gmail', text: 'Maya has been waiting 18 days on a high-importance thread tied to the product narrative.' },
          { source: 'Notion', text: 'Project Orion remains in progress but untouched since Apr 9, making it the longest strategic idle signal.' },
          { source: 'Calendar', text: 'Friday is packed enough that unplanned work will push emotional follow-through out of the day.' },
          { source: 'Health', text: 'Sleep has stayed below the recovery threshold, raising the chance you choose easy polish over hard closure.' }
        ],
        actions: [
          { label: 'Send Maya the 90-second product arc', reason: 'It is the highest-regret, lowest-effort open loop.', impact: '-24 regret points' },
          { label: 'Block Orion after the submission window', reason: 'Protects strategic work without stealing from deadline time.', impact: '-16 regret points' },
          { label: 'Send Vikram a concise update', reason: 'Reopens the reference loop before it feels awkward.', impact: '-14 regret points' }
        ],
        draft: {
          type: 'Email draft',
          title: 'Maya reply',
          text:
            'Hey Maya - you were right that the architecture reveal is the interesting part. The Coral console now shows the SQL behind every insight. Could I send you the 90-second product arc for one sharp note before tonight?'
        }
      },
      graph: 'regret',
      insights: [
        {
          title: 'Top predicted regret: mentor thread goes cold',
          severity: 'CRITICAL',
          score: regret?.regret_score || 88,
          confidence: 0.9,
          evidence: regret?.evidence_chain || [],
          sources: sourceBadges(['Gmail', 'Notion', 'Calendar', 'Health']),
          actions: ['Reply to Maya before new work', 'Schedule Project Orion memo after the submission window', 'Send Vikram a concise update']
        }
      ]
    },
    decision: {
      response:
        'The data says do the small, high-regret items first. Your open loops are not equal: a 12-minute reply currently beats another hour of polish.',
      readout: {
        kicker: 'Decision pressure-test',
        title: 'Decline the 3pm standup unless you can turn it into a 12-minute async update.',
        verdict:
          'The meeting is not expensive because it is long; it is expensive because it lands inside the only remaining recovery window before the work stack gets noisy.',
        stakes:
          'Calendar load is already above the overload threshold, and health signals say your next context switch will cost more than usual. Protecting one uninterrupted block has more upside than attending a low-information standup.',
        next_move: 'Send a short async update and move the live discussion to after submission.',
        confidence: 84,
        sources: ['Calendar', 'Gmail', 'Notion', 'Health'],
        evidence: [
          { source: 'Calendar', text: 'The day has 6 meetings and 0 long focus blocks before the work needs to consolidate.' },
          { source: 'Health', text: 'Sleep at 5.1h keeps energy risk high, so the meeting creates a heavier switching penalty.' },
          { source: 'Notion', text: 'The highest-priority open work is not discussion; it is product assembly and Project Orion recovery.' },
          { source: 'Gmail', text: 'Maya reply is still a low-effort, high-regret action that needs the same attention window.' }
        ],
        actions: [
          { label: 'Decline with a concrete async note', reason: 'Preserves the block without leaving teammates guessing.', impact: 'Best trade' },
          { label: 'Use 2:30-4:00 as protected focus', reason: 'Reduces chaos more than attending the status sync.', impact: '-18 chaos points' },
          { label: 'Offer one post-submission slot', reason: 'Keeps collaboration intact while defending the deadline.', impact: 'Relationship-safe' }
        ],
        draft: {
          type: 'Calendar reply',
          title: '3pm standup response',
          text:
            'I am going to skip the live standup today so I can protect the submission block. Current status: Coral query console is live, regret graph is wired, and I am polishing the ask flow. I can send a final note right after submission.'
        }
      },
      graph: 'decision',
      insights: [
        {
          title: 'Act now beats polish',
          severity: 'ACT',
          score: 86,
          confidence: 0.84,
          evidence: ['Maya reply has high regret and low effort', 'Focus block reduces the chaos score by an estimated 18 points', 'Orion needs a planned block, not a panic slot'],
          sources: sourceBadges(['Calendar', 'Gmail', 'Notion']),
          actions: ['Reply to Maya', 'Block 90 minutes', 'Move Orion to a protected slot']
        }
      ]
    },
    debug: {
      response:
        'Your week is failing as a system, not from one task. Calendar compression, sleep debt, and relationship debt are reinforcing each other.',
      readout: {
        kicker: 'System diagnostic',
        title: 'The next 48 hours are overloaded because three debts are reinforcing.',
        verdict:
          'Calendar compression is creating sleep debt; sleep debt is making relationship follow-through feel harder; relationship debt is increasing regret pressure while you polish.',
        stakes:
          'No single source screams disaster. Coral makes the pattern visible by joining meetings, replies, goal age, and recovery signals into one operating picture.',
        next_move: 'Remove one low-value meeting, reply to one person, and protect one focus block.',
        confidence: 88,
        sources: ['Calendar', 'Gmail', 'Notion', 'Health', 'Banking', 'WhatsApp'],
        evidence: [
          { source: 'Calendar', text: 'Thursday and Friday both breach the meeting-density threshold with too little focus recovery.' },
          { source: 'Health', text: 'Sleep debt is persistent across the same window, not a one-night anomaly.' },
          { source: 'Gmail', text: 'High-importance unreplied messages are clustered around mentor and product-support threads.' },
          { source: 'Notion', text: 'Project Orion is still marked in progress but has not received meaningful attention.' }
        ],
        actions: [
          { label: 'Cut or async the 3pm standup', reason: 'Creates the largest immediate drop in chaos.', impact: 'Operational relief' },
          { label: 'Reply to Maya before polishing', reason: 'Converts regret pressure into momentum.', impact: 'Trust preserved' },
          { label: 'Set a hard sleep boundary', reason: 'Prevents Saturday from becoming a recovery tax.', impact: 'Energy repair' }
        ],
        draft: {
          type: 'Today plan',
          title: '48-hour recovery sequence',
          text:
            '11:40 reply to Maya. 12:00 ship ask-flow polish. 2:30 protected submission block. 3:00 async standup. 5:15 submit. 8:30 call Mom. 11:45 hard stop.'
        }
      },
      graph: 'life',
      insights: briefing.top_3_insights.map((item) => ({
        ...item,
        confidence: item.id === 'insight_chaos' ? 0.91 : 0.78
      }))
    },
    quiet: {
      response:
        'The quiet problem is that urgent product work is borrowing trust from relationships and attention from strategic goals. Nothing looks catastrophic alone; the join is what makes it visible.',
      readout: {
        kicker: 'Quiet risk',
        title: 'Deadline urgency is borrowing from trust and strategy.',
        verdict:
          'The issue is not that you have too much to do. It is that urgent product work is quietly using relationship goodwill and long-term goal attention as its hidden budget.',
        stakes:
          'This is the kind of problem that feels fine at noon and expensive next week. Aether sees it because the same dates connect calendar overload, stale goals, unanswered mentor email, and low sleep.',
        next_move: 'Spend 18 minutes closing the Maya thread before adding another polish pass.',
        confidence: 88,
        sources: ['Calendar', 'Gmail', 'Notion', 'Health'],
        evidence: [
          { source: 'Calendar', text: 'Friday carries 6 meetings and no meaningful focus block in the highest-risk part of the day.' },
          { source: 'Gmail', text: 'A mentor-support thread is still unanswered after 18 days.' },
          { source: 'Notion', text: 'Project Orion has gone cold since Apr 9 while still marked important.' },
          { source: 'Health', text: 'Recent sleep averages below the threshold where context switching gets costly.' }
        ],
        actions: [
          { label: 'Close the mentor loop', reason: 'It removes the highest trust-risk item with the least effort.', impact: '18 min' },
          { label: 'Protect one focus block', reason: 'It stops the day from fragmenting into reactive work.', impact: '90 min' },
          { label: 'Move Orion deliberately', reason: 'Prevents strategic guilt from leaking into urgent product work.', impact: 'Tomorrow AM' }
        ],
        draft: {
          type: 'Micro-plan',
          title: 'First 30 minutes',
          text:
            'Open Maya thread. Send the product-arc note. Decline or async the 3pm standup. Then return to the Aether ask flow with the regret graph already chosen.'
        }
      },
      graph: 'chaos',
      insights: [
        {
          title: 'Small signals are converging into Friday risk',
          severity: 'CRITICAL',
          score: briefing.chaos_score,
          confidence: 0.88,
          evidence: ['6 meetings and no long focus block', '4.9h average sleep across the risk window', 'High-importance mentor email still open'],
          sources: sourceBadges(['Calendar', 'Gmail', 'Health', 'Notion']),
          actions: ['Protect focus before 3pm', 'Close the mentor loop', 'Defer low-regret polish']
        }
      ]
    }
  };

  const selected = insightMap[profile];
  const newQueries = queryStore().filter((entry) => !before.has(entry.id));

  return {
    response: selected.response,
    readout: selected.readout,
    mode,
    graph: selected.graph,
    insights: selected.insights,
    queries_run: [...newQueries, decisionQuery].filter(Boolean),
    sources_used: [...new Set(newQueries.flatMap((entry) => entry.sources))],
    confidence: Math.round(average(selected.insights.map((item) => item.confidence || 0.8)) * 100),
    data: {
      briefing,
      relationships,
      regret
    }
  };
}

export const __internal = {
  SQL,
  dayStats,
  relationshipRows,
  lifeGraph
};
