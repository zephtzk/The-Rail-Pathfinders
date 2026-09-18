-- Apply with: npx wrangler d1 migrations apply commute-copilot-sharing --remote
-- A bounded pilot document gives every revision, consent, outbox and rate-limit
-- change one atomic compare-and-swap. See docs/SHARING.md for pilot limits.
CREATE TABLE IF NOT EXISTS sharing_state (
  id TEXT PRIMARY KEY,
  revision INTEGER NOT NULL CHECK(revision > 0),
  body TEXT NOT NULL CHECK(json_valid(body))
);
