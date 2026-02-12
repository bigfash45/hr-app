# NowNowHR — Frontend Implementation Plan

**Status:** Draft for review
**Author:** Claude (for Fasina Ayodimeji, Frontend)
**Date:** 27 Jul 2026
**Source of truth:** NowNowHR Application PRD v2.0 (Mar 2026, rescoped Jul 2026)
**Repo:** `hr-app` — Angular 21, Tailwind 3.4, Vitest, standalone components

---

## 0. Read this first — three blockers

Nothing below is guesswork about the codebase; it is all verified against the repo, the live dev
API, and the local toolchain.

### B1 — Figma authenticates, but its MCP tools never register

Authentication is **done** — the stored token is valid with a refresh token, ~90 days to expiry, and
`claude mcp list` reports `✔ Connected`. The failure is one layer up, in the session's tool
registration:

```
Successfully connected (transport: http) in 3159ms
HTTP connection dropped after 0s uptime
tools/list failed (MCP error -32000: Connection closed); retrying in 250ms
tools/list failed (Not connected); retrying in 500ms
tools/list failed (Not connected); retrying in 1000ms
Terminal connection error 3/3
Closing transport (max consecutive terminal errors)
"error":"Failed to fetch tools: Not connected"
```

The connection opens, drops at 0s uptime, and after three failed `tools/list` retries the transport
closes with **zero Figma tools registered**. `claude mcp list` still says connected because its health
check only performs `initialize` — one short request — while the persistent stream `tools/list` needs
is what dies.

Ruled out: the Hotspot Shield VPN config is `(Invalid)` with no process running. The Claude process
runs Node v26.3.0 (the shell has v24.16.0); transport instability on that runtime is plausible but
unconfirmed.

**To unblock:** `/mcp` → `plugin:figma:figma` → **Reconnect** (not re-authenticate). If it drops again
at 0s, the transport is at fault rather than anything configured locally.

Until then **I cannot see a single pixel of the 8 nodes.** Every screen in §7 is specified from the
PRD only — layout, spacing, colour, and component anatomy are placeholders.

### B3 — The repo lives in iCloud, and node_modules has been evicted

This is why builds fail. `ng build` crashes on startup:

```
Error: ETIMEDOUT: connection timed out, read
    at Object.readFileSync (node:fs:441:20)
    ... hr-app/node_modules/rxjs/dist/cjs/index.js:109:18
```

An `ETIMEDOUT` reading a "local" file is the signature of iCloud eviction. Confirmed:

| Check | Result |
|---|---|
| `~/Documents` redirected into iCloud Drive | **Yes** — "Desktop & Documents Folders" is on |
| `ls -lO node_modules/rxjs/dist/cjs/index.js` | `compressed,` **`dataless`** |
| Files in `node_modules/@angular` | 6,738 |
| …of those, **dataless (evicted)** | **6,685 — 99.2%** |
| `du -sh node_modules` | **9.9M** (an Angular 21 install is 400MB+) |

Every build has to stream `node_modules` back from iCloud file by file, which is why `ng build`
exceeded 300s, then 420s, and `tsc --noEmit` timed out at 240s. `brctl download node_modules` returns
instantly and materialises nothing.

**Fix, in order of preference:**
1. **Move the repo out of `~/Documents`** — e.g. `~/Projects/hr-app`, then `npm ci`. Permanent, and it
   fixes every other project sitting in Documents too.
2. Turn off System Settings → Apple Account → iCloud → Drive → *Desktop & Documents Folders*.
3. Stopgap: rename `node_modules` to `node_modules.nosync` and symlink it — iCloud skips `.nosync`
   folders. Survives until the next `npm install` recreates the real folder.

This is not a code problem and nothing in §8 depends on it, but **no build or test can be trusted
until it is fixed.**

### B2 — The backend's OpenAPI spec returns HTTP 500, so there is no API contract to build against

| Endpoint | Result |
|---|---|
| `GET /hr/swagger-ui/index.html` | `200` — the UI shell loads |
| `GET /hr/v3/api-docs` | `500 Internal Server Error` |
| `GET /hr/v3/api-docs/swagger-config` | `500 Internal Server Error` |

