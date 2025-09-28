-- Creates the unprivileged role the API connects as.
--
-- Runs once, on first container start. The important part is what this role is
-- NOT: not a superuser, and not the owner of any table. Both of those bypass
-- Row-Level Security in PostgreSQL, which would quietly disable every tenant
-- isolation policy we add later (PRD §11.4).

CREATE ROLE nownowhr_app WITH LOGIN PASSWORD 'change-me' NOSUPERUSER NOCREATEDB NOCREATEROLE;

GRANT CONNECT ON DATABASE nownowhr TO nownowhr_app;
GRANT USAGE ON SCHEMA public TO nownowhr_app;

-- Rights on tables that exist now and on everything migrations create later.
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO nownowhr_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO nownowhr_app;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO nownowhr_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO nownowhr_app;
