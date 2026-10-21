interface Env {
  DB: any;
  LISTENING_ROOMS: any;
  LINER_API_URL?: string;
}

interface SocialUser {
  id: string;
  username?: string | null;
  displayName?: string | null;
  avatarUrl?: string | null;
}

const ROOM_RECONNECT_GRACE_MS = 60_000;
const MAX_PLAYLIST_TRACKS = 250;
const MAX_PLAYLIST_MEMBERS = 25;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
  "Access-Control-Max-Age": "86400",
};

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json; charset=utf-8" },
  });
}

function error(message: string, status = 400): Response {
  return json({ error: message }, status);
}

function string(value: unknown, maxLength = 200): string | null {
  if (typeof value !== "string") return null;
  const clean = value.trim();
  return clean.length > 0 && clean.length <= maxLength ? clean : null;
}

function parseTrack(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const track = value as Record<string, unknown>;
  if (!string(track.id, 300) || !string(track.title, 300)) return null;
  const albumValue = track.album && typeof track.album === "object" && !Array.isArray(track.album)
    ? track.album as Record<string, unknown>
    : null;
  const album = albumValue
    ? { id: string(albumValue.id, 300) ?? "", title: string(albumValue.title, 300) ?? "" }
    : undefined;
  const artistList = Array.isArray(track.artistList)
    ? track.artistList.slice(0, 20).flatMap((artist: unknown) => {
      if (!artist || typeof artist !== "object" || Array.isArray(artist)) return [];
      const item = artist as Record<string, unknown>;
      const name = string(item.name, 300);
      return name ? [{ id: string(item.id, 300) ?? undefined, name }] : [];
    })
    : undefined;
  return {
    id: track.id,
    title: track.title,
    artists: string(track.artists, 500) ?? "Unknown artist",
    artistId: string(track.artistId, 300) ?? undefined,
    coverUrl: string(track.coverUrl, 2000) ?? "",
    durationMs: Number.isFinite(track.durationMs) ? Math.max(0, Math.min(Number(track.durationMs), 24 * 60 * 60 * 1000)) : 0,
    playCount: Number.isFinite(track.playCount) ? Math.max(0, Number(track.playCount)) : 0,
    explicit: track.explicit === true,
    album,
    artistList,
  };
}

function safeParse(value: string | null | undefined): unknown {
  if (!value) return null;
  try { return JSON.parse(value); } catch { return null; }
}

async function currentUser(request: Request, env: Env): Promise<SocialUser | Response> {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();
  if (!token) return error("Sign in to use Friends.", 401);

  const baseUrl = (env.LINER_API_URL || "https://api.tryliner.fun").replace(/\/+$/, "");
  let profileResponse: Response;
  try {
    profileResponse = await fetch(`${baseUrl}/v1/me`, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    });
  } catch {
    return error("Could not verify your Zucify account right now.", 503);
  }
  if (!profileResponse.ok) {
    if (profileResponse.status === 401 || profileResponse.status === 403) {
      return error("Your sign-in has expired. Sign in again.", 401);
    }
    if (profileResponse.status === 429 || profileResponse.status >= 500) {
      return error("The account service is temporarily unavailable. Try again shortly.", 503);
    }
    return error("The account service could not verify your account.", 502);
  }

  const payload = await profileResponse.json().catch(() => null) as any;
  const profile = payload?.user && typeof payload.user === "object" ? payload.user : payload;
  if (!profile || typeof profile.id !== "string" || !profile.id.trim()) {
    return error("The account service returned an invalid profile.", 502);
  }
  const user: SocialUser = {
    id: profile.id,
    username: typeof profile.username === "string" ? profile.username : null,
    displayName: typeof profile.displayName === "string" ? profile.displayName : null,
    avatarUrl: typeof profile.avatarUrl === "string" ? profile.avatarUrl : null,
  };
  await env.DB.prepare(
    `INSERT INTO social_users (id, username, display_name, avatar_url, updated_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET username=excluded.username, display_name=excluded.display_name,
       avatar_url=excluded.avatar_url, updated_at=excluded.updated_at`,
  ).bind(user.id, user.username ?? null, user.displayName ?? null, user.avatarUrl ?? null, Date.now()).run();
  return user;
}

function isResponse(value: SocialUser | Response): value is Response {
  return value instanceof Response;
}

function personFromRequest(row: any, prefix: "from" | "to"): SocialUser {
  return {
    id: row[`${prefix}_id`],
    username: row[`${prefix}_username`],
    displayName: row[`${prefix}_display_name`],
    avatarUrl: row[`${prefix}_avatar_url`],
  };
}

