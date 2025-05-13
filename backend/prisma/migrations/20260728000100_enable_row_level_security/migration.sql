-- Row-Level Security — the second line of tenant defence (PRD §11.4)
--
-- Application code already scopes every query by company. This exists for the
-- day someone forgets. With these policies in place a missing WHERE clause
-- returns zero rows instead of another company's payroll.
--
-- HOW IT WORKS
--   Every request opens a transaction and sets two session variables:
--     app.company_id  — the tenant the caller is acting within
--     app.is_group_hr — 'on' only for a Group HR Manager, who legitimately
--                       reads across companies (PRD §7.1)
--   Policies below compare those against each row's company_id.
--
-- WHY THE APP ROLE MATTERS
--   PostgreSQL exempts superusers and table owners from RLS. The API must
--   connect as nownowhr_app (see prisma/init/01-app-role.sql), which is neither.
--   FORCE ROW LEVEL SECURITY is added anyway so even the owner is subject to it,
--   which stops a migration script or a psql session from quietly leaking data.
--
-- RUN ORDER: after the initial schema migration.

-- Reusable predicate: is this row visible to the current session?
CREATE OR REPLACE FUNCTION app_can_access_company(row_company_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT
    -- Group HR sees every company.
    coalesce(current_setting('app.is_group_hr', true), 'off') = 'on'
    OR row_company_id::text = current_setting('app.company_id', true);
$$;

-- `true` for the second arg makes current_setting return NULL rather than error
-- when unset. An unset app.company_id therefore matches nothing, so a query that
-- forgets to open the tenant context sees an empty table — fail closed, not open.

DO $$
DECLARE
  target_table text;
  tenant_tables text[] := ARRAY[
    'users',
    'departments',
    'employees',
    'attendance_records',
    'attendance_corrections',
    'leave_types',
    'leave_balances',
    'leave_requests',
    'payslips',
    'employee_documents',
    'onboarding_tasks',
    'public_holidays',
    'notifications',
    'feature_flags'
  ];
BEGIN
  FOREACH target_table IN ARRAY tenant_tables LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', target_table);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', target_table);

    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I
         USING (app_can_access_company(company_id))
         WITH CHECK (app_can_access_company(company_id))',
      target_table
    );
  END LOOP;
END
$$;

-- leave_approvals has no company_id of its own — it hangs off leave_requests,
-- which is already isolated. Reach through the parent rather than denormalising
-- a company_id we would then have to keep in sync.
ALTER TABLE leave_approvals ENABLE ROW LEVEL SECURITY;
ALTER TABLE leave_approvals FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON leave_approvals
  USING (
    EXISTS (
      SELECT 1 FROM leave_requests lr
      WHERE lr.id = leave_approvals.leave_request_id
        AND app_can_access_company(lr.company_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM leave_requests lr
      WHERE lr.id = leave_approvals.leave_request_id
        AND app_can_access_company(lr.company_id)
    )
  );

-- refresh_tokens and password_resets belong to a user, not directly to a company.
-- They are only ever queried by token hash during authentication, before a tenant
-- context exists, so they are deliberately left outside RLS. Access control for
-- them is "you must already hold the secret".

-- companies: everyone may read the row for their own company; Group HR reads all.
ALTER TABLE companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE companies FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON companies
  USING (app_can_access_company(id))
  WITH CHECK (app_can_access_company(id));

-- audit_logs: append-only, and readable within your own company.
-- Group HR reads across the group (PRD §7.2).
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs FORCE ROW LEVEL SECURITY;

CREATE POLICY audit_read ON audit_logs
  FOR SELECT
  USING (company_id IS NULL OR app_can_access_company(company_id));

CREATE POLICY audit_append ON audit_logs
  FOR INSERT
  WITH CHECK (true);

-- No UPDATE or DELETE policy is defined, and that is the point: with RLS forced
-- and no permissive policy for those commands, they are refused. An audit log
-- that can be edited is not an audit log (PRD glossary: "chronological,
-- non-editable record").
REVOKE UPDATE, DELETE ON audit_logs FROM nownowhr_app;
