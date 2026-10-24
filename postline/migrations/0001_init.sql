-- Postline schema. All timestamps are UTC ISO 8601 strings ending in "Z".

CREATE TABLE posts (
  id                 TEXT PRIMARY KEY,
  text               TEXT NOT NULL,
  -- 'publishing' is internal: the row is locked while a LinkedIn call is in flight.
  status             TEXT NOT NULL CHECK (status IN ('draft','planned','scheduled','publishing','published','error')),
  scheduled_at       TEXT,
  published_at       TEXT,
  linkedin_post_urn  TEXT,
  linkedin_post_url  TEXT,
  error_message      TEXT,
  publish_attempt_id TEXT,
  publish_started_at TEXT,
  created_at         TEXT NOT NULL,
  updated_at         TEXT NOT NULL
);
CREATE INDEX idx_posts_status_scheduled ON posts (status, scheduled_at);

CREATE TABLE queue_slots (
  weekday INTEGER NOT NULL CHECK (weekday BETWEEN 1 AND 7), -- ISO: 1=Mon .. 7=Sun
  time    TEXT    NOT NULL,                                 -- 'HH:MM' wall clock in settings.queue_timezone
  PRIMARY KEY (weekday, time)
);
INSERT INTO queue_slots (weekday, time) VALUES
  (1,'12:00'),(1,'17:00'),(2,'12:00'),(2,'17:00'),(3,'12:00'),
  (3,'17:00'),(4,'12:00'),(4,'17:00'),(5,'12:00'),(5,'17:00');

CREATE TABLE settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
INSERT INTO settings (key, value) VALUES ('queue_timezone', 'America/New_York');

-- Single row (id = 1). Tokens are AES-GCM encrypted with TOKEN_ENCRYPTION_KEY.
CREATE TABLE linkedin_auth (
  id                       INTEGER PRIMARY KEY CHECK (id = 1),
  member_urn               TEXT NOT NULL,
  member_name              TEXT,
  access_token_enc         TEXT NOT NULL,
  access_token_expires_at  TEXT NOT NULL,
  refresh_token_enc        TEXT,
  refresh_token_expires_at TEXT,
  scope                    TEXT,
  updated_at               TEXT NOT NULL
);