async function areFriends(env: Env, firstId: string, secondId: string): Promise<boolean> {
  const [low, high] = [firstId, secondId].sort();
  return Boolean(await env.DB.prepare(
    "SELECT 1 AS ok FROM friendships WHERE user_low_id = ? AND user_high_id = ?",
  ).bind(low, high).first());
}

async function requireFriend(env: Env, userId: string, otherId: string): Promise<Response | null> {
  if (!otherId || userId === otherId) return error("Choose a valid friend.");
  if (!(await areFriends(env, userId, otherId))) return error("You can only message accepted friends.", 403);
  return null;
}

async function requirePlaylistMember(env: Env, playlistId: string, userId: string): Promise<Response | null> {
  const member = await env.DB.prepare(
    "SELECT 1 AS ok FROM shared_playlist_members WHERE playlist_id = ? AND user_id = ?",
  ).bind(playlistId, userId).first();
  return member ? null : error("You are not a member of this playlist.", 403);
}

function requestView(row: any, currentId: string) {
  return {
    id: row.id,
    status: row.status,
    direction: row.from_id === currentId ? "outgoing" : "incoming",
    from: personFromRequest(row, "from"),
    to: personFromRequest(row, "to"),
    createdAt: row.created_at,
  };
}

async function friends(env: Env, userId: string): Promise<Response> {
  const result = await env.DB.prepare(
    `SELECT u.id, u.username, u.display_name AS displayName, u.avatar_url AS avatarUrl
     FROM friendships f
     JOIN social_users u ON u.id = CASE WHEN f.user_low_id = ? THEN f.user_high_id ELSE f.user_low_id END
     WHERE f.user_low_id = ? OR f.user_high_id = ? ORDER BY COALESCE(u.display_name, u.username, u.id) COLLATE NOCASE`,
  ).bind(userId, userId, userId).all();
  return json({ items: result.results ?? [] });
}

async function requests(env: Env, userId: string): Promise<Response> {
  const result = await env.DB.prepare(
    `SELECT * FROM friend_requests WHERE status = 'pending' AND (from_id = ? OR to_id = ?)
     ORDER BY created_at DESC LIMIT 100`,
  ).bind(userId, userId).all();
  return json({ items: (result.results ?? []).map((row: any) => requestView(row, userId)) });
}

async function playlists(env: Env, userId: string): Promise<Response> {
  const result = await env.DB.prepare(
    `SELECT p.id, p.owner_id AS ownerId, p.title, p.created_at AS createdAt,
       (SELECT COUNT(*) FROM shared_playlist_tracks t WHERE t.playlist_id = p.id) AS trackCount
     FROM shared_playlists p JOIN shared_playlist_members m ON m.playlist_id = p.id
     WHERE m.user_id = ? ORDER BY p.created_at DESC LIMIT 100`,
  ).bind(userId).all();
  const items = [];
  for (const row of result.results ?? []) {
    const [members, tracks] = await Promise.all([
      env.DB.prepare(
        `SELECT u.id, u.username, u.display_name AS displayName, u.avatar_url AS avatarUrl
         FROM shared_playlist_members m LEFT JOIN social_users u ON u.id = m.user_id
         WHERE m.playlist_id = ? ORDER BY m.added_at`,
      ).bind(row.id).all(),
      env.DB.prepare(
        "SELECT id, added_by AS addedBy, track_json AS trackJson, created_at AS createdAt FROM shared_playlist_tracks WHERE playlist_id = ? ORDER BY position, created_at LIMIT ?",
      ).bind(row.id, MAX_PLAYLIST_TRACKS).all(),
    ]);
    items.push({
      ...row,
      members: members.results ?? [],
      tracks: (tracks.results ?? []).map((track: any) => ({
        id: track.id, addedBy: track.addedBy, createdAt: track.createdAt, track: safeParse(track.trackJson),
      })),
    });
  }
  return json({ items });
}

