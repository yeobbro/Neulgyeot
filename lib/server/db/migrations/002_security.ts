export const version = "002_security";

/**
 * 2026-11-06 review — server-side session revocation and append-only audit log (PGlite demo DB / local tests only).
 *  - revoked_sessions: logout stores the token's jti so a copied cookie stops working before it expires.
 *  - audit_logs: UPDATE / DELETE are rejected by a trigger; only the explicit demo reset (scripts/db.ts reset) may purge,
 *    by setting the transaction-local flag neulgyeot.allow_audit_purge = 'on'.
 */
export const up = `
CREATE TABLE IF NOT EXISTS revoked_sessions (
  jti text PRIMARY KEY,
  user_id text,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS revoked_sessions_expires_idx ON revoked_sessions(expires_at);

-- single line on purpose: the migration runner splits statements at a semicolon followed by a line break
CREATE OR REPLACE FUNCTION audit_logs_append_only() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF TG_OP = 'DELETE' AND current_setting('neulgyeot.allow_audit_purge', true) = 'on' THEN RETURN OLD; END IF; RAISE EXCEPTION 'audit_logs is append-only'; END $$;
DROP TRIGGER IF EXISTS audit_logs_append_only ON audit_logs;
CREATE TRIGGER audit_logs_append_only BEFORE UPDATE OR DELETE ON audit_logs FOR EACH ROW EXECUTE FUNCTION audit_logs_append_only();
`;

export const down = `
DROP TRIGGER IF EXISTS audit_logs_append_only ON audit_logs;
DROP FUNCTION IF EXISTS audit_logs_append_only();
DROP TABLE IF EXISTS revoked_sessions;
`;
