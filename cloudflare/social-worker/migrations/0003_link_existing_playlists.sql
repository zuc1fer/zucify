ALTER TABLE shared_playlists ADD COLUMN source_playlist_id TEXT;
ALTER TABLE shared_playlist_tracks ADD COLUMN source_item_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS shared_playlists_source_playlist
  ON shared_playlists(source_playlist_id);

CREATE UNIQUE INDEX IF NOT EXISTS shared_playlist_tracks_source_item
  ON shared_playlist_tracks(playlist_id, source_item_id);