async function listeningSessions(env: Env, userId: string): Promise<Response> {
  const result = await env.DB.prepare(
    `SELECT s.id, s.host_id AS hostId, s.guest_id AS guestId, s.track_json AS trackJson,
       s.position_ms AS positionMs, s.playback_status AS playbackStatus, s.status,
       s.created_at AS createdAt, s.updated_at AS updatedAt,
       host.username AS hostUsername, host.display_name AS hostDisplayName, host.avatar_url AS hostAvatarUrl,
       guest.username AS guestUsername, guest.display_name AS guestDisplayName, guest.avatar_url AS guestAvatarUrl
     FROM listening_sessions s
     LEFT JOIN social_users host ON host.id = s.host_id
     LEFT JOIN social_users guest ON guest.id = s.guest_id
     WHERE (s.host_id = ? OR s.guest_id = ?) AND s.status != 'ended' AND s.updated_at > ?
     ORDER BY s.updated_at DESC LIMIT 30`,
  ).bind(userId, userId, Date.now() - 12 * 60 * 60 * 1000).all();
  return json({ items: (result.results ?? []).map((row: any) => ({
    id: row.id, hostId: row.hostId, guestId: row.guestId,
    host: { id: row.hostId, username: row.hostUsername, displayName: row.hostDisplayName, avatarUrl: row.hostAvatarUrl },
    guest: { id: row.guestId, username: row.guestUsername, displayName: row.guestDisplayName, avatarUrl: row.guestAvatarUrl },
    track: safeParse(row.trackJson), positionMs: row.positionMs, playbackStatus: row.playbackStatus,
    status: row.status, createdAt: row.createdAt, updatedAt: row.updatedAt,
  })) });
}

