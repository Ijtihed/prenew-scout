# AGENTS.md

Guide for anyone (human or agent) working in this repo.

## What this is

**Scout**: a local web app for Prenew's marketing team (Prenew sells refurbished gaming PCs) to find gaming
creators, predict what a collab would earn, and handle outreach. Built for a hackathon challenge.

- Platforms: YouTube Shorts and TikTok, both real data.
- Live markets: Finland, Sweden, Germany, Denmark, France, Netherlands, Belgium, Austria, Poland, Estonia,
  Latvia, Lithuania (`LIVE_MARKETS` in `app/lib/data/mock.ts`). YouTube discovery focuses on the newer ones
  (`ACTIVE_MARKETS` in `crawler/scout.py`); Finland is covered. US, Singapore and China are shown as "Soon".
- Money is in euros everywhere. Core metric: cost per PC sold / break-even in PCs.

## Layout

| Path | What |
|---|---|
| `app/` | The product. Next.js 15 (Turbopack), React 19, Tailwind 4, shadcn/ui, zustand. Look copied from [ln-dev7/circle](https://github.com/ln-dev7/circle) (MIT, `app/LICENSE-circle.md`) |
| `crawler/` | Python crawler (`scout.py`) that finds and qualifies creators, plus the shared SQLite schema |
| `data/scout.db` | SQLite shared by crawler and app. **Not in git**; created on first run |
| `app/public/data/creators.json` | Crawler export the app loads at runtime. Committed so the app works without crawling |
| `docs/METHODOLOGY.md` | **How every number is computed and why.** Keep it current when a formula changes |
| `docs/media/` | Screenshots and GIFs used in the README |

## Run

```bash
cd app && npm install && npx next dev --turbopack -p 3000   # http://localhost:3000
npm run typecheck
NEXT_DIST_DIR=.next-build npx next build                    # build without clobbering a running dev server
```

- Node 24 is required (`node:sqlite`, no native DB driver).
- Language models: DeepSeek on Featherless (`FEATHERLESS_API_KEY` in `.env`): V4-Flash with thinking for the Agent
  and plan edits, V3 for everything else (`app/lib/server/llm.ts`, `crawler/llm.py`). `ollama serve` with `qwen3:8b`
  is the automatic fallback.

Crawler (needs [uv](https://docs.astral.sh/uv/); dependencies are inline, PEP 723):

```bash
uv run crawler/scout.py run       # runs until stopped: every step each round, survives throttling and outages
uv run crawler/scout.py status    # counts, rejection reasons, search yield, lane health (read-only)
uv run crawler/scout.py export    # rewrite the app's creators.json from the database
uv run crawler/scout.py apiqualify  # spend the day's API quota checking the queued channels
uv run crawler/scout.py run --no-qualify  # everything else, alongside apiqualify
```

## How it works

**Crawler** (`crawler/`), public data through official APIs. Full method and reasoning: `docs/METHODOLOGY.md`.
- `scout.py`: the loop. Each round: autocomplete → searches → qualify channels → featured channels and
  commenters (snowball) → daily follower snapshots → comments → language-model verify and judge → export.
- `ytapi.py`: YouTube Data API v3 (keys in `.env`, git-ignored). Search, qualifying, Shorts, stats, comments,
  featured channels and daily snapshots go through it; quota is metered per key per Pacific day in `kv`.
- `llm.py`: DeepSeek on Featherless for verification, comment labels and brand-safety checks (local fallback).
- `tiktok.py`: TikTok creators via TikTok's official public creator embed; discovery through YouTube bios,
  handle matches (identity-checked) and caption mentions.
- `net.py`: one lane per endpoint (search, channel, rss, suggest, video) with its own pace and cool-down.
  Throttled work stays queued; offline time spends no retries. **Never work around a platform block.**
- `sponsor.py`: sponsored posts and sponsors from descriptions (footer lines are standing partners).
- `comments.py`, `judge.py`: audience language, PC-buying questions and brand safety (local model confirms
  each item; flags must quote the creator's own text).
- `common.py`: language, games and contact detection. `store.py` + `schema.sql`: the database and export.

**App** (`app/`):
- `lib/data/mock.ts`: builds `Creator` objects from the crawl export (`fromCrawl()`), plus prices, the Score
  and predictions.
  `components/layout/data-gate.tsx` loads the export at startup.
- `lib/engine.ts`: expected PCs sold per sponsored post (the buyer model behind plans and charts).
- `lib/plan.ts`: Agent campaigns: reads "reach out to N … with €X", builds the plan, starts agent outreach.
- `lib/learn.ts`: what the agent learns from past bookings (`lib/data/past-collabs.ts`, from the team
  spreadsheet) and its own settled negotiations; feeds plans, the negotiation policy and Outreach stats.
- `lib/nlq.ts`: plain-words search parser (rules first, local model only fills gaps; model output must be
  backed by words in the query).
- `lib/store.ts`: shared team state (saved, outreach, settings) persisted to the DB through
  `/api/state`. No saves happen before the saved state has loaded; saves are serialized.
- API routes (`app/app/api/*`, `app/app/r/[slug]`): `state`, `mail` (emails are **recorded only, never
  delivered**), `r/<slug>` tracked links (logs clicks, redirects to prenew.com), `sales` webhook, `results`,
  `parse`, `agent`.

Pages: Discover (search + sortable list), Outreach (email-style inbox, unread tracking), Saved, Compare,
Markets (MapLibre world map), Calendar, Agent, Settings (under the profile).

## Decisions that are settled

- Official APIs and public pages only. Don't circumvent captchas, bot checks or rate limits.
- No mailbox sync and no Prenew-internal numbers, ever. Email stays inside Scout.
- TikTok: only through TikTok's official public embed; never scrape past its captcha or bot checks.
- Design: dark only, Linear/Circle look (zinc grays, white primary buttons, green/red only for signals),
  sidebar layout. Don't restyle or restructure UI that wasn't asked for.
- Default profile: Viljami Meriläinen (Co-founder & CEO).
- Every number shown should be measured, or computed by a documented formula. Keep `docs/METHODOLOGY.md`
  current when a formula changes.

## Conventions

- No new dependencies without the owner's OK. MapLibre is pinned to v5 (v6 breaks Turbopack).
- Comments explain *why*, briefly; no changelog-style comments. Commit messages explain why, not what.
- No em dashes in user-facing text.
- Long jobs (crawls) run in the background.
- Code style: match the surrounding file (3-space indent in `app/app` and components, 2 in `lib/data`).

## Status (2026-09-27)

- About 2,300 creators across 12 markets; discovery currently focuses on Denmark, Belgium, Austria, Estonia and
  Latvia (`ACTIVE_MARKETS`). The crawler runs as four workers: `apisearch`, `apiqualify`,
  `run --no-qualify --no-tiktok --no-search` and `tiktokloop`.
- YouTube API keys: `YOUTUBE_API_KEY`, `YOUTUBE_API_KEY_2`, ... in `.env`, each with its own daily quota; the
  crawler moves to the next key when one is spent or rejected.
- Agent: `app/lib/plan.ts` (campaign plans), `app/lib/negotiate.ts` (negotiation policy, AI disclosure on every
  agent email), `app/lib/learn.ts` (what it learns), `components/layout/agent-runner.tsx` (runs conversations in
  the background).
