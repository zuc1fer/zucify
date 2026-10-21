CREATE TABLE IF NOT EXISTS social_users (
  id TEXT PRIMARY KEY,
  username TEXT,
  display_name TEXT,
  avatar_url TEXT,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS friend_requests (
  id TEXT PRIMARY KEY,
  from_id TEXT NOT NULL,
  to_id TEXT NOT NULL,
  from_username TEXT,
  from_display_name TEXT,
  from_avatar_url TEXT,
  to_username TEXT,
  to_display_name TEXT,
  to_avatar_url TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined')),
  created_at INTEGER NOT NULL,
  UNIQUE(from_id, to_id)
);

CREATE INDEX IF NOT EXISTS friend_requests_to_status ON friend_requests(to_id, status, created_at);
CREATE INDEX IF NOT EXISTS friend_requests_from_status ON friend_requests(from_id, status, created_at);

CREATE TABLE IF NOT EXISTS friendships (
  user_low_id TEXT NOT NULL,
  user_high_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY(user_low_id, user_high_id),
  CHECK (user_low_id < user_high_id)
);

CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  from_id TEXT NOT NULL,
  to_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('text', 'song', 'playlist')),
  body TEXT,
  payload_json TEXT,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS messages_pair_created ON messages(from_id, to_id, created_at);
CREATE INDEX IF NOT EXISTS messages_reverse_pair_created ON messages(to_id, from_id, created_at);

CREATE TABLE IF NOT EXISTS shared_playlists (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  title TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS shared_playlist_members (
  playlist_id TEXT NOT NULL REFERENCES shared_playlists(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  added_at INTEGER NOT NULL,
  PRIMARY KEY(playlist_id, user_id)
);

CREATE TABLE IF NOT EXISTS shared_playlist_tracks (
  id TEXT PRIMARY KEY,
  playlist_id TEXT NOT NULL REFERENCES shared_playlists(id) ON DELETE CASCADE,
  added_by TEXT NOT NULL,
  position INTEGER NOT NULL,
  track_json TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS shared_playlist_tracks_order ON shared_playlist_tracks(playlist_id, position, created_at);

CREATE TABLE IF NOT EXISTS listening_sessions (
  id TEXT PRIMARY KEY,
  host_id TEXT NOT NULL,
  guest_id TEXT NOT NULL,
  track_json TEXT NOT NULL,
  position_ms INTEGER NOT NULL DEFAULT 0,
  playback_status TEXT NOT NULL DEFAULT 'playing' CHECK (playback_status IN ('playing', 'paused')),
  status TEXT NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting', 'active', 'ended')),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS listening_sessions_participants ON listening_sessions(host_id, guest_id, status, created_at);

CREATE TABLE IF NOT EXISTS websocket_tickets (
  token_hash TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  used INTEGER NOT NULL DEFAULT 0
);