async function handleApi(request: Request, env: Env, user: SocialUser): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, "") || "/";
  const method = request.method.toUpperCase();

  if (method === "GET" && path === "/api/me") return json(user);
  if (method === "GET" && path === "/api/overview") {
    const [friendsResponse, requestsResponse, playlistsResponse, sessionsResponse] = await Promise.all([
      friends(env, user.id), requests(env, user.id), playlists(env, user.id), listeningSessions(env, user.id),
    ]);
    const [friendData, requestData, playlistData, sessionData] = await Promise.all([
      friendsResponse.json(), requestsResponse.json(), playlistsResponse.json(), sessionsResponse.json(),
    ]) as any[];
    return json({ friends: friendData.items, requests: requestData.items, playlists: playlistData.items, sessions: sessionData.items });
  }
  if (method === "GET" && path === "/api/friends") return friends(env, user.id);
  if (method === "GET" && path === "/api/requests") return requests(env, user.id);
  if (method === "GET" && path === "/api/playlists") return playlists(env, user.id);
  if (method === "GET" && path === "/api/sessions") return listeningSessions(env, user.id);

  if (method === "POST" && path === "/api/requests") {
    const body = await request.json().catch(() => null) as any;
    const targetId = string(body?.user?.id, 300);
    if (!targetId || targetId === user.id) return error("Choose a different Zucify listener.");
    if (await areFriends(env, user.id, targetId)) return error("You are already friends.", 409);
    const duplicate = await env.DB.prepare(
      "SELECT id, status FROM friend_requests WHERE from_id = ? AND to_id = ?",
    ).bind(user.id, targetId).first();
    if (duplicate?.status === "pending") return error("A friend request is already waiting.", 409);
    const reverseRequest = await env.DB.prepare(
      "SELECT id FROM friend_requests WHERE from_id = ? AND to_id = ? AND status = 'pending'",
    ).bind(targetId, user.id).first();
    if (reverseRequest) return error("They have already sent you a request. Accept it below.", 409);
    const target = body.user as SocialUser;
    const id = crypto.randomUUID();
    const now = Date.now();
    await env.DB.prepare(
      `INSERT INTO friend_requests
       (id, from_id, to_id, from_username, from_display_name, from_avatar_url,
        to_username, to_display_name, to_avatar_url, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)
       ON CONFLICT(from_id, to_id) DO UPDATE SET id=excluded.id, status='pending', created_at=excluded.created_at,
         from_username=excluded.from_username, from_display_name=excluded.from_display_name, from_avatar_url=excluded.from_avatar_url,
         to_username=excluded.to_username, to_display_name=excluded.to_display_name, to_avatar_url=excluded.to_avatar_url`,
    ).bind(id, user.id, targetId, user.username ?? null, user.displayName ?? null, user.avatarUrl ?? null,
      string(target.username, 100), string(target.displayName, 200), string(target.avatarUrl, 2000), now).run();
    await env.DB.prepare(
      `INSERT INTO social_users (id, username, display_name, avatar_url, updated_at) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET username=excluded.username, display_name=excluded.display_name, avatar_url=excluded.avatar_url, updated_at=excluded.updated_at`,
    ).bind(targetId, string(target.username, 100), string(target.displayName, 200), string(target.avatarUrl, 2000), now).run();
    return json({ id, status: "pending" }, 201);
  }

  const requestAction = path.match(/^\/api\/requests\/([^/]+)\/(accept|decline)$/);
  if (method === "POST" && requestAction) {
    const [, requestId, action] = requestAction;
    const row = await env.DB.prepare(
      "SELECT * FROM friend_requests WHERE id = ? AND to_id = ? AND status = 'pending'",
    ).bind(requestId, user.id).first();
    if (!row) return error("That friend request is no longer waiting.", 404);
    if (action === "decline") {
      await env.DB.prepare("UPDATE friend_requests SET status='declined' WHERE id=?").bind(requestId).run();
      return json({ ok: true });
    }
    const [low, high] = [row.from_id, row.to_id].sort();
    const now = Date.now();
    await env.DB.batch([
      env.DB.prepare("UPDATE friend_requests SET status='accepted' WHERE id=? AND status='pending'").bind(requestId),
      env.DB.prepare("INSERT OR IGNORE INTO friendships (user_low_id, user_high_id, created_at) VALUES (?, ?, ?)").bind(low, high, now),
      env.DB.prepare(
        `INSERT INTO social_users (id, username, display_name, avatar_url, updated_at) VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET username=COALESCE(excluded.username, username), display_name=COALESCE(excluded.display_name, display_name), avatar_url=COALESCE(excluded.avatar_url, avatar_url), updated_at=excluded.updated_at`,
      ).bind(row.from_id, row.from_username, row.from_display_name, row.from_avatar_url, now),
    ]);
    return json({ ok: true });
  }

  const friendPath = path.match(/^\/api\/friends\/([^/]+)$/);
  if (method === "DELETE" && friendPath) {
    const otherId = decodeURIComponent(friendPath[1]);
    const [low, high] = [user.id, otherId].sort();
    await env.DB.prepare("DELETE FROM friendships WHERE user_low_id=? AND user_high_id=?").bind(low, high).run();
    return json({ ok: true });
  }

  if (method === "GET" && path === "/api/messages") {
    const otherId = url.searchParams.get("with") ?? "";
    const denied = await requireFriend(env, user.id, otherId);
    if (denied) return denied;
    const result = await env.DB.prepare(
      `SELECT id, from_id AS fromId, to_id AS toId, kind, body, payload_json AS payloadJson, created_at AS createdAt
       FROM messages WHERE (from_id=? AND to_id=?) OR (from_id=? AND to_id=?) ORDER BY created_at DESC LIMIT 100`,
    ).bind(user.id, otherId, otherId, user.id).all();
    return json({ items: (result.results ?? []).reverse().map((row: any) => ({ ...row, payload: safeParse(row.payloadJson) })) });
  }

  if (method === "POST" && path === "/api/messages") {
    const body = await request.json().catch(() => null) as any;
    const otherId = string(body?.toUserId, 300);
    if (!otherId) return error("Choose a friend.");
    const denied = await requireFriend(env, user.id, otherId);
    if (denied) return denied;
    const kind = body?.kind;
    if (kind !== "text" && kind !== "song" && kind !== "playlist") return error("Unsupported message type.");
    const messageText = kind === "text" ? string(body?.body, 2000) : null;
    if (kind === "text" && !messageText) return error("Write a message first.");
    let payload: unknown = null;
    if (kind === "song") {
      const track = parseTrack(body?.payload?.track);
      if (!track) return error("Choose a valid song to share.");
      payload = { track };
    } else if (kind === "playlist") {
      const playlistId = string(body?.payload?.playlistId, 100);
      if (!playlistId) return error("Choose a playlist to share.");
      const member = await env.DB.prepare(
        "SELECT 1 AS ok FROM shared_playlist_members WHERE playlist_id=? AND user_id=?",
      ).bind(playlistId, user.id).first();
      if (!member) return error("You are not a member of that playlist.", 403);
      payload = { playlistId };
    }
    const id = crypto.randomUUID();
    const now = Date.now();
    const statements = [];
    if (kind === "playlist") {
      statements.push(env.DB.prepare("INSERT OR IGNORE INTO shared_playlist_members (playlist_id, user_id, added_at) VALUES (?, ?, ?)")
        .bind((payload as { playlistId: string }).playlistId, otherId, now));
    }
    statements.push(env.DB.prepare(
      "INSERT INTO messages (id, from_id, to_id, kind, body, payload_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    ).bind(id, user.id, otherId, kind, messageText, payload ? JSON.stringify(payload) : null, now));
    await env.DB.batch(statements);
    return json({ id, fromId: user.id, toId: otherId, kind, body: messageText, payload, createdAt: now }, 201);
  }

  if (method === "POST" && path === "/api/playlists") {
    const body = await request.json().catch(() => null) as any;
    const title = string(body?.title, 100);
    const memberIds = Array.isArray(body?.memberIds) ? [...new Set(body.memberIds.filter((id: unknown) => typeof id === "string" && id !== user.id).slice(0, 8))] : [];
    if (!title) return error("Give the playlist a name.");
    for (const id of memberIds) {
      const denied = await requireFriend(env, user.id, id);
      if (denied) return denied;
    }
    const id = crypto.randomUUID();
    const now = Date.now();
    await env.DB.prepare("INSERT INTO shared_playlists (id, owner_id, title, created_at) VALUES (?, ?, ?, ?)").bind(id, user.id, title, now).run();
    const memberStatements = [user.id, ...memberIds].map((memberId) =>
      env.DB.prepare("INSERT INTO shared_playlist_members (playlist_id, user_id, added_at) VALUES (?, ?, ?)").bind(id, memberId, now),
    );
    await env.DB.batch(memberStatements);
    return json({ id, ownerId: user.id, title, createdAt: now }, 201);
  }

  const playlistMembersPath = path.match(/^\/api\/playlists\/([^/]+)\/members$/);
  if (method === "POST" && playlistMembersPath) {
    const playlistId = decodeURIComponent(playlistMembersPath[1]);
    const denied = await requirePlaylistMember(env, playlistId, user.id);
    if (denied) return denied;
    const body = await request.json().catch(() => null) as any;
    const memberId = string(body?.memberId, 300);
    if (!memberId || memberId === user.id) return error("Choose a valid friend.");
    const friendDenied = await requireFriend(env, user.id, memberId);
    if (friendDenied) return friendDenied;
    const existing = await env.DB.prepare("SELECT 1 AS ok FROM shared_playlist_members WHERE playlist_id=? AND user_id=?")
      .bind(playlistId, memberId).first();
    if (!existing) {
      const count = await env.DB.prepare("SELECT COUNT(*) AS count FROM shared_playlist_members WHERE playlist_id=?")
        .bind(playlistId).first();
      if (Number(count?.count ?? 0) >= MAX_PLAYLIST_MEMBERS) return error(`A shared playlist can have up to ${MAX_PLAYLIST_MEMBERS} members.`, 409);
    }
    await env.DB.prepare("INSERT OR IGNORE INTO shared_playlist_members (playlist_id, user_id, added_at) VALUES (?, ?, ?)")
      .bind(playlistId, memberId, Date.now()).run();
    return json({ ok: true });
  }

  const playlistTrackPath = path.match(/^\/api\/playlists\/([^/]+)\/tracks$/);
  if (method === "POST" && playlistTrackPath) {
    const playlistId = decodeURIComponent(playlistTrackPath[1]);
    const denied = await requirePlaylistMember(env, playlistId, user.id);
    if (denied) return denied;
    const body = await request.json().catch(() => null) as any;
    const track = parseTrack(body?.track);
    if (!track) return error("Choose a valid song.");
    const count = await env.DB.prepare("SELECT COUNT(*) AS count FROM shared_playlist_tracks WHERE playlist_id=?")
      .bind(playlistId).first();
    if (Number(count?.count ?? 0) >= MAX_PLAYLIST_TRACKS) return error(`A shared playlist can have up to ${MAX_PLAYLIST_TRACKS} songs.`, 409);
    const last = await env.DB.prepare("SELECT COALESCE(MAX(position), -1) AS position FROM shared_playlist_tracks WHERE playlist_id=?").bind(playlistId).first();
    const id = crypto.randomUUID();
    const now = Date.now();
    await env.DB.prepare(
      "INSERT INTO shared_playlist_tracks (id, playlist_id, added_by, position, track_json, created_at) VALUES (?, ?, ?, ?, ?, ?)",
    ).bind(id, playlistId, user.id, Number(last?.position ?? -1) + 1, JSON.stringify(track), now).run();
    return json({ id, addedBy: user.id, track, createdAt: now }, 201);
  }

  const deleteTrackPath = path.match(/^\/api\/playlists\/([^/]+)\/tracks\/([^/]+)$/);
  if (method === "DELETE" && deleteTrackPath) {
    const playlistId = decodeURIComponent(deleteTrackPath[1]);
    const itemId = decodeURIComponent(deleteTrackPath[2]);
    const denied = await requirePlaylistMember(env, playlistId, user.id);
    if (denied) return denied;
    await env.DB.prepare("DELETE FROM shared_playlist_tracks WHERE id=? AND playlist_id=?").bind(itemId, playlistId).run();
    return json({ ok: true });
  }

  if (method === "POST" && path === "/api/sessions") {
    const body = await request.json().catch(() => null) as any;
    const guestId = string(body?.guestId, 300);
    const track = parseTrack(body?.track);
    if (!guestId || !track) return error("Choose a friend and a song to start listening together.");
    const denied = await requireFriend(env, user.id, guestId);
    if (denied) return denied;
    const id = crypto.randomUUID();
    const now = Date.now();
    const positionMs = Number.isFinite(body?.positionMs) ? Math.max(0, Math.min(Number(body.positionMs), 24 * 60 * 60 * 1000)) : 0;
    const playbackStatus = body?.playbackStatus === "paused" ? "paused" : "playing";
    await env.DB.prepare(
      `INSERT INTO listening_sessions (id, host_id, guest_id, track_json, position_ms, playback_status, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 'waiting', ?, ?)`,
    ).bind(id, user.id, guestId, JSON.stringify(track), positionMs, playbackStatus, now, now).run();
    return json({ id, hostId: user.id, guestId, track, positionMs, playbackStatus, status: "waiting", createdAt: now }, 201);
  }

  const joinPath = path.match(/^\/api\/sessions\/([^/]+)\/join$/);
  if (method === "POST" && joinPath) {
    const sessionId = decodeURIComponent(joinPath[1]);
    const session = await env.DB.prepare("SELECT * FROM listening_sessions WHERE id=? AND status!='ended'").bind(sessionId).first();
    if (!session || (session.host_id !== user.id && session.guest_id !== user.id)) return error("That listening invitation is no longer available.", 404);
    await env.DB.prepare("UPDATE listening_sessions SET status='active', updated_at=? WHERE id=? AND status='waiting'").bind(Date.now(), sessionId).run();
    return json({ id: sessionId, hostId: session.host_id, guestId: session.guest_id, track: safeParse(session.track_json), positionMs: session.position_ms, playbackStatus: session.playback_status, status: "active" });
  }

  const ticketPath = path.match(/^\/api\/sessions\/([^/]+)\/ticket$/);
  if (method === "POST" && ticketPath) {
    const sessionId = decodeURIComponent(ticketPath[1]);
    const session = await env.DB.prepare("SELECT host_id, guest_id, status FROM listening_sessions WHERE id=?").bind(sessionId).first();
    if (!session || session.status === "ended" || (session.host_id !== user.id && session.guest_id !== user.id)) return error("That listening room has ended.", 404);
    const ticket = crypto.randomUUID() + crypto.randomUUID();
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(ticket));
    const hash = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
    await env.DB.prepare("INSERT INTO websocket_tickets (token_hash, session_id, user_id, expires_at) VALUES (?, ?, ?, ?)")
      .bind(hash, sessionId, user.id, Date.now() + 30_000).run();
    return json({ ticket, expiresInSeconds: 30 });
  }

  const leavePath = path.match(/^\/api\/sessions\/([^/]+)\/leave$/);
  if (method === "POST" && leavePath) {
    const sessionId = decodeURIComponent(leavePath[1]);
    const session = await env.DB.prepare("SELECT host_id, guest_id, status FROM listening_sessions WHERE id=?").bind(sessionId).first();
    if (!session || (session.host_id !== user.id && session.guest_id !== user.id)) return error("Listening room not found.", 404);
    if (session.status !== "ended") {
      await env.DB.prepare("UPDATE listening_sessions SET status='ended', updated_at=? WHERE id=?").bind(Date.now(), sessionId).run();
      const roomId = env.LISTENING_ROOMS.idFromName(sessionId);
      await env.LISTENING_ROOMS.get(roomId).fetch("https://room/close");
    }
    return json({ ok: true });
  }

  return error("Not found.", 404);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
    const url = new URL(request.url);
    const wsRoute = url.pathname.match(/^\/api\/sessions\/([^/]+)\/ws$/);
    if (wsRoute && request.method === "GET" && request.headers.get("upgrade")?.toLowerCase() === "websocket") {
      const ticket = url.searchParams.get("ticket");
      if (!ticket) return error("Missing room ticket.", 401);
      const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(ticket));
      const hash = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
      const consumed = await env.DB.prepare(
        "UPDATE websocket_tickets SET used=1 WHERE token_hash=? AND session_id=? AND used=0 AND expires_at>? RETURNING user_id",
      ).bind(hash, decodeURIComponent(wsRoute[1]), Date.now()).first();
      if (!consumed?.user_id) return error("This room ticket has expired. Try again.", 401);
      const roomId = env.LISTENING_ROOMS.idFromName(decodeURIComponent(wsRoute[1]));
      const upstream = new Request(request);
      upstream.headers.set("x-social-user", consumed.user_id);
      upstream.headers.set("x-session-id", decodeURIComponent(wsRoute[1]));
      return env.LISTENING_ROOMS.get(roomId).fetch(upstream);
    }

    if (!url.pathname.startsWith("/api/")) return json({ service: "Zucify Friends", ok: true });
    const user = await currentUser(request, env);
    if (isResponse(user)) return user;
    try {
      return await handleApi(request, env, user);
    } catch (err) {
      console.error("Zucify social request failed", err);
      return error("The social service had a problem. Please try again.", 500);
    }
  },
};

