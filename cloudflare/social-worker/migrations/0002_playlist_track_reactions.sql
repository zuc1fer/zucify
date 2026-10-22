CREATE TABLE IF NOT EXISTS shared_playlist_track_reactions (
  playlist_id TEXT NOT NULL REFERENCES shared_playlists(id) ON DELETE CASCADE,
  track_id TEXT NOT NULL REFERENCES shared_playlist_tracks(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  emoji TEXT NOT NULL CHECK (emoji IN ('❤️', '🔥', '😍', '😂', '👏')),
  created_at INTEGER NOT NULL,
  PRIMARY KEY(track_id, user_id, emoji)
);

CREATE INDEX IF NOT EXISTS shared_playlist_track_reactions_playlist
  ON shared_playlist_track_reactions(playlist_id, track_id, emoji);
