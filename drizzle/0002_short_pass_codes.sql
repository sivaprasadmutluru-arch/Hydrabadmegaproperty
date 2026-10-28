ALTER TABLE registrations ADD COLUMN short_code TEXT;
CREATE UNIQUE INDEX registrations_short_code_unique ON registrations(short_code) WHERE short_code IS NOT NULL;
