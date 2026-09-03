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

# 2. env (also sets DATABASE_URL, which Prisma now requires)
cp server/.env.example server/.env
$EDITOR server/.env        # set ANTHROPIC_API_KEY=sk-ant-... (optional)

# 3. database (creates server/prisma/dev.db and applies migrations)
npm run prisma:migrate

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

## Production deploy (Docker)

One image, one container, one port: the Express process serves the JSON API
under `/api` and the built React client (`client/dist`) for everything else, so
no nginx or separate static host is needed. Target is a Debian LXC with Docker.

### On the host

```bash
# repo at /opt/edu-planner (git clone or rsync)
cd /opt/edu-planner

# env file — required, not committed
cp .env.production.example .env
$EDITOR .env               # ANTHROPIC_API_KEY, ANTHROPIC_WORKSPACE_ID

docker compose up -d --build
```

The app is then on **port 4000** (`http://<lxc-ip>:4000`), the same port the API
uses in dev. To change it, edit both `PORT` in `.env` and the `ports:` mapping
in `docker-compose.yml`.

Update after a `git pull`: `docker compose up -d --build`. Logs:
`docker compose logs -f`. Stop: `docker compose down` (the volume survives).

### Env vars

| Var | Required | Notes |
|---|---|---|
| `ANTHROPIC_API_KEY` | no | Without it the app runs fine; AI endpoints return `503` |
| `ANTHROPIC_WORKSPACE_ID` | only for identity-linked keys | `wrkspc_...` |
| `ANTHROPIC_MODEL` | no | Fallback model, below the `claude.model` DB setting |
| `BASIC_AUTH_USER` / `BASIC_AUTH_PASS` | no | Shared HTTP Basic Auth for the whole app. Leave both empty to disable |
| `PORT` | no | Defaults to `4000` |
| `DATABASE_URL` | no | Pinned to `file:/app/data/prod.db` by compose |

### Data & migrations

The SQLite database is **never** baked into the image. It lives in the named
volume `edu-planner-data`, mounted at `/app/data`, so it survives rebuilds,
restarts and `docker compose down`. On every container start the entrypoint runs
`prisma migrate deploy` (never `migrate dev`) against that volume, so the schema
is brought up to date without touching existing data.

```bash
# backup
docker run --rm -v edu-planner-data:/data -v "$PWD:/out" alpine \
  cp /data/prod.db /out/edu-planner-backup.db
```

Deleting the volume (`docker volume rm edu-planner-data`) deletes all data.

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

Curriculum bank (reuse across classes/schools without re-running AI)

| Method | Path | Notes |
|---|---|---|
| GET | `/api/curriculum-templates` | `{ id, name, itemCount, createdAt }[]` |
| POST | `/api/classes/:id/curriculum/import-template` | `{ templateId }` — copies a bank entry's items into the class |
| POST | `/api/classes/:id/curriculum/import-pdf` | multipart `file` (PDF, 503 without a key) — see below |

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
| GET | `/api/settings` | `{ model, defaultModel }` — the effective Claude model |
| PUT | `/api/settings` | `{ model }`. Persists the model choice in `AppSetting`. |

## Curriculum bank & PDF import

`/api/classes/:id/curriculum/import-pdf` lets a teacher upload the official
syllabus PDF for a class instead of typing every unit by hand. To keep AI
cost down:

1. The PDF's SHA-256 hash is checked against `CurriculumTemplate.sourceHash`
   first. An exact re-upload (e.g. the same file for a parallel class) skips
   Claude entirely and reuses the stored items (`source: "cache"`).
2. On a genuinely new file, the PDF's text is extracted **in code**
   (`pdf-parse`, no AI) and only that plain text is sent to Claude
   (`source: "ai-text"`) — far cheaper than sending the PDF itself, since
   Claude would otherwise render and process every page as an image.
3. Only when no text layer exists (a scanned/image-only PDF) does it fall
   back to sending the PDF to Claude directly (`source: "ai-pdf"`).

Every successful extraction (text or PDF) is saved as a new
`CurriculumTemplate`, so `GET /api/curriculum-templates` lets the UI also
offer "reuse existing curriculum" for a *different* PDF covering the same
material (e.g. same grade, different school) — `import-template` copies it
in with zero AI calls.

## Claude integration

All model/prompt/tool code is in [`server/src/claude.ts`](server/src/claude.ts).
Model resolution (`server/src/settings.ts`): the `claude.model` row in the
`AppSetting` table > `ANTHROPIC_MODEL` in `server/.env` > the built-in default
`claude-sonnet-5`. The DB setting is editable from the UI (⚙ Ρυθμίσεις in the
sidebar) or via `GET`/`PUT /api/settings`, so switching models needs no restart.
The active model is shown in the sidebar and reported by `/api/health`.
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

No auth, no cron/automatic weekly review (the review is a manual button), no
file uploads, no multi-user roles.
