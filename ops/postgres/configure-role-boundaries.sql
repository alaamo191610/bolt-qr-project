\set ON_ERROR_STOP on

\if :{?app_database}
\else
  \echo 'app_database is required'
  \quit 64
\endif
\if :{?current_owner_role}
\else
  \echo 'current_owner_role is required'
  \quit 64
\endif
\if :{?migration_role}
\else
  \echo 'migration_role is required'
  \quit 64
\endif
\if :{?runtime_role}
\else
  \echo 'runtime_role is required'
  \quit 64
\endif

SELECT current_database() = :'app_database' AS correct_database \gset
\if :correct_database
\else
  \echo 'Refusing to configure roles in the wrong database'
  \quit 65
\endif

SELECT rolsuper AS executor_is_superuser
FROM pg_roles
WHERE rolname = current_user \gset
\if :executor_is_superuser
\else
  \echo 'Role-boundary configuration must run as a local PostgreSQL administrator'
  \quit 65
\endif

SELECT :'migration_role' <> :'runtime_role'
  AND :'current_owner_role' !~ '^pg_'
  AND :'migration_role' !~ '^pg_'
  AND :'runtime_role' !~ '^pg_'
  AND NOT EXISTS (
    SELECT 1
    FROM pg_roles
    WHERE rolname IN (:'current_owner_role', :'migration_role', :'runtime_role')
      AND rolsuper
  )
  AND NOT EXISTS (
    SELECT 1
    FROM pg_auth_members memberships
    JOIN pg_roles member_role ON member_role.oid = memberships.member
    WHERE member_role.rolname IN (:'current_owner_role', :'migration_role', :'runtime_role')
  )
  AND (SELECT COUNT(DISTINCT rolname)
       FROM pg_roles
       WHERE rolname IN (:'current_owner_role', :'migration_role', :'runtime_role')) =
      CASE WHEN :'current_owner_role' = :'migration_role' THEN 2 ELSE 3 END
  AS safe_roles \gset
\if :safe_roles
\else
  \echo 'Roles must exist, migration/runtime must differ, and application roles must not be superusers or pg_* roles'
  \quit 66
\endif

SELECT :'current_owner_role' = :'migration_role'
  OR (
    NOT EXISTS (
      SELECT 1
      FROM pg_database d
      JOIN pg_roles r ON r.oid = d.datdba
      WHERE r.rolname = :'current_owner_role' AND d.datname <> :'app_database'
    )
    AND NOT EXISTS (
      SELECT 1
      FROM pg_tablespace t
      JOIN pg_roles r ON r.oid = t.spcowner
      WHERE r.rolname = :'current_owner_role'
    )
  ) AS ownership_scope_safe \gset
\if :ownership_scope_safe
\else
  \echo 'Current owner also owns another database or tablespace; refusing broad REASSIGN OWNED'
  \quit 67
\endif

ALTER ROLE :"migration_role" NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
ALTER ROLE :"runtime_role" NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;

SELECT :'current_owner_role' = :'migration_role' AS ownership_already_migrated \gset
\if :ownership_already_migrated
\else
  REASSIGN OWNED BY :"current_owner_role" TO :"migration_role";
\endif

ALTER DATABASE :"app_database" OWNER TO :"migration_role";
ALTER SCHEMA public OWNER TO :"migration_role";

REVOKE CREATE, TEMPORARY ON DATABASE :"app_database" FROM PUBLIC;
REVOKE ALL PRIVILEGES ON DATABASE :"app_database" FROM :"runtime_role";
GRANT CONNECT ON DATABASE :"app_database" TO :"runtime_role";

REVOKE ALL ON SCHEMA public FROM PUBLIC;
REVOKE ALL ON SCHEMA public FROM :"runtime_role";
GRANT USAGE ON SCHEMA public TO :"runtime_role";

REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM PUBLIC;
REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM :"runtime_role";
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO :"runtime_role";

REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public FROM PUBLIC;
REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public FROM :"runtime_role";
GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public TO :"runtime_role";

ALTER DEFAULT PRIVILEGES FOR ROLE :"migration_role" IN SCHEMA public
  REVOKE ALL ON TABLES FROM PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE :"migration_role" IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO :"runtime_role";
ALTER DEFAULT PRIVILEGES FOR ROLE :"migration_role" IN SCHEMA public
  REVOKE ALL ON SEQUENCES FROM PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE :"migration_role" IN SCHEMA public
  GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO :"runtime_role";

\if :ownership_already_migrated
\else
  ALTER ROLE :"current_owner_role" NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
  REVOKE ALL PRIVILEGES ON DATABASE :"app_database" FROM :"current_owner_role";
  GRANT CONNECT ON DATABASE :"app_database" TO :"current_owner_role";
  REVOKE ALL ON SCHEMA public FROM :"current_owner_role";
  GRANT USAGE ON SCHEMA public TO :"current_owner_role";
  REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM :"current_owner_role";
  GRANT SELECT ON ALL TABLES IN SCHEMA public TO :"current_owner_role";
  REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public FROM :"current_owner_role";
  GRANT SELECT ON ALL SEQUENCES IN SCHEMA public TO :"current_owner_role";
  ALTER DEFAULT PRIVILEGES FOR ROLE :"migration_role" IN SCHEMA public
    GRANT SELECT ON TABLES TO :"current_owner_role";
  ALTER DEFAULT PRIVILEGES FOR ROLE :"migration_role" IN SCHEMA public
    GRANT SELECT ON SEQUENCES TO :"current_owner_role";
\endif

SELECT to_regclass('public._prisma_migrations') IS NOT NULL AS has_prisma_migrations \gset
\if :has_prisma_migrations
  REVOKE ALL PRIVILEGES ON TABLE public._prisma_migrations FROM :"runtime_role";
\endif

\echo 'database_role_boundaries_configured'
