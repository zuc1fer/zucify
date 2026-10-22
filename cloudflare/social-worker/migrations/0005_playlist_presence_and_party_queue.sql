CREATE TABLE IF NOT EXISTS shared_playlist_presence (
  playlist_id TEXT NOT NULL REFERENCES shared_playlists(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  track_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('playing', 'paused')),
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (playlist_id, user_id)
);

CREATE INDEX IF NOT EXISTS shared_playlist_presence_fresh
  ON shared_playlist_presence(playlist_id, updated_at);

CREATE TABLE IF NOT EXISTS listening_session_tracks (
  session_id TEXT NOT NULL REFERENCES listening_sessions(id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  track_id TEXT NOT NULL,
  track_json TEXT NOT NULL,
  PRIMARY KEY (session_id, position)
);

CREATE INDEX IF NOT EXISTS listening_session_tracks_track
  ON listening_session_tracks(session_id, track_id);
