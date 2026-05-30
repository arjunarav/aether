# Aether

**A personal operating system powered by Coral.**

Aether turns fragmented life signals into one reasoning surface. It brings together calendar load, communication patterns, goals, relationship drift, and recovery signals so you can see what is quietly becoming a problem before it compounds.

## What It Does

- Builds a living context graph across people, meetings, goals, and health signals
- Surfaces overload, neglected relationships, and emerging regret
- Makes reasoning visible through Coral-style query traces, joins, and confidence
- Turns scattered signals into structured reads with clear next moves

## Product Surfaces

### Context Graph

The opening graph is the product's first opinion about the week. Instead of treating life data as separate tools, Aether models it as one connected system and lets you move between four views:

- `Life Graph`
- `Chaos timeline`
- `Relationship heatmap`
- `Regret projection`

### Ask Aether

Ask Aether is structured around high-signal prompts rather than an empty chat box. Each prompt shifts the reasoning mode and stages the read before revealing the result.

Current prompt set:

- `What is quietly becoming a problem?`
- `Who am I accidentally neglecting?`
- `Should I decline the 3pm standup?`
- `What will I regret next week if I change nothing?`

### Coral Console

Coral Console is the visible reasoning layer. It shows:

- active sources
- query feed
- SQL used for the read
- join structure
- execution context

The goal is not just to answer a question, but to show how the answer was produced.

### Cross-Source Diagnostics

Aether also breaks the week into three operational modules:

- `Life Autopilot` for chaos and energy risk
- `Human Relationship CRM` for relationship cooling and neglected loops
- `Regret Minimizer` for projected future cost and action prioritization

## How It Works

Aether is built as a Next.js application with lightweight server routes that simulate a Coral-powered reasoning layer. The app pulls from local structured datasets and combines them through API routes that return:

- briefing summaries
- relationship reads
- regret projections
- question-based insights
- source metadata
- query logs

Relevant API routes:

- `/api/briefing`
- `/api/relationships`
- `/api/regret`
- `/api/ask`
- `/api/actions/draft`
- `/api/coral/sources`
- `/api/coral/query-log`

## Stack

- `Next.js`
- `React`
- `GSAP`
- `D3`
- `Lucide React`
- local JSON source fixtures

## Local Development

Install dependencies and run the app:

```bash
npm install
npm run dev
```

The app runs locally at:

```bash
http://localhost:3000
```

If you prefer the bundled pnpm setup in this repo, the lockfile and workspace files are already included.

## Environment

Create a local `.env` from the example file and fill in any integrations you want to connect:

```bash
cp .env.example .env
```

Available variables:

- `OPENAI_API_KEY`
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_REDIRECT_URI`
- `NOTION_API_KEY`
- `NOTION_DATABASE_ID`
- `CORAL_PATH`
- `CORAL_DB_URL`
- `NEXT_PUBLIC_APP_URL`

## Project Goal

Aether is not framed as a dashboard and not framed as a generic assistant. It is a life reasoning system: one place to see the shape of the week, inspect the reasoning, and act before noise hardens into regret.