export class ListeningRoom {
  private readonly state: any;
  private readonly env: Env;

  constructor(state: any, env: Env) {
    this.state = state;
    this.env = env;
  }

  async fetch(request: Request): Promise<Response> {
    if (new URL(request.url).pathname === "/close") {
      await this.finish();
      return json({ ok: true });
    }
    if (request.headers.get("upgrade")?.toLowerCase() !== "websocket") return error("WebSocket upgrade required.", 426);
    const userId = request.headers.get("x-social-user");
    const sessionId = request.headers.get("x-session-id") || new URL(request.url).pathname.split("/").pop();
    if (!userId || !sessionId) return error("Room identity is missing.", 401);
    if (await this.state.storage.get("ended")) return error("This listening room has ended.", 404);

    const record = await this.env.DB.prepare("SELECT host_id, guest_id, track_json, position_ms, playback_status, status FROM listening_sessions WHERE id=?")
      .bind(sessionId).first();
    if (!record || record.status === "ended" || (record.host_id !== userId && record.guest_id !== userId)) return error("This listening room has ended.", 404);
    const snapshot = {
      hostId: record.host_id,
      track: safeParse(record.track_json),
      positionMs: Number(record.position_ms) || 0,
      status: record.playback_status === "paused" ? "paused" : "playing",
      updatedAt: Date.now(),
    };
    await this.state.storage.put("snapshot", snapshot);

    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];
    this.state.acceptWebSocket(server);
    server.serializeAttachment({ userId, sessionId });
    await this.state.storage.deleteAlarm();
    await this.state.storage.delete("disconnectDeadline");
    server.send(JSON.stringify({ type: "state", ...snapshot }));
    await this.broadcastPresence(sessionId);
    return new Response(null, { status: 101, webSocket: client });
  }

  async alarm(): Promise<void> {
    const sessionId = await this.state.storage.get("sessionId") as string | undefined;
    const deadline = await this.state.storage.get("disconnectDeadline");
    if (!sessionId || typeof deadline !== "number") return;
    if (deadline > Date.now()) {
      await this.state.storage.setAlarm(deadline);
      return;
    }
    const session = await this.env.DB.prepare("SELECT host_id, guest_id, status FROM listening_sessions WHERE id=?")
      .bind(sessionId).first();
    if (!session || session.status === "ended") {
      await this.finish(sessionId);
      return;
    }
    const connected = this.connectedUserIds();
    if (connected.has(session.host_id) && connected.has(session.guest_id)) {
      await this.state.storage.delete("disconnectDeadline");
      return;
    }
    await this.finish(sessionId);
  }

  async webSocketMessage(socket: any, message: string | ArrayBuffer): Promise<void> {
    if (typeof message !== "string" || message.length > 30_000) return;
    const attachment = socket.deserializeAttachment() as { userId?: string; sessionId?: string } | null;
    if (!attachment?.userId || !attachment.sessionId) return;
    let event: any;
    try { event = JSON.parse(message); } catch { return; }
    if (event?.type === "leave") {
      await this.finish();
      return;
    }
    if (event?.type === "control") {
      const session = await this.env.DB.prepare("SELECT host_id, status FROM listening_sessions WHERE id=?")
        .bind(attachment.sessionId).first();
      if (!session || session.status === "ended" || attachment.userId === session.host_id) return;
      const action = event.action;
      if (!action || !["play", "pause", "resume", "seek"].includes(action.type)) return;
      const control = action.type === "play"
        ? { type: "play", track: parseTrack(action.track) }
        : action.type === "seek"
          ? { type: "seek", positionMs: Math.max(0, Math.min(Number(action.positionMs) || 0, 24 * 60 * 60 * 1000)) }
          : { type: action.type };
      if (control.type === "play" && !control.track) return;
      for (const peer of this.state.getWebSockets()) {
        const peerData = peer.deserializeAttachment() as { userId?: string } | null;
        if (peerData?.userId === session.host_id) {
          try { peer.send(JSON.stringify({ type: "control", action: control })); } catch {}
        }
      }
      return;
    }
    if (event?.type !== "sync") return;
    const session = await this.env.DB.prepare("SELECT host_id, status FROM listening_sessions WHERE id=?")
      .bind(attachment.sessionId).first();
    if (!session || session.status === "ended" || attachment.userId !== session.host_id) return;
    const track = parseTrack(event.track);
    const positionMs = Number.isFinite(event.positionMs) ? Math.max(0, Math.min(Number(event.positionMs), 24 * 60 * 60 * 1000)) : 0;
    const status = event.status === "paused" ? "paused" : "playing";
    if (!track) return;
    const snapshot = { hostId: session.host_id, track, positionMs, status, updatedAt: Date.now() };
    await this.state.storage.put("snapshot", snapshot);
    await this.env.DB.prepare(
      "UPDATE listening_sessions SET track_json=?, position_ms=?, playback_status=?, updated_at=? WHERE id=? AND status!='ended'",
    ).bind(JSON.stringify(track), positionMs, status, snapshot.updatedAt, attachment.sessionId).run();
    this.broadcast({ type: "state", ...snapshot });
  }

  async webSocketClose(socket: any): Promise<void> {
    const attachment = socket.deserializeAttachment() as { sessionId?: string } | null;
    if (attachment?.sessionId) await this.scheduleDisconnect(attachment.sessionId);
  }

  async webSocketError(socket: any): Promise<void> {
    const attachment = socket.deserializeAttachment() as { sessionId?: string } | null;
    if (attachment?.sessionId) await this.scheduleDisconnect(attachment.sessionId);
  }

  private broadcast(message: unknown): void {
    const payload = JSON.stringify(message);
    for (const socket of this.state.getWebSockets()) {
      try { socket.send(payload); } catch {}
    }
  }

  private connectedUserIds(): Set<string> {
    const connected = new Set<string>();
    for (const socket of this.state.getWebSockets()) {
      if (socket.readyState !== WebSocket.OPEN) continue;
      const attachment = socket.deserializeAttachment() as { userId?: string } | null;
      if (attachment?.userId) connected.add(attachment.userId);
    }
    return connected;
  }

  private async broadcastPresence(sessionId: string): Promise<void> {
    const session = await this.env.DB.prepare("SELECT host_id, guest_id FROM listening_sessions WHERE id=?")
      .bind(sessionId).first();
    if (!session) return;
    const connected = this.connectedUserIds();
    const connectedCount = Number(connected.has(session.host_id)) + Number(connected.has(session.guest_id));
    await this.state.storage.put("sessionId", sessionId);
    this.broadcast({ type: "presence", connectedCount });
  }

  private async scheduleDisconnect(sessionId: string): Promise<void> {
    if (await this.state.storage.get("ended")) return;
    const deadline = Date.now() + ROOM_RECONNECT_GRACE_MS;
    await this.state.storage.put("sessionId", sessionId);
    await this.state.storage.put("disconnectDeadline", deadline);
    await this.state.storage.setAlarm(deadline);
    await this.broadcastPresence(sessionId);
  }

  private async finish(sessionId?: string): Promise<void> {
    if (await this.state.storage.get("ended")) return;
    await this.state.storage.put("ended", true);
    await this.state.storage.deleteAlarm();
    await this.state.storage.delete("disconnectDeadline");
    const sockets = this.state.getWebSockets();
    if (!sessionId) {
      sessionId = await this.state.storage.get("sessionId") as string | undefined;
    }
    if (!sessionId) {
      const first = sockets[0];
      const attachment = first?.deserializeAttachment?.() as { sessionId?: string } | null;
      sessionId = attachment?.sessionId;
    }
    if (sessionId) {
      await this.env.DB.prepare("UPDATE listening_sessions SET status='ended', updated_at=? WHERE id=? AND status!='ended'")
        .bind(Date.now(), sessionId).run();
    }
    this.broadcast({ type: "ended" });
    for (const socket of sockets) {
      try { socket.close(1000, "Listening session ended"); } catch {}
    }
  }
}
