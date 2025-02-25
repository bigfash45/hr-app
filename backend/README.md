# NowNowHR API

Internal multi-tenant HRMS backend for NowNow Digital Systems and its sister
companies. NestJS · PostgreSQL · Prisma.

Replaces the previous service at `159.223.197.108:1066`.

## Getting started

```bash
cp .env.example .env          # then fill in the secrets
openssl rand -base64 48       # for each of JWT_* and FIELD_ENCRYPTION_KEY

docker compose up -d          # PostgreSQL, with the app + owner roles
npm install
npm run db:migrate            # schema, then the RLS policies
npm run db:seed               # company, roles, leave types, 2026 holidays
npm run start:dev
```

API at `http://localhost:3000/hr/api/v1`, OpenAPI at `/hr/api/v1/docs`.

## How tenant isolation works

Three independent layers, because one is not enough when the data is payroll
(PRD §11.4).

1. **Application** — `TenantContext` is derived from the verified JWT, never from
   a client header. `X-Company-Id` is honoured only for a Group HR Manager, and
   only after checking it against their permitted set.
2. **Database** — Row-Level Security on every tenant table. Each request opens a
   transaction that sets `app.company_id` and `app.is_group_hr` as
   *transaction-local* settings, so a pooled connection cannot carry one
   company's scope into the next request. A query that forgets its `WHERE`
   returns nothing rather than another company's rows.
3. **Storage** — payslips and documents live under company-scoped key prefixes
   and are only ever served through short-lived signed URLs.

The API connects as `nownowhr_app`, which is **not** a superuser and **not** the
table owner. That is deliberate: PostgreSQL exempts both from RLS, so connecting
as either would silently disable layer 2 and nobody would notice until a leak.

## Conventions

- Tenant-scoped work goes through `prisma.withTenant(tx => ...)`. Queries on the
  bare client have no company set, so RLS matches nothing — a forgotten wrapper
  shows up as empty results, not as a leak.
- `prisma.withoutTenantScope()` is the deliberate escape hatch for pre-auth paths
  (login, token refresh, health). Named to stand out in review.
- Every sensitive action calls `AuditService.record()`. Tier 1 values are
  redacted before writing — the log records *that* salary changed, never to what.
- Tier 1 columns hold ciphertext. Encrypt on write and decrypt on read through
  `FieldEncryptionService`; never read them raw.
- Permissions are enforced here. The Angular `*appHasRole` directive only hides
  controls (PRD §7.3) — a hidden button is still a reachable endpoint.

## Status

**Built:** tenancy and RLS, auth (Argon2id, JWT + refresh rotation with reuse
detection, lockout, password reset), RBAC guards and scope service, audit log,
field encryption, error envelope, OpenAPI.

**Not yet built:** employees, attendance, leave, payslips, dashboard,
notifications, seed. Schema covers all of them; the modules are next.

## Open decisions

PRD §17 Q2–Q5 are unanswered. Current assumptions: PostgreSQL 16, S3-compatible
storage, email behind a driver interface (`console` locally), containers rather
than a named cloud. Each is one file to change.
