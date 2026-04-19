# nxspub preview --web Design Plan (MVP)

## 1. Background and Goals

`nxspub preview` currently works well for CLI users, but in multi-branch and multi-package workspace scenarios, users need to frequently switch branch strategies, compare version paths, and inspect changelog/draft health.
The goal of `--web` is to provide a local visual "pre-release console" so users can validate release decisions before running `nxspub version/release`.

Goals:
- Reduce mis-release risk (branch policy, tag conflicts, registry-published versions).
- Reduce cognitive load (workspace dependency propagation, passive bump chain).
- Keep behavior consistent with existing CLI logic (reuse computation logic, no duplicate definitions).

Non-goals (MVP):
- No direct `version/release` write operations.
- No remote collaboration SaaS (local-only runtime).
- No account/auth system.

---

## 2. Command and Runtime Modes

New command forms:

```bash
nxspub preview
nxspub preview --web
nxspub preview --web --port 4173
nxspub preview --web --host 127.0.0.1
nxspub preview --web --open
nxspub preview --json
```

Behavior rules:
- `preview`: terminal mode (compatible with current expectation).
- `preview --web`: start local HTTP service + frontend page.
- Default listen host is `127.0.0.1`, default port is `4173`.
- Browser is not auto-opened by default; use `--open` to open.
- Service shuts down when process exits.

### 2.1 Command Parameter Matrix (Extended)

| Command | Parameter | Type | Default | Description | Constraints |
|---|---|---|---|---|---|
| `preview` | `--cwd` | `string` | `process.cwd()` | Working directory | Must be a readable repository directory |
| `preview` | `--json` | `boolean` | `false` | Machine-readable output | Can be used with `--branch` |
| `preview` | `--branch` | `string` | current branch | Simulate branch policy | No disk writes |
| `preview --web` | `--host` | `string` | `127.0.0.1` | Listen address | `0.0.0.0` requires `--allow-remote` |
| `preview --web` | `--port` | `number` | `4173` | Listen port | Auto-detect next available port on conflict |
| `preview --web` | `--open` | `boolean` | `false` | Auto-open browser | Ignored in no-GUI environments |
| `preview --web` | `--readonly-strict` | `boolean` | `false` | Fully read-only mode | Disables prune API |
| `preview --web` | `--allow-remote` | `boolean` | `false` | Allow non-local access | Must be used with `--host 0.0.0.0` |

---

## 3. User Scenarios

1. Single-package project
Check next version, changelog preview, and tag/registry risks on current branch.

2. Workspace project
Check bump source per package (commit/passive), dependency propagation path, and root changelog summary.

3. Multi-branch strategy comparison
Compare releaseability and version differences for the same code on `main` / `alpha` / `hotfix`.

4. Draft governance
View `matching/behind/ahead/invalid`, and run one-click prune (behind-only).

---

## 4. Page Information Architecture (MVP)

### 4.1 Top Control Area
- Repository path (`cwd`)
- Simulated branch (dropdown)
- Mode (`single`/`workspace`)
- Refresh button (recompute)
- Export JSON

### 4.2 Overview Cards
- Current version / target version
- Number of changed commits
- Number of packages to be released
- Number of risks (tag, registry, sync, policy)

### 4.3 Version Plan (Core)
- single: display bump type, target version, and triggering commit list
- workspace: package table
  - package name
  - current -> next
  - bumpType
  - isPassive / passiveReasons
  - private marker

### 4.4 Changelog Preview
- root or package entry preview
- imported draft entries (source branch and version)

### 4.5 Pre-release Checks
- branch policy validity
- local/remote tag conflicts
- existing versions in registry
- git sync state (`ahead/behind/dirty`)

### 4.6 Draft Health
- `matching/behind/ahead/invalid` counts
- behind sample list
- `Prune behind drafts` button (calls backend prune API)

---

## 4.7 Page Visual Style Specification (Neo-Brutalism)

Goal: use a Neo-Brutalism visual language with strong contrast, hard borders, hard shadows, and dense information hierarchy. Avoid rounded "soft-tech" styles and glassmorphism.

### Visual Principles
- Strong contrast: black/white as the base, fluorescent lime as primary accent.
- Hard outlines: all core cards, buttons, and inputs use thick borders.
- Hard shadows: use offset hard shadows, not soft blur shadows.
- Strong hierarchy: headings and key metrics use extra-heavy weight, uppercase, and tight spacing.
- Minimal visual grammar: consistent primitive style, no component style drift.

