ALTER TABLE listening_sessions ADD COLUMN shared_playlist_id TEXT REFERENCES shared_playlists(id);
ALTER TABLE listening_sessions ADD COLUMN party_type TEXT NOT NULL DEFAULT 'song'
  CHECK (party_type IN ('song', 'playlist', 'friends'));

CREATE TABLE IF NOT EXISTS listening_session_members (
  session_id TEXT NOT NULL REFERENCES listening_sessions(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('invited', 'active', 'left')),
  created_at INTEGER NOT NULL,
  PRIMARY KEY (session_id, user_id)
);

CREATE INDEX IF NOT EXISTS listening_session_members_user ON listening_session_members(user_id, status, session_id);

INSERT OR IGNORE INTO listening_session_members (session_id, user_id, status, created_at)
SELECT id, host_id, 'active', created_at FROM listening_sessions;

INSERT OR IGNORE INTO listening_session_members (session_id, user_id, status, created_at)
SELECT id, guest_id, CASE WHEN status = 'active' THEN 'active' ELSE 'invited' END, created_at
FROM listening_sessions;
