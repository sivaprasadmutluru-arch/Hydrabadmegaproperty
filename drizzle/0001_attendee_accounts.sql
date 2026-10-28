CREATE TABLE attendee_users (
 id TEXT PRIMARY KEY,
 name TEXT NOT NULL,
 email TEXT NOT NULL COLLATE NOCASE UNIQUE,
 phone TEXT NOT NULL,
 password_hash TEXT NOT NULL,
 salt TEXT NOT NULL,
 email_updates INTEGER NOT NULL DEFAULT 0,
 created_at TEXT NOT NULL,
 updated_at TEXT NOT NULL
);
ALTER TABLE registrations ADD COLUMN user_id TEXT REFERENCES attendee_users(id);
CREATE INDEX registrations_user_id ON registrations(user_id);
CREATE UNIQUE INDEX registrations_user_category ON registrations(user_id,category) WHERE user_id IS NOT NULL;
CREATE TABLE attendee_sessions (
 token_hash TEXT PRIMARY KEY,
 user_id TEXT NOT NULL REFERENCES attendee_users(id) ON DELETE CASCADE,
 expires_at INTEGER NOT NULL
);
CREATE INDEX attendee_sessions_expiry ON attendee_sessions(expires_at);
CREATE TABLE attendee_notifications (
 id TEXT PRIMARY KEY,
 user_id TEXT NOT NULL REFERENCES attendee_users(id) ON DELETE CASCADE,
 registration_id TEXT REFERENCES registrations(id) ON DELETE CASCADE,
 title TEXT NOT NULL,
 body TEXT NOT NULL,
 created_at TEXT NOT NULL,
 read_at TEXT
);
CREATE INDEX attendee_notifications_user ON attendee_notifications(user_id,created_at);