The Swagger *page* is up but the spec it needs is crashing server-side, so the page renders empty.
I cannot enumerate endpoints, request/response shapes, error envelopes, or status codes.

**This is the single highest-leverage fix on the project.** Everything in §5 (error handling) depends
on knowing the backend's error envelope, and everything in §7 depends on knowing the payloads. Ask
Elvis to fix `/hr/v3/api-docs` first. Until then I am reverse-engineering from two known endpoints:

- `POST /hr/api/v1/auth/login` → `{ token, type, username, roles[] }`
- `GET  /hr/api/v1/overview/stats`, `GET /hr/api/v1/overview/events`

### D1 — RESOLVED: a brand-new backend, built from scratch

**Decision (27 Jul 2026): write a new backend from scratch**, not just a client layer over Elvis's
existing service.

Recorded for the avoidance of doubt, since it was raised and reaffirmed: a working backend already
exists at `http://159.223.197.108:1066/hr/api/v1`, the PRD assigns backend to Osuji Elvis, and the
frontend currently authenticates against it successfully. Building a second one duplicates that work
and needs a call on which becomes canonical. That is a scoping decision, not a technical objection —
proceeding as directed.

**Consequence for the frontend:** the client is being built contract-first. One `ApiService`, one base
URL in `environments/`, so retargeting from the old backend to the new one is a one-line change rather
than a sweep through every service.

The backend itself is scoped as its own track in §11, and it needs PRD §17 Q2–Q5 answered (database,
cloud host, file storage, email provider) — all four are still open. §11 states the defaults I will
assume if they stay open.

---

## 1. What already exists

12 routes' worth of UI, 9 shared components, 2 services. Real structure to build on, not a blank slate.

```
src/app/
├── auth/              login page + auth.service (live, working against dev API)
├── overview/          dashboard page + dashboard.service (live stats + events)
├── employees/         page + 5 components (list, details, add, leave-requests, org-chart)
├── attendance/        page
├── leave/             page + history + detail
└── shared/            button, input, select, form-field, side-nav, top-nav,
                       nownow-logo, decor-shapes, leave-approved-modal
```

## 2. Baseline audit — what needs to change and why

Verified findings, ordered by risk. Each maps to a PRD clause.

| # | Finding | Evidence | PRD clause violated | Severity |
|---|---|---|---|---|
| 1 | **No route guards at all.** Every page is reachable unauthenticated by typing the URL. | `src/app/app.routes.ts` — no `canActivate` anywhere; `grep` for guards/interceptors returns nothing | §7.3 RBAC | **Critical** |
| 2 | **No RBAC in the client.** No role model, no per-role dashboards, no field-level scoping. `roles[]` comes back from login and is dropped into `localStorage` unused. | `auth.service.ts:31` | §4, §7.1, §7.2 | **Critical** |
| 3 | **JWT in `localStorage`, no refresh, no expiry handling.** XSS-readable. No refresh-token rotation. | `auth.service.ts:28-29` | §11.2 (1h JWT + refresh rotation) | **Critical** |
| 4 | **No error handling infrastructure.** No interceptor, no `ErrorHandler`, no toast, no error modal. Failures `console.error` and leave the UI on a spinner or blank. | `overview.page.ts:118,131` — 8 `console.*` calls total | §15.4 DoD ("loading, empty and error states implemented") | **Critical** — *this is your explicit ask; see §5* |
| 5 | **No session timeout.** No idle detection, no re-auth prompt. | nothing implements it | §6.1 (8h active / 30min idle, re-auth **without losing page state**) | High |
| 6 | **Auth header logic duplicated per service.** `dashboard.service.ts` rebuilds `Authorization` by hand; every new service will copy it. | `dashboard.service.ts:62-67` | — (this is the "shared service" gap) | High |
| 7 | **API host hardcoded in 2 files, no environments.** | `auth.service.ts:21`, `dashboard.service.ts:59` | — | High |
| 8 | **Login leaks backend error text**, and `companyCode` is prefilled `'001122'`. | `auth.service.ts:39-45`, `login.page.ts:33` | §6.1 ("generic error, no field-level hints") | High |
| 9 | **Zero accessibility work.** 0 `aria-*` attributes across all templates. No focus management, no keyboard traps, no `prefers-reduced-motion`. | `grep -c aria- src/**/*.html` → 0 | §10.3 WCAG 2.1 AA | High |
| 10 | **No MD3 design tokens.** `tailwind.config.js` has `theme.extend: {}` — every colour and spacing value is an ad-hoc literal in templates. | `tailwind.config.js` | §2 (MD3), §10.3 (4.5:1 contrast) | High |
| 11 | **Mock data hardcoded in components.** `employees`, `activities` arrays are fixtures shipped in the bundle. | `overview.page.ts:52-62` | — | Medium |
| 12 | **Manual `ChangeDetectorRef.detectChanges()`; no `OnPush`; imperative field-by-field mapping.** 27 mutable public fields on one component where signals belong. | `overview.page.ts:14,124` | §10.1 (<3s load) | Medium |
| 13 | **No multi-tenant client scoping.** No `company_id` context, no company switcher for Group HR. | — | §11.4, §4.1 | Medium |
| 14 | **Effectively no tests.** One default `app.spec.ts`. Vitest is configured and unused. | `find src -name '*.spec.ts'` | §15.4 DoD | Medium |
| 15 | Build baseline: `ng build` exceeded 300s on this machine. Worth confirming whether that's cold-cache or a real problem. | — | §10.1 | Low |

