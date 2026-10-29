import {
  AVAILABILITY_STATUSES,
  CARE_STATUSES,
  PRIORITIES,
  RECORD_TYPES,
  REFERRAL_STATUSES,
  REVIEW_STATUSES,
  ROLES,
  SERVICE_TYPES,
  SOURCE_TYPES,
  SUPPORT_REQUEST_STATUSES,
  SUPPORT_REQUEST_TYPES,
  TASK_STATUSES,
  TASK_TYPES,
  VISIT_STATUSES,
} from "../../../domain/constants";

const list = (values: readonly string[]) => values.map((v) => `'${v}'`).join(", ");

export const version = "001_init";

export const up = `
CREATE TABLE regions (
  id text PRIMARY KEY,
  parent_id text REFERENCES regions(id),
  name text NOT NULL,
  region_code text NOT NULL UNIQUE,
  level text NOT NULL CHECK (level IN ('sido', 'sigungu', 'eupmyeondong')),
  boundary_geojson jsonb,
  is_demo_data boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX regions_parent_idx ON regions(parent_id);

CREATE TABLE service_providers (
  id text PRIMARY KEY,
  region_id text NOT NULL REFERENCES regions(id),
  name text NOT NULL,
  service_types text[] NOT NULL DEFAULT '{}',
  address_label text NOT NULL,
  latitude double precision,
  longitude double precision,
  availability_status text NOT NULL DEFAULT 'unknown' CHECK (availability_status IN (${list(AVAILABILITY_STATUSES)})),
  contact_label text NOT NULL,
  is_demo_data boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX service_providers_region_idx ON service_providers(region_id);

CREATE TABLE users (
  id text PRIMARY KEY,
  name text NOT NULL,
  email text NOT NULL UNIQUE,
  role text NOT NULL CHECK (role IN (${list(ROLES)})),
  region_id text REFERENCES regions(id),
  provider_id text REFERENCES service_providers(id),
  is_active boolean NOT NULL DEFAULT true,
  is_demo_data boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE care_recipients (
  id text PRIMARY KEY,
  display_code text NOT NULL UNIQUE,
  display_name text NOT NULL,
  age_band text,
  region_id text NOT NULL REFERENCES regions(id),
  assigned_user_id text REFERENCES users(id),
  care_status text NOT NULL DEFAULT 'active' CHECK (care_status IN (${list(CARE_STATUSES)})),
  needs text[] NOT NULL DEFAULT '{}',
  attributes jsonb NOT NULL DEFAULT '{}',
  staff_note text,
  next_check_at timestamptz,
  is_demo_data boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX care_recipients_region_idx ON care_recipients(region_id);
CREATE INDEX care_recipients_assigned_idx ON care_recipients(assigned_user_id);
CREATE INDEX care_recipients_status_idx ON care_recipients(care_status);

ALTER TABLE users ADD COLUMN recipient_id text REFERENCES care_recipients(id);

CREATE TABLE service_catalog (
  id text PRIMARY KEY,
  provider_id text NOT NULL REFERENCES service_providers(id),
  name text NOT NULL,
  service_type text NOT NULL CHECK (service_type IN (${list(SERVICE_TYPES)})),
  service_region_ids text[] NOT NULL DEFAULT '{}',
  eligibility_rules jsonb NOT NULL DEFAULT '{}',
  description text NOT NULL DEFAULT '',
  application_method text NOT NULL,
  schedule_label text NOT NULL DEFAULT '',
  is_operating boolean NOT NULL DEFAULT true,
  capacity_status text NOT NULL DEFAULT 'unknown' CHECK (capacity_status IN (${list(AVAILABILITY_STATUSES)})),
  capacity_verified boolean NOT NULL DEFAULT false,
  contact_method text NOT NULL,
  data_source text NOT NULL,
  source_updated_at timestamptz NOT NULL DEFAULT now(),
  is_demo_data boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX service_catalog_type_idx ON service_catalog(service_type);
CREATE INDEX service_catalog_provider_idx ON service_catalog(provider_id);

CREATE TABLE service_referrals (
  id text PRIMARY KEY,
  recipient_id text NOT NULL REFERENCES care_recipients(id),
  service_id text NOT NULL REFERENCES service_catalog(id),
  provider_id text NOT NULL REFERENCES service_providers(id),
  status text NOT NULL DEFAULT 'requested' CHECK (status IN (${list(REFERRAL_STATUSES)})),
  referred_by text REFERENCES users(id),
  referred_at timestamptz NOT NULL DEFAULT now(),
  status_changed_at timestamptz NOT NULL DEFAULT now(),
  failure_reason text,
  result_note text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (status <> 'failed' OR failure_reason IS NOT NULL)
);
CREATE INDEX service_referrals_recipient_idx ON service_referrals(recipient_id);
CREATE INDEX service_referrals_provider_idx ON service_referrals(provider_id);
CREATE INDEX service_referrals_status_idx ON service_referrals(status);

CREATE TABLE care_records (
  id text PRIMARY KEY,
  recipient_id text NOT NULL REFERENCES care_recipients(id),
  record_type text NOT NULL CHECK (record_type IN (${list(RECORD_TYPES)})),
  visit_status text CHECK (visit_status IN (${list(VISIT_STATUSES)})),
  scheduled_at timestamptz,
  recorded_at timestamptz NOT NULL,
  content text NOT NULL,
  flags text[] NOT NULL DEFAULT '{}',
  created_by text REFERENCES users(id),
  source_type text NOT NULL DEFAULT 'manual' CHECK (source_type IN (${list(SOURCE_TYPES)})),
  related_referral_id text REFERENCES service_referrals(id),
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (record_type = 'visit' OR visit_status IS NULL)
);
CREATE INDEX care_records_recipient_idx ON care_records(recipient_id, recorded_at DESC);

CREATE TABLE record_revisions (
  id bigserial PRIMARY KEY,
  record_id text NOT NULL REFERENCES care_records(id),
  previous jsonb NOT NULL,
  edited_by text REFERENCES users(id),
  edited_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX record_revisions_record_idx ON record_revisions(record_id);

CREATE TABLE risk_assessments (
  id text PRIMARY KEY,
  recipient_id text NOT NULL REFERENCES care_recipients(id),
  method text NOT NULL CHECK (method IN ('rules', 'rules+ai')),
  rule_version text NOT NULL,
  model_version text,
  score integer NOT NULL CHECK (score BETWEEN 0 AND 100),
  priority text NOT NULL CHECK (priority IN (${list([...PRIORITIES, "none"])})),
  detected_signals jsonb NOT NULL DEFAULT '[]',
  ai_status text NOT NULL CHECK (ai_status IN ('not_configured', 'succeeded', 'failed', 'skipped')),
  ai_result jsonb,
  ai_error text,
  source_record_ids text[] NOT NULL DEFAULT '{}',
  data_insufficient boolean NOT NULL DEFAULT false,
  window_start timestamptz NOT NULL,
  window_end timestamptz NOT NULL,
  review_status text NOT NULL DEFAULT 'pending' CHECK (review_status IN (${list(REVIEW_STATUSES)})),
  review_note text,
  reviewed_by text REFERENCES users(id),
  reviewed_at timestamptz,
  created_by text REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX risk_assessments_recipient_idx ON risk_assessments(recipient_id, created_at DESC);
CREATE INDEX risk_assessments_review_idx ON risk_assessments(review_status);

CREATE TABLE action_tasks (
  id text PRIMARY KEY,
  recipient_id text NOT NULL REFERENCES care_recipients(id),
  assessment_id text REFERENCES risk_assessments(id),
  record_id text REFERENCES care_records(id),
  referral_id text REFERENCES service_referrals(id),
  task_type text NOT NULL CHECK (task_type IN (${list(TASK_TYPES)})),
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  priority text NOT NULL CHECK (priority IN (${list(PRIORITIES)})),
  status text NOT NULL DEFAULT 'open' CHECK (status IN (${list(TASK_STATUSES)})),
  assignee_id text REFERENCES users(id),
  due_at timestamptz,
  completed_at timestamptz,
  result_note text,
  delay_reason text,
  created_by text REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (status <> 'completed' OR completed_at IS NOT NULL)
);
CREATE INDEX action_tasks_recipient_idx ON action_tasks(recipient_id);
CREATE INDEX action_tasks_assignee_idx ON action_tasks(assignee_id, status);
CREATE INDEX action_tasks_due_idx ON action_tasks(status, due_at);

CREATE TABLE voice_record_drafts (
  id text PRIMARY KEY,
  recipient_id text NOT NULL REFERENCES care_recipients(id),
  created_by text NOT NULL REFERENCES users(id),
  record_type text NOT NULL CHECK (record_type IN (${list(RECORD_TYPES)})),
  transcript text NOT NULL,
  transcript_source text NOT NULL CHECK (transcript_source IN ('browser_speech', 'typed')),
  structured_content jsonb,
  structuring_method text CHECK (structuring_method IN ('ai', 'rules')),
  review_status text NOT NULL DEFAULT 'draft' CHECK (review_status IN ('draft', 'saved', 'discarded')),
  saved_record_id text REFERENCES care_records(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE notifications (
  id text PRIMARY KEY,
  user_id text NOT NULL REFERENCES users(id),
  type text NOT NULL,
  title text NOT NULL,
  message text NOT NULL,
  link text,
  channel text NOT NULL DEFAULT 'in_app' CHECK (channel IN ('in_app')),
  dedupe_key text UNIQUE,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX notifications_user_idx ON notifications(user_id, read_at, created_at DESC);

CREATE TABLE notification_preferences (
  user_id text PRIMARY KEY REFERENCES users(id),
  in_app boolean NOT NULL DEFAULT true,
  schedule_reminders boolean NOT NULL DEFAULT true,
  request_updates boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE family_links (
  id text PRIMARY KEY,
  recipient_id text NOT NULL REFERENCES care_recipients(id),
  user_id text NOT NULL REFERENCES users(id),
  relationship_label text NOT NULL,
  consent_status text NOT NULL CHECK (consent_status IN ('pending', 'granted', 'revoked')),
  permissions jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  UNIQUE (recipient_id, user_id)
);

CREATE TABLE support_requests (
  id text PRIMARY KEY,
  recipient_id text NOT NULL REFERENCES care_recipients(id),
  created_by text NOT NULL REFERENCES users(id),
  request_type text NOT NULL CHECK (request_type IN (${list(SUPPORT_REQUEST_TYPES)})),
  title text NOT NULL,
  content text NOT NULL,
  related_referral_id text REFERENCES service_referrals(id),
  status text NOT NULL DEFAULT 'received' CHECK (status IN (${list(SUPPORT_REQUEST_STATUSES)})),
  assigned_user_id text REFERENCES users(id),
  response_content text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX support_requests_recipient_idx ON support_requests(recipient_id);

CREATE TABLE reports (
  id text PRIMARY KEY,
  period_start date NOT NULL,
  period_end date NOT NULL,
  region_id text REFERENCES regions(id),
  stats jsonb NOT NULL,
  narrative jsonb NOT NULL,
  narrative_method text NOT NULL CHECK (narrative_method IN ('ai', 'template')),
  validation jsonb NOT NULL DEFAULT '{}',
  is_demo_data boolean NOT NULL DEFAULT true,
  created_by text REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (period_end >= period_start)
);

CREATE TABLE audit_logs (
  id bigserial PRIMARY KEY,
  actor_id text REFERENCES users(id),
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id text NOT NULL,
  recipient_id text REFERENCES care_recipients(id),
  metadata jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_logs_entity_idx ON audit_logs(entity_type, entity_id);
CREATE INDEX audit_logs_recipient_idx ON audit_logs(recipient_id, created_at DESC);

CREATE TABLE id_counters (
  prefix text PRIMARY KEY,
  value integer NOT NULL
);
`;

export const down = `
DROP TABLE IF EXISTS id_counters;
DROP TABLE IF EXISTS audit_logs;
DROP TABLE IF EXISTS reports;
DROP TABLE IF EXISTS support_requests;
DROP TABLE IF EXISTS family_links;
DROP TABLE IF EXISTS notification_preferences;
DROP TABLE IF EXISTS notifications;
DROP TABLE IF EXISTS voice_record_drafts;
DROP TABLE IF EXISTS action_tasks;
DROP TABLE IF EXISTS risk_assessments;
DROP TABLE IF EXISTS record_revisions;
DROP TABLE IF EXISTS care_records;
DROP TABLE IF EXISTS service_referrals;
DROP TABLE IF EXISTS service_catalog;
ALTER TABLE users DROP COLUMN IF EXISTS recipient_id;
DROP TABLE IF EXISTS care_recipients;
DROP TABLE IF EXISTS users;
DROP TABLE IF EXISTS service_providers;
DROP TABLE IF EXISTS regions;
`;