### Color and Theme
- Primary background: `#FFFFFF`
- Primary text: `#000000`
- Primary accent: `#CCFF00`
- Neutrals: `#F6F6F6` / `#E2E2E2` / `#5B5B5B`
- Semantic colors:
  - Success: keep accent color family
  - Warning: highlighted yellow background + black text
  - Error: `#B02500` / `#F95630`

### Typography
- Primary font: `Public Sans`
- Headings: `font-weight: 800~900`, uppercase, tight letter spacing
- Body: `font-weight: 400~500`
- Labels/status text: `font-weight: 700`, small-size uppercase

### Shape, Border, and Shadow
- Border radius: small radius only (`4px`), avoid large rounded corners
- Standard border: `2px solid #000`
- Standard shadow (Neo Shadow): `4px 4px 0 0 #000`
- Accent shadow: `4px 4px 0 0 #CCFF00`
- Pressed state: shrink shadow to `2px 2px` with `translate(2px, 2px)`

### Component Style Baseline
- Buttons: black border + hard shadow + uppercase bold text; hover may switch background to accent.
- Cards: white background with black border; key cards may use black background + accent text.
- Inputs: black hard frame; low-contrast gray placeholder text.
- Tabs/Filters: active state must use obvious block background or underline emphasis.
- Tables: compact row height, uppercase bold header, high contrast for key columns.
- Status badges: small uppercase blocks, solid fills only, no gradients.

### Logo and Brand Asset
- Top navigation must use repository-root `logo.svg`.
- Recommended composition:
  - left logo icon + right text `NXSPUB PREVIEW`
  - keep black/white + accent compatibility, no heavy filters
- Asset path rule: runtime static assets can expose repository-root `logo.svg` via bundling copy or server mapping.

### Motion
- Motion style: short and direct (`100~150ms`)
- Disallow: soft easing, blur transitions, complex spring animations
- Suggested: hover color switch, press translation, lightweight panel fade-in

### Responsive Rules
- Desktop (`>=1280`): left navigation + two-column main content
- Tablet (`>=768`): partially collapsed sidebar, main panel prioritized
- Mobile (`<768`): single-column stack, control panel becomes drawer/collapse
- Keep hard-border and hard-shadow style on mobile; do not degrade to default system style

### Implementation Suggestions (Frontend)
- Define design tokens in `src/preview/web/styles/tokens.css`:
  - `--neo-accent`, `--neo-border`, `--neo-shadow`, `--neo-shadow-accent`
- Build reusable utility classes:
  - `.neo-border`, `.neo-shadow`, `.neo-shadow-accent`, `.neo-pressable`
- Do not introduce default component themes that conflict with Neo-Brutalism (for example, rounded-card defaults).

---

## 5. Backend API Design (Local Service)

Base:
- `GET /api/health`
- `GET /api/context` (`cwd`, `mode`, detected `packageManager`, `branch`)

Preview:
- `POST /api/preview`
  Request: `{ branch?: string, includeChangelog?: boolean }`
  Response: unified `PreviewResult` (single/workspace shape)

Risk checks:
- `POST /api/checks`
  Response: `{ policy, gitSync, tagConflicts, registryConflicts }`

Draft:
- `GET /api/drafts?target=1.3.0`
- `POST /api/drafts/prune`
  Request: `{ target: string, only: "behind" }`
  Response: `{ prunedCount, remaining }`

Export:
- `GET /api/export.json` (most recent preview result)

---

## 5.1 Web Service Architecture and Technology Choices

### Service Layer (Node)
- Runtime: Node.js (aligned with nxspub CLI runtime)
- HTTP framework: `hono` (lightweight, TypeScript-friendly, suitable for local tool services)
- Startup: `nxspub preview --web` starts local service in the same process
- Concurrency model: stateless requests + in-memory cache of latest preview result
- Network binding: `127.0.0.1` by default, `4173` by default

### Frontend Layer (Web UI)
- Framework: React + Vite
- Routing: SPA routing (MVP can avoid complex routing libraries)
- State: React state + `@tanstack/react-query` (cache/retry)
- UI components: native HTML + lightweight custom components (avoid heavy design systems)
- Charts/relationship visualization: table-based in MVP; dependency graph can be added in Milestone 2