**Read #1–#4 together:** the app currently has no security boundary and no failure boundary. Those
are the first two things to build, before any new screen.

---

## 3. Target architecture

Keep Angular 21 standalone + Tailwind. No framework migration. (Note: PRD §17 Q6 still asks "React
or Vue" — **that question is already answered by reality: Angular 21.** The PRD needs updating.)

```
src/
├── environments/
│   ├── environment.ts                 # dev  → 159.223.197.108:1066
│   └── environment.prod.ts
├── app/
│   ├── core/                          # singletons, no UI
│   │   ├── http/
│   │   │   ├── api.service.ts         # ← the "shared service"
│   │   │   └── interceptors/
│   │   │       ├── auth.interceptor.ts
│   │   │       ├── tenant.interceptor.ts
│   │   │       ├── correlation-id.interceptor.ts
│   │   │       ├── error.interceptor.ts
│   │   │       └── loading.interceptor.ts
│   │   ├── auth/
│   │   │   ├── auth.service.ts        # rewrite of existing
│   │   │   ├── session.service.ts     # idle timeout + re-auth
│   │   │   ├── auth.guard.ts
│   │   │   ├── role.guard.ts
│   │   │   └── role.model.ts          # the 4-role enum
│   │   ├── tenant/company-context.service.ts
│   │   ├── feedback/                  # ← §5 lives here
│   │   │   ├── feedback.service.ts
│   │   │   ├── dialog.service.ts
│   │   │   └── error-mapper.ts
│   │   └── errors/global-error-handler.ts
│   ├── shared/
│   │   ├── ui/                        # dumb, presentational, OnPush
│   │   │   ├── dialog/                # a11y base — focus trap, Esc, restore
│   │   │   ├── toast/ + toast-host/
│   │   │   ├── confirm-dialog/
│   │   │   ├── success-dialog/        # generalised from leave-approved-modal
│   │   │   ├── error-dialog/
│   │   │   ├── state-panel/           # loading | empty | error, one component
│   │   │   ├── skeleton/
│   │   │   └── (existing: button, input, select, form-field, …)
│   │   ├── directives/has-role.directive.ts
│   │   └── layout/shell.component.ts  # side-nav + top-nav + <router-outlet>
│   └── features/                      # existing pages migrate here
│       ├── overview/ employees/ attendance/ leave/ payslips/
│       ├── onboarding/ org-chart/ reports/ settings/ profile/
```

**Conventions, applied everywhere:**

- `ChangeDetectionStrategy.OnPush` on every component. Signals for all state — no mutable public fields.
- Feature services return typed models; components never touch `HttpClient` directly.
- Every async view renders one of four states: **loading → (empty | error | data)**. `<ui-state-panel>` enforces this so no screen can ship with a bare spinner. This is a PRD §15.4 DoD line item.
- Layout shell owns the nav; pages stop importing `SideNavComponent`/`TopNavComponent` individually.
- Zero `console.*` in committed code — replaced by the error pipeline.

---

## 4. The shared data-access layer

`ApiService` is a thin typed wrapper over `HttpClient`, and the *only* place the base URL appears.
All cross-cutting concerns move to interceptors, so no feature service ever builds an auth header again.

```ts
@Injectable({ providedIn: 'root' })
export class ApiService {
  private http = inject(HttpClient);
  private base = environment.apiBaseUrl;      // one place, from environments

  get<T>(path: string, params?: HttpParams): Observable<T>
  post<T>(path: string, body: unknown): Observable<T>
  patch<T>(path: string, body: unknown): Observable<T>
  delete<T>(path: string): Observable<T>
  upload<T>(path: string, file: File): Observable<HttpEvent<T>>   // payslips, documents
}
```

| Interceptor | Responsibility |
|---|---|
| `correlationId` | Attach `X-Request-Id` (UUID) so a user-facing error can be traced to a server log. Surfaced in the error modal. |
| `auth` | Attach bearer token. On `401`, attempt one silent refresh; if that fails, hand off to `SessionService`. |
| `tenant` | Attach `X-Company-Id` from `CompanyContextService` — required for Group HR drill-down (PRD §11.4). **Needs backend confirmation.** |
| `loading` | Increment/decrement a global in-flight counter for the top progress bar. |
| `error` | Last in chain. Maps `HttpErrorResponse` → `AppError` and routes it per §5.3. |

Feature services to write, one per PRD §6 area: `EmployeeService`, `AttendanceService`,
`LeaveService`, `PayslipService`, `OnboardingService`, `ReportService`, `NotificationService`,
`CompanyService`. Each gets a `.model.ts` of interfaces. **All shapes are provisional until B2 is fixed.**

---

## 5. Error handling, success messaging & feedback — *your explicit ask*

The rule that decides everything below:

> **Toast** for outcomes the user already expects and can ignore.
> **Modal** for outcomes the user must read, acknowledge, or act on.
> **Inline** for anything attached to a specific form field.

### 5.1 The `AppError` model

Every failure in the app becomes one of these before any UI sees it. Components never inspect
`HttpErrorResponse`.

```ts
export type ErrorKind =
  | 'network' | 'auth' | 'forbidden' | 'notFound' | 'conflict'
  | 'validation' | 'locked' | 'rateLimit' | 'server' | 'unknown';

export interface AppError {
  kind: ErrorKind;
  title: string;                            // modal heading
  message: string;                          // human, actionable, never a stack trace
  fieldErrors?: Record<string, string>;      // → reactive form controls
  correlationId?: string;                    // from X-Request-Id
  retryable: boolean;
  retry?: () => void;
}
```

### 5.2 Services

| Service | API | Notes |
|---|---|---|
| `FeedbackService` | `success(msg)`, `info(msg)`, `warn(msg)`, `error(AppError)` | Signal-backed queue. Toasts auto-dismiss (4s success / 6s warn); errors never auto-dismiss. |
| `DialogService` | `confirm(opts): Promise<boolean>`, `success(opts)`, `error(AppError)`, `open(cmp, data)` | Promise-based so calling code reads top-to-bottom. Stacks max 1 — a second dialog queues. |
| `GlobalErrorHandler` | implements Angular `ErrorHandler` | Catches uncaught template/lifecycle throws that never touched HTTP, so nothing fails silently. |

### 5.3 HTTP status → UI treatment (the decision table)

| Status | Situation | Treatment | Recovery affordance |
|---|---|---|---|
| `0` | Offline / server unreachable | **Error modal** — "Can't reach NowNowHR" | **Retry** button (re-fires the request) |
| `400` | Malformed request (our bug) | **Error modal**, generic copy + correlation ID | Report |
| `401` **on login** | Bad credentials | **Inline banner** on the form — *"The details you entered are incorrect."* Deliberately generic per PRD §6.1: never say which field was wrong. | — |
| `401` **after login** | Session expired | **Re-auth modal over the current page.** Page state is preserved — no redirect, no data loss (PRD §6.1). On success the original request replays. | Password field in modal |
| `403` | Role/scope denied | **Error modal** — "You don't have access to this." Log to audit (PRD §7.3). | Back to my dashboard |
| `404` | Record missing/deleted | **Inline empty state**, not a modal — a missing record isn't an emergency | Back to list |
| `409` | Conflict — duplicate email, overlapping leave dates, double clock-in | **Inline field error + warn toast**, with the specific conflict named | Adjust and resubmit |
| `422` | Server-side validation | **Map `fieldErrors` onto the reactive form**, mark touched, scroll+focus first invalid control, `aria-live` announce the count | Fix inline |
| `423` | Account locked (5 failed logins, PRD §6.1) | **Error modal** — "Account locked. Contact your HR Manager." | Copy HR email |
| `429` | Rate limited | **Warn toast** with retry-after countdown | Auto-retry |
| `5xx` | Server error | **Error modal** + correlation ID (copy button) | **Retry** + Report |

**Idempotency rule:** `Retry` is offered only on `GET`/`PUT`/`DELETE` and on `POST`s the backend
confirms are idempotent. Never blind-retry "submit leave" or "upload payslip" — a duplicate leave
request is worse than an error message.

### 5.4 Success messaging catalogue

| Action | Treatment | Copy |
|---|---|---|
| Clock in / out | **Toast**, optimistic state flip | "Clocked in at 8:42 AM." |
| Leave request submitted | **Success modal** — summary: type, dates, working days, remaining balance, who approves next | "Request sent to *Line Manager name*" |
| Leave approved / rejected (manager) | **Toast** + row updates in place, no reload | "Leave approved for Babatunde Jimoh." |
| Employee added | **Success modal** — "Add another" / "View employee" | "Joan Onyimadu added." |
| Bulk CSV / payslip batch | **Success modal with match summary** — *n* matched, *n* unmatched, download the unmatched list | Phase 1 |
| Attendance correction submitted | **Toast** | "Correction sent for approval." |
| Profile / settings saved | **Toast** | "Changes saved." |
| Password reset link sent | **Inline confirmation panel** replaces the form (don't reveal whether the email exists) | "If that email is registered, a link is on its way." |
| Payslip downloaded | **No feedback** — the browser's download UI is the feedback | — |

**Destructive actions go through `DialogService.confirm()` with typed confirmation** where PRD demands
a reason: employee deactivation (§6.3), manual leave-balance adjustment (§6.5), attendance override
(§6.4). The reason field is mandatory in the dialog because it is mandatory in the audit log.

### 5.5 Accessibility requirements on the feedback layer

Not optional — PRD §10.3 is WCAG 2.1 AA, and today the app has **zero** `aria-*` attributes.

- Toast host: `aria-live="polite"`, `role="status"`. Error toasts: `aria-live="assertive"`.
- Dialog: `role="dialog"` (`alertdialog` for errors/confirms), `aria-modal="true"`, labelled by its heading, focus moves to the dialog on open, **focus is trapped**, `Esc` closes (except blocking session re-auth), focus returns to the trigger on close, background gets `inert`.
- Never colour alone: every status carries an icon **and** text (PRD §10.3).
- All animation behind `@media (prefers-reduced-motion: reduce)`.
- Contrast ≥ 4.5:1 verified on every state colour once MD3 tokens land (§6).

### 5.6 Sequencing note

**§5 is built before any new feature screen.** Every screen in §7 then consumes it rather than
inventing its own error handling. Building it after the screens means retrofitting 12 pages.

---

## 6. Design system — MD3 tokens

PRD §2 mandates Material Design 3. Two options:

| Option | Verdict |
|---|---|
| Adopt **Angular Material** (native MD3) | ✗ Rejected. Means rewriting the 9 existing Tailwind components and fighting Material's opinions against your Figma. |
| **Encode MD3 tokens in `tailwind.config.js`**, keep hand-built components | ✓ **Recommended.** Preserves existing work, gives full Figma fidelity, keeps the bundle small. |

Populate `theme.extend` with the MD3 token set — colour roles (`primary`, `on-primary`,
`primary-container`, `surface`, `surface-variant`, `error`, `on-error`…), the type scale
(display/headline/title/body/label), elevation, shape, and state layers. Values come **from the Figma
file's variables** once B1 is unblocked — I will not invent them.

**Locale primitives** (PRD §10.4), as Angular pipes so they're impossible to get wrong ad hoc: `₦` naira
currency, `DD MMM YYYY` dates, 12-hour clock, WAT (UTC+1).

**Desktop-first** (PRD §2.1): design at 1440px, must not break below 1280px. No mobile breakpoints.
Worth adding a CI viewport check at 1280px — it's a DoD line item (§15.4).

## 7. The 8 Figma screens — **unresolved pending B1**

You linked 8 nodes. I cannot open any of them. Here they are with my best inference from route
gaps + PRD §6, to be **replaced with real specs** the moment Figma auth works.

| # | Node ID | Inferred screen | Confidence |
|---|---|---|---|
| 1 | `21-4555` | Auth — login / password reset (lowest node ID ⇒ earliest frame) | Low |
| 2 | `213-2866` | Overview dashboard variant (role-specific?) | Low |
| 3 | `450-1600` | *You linked this one first — likely the priority screen* | Low |
| 4 | `934-3047` | Employees — list or detail | Low |
| 5 | `1067-2340` | Attendance | Low |
| 6 | `1220-5167` | Leave — apply or approvals | Low |
| 7 | `1234-6132` | Payslips (no route exists yet) | Low |
| 8 | `1275-2878` | Onboarding checklist / settings (no route exists yet) | Low |

**These labels are guesses from node-ID ordering. Treat them as unknown.** Once authenticated I'll
pull each node, map its components to the shared UI library, list the design tokens it needs, and
turn this table into real per-screen specs with component breakdowns.

## 8. Build sequence

Sized for one frontend engineer + me, sequenced so each stage is independently reviewable and nothing
gets retrofitted.

### Stage 0 — Unblock (you, not me)
1. `/mcp` → authorise `plugin:figma:figma` **(B1)**
2. Elvis fixes `GET /hr/v3/api-docs` **(B2)**
3. Answer §10 decisions, confirm **A1**

### Stage 1 — Foundation *(no new screens; everything after depends on this)*
1. `environments/` — kill both hardcoded IPs (finding #7)
2. `ApiService` + all 5 interceptors (§4) — resolves finding #6
3. **Feedback layer in full (§5)** — `AppError`, `FeedbackService`, `DialogService`, dialog a11y base, toast host, `state-panel`, `GlobalErrorHandler` — resolves finding #4
4. MD3 tokens into `tailwind.config.js` from Figma variables — finding #10
5. `shell.component` layout; pages stop importing nav directly
6. Retrofit the 3 existing services onto the new layer; delete all 8 `console.*`

*Exit criteria: every existing page shows a real loading, empty and error state. Kill the network in devtools and the app explains itself instead of hanging.*

### Stage 2 — Auth, session & RBAC *(the security boundary — findings #1, #2, #3, #5, #8)*
1. Rewrite `AuthService`: access token in memory, refresh via httpOnly cookie, silent refresh, generic login errors
2. `authGuard` + `roleGuard` on every route; role-aware redirect after login (PRD §6.1)
3. `role.model.ts` — the 4 roles, non-cumulative (PRD §4)
4. `hasRole` directive for control-level hiding — *supplementary only; server is authority (PRD §7.3)*
5. `SessionService` — 8h absolute / 30min idle, **re-auth modal preserving page state**
6. `CompanyContextService` + Group HR company switcher (PRD §11.4)
7. Password reset flow (single-use link, 24h expiry)

*Exit criteria: all 4 roles tested; no route reachable unauthenticated; session expiry loses no work.*

### Stage 3 — Core features, in PRD Phase 0 order
Each on the Stage 1/2 foundation, each with real Figma specs, each with loading/empty/error states,
RBAC-scoped fields, and the §5.4 success treatments.

1. **Employees** — guided add flow (4 steps), list + filters, detail with role-scoped fields, deactivate-with-reason
2. **Attendance** — clock in/out, history, status set (Present/Late/Absent/On Leave/WFH/Holiday), team view, HR override
3. **Leave** — apply with auto working-day calc + live balance, 2-level approval, calendar, balances *(builds on existing pages)*
4. **Payslips** — single upload, employee view/download, access logging *(new route)*
5. **Self-service portal** + profile *(new route)*
6. **Org chart & directory** *(component exists, needs a route)*
7. **Onboarding checklist** *(new route)*
8. **Notifications** — bell + badge, real-time in-app, email preferences
9. **Basic reporting** — attendance/leave/employee, date filters, PDF export

### Stage 4 — Hardening
Accessibility audit (NVDA + VoiceOver, keyboard-only pass), 1280px layout check, cross-browser
(Chrome/Firefox/Edge/Safari, latest 2), performance to PRD §10.1 (<3s load), Vitest coverage on
guards + error mapper + feedback service + leave-day calculation, feature-flag scaffolding (PRD §14).

**Phase 1 (deferred, PRD §13.2):** bulk CSV upload, bulk payslips, document management, audit log UI,
advanced/scheduled reports, custom report builder, attendance correction workflow, full Group HR
cross-company features.

## 9. Testing & Definition of Done

Vitest is installed and unused. Priority targets — the logic where bugs are silent and expensive:

| Target | Why |
|---|---|
| `error-mapper` | Every row of the §5.3 table, asserted |
| `authGuard` / `roleGuard` | All 4 roles × allowed/denied |
| Leave working-day calculation | Excludes weekends + Nigerian public holidays (PRD §6.5) |
| `FeedbackService` / `DialogService` | Queueing, dismissal, focus restore |
| `SessionService` | Idle expiry, silent refresh, state preservation |

**Per-feature DoD (PRD §15.4)** — my checklist before calling anything done:
acceptance criteria met · tested on all 4 browsers · WCAG 2.1 AA pass · RBAC tested for all 4 roles ·
no catastrophic break below 1280px · **loading, empty and error states implemented** · inputs
validated server-side · audit entries for sensitive actions · no open P0/P1.

## 10. Decisions I need from you

Blocking:

| # | Decision | My recommendation |
|---|---|---|
| **D1** | **A1** — Angular shared service layer, or a whole new backend? | Shared service layer against Elvis's existing API |
| **D2** | Token storage: keep `localStorage`, or access-token-in-memory + refresh in httpOnly cookie? Needs backend support. | **In-memory + httpOnly refresh cookie.** `localStorage` is XSS-readable and contradicts PRD §11.2 |
| **D3** | Does the backend accept `X-Company-Id`, or is company scope baked into the JWT? | JWT claim, with the header only for Group HR drill-down |
| **D4** | Is the backend error envelope stable, and does it return field-level validation errors? | Needed to finish §5.1 — it's `{timestamp,status,error,message,path}` today, which has **no field errors** |
| **D5** | MD3 via Tailwind tokens, or migrate to Angular Material? | Tailwind tokens (§6) |

Non-blocking, from PRD §17 — flagging that these are still open and some now affect me:

- Q6 "React or Vue" is **moot** — it's Angular 21. Update the PRD.
- Q1/Q8 session timeout values → I'll build 8h/30min configurable (D2 territory).
- Q10 pending leave on deactivation, Q11 cancelling approved leave, Q13 dotted-line reporting → these change UI I'd otherwise have to rebuild. Worth deciding before Stage 3.

---

## 11. Backend track (D1 — new build)

Scoped separately from the frontend because it can proceed in parallel and has its own open
decisions. Nothing in §8 depends on it: the client talks to the existing API until this is ready, and
retargeting is one line in `environments/`.

### 11.1 Stack — recommended defaults

PRD §17 Q2–Q5 are all still open. Rather than block, these are the defaults I will build against
unless told otherwise. Each is a real decision, so overrule freely.

| Concern | Default | Why | PRD |
|---|---|---|---|
| Runtime & framework | **NestJS (TypeScript)** | End-to-end TypeScript means DTOs shared verbatim with the Angular client, so a contract change breaks the build instead of production. Fits a 2-person team. **Alternative: Spring Boot**, which matches Elvis's existing service — pick that if he owns this. | §16.2 |
| Database | **PostgreSQL 16** | PRD suggests it, and it is the only mainstream option with the Row-Level Security §11.4 asks for. | §17 Q5 |
| ORM | **Prisma** | Typed schema, first-class migrations. RLS needs a raw-SQL escape hatch, which Prisma supports. | — |
| File storage | **S3-compatible** (AWS S3 or DigitalOcean Spaces) with pre-signed URLs, company-scoped key prefixes | §11.2 requires signed URLs and encrypted storage for payslips. | §11.2, §17 Q4 |
| Email | **Adapter interface**, SES first | Keeps Q2 open without blocking: swapping to Mailgun/SendGrid is one class. | §17 Q2 |
| Hosting | **Docker containers**, provider-agnostic | Defers Q3 rather than pretending it is answered. | §17 Q3 |

### 11.2 Multi-tenancy — the part that must not be got wrong

Single database, shared schema, `company_id` on every table, enforced in **three** places:

1. **Application** — a request-scoped tenant context derived from the JWT, never from a client header. The `X-Company-Id` the frontend sends is a *hint* for Group HR drill-down and must be validated against the caller's permitted company set.
2. **Row-Level Security** — a Postgres policy per table on `company_id`, with the session variable set per connection. This is the secondary defence PRD §11.4 requires: if application code forgets a `WHERE`, the database still refuses.
3. **Storage** — company-scoped key prefixes, so a signed URL cannot be walked across tenants.

Data-isolation tests are a release gate before each sister-company rollout (PRD §11.4), not an
afterthought — a cross-tenant leak in an HR system means salaries.

### 11.3 Build order

1. **Foundation** — schema + migrations, tenant context, RLS policies, audit-log table (§11.3 retention), health checks, **OpenAPI generation that actually works** (the current one 500s)
2. **Auth** — bcrypt ≥12, JWT 1h + refresh rotation in an httpOnly cookie, lockout after 5 failures, password reset with single-use 24h links, session policy 8h/30min (§6.1, §11.2)
3. **RBAC** — 4 roles, non-cumulative, enforced server-side with the "never approve your own request" rule (§7.3)
4. **Employees** — CRUD, deactivation-with-reason, field-level scoping so salary/bank/RSA PIN reach only Local HR and the employee themselves (§7.2)
5. **Attendance** — clock in/out with timestamp/device/IP, status set, corrections (§6.4)
6. **Leave** — balances, working-day calculation excluding weekends and Nigerian public holidays, 2-level approval, 48h reminder / 72h escalation (§6.5)
7. **Payslips** — upload, employee-ID filename matching, signed-URL download, access logging (§6.6)
8. **Notifications** — in-app + email triggers (§8)
9. **Reports** — role-scoped queries, PDF/CSV export (§9)

### 11.4 Non-negotiables, from the PRD

Encrypt Tier 1 fields at rest with AES-256 (salary, bank, RSA PIN, NIN, BVN); TLS 1.2 minimum in
transit; audit-log every sensitive action with actor and timestamp; enforce the retention schedule in
§11.3; NDPR data export and correction endpoints (§11.5). These are requirements, not enhancements —
they are cheap to build in now and expensive to retrofit.

---

## Summary

**Findings:** 15 verified issues. Four are critical and all four are *structural* — no route guards,
no client RBAC, insecure token handling, and no error-handling layer. They are cheap to fix now and
expensive to retrofit across 12 screens later.

**Your specific ask** — proper error modals and success messages — is §5, and it is Stage 1 work,
deliberately ahead of every feature screen.

**What I can start on immediately, without waiting on anything:** Stage 1 items 1, 2, 3, 5, 6 and all
of Stage 2. That is the entire foundation and security boundary — real, reviewable, useful work.

**What is genuinely blocked:** MD3 tokens (need Figma variables), the 8 screens (need Figma), and the
final API contracts (need `/v3/api-docs`).

Tell me which parts of this you want changed, and whether to start Stage 1 while you sort out B1/B2.
