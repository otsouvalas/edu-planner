# edu-planner

Εργαλείο εβδομαδιαίου προγραμματισμού ύλης για αναπληρωτή καθηγητή Πληροφορικής
σε ελληνικό Γυμνάσιο/Λύκειο, με βοηθό AI (Claude) για δημιουργία και αναθεώρηση
του εβδομαδιαίου προγράμματος ανά τμήμα.

Single user — δεν υπάρχει σύστημα σύνδεσης.

## Stack

- **server/** — Express + TypeScript + Prisma (SQLite), `@anthropic-ai/sdk`
- **client/** — React + Vite + TypeScript (Greek UI, plain CSS)
- npm workspaces at the root, `concurrently` for dev

## Setup

```bash
# 1. dependencies (root, installs both workspaces)
npm install

# 2. database (creates server/prisma/dev.db and applies migrations)
npm run prisma:migrate

# 3. API key for the AI features (optional — CRUD works without it)
cp server/.env.example server/.env
$EDITOR server/.env        # set ANTHROPIC_API_KEY=sk-ant-...

# 4. run both dev servers
npm run dev
```

- Client: http://localhost:5173 (Vite proxies `/api` → `http://localhost:4000`)
- API: http://localhost:4000

Without `ANTHROPIC_API_KEY` the app runs normally; only the three AI endpoints
return `503` with an explanatory message, and the AI buttons/chat are disabled
in the UI.

### Other scripts

| Command | Effect |
|---|---|
| `npm run dev` | server + client together |
| `npm run dev:server` / `npm run dev:client` | one at a time |
| `npm run build` | typecheck + compile server, build client |
| `npm run prisma:migrate` | create/apply a migration |
| `npm run prisma:studio` | Prisma Studio on the SQLite db |

## Data model

`School → SchoolClass → CurriculumItem` (η ύλη ανά τμήμα).
`WeeklyPlan` is one week (identified by its Monday, stored UTC) for one class,
with `hoursPerWeek` and `status` (`draft`/`active`/`closed`).
`WeeklyPlanItem` is a checklist entry linking a plan to a curriculum item with
`done` + `notes`. `ChatMessage` is the per-class chat log.

A curriculum item counts as **covered** once any `WeeklyPlanItem` referencing it
is `done`, and **scheduled** once it appears in any plan.

## API

CRUD

| Method | Path |
|---|---|
| GET/POST | `/api/schools`, PATCH/DELETE `/api/schools/:id` |
| GET/POST | `/api/classes` (`?schoolId=`), GET/PATCH/DELETE `/api/classes/:id` |
| GET/POST | `/api/classes/:id/curriculum`, PATCH/DELETE `/api/curriculum/:id` |

Weekly plans

| Method | Path | Notes |
|---|---|---|
| GET | `/api/classes/:id/plan?week=current\|next\|YYYY-MM-DD` | `null` if no plan |
| GET | `/api/classes/:id/plans` | all weeks |
| POST | `/api/classes/:id/plan` | `{ week, hoursPerWeek? }` — get-or-create |
| PATCH/DELETE | `/api/plans/:id` | `{ hoursPerWeek?, status? }` |
| PUT | `/api/plans/:id/items` | `{ curriculumItemIds: number[] }` — replaces the list |
| POST | `/api/plans/:id/items` | `{ curriculumItemId, notes? }` |
| PATCH | `/api/plan-items/:id` | `{ done?, notes? }` — the done toggle |
| DELETE | `/api/plan-items/:id` | |
| GET | `/api/weeks` | which Mondays `current`/`next` resolve to |

AI (503 without a key)

| Method | Path | Notes |
|---|---|---|
| POST | `/api/classes/:id/generate-plan` | `{ week? }` (default `next`). Picks uncovered curriculum items matching `hoursPerWeek`, writes the plan items, stores the rationale as an assistant `ChatMessage`. |
| POST | `/api/classes/:id/review-week` | `{ apply?: boolean }`. Reviews the current week, carries undone items forward, asks Claude to rebalance next week against `hoursPerWeek`. Returns a diff (`carriedOver`/`added`/`removed`); **only writes when `apply: true`**. |
| POST | `/api/classes/:id/chat` | `{ message }`. Claude tool use — it can call `add_plan_item`, `remove_plan_item`, `mark_done`, `set_next_week_items` to mutate the plan directly. |
| GET | `/api/classes/:id/chat` | chat history (works without a key) |

## Claude integration

All model/prompt/tool code is in [`server/src/claude.ts`](server/src/claude.ts).
Model: `claude-sonnet-4-5`, overridable with `ANTHROPIC_MODEL` in `server/.env`.
Plan generation forces a `propose_week_plan` tool call so the response is
structured; chat runs a manual tool-use loop (max 8 iterations) whose tool
handlers live in `server/src/routes/ai.ts`.

## UI

Left sidebar: schools, expandable to their classes, with inline add/delete forms.
Main panel per class, three tabs:

- **Ύλη** — CRUD for curriculum items, with coverage badges
- **Πρόγραμμα** — current/next week toggle, checklist with done checkboxes,
  hours-per-week editor, «Δημιουργία Προγράμματος» and «Review Εβδομάδας»
- **Συνομιλία** — per-class chat with the AI assistant

## Not built (deliberately)

No auth, no deployment config, no cron/automatic weekly review (the review is a
manual button), no file uploads, no multi-user roles.