### API Communication
- Protocol: HTTP JSON (MVP)
- Realtime behavior: polling/manual refresh in MVP; optional SSE in Milestone 2
- Authentication: one-time local token generated by CLI at startup; frontend sends token in headers
- Error format: unified `{ code, message, details? }`

### Relationship with CLI
- Shared execution context: `preview --web` and CLI `preview` must call the same computation core
- No divergence: web must not reimplement version computation logic
- Process lifecycle: web service exits with CLI process; no background daemon

### Recommended Directory Structure

```txt
src/
  commands/
    preview.ts                 # CLI entry (preview / preview --web)
  preview/
    core/
      compute.ts               # Shared computation core (single/workspace)
      checks.ts                # tag/registry/git sync checks
      drafts.ts                # draft health / prune
      types.ts                 # Shared types such as PreviewResult
    server/
      app.ts                   # hono app + routes
      auth.ts                  # token validation
    web/
      index.html
      main.tsx
      App.tsx
      api.ts                   # fetch client
      components/
        SummaryCards.tsx
        VersionPlanTable.tsx
        ChangelogPreview.tsx
        DraftHealthPanel.tsx
```

### Build and Distribution
- Backend: use current CLI build output path (`tsdown`)
- Frontend: Vite output embedded to `dist/preview-web`
- Runtime: CLI service hosts static assets + `/api/*` routes

---

## 5.2 Detailed API Protocol (Extended)

### Unified Response Shapes

```ts
type ApiSuccess<T> = {
  ok: true
  data: T
  requestId: string
  timestamp: string
}

type ApiError = {
  ok: false
  error: {
    code:
      | 'BAD_REQUEST'
      | 'UNAUTHORIZED'
      | 'FORBIDDEN'
      | 'NOT_FOUND'
      | 'CONFLICT'
      | 'TIMEOUT'
      | 'INTERNAL'
    message: string
    details?: unknown
  }
  requestId: string
  timestamp: string
}
```

Version compatibility rules:
- Every response includes `apiVersion` (for example `v1`).
- New fields are backward-compatible additions only.
- Breaking changes must be introduced via `v2` paths or version upgrades.

### Endpoint Definitions

1. `GET /api/health`
- Purpose: service liveness check
- Returns: `{ status: 'ok', version: string }`

2. `GET /api/context`
- Purpose: load current runtime context
- Returns: `{ cwd, mode, packageManager, currentBranch, availableBranches }`

3. `POST /api/preview`
- Request:
```ts
{
  branch?: string
  includeChangelog?: boolean
  includeChecks?: boolean
}
```
- Response: `PreviewResult`
- Field rules:
  - `branch` optional, defaults to current branch
  - `includeChangelog` default `false`
  - `includeChecks` default `false`

4. `POST /api/checks`
- Request:
```ts
{
  branch?: string
}
```
- Response:
```ts
{
  policy: { ok: boolean; message?: string }
  gitSync: { ok: boolean; ahead: number; behind: number; dirty: boolean }
  tagConflicts: Array<{ tag: string; local: boolean; remote: boolean }>
  registryConflicts: Array<{ name: string; version: string }>
}
```

5. `GET /api/drafts?target=1.3.0`
- Returns: `{ target, matching, behind, ahead, invalid, malformedFileCount }`

6. `POST /api/drafts/prune`
- Request: `{ target: string, only: 'behind' }`
- Response: `{ prunedCount: number, remaining: number }`
- Field rules:
  - `target` is required and must be `x.y.z`
  - currently only `behind` is supported for `only`
  - returns `403 FORBIDDEN` in `--readonly-strict` mode

7. `GET /api/export.json`
- Purpose: export latest preview result (`404` if no cached preview exists)

### Timeout and Concurrency Constraints
- Default timeout per request: `20s`
- Concurrent compute: only one `/api/preview` run per session at a time
- Concurrency conflict response: `409 CONFLICT`

---

## 6. Data Model (MVP)

```ts
interface PreviewResult {
  mode: 'single' | 'workspace'
  branch: string
  policy: string
  currentVersion?: string
  targetVersion?: string
  packages?: Array<{
    name: string
    private: boolean
    currentVersion: string
    nextVersion?: string
    bumpType?: string | null
    isPassive?: boolean
    passiveReasons?: string[]
  }>
  changelog?: {
    entryPreview: string
    importedDrafts: Array<{ branch: string; version: string; count: number }>
  }
}
```

---

## 6.1 State Machine and Interaction Flow

Page state machine:
- `idle`: no computation triggered yet
- `loading`: request in progress
- `success`: result rendered
- `partial_error`: partial panel failure (for example checks timeout)
- `fatal_error`: core preview failed

Interaction flow (MVP):
1. Page load -> `GET /api/context`
2. Auto-trigger `POST /api/preview`
3. User switches branch -> debounce 300ms -> recompute preview
4. User clicks prune -> `POST /api/drafts/prune` -> auto-refresh preview

---

## 7. Implementation Strategy

Core rule: reuse existing computation logic and avoid split behavior between CLI and Web.

Suggested refactor:
1. Extract pure "computation phase" functions from `versionSingle/versionWorkspace` (no writes, no tags).
2. Both CLI `preview` and Web API call the same shared computation functions.
3. Existing `version` keeps write workflow on top of computation results.

---

## 7.1 Code Reuse Boundaries (Mandatory)

- `preview core` must not call:
  - `writeJSON/writeFile`
  - `git add/commit/tag/push`
  - `npm/pnpm publish`
- `preview core` may call:
  - read-only git queries
  - read-only filesystem reads
  - read-only registry checks
- `version/release` remains the only holder of write operations; preview cannot bypass this.

---

## 8. Security and Robustness

- Bind to `127.0.0.1` by default.
- Generate one-time session token (request header validation).
- Web mode defaults to read-only; only draft prune is allowed as a side-effect operation.
- Long-running APIs may add timeout and cancellation (future iteration).

Additional security items (recommended for MVP):
- `--host 0.0.0.0` must require explicit `--allow-remote`, otherwise startup is denied.
- Session token is in-memory only; invalidated on process exit and never written to disk.
- Logs are redacted by default (registry token, git remote credentials).

### 8.3 Prune Safety Strategy (Extended)
- No automatic prune by default; user action (`UI click`) or explicit `--prune` required.
- Add `dryRun` option (API + UI) to show deletion candidates before execution.
- Emit operation log after prune (deleted paths + count).
- If prune fails midway, at least return a visible list of already-deleted items for manual recovery.

---

## 8.1 Performance and Availability Budget

- First screen (`context + first preview`) target: < 2s (medium repository)
- Branch switch recompute target: < 1.5s
- Draft Health API target: < 300ms
- Availability: single endpoint failure must not block full page render (panel-level degradation)

---

## 8.2 Compatibility Constraints

- Node: aligned with current nxspub support (>=20)
- Package managers: pnpm / npm / yarn
- Git hosting: GitHub / GitLab / Gitee / Bitbucket (reuse existing link provider)
- Terminal environments: local shell, CI containers (`--open` is skipped without GUI)

---

## 9. Milestone Plan

### Milestone 1 (MVP, 1~2 days)
- `preview --web` service boot + base page
- `/api/preview` + `/api/drafts` + `/api/drafts/prune`
- version plan panel, Draft Health panel, JSON export
- unified error codes and `requestId`
- frontend static hosting integrated in CLI service

### Milestone 2 (Enhancement, 1~2 days)
- pre-release checks panel (`tag/registry/git sync`)
- realtime recompute on branch switch
- workspace dependency propagation visualization
- SSE incremental status push (optional)

### Milestone 3 (UX Optimization)
- historical diff (compare with previous preview)
- report snapshot export (`markdown/json`)

---

## 10. Acceptance Criteria

- `nxspub preview --web` starts correctly in both single and workspace modes.
- Version computation shown in page is identical to CLI `preview --json`.
- `draft prune` filesystem result is correct and re-readable.
- Output is stable and explainable for `main/alpha/hotfix` simulation without crashes.
- API error codes match documentation (sample at least 5 error paths).
- Every parameter matrix row is executable and behavior matches the table.

---

## 11. Risks and Mitigation

- Risk: divergence between existing `version` logic and `preview` logic.
  Mitigation: extract shared compute layer first, then connect Web.

- Risk: slow checks (`registry / git`).
  Mitigation: split APIs, load in parallel, and render panel-by-panel.

- Risk: local port conflicts.
  Mitigation: auto-detect available port and print final access URL.

- Risk: drift between preview and version results.
  Mitigation: add "same-input consistency tests" (snapshot comparison).

- Risk: accidental deletion from `prune`.
  Mitigation: default dry-run + explicit second confirmation (outside CLI auto mode).

---

## 12. Test Plan (Extended)

Unit tests:
- `preview core` version computation (single/workspace)
- draft analysis and prune
- checks aggregation

Integration tests:
- API routes (`health/context/preview/checks/drafts/prune/export`)
- token validation
- recompute after branch switch
- parameter matrix (`host/port/open/readonly-strict/allow-remote`)

End-to-end (optional for MVP):
- start service -> open page -> switch branch -> trigger prune -> export JSON

---

## 13. Task Breakdown (Ready to Start)

1. Add `preview` command skeleton and argument parsing
2. Extract read-only `preview core` compute module
3. Implement `hono` service and API routes
4. Initialize React + Vite page skeleton
5. Integrate version plan and draft panel
6. Integrate checks panel and export
7. Add tests (unit + integration)
8. Update README and example screenshots

---

## 13.1 Frontend Build and Hosting (Extended)

- Development:
  - Frontend: `vite dev` (for example `5173`)
  - Backend: `nxspub preview --web --api-only` (optional)
  - Use proxy to forward `/api` to backend

- Production:
  - `vite build` outputs to `dist/preview-web`
  - CLI service hosts `dist/preview-web` static files
  - Route fallback: all non-`/api/*` paths return `index.html`
  - Static cache: `index.html` no-cache, hashed assets long-cache

---

## 14. Feature Addendum (MVP / v1.1)

### 14.1 Optional MVP Items (If Time Allows)

1. Config override simulation (no disk write)
- Capability: temporary Web-side overrides for `branches`, `workspace.mode`, `changelog.writeOnBranches`
- Constraint: only affects current session, never writes config file
- Acceptance: defaults are restored after page refresh

2. Risk severity visualization
- Capability: classify check items as `blocker / warn / info`
- Acceptance: UI differentiates by color and ordering, `blocker` appears first

3. Long-task cancellation
- Capability: cancel old preview request on branch switch or repeated trigger
- Acceptance: UI only renders the latest response, no out-of-order overwrite

4. Diagnostic bundle export
- Capability: export `zip/json` (preview + checks + drafts + runtime context)
- Acceptance: exported content can reproduce conclusions offline

### 14.2 v1.1 Targets (Recommended Next Iteration)

1. Result comparison view
- Scenario: `main` vs `alpha`, or different override configurations
- Output: version diffs, release package diffs, changelog diffs

2. Reproducible snapshot
- Capability: persist snapshot (input args, git HEAD, preview result)
- Acceptance: page state can be restored from snapshot

3. Large repository performance optimization
- Capability: package table pagination/virtual scroll, lazy changelog loading
- Acceptance: interactive behavior remains smooth with 1k+ packages

4. Strict read-only mode
- Capability: disable all write operations (including prune) in `--readonly-strict`
- Acceptance: related APIs return `403 FORBIDDEN` with explicit message

---

## 15. Failure Recovery and Rollback (Extended)

### 15.1 Common Failure Recovery Flow

1. Port conflict
- Symptom: service startup fails or port is occupied
- Handling: auto-switch to another port and print final URL; if still failed, suggest manual `--port`

2. Token expiration/invalid
- Symptom: frontend gets `401`
- Handling: refresh page to renegotiate; restart `preview --web` if needed

3. API timeout
- Symptom: partial panel load failure
- Handling: keep loaded panels, show retry action for failed panels

4. Computation interrupted
- Symptom: request canceled or process exits
- Handling: frontend returns to `idle` and prompts user to rerun preview

### 15.2 Release and Rollback Strategy

- Rollout sequence:
  1. hidden feature flag (experimental)
  2. default-off, internal usage first
  3. public docs and default availability

- Rollback switches:
  - preserve pure CLI `preview` primary path
  - disable `--web` entry with feature flag if major issues are found

---

## 16. Implementation Checklist (Extended)

- [ ] Parameter matrix implemented and covered by tests
- [ ] API responses include `apiVersion`
- [ ] `/api/drafts/prune` supports dry-run
- [ ] `--readonly-strict` enforced for write endpoints
- [ ] Static hosting and cache policy match documentation
- [ ] Recovery paths (`401/timeout/cancel`) are verifiable
- [ ] Rollout/rollback switch is configurable
