import { getValidAccessToken } from "@/shared/api/auth-session";
import type { Track } from "@/shared/types";

export interface SocialPerson {
  id: string;
  username?: string | null;
  displayName?: string | null;
  avatarUrl?: string | null;
}

export interface FriendRequest {
  id: string;
  status: "pending";
  direction: "incoming" | "outgoing";
  from: SocialPerson;
  to: SocialPerson;
  createdAt: number;
}

export interface SocialMessage {
  id: string;
  fromId: string;
  toId: string;
  kind: "text" | "song" | "playlist";
  body?: string | null;
  payload?: { track?: Track; playlistId?: string } | null;
  createdAt: number;
}

export const TRACK_REACTION_EMOJIS = ["❤️", "🔥", "😍", "😂", "👏"] as const;
export type TrackReactionEmoji = (typeof TRACK_REACTION_EMOJIS)[number];

export interface TrackReaction {
  emoji: TrackReactionEmoji;
  count: number;
  reactedByMe: boolean;
}

export interface SharedPlaylistTrack {
  id: string;
  addedBy: string;
  sourceItemId?: string | null;
  addedByUser?: SocialPerson | null;
  createdAt: number;
  track: Track;
  reactions: TrackReaction[];
}

export interface SharedPlaylist {
  id: string;
  ownerId: string;
  title: string;
  sourcePlaylistId?: string | null;
  createdAt: number;
  trackCount: number;
  members: SocialPerson[];
  tracks: SharedPlaylistTrack[];
}

export interface ListeningSession {
  id: string;
  hostId: string;
  guestId: string;
  host: SocialPerson;
  guest: SocialPerson;
  track: Track;
  positionMs: number;
  playbackStatus: "playing" | "paused";
  status: "waiting" | "active";
  createdAt: number;
  updatedAt: number;
}

export interface RoomState {
  type: "state";
  hostId: string;
  track: Track;
  positionMs: number;
  status: "playing" | "paused";
  updatedAt: number;
}

export type RoomMessage =
  | RoomState
  | { type: "ended" }
  | { type: "presence"; connectedCount: number }
  | { type: "control"; action: unknown };

export interface SocialOverview {
  friends: SocialPerson[];
  requests: FriendRequest[];
  playlists: SharedPlaylist[];
  sessions: ListeningSession[];
}

export class SocialApiError extends Error {
  constructor(message: string, public readonly status = 0) {
    super(message);
    this.name = "SocialApiError";
  }
}

function getBaseUrl(): string {
  return ((import.meta.env.VITE_SOCIAL_API_URL as string | undefined) || "").trim().replace(/\/+$/, "");
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const baseUrl = getBaseUrl();
  if (!baseUrl) {
    throw new SocialApiError("Friends needs a Cloudflare URL. Set VITE_SOCIAL_API_URL in .env.local.");
  }
  const token = await getValidAccessToken();
  if (!token) throw new SocialApiError("Sign in to use Friends.", 401);
  let response: Response;
  try {
    response = await fetch(`${baseUrl}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(init.body ? { "Content-Type": "application/json" } : {}),
        ...init.headers,
      },
    });
  } catch {
    throw new SocialApiError("Could not reach the Friends service. Check your connection.");
  }
  const payload = await response.json().catch(() => null) as { error?: unknown } | null;
  if (!response.ok) {
    throw new SocialApiError(typeof payload?.error === "string" ? payload.error : "The Friends service returned an error.", response.status);
  }
  return payload as T;
}

function post<T>(path: string, body?: unknown): Promise<T> {
  return request<T>(path, { method: "POST", ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
}

export const socialApi = {
  getOverview: () => request<SocialOverview>("/api/overview"),
  searchPeople: (query: string) => request<{ items: SocialPerson[] }>(`/api/people?q=${encodeURIComponent(query)}`).then((result) => result.items),
  getFriends: () => request<{ items: SocialPerson[] }>("/api/friends").then((result) => result.items),
  getRequests: () => request<{ items: FriendRequest[] }>("/api/requests").then((result) => result.items),
  sendFriendRequest: (user: SocialPerson) => post<{ id: string; status: string }>("/api/requests", { user }),
  respondToRequest: (requestId: string, action: "accept" | "decline") => post<{ ok: boolean }>(`/api/requests/${encodeURIComponent(requestId)}/${action}`),
  removeFriend: (userId: string) => request<{ ok: boolean }>(`/api/friends/${encodeURIComponent(userId)}`, { method: "DELETE" }),
  getMessages: (userId: string) => request<{ items: SocialMessage[] }>(`/api/messages?with=${encodeURIComponent(userId)}`).then((result) => result.items),
  sendText: (toUserId: string, body: string) => post<SocialMessage>("/api/messages", { toUserId, kind: "text", body }),
  sendSong: (toUserId: string, track: Track) => post<SocialMessage>("/api/messages", { toUserId, kind: "song", payload: { track } }),
  sendPlaylist: (toUserId: string, playlistId: string) => post<SocialMessage>("/api/messages", { toUserId, kind: "playlist", payload: { playlistId } }),
  getPlaylists: () => request<{ items: SharedPlaylist[] }>("/api/playlists").then((result) => result.items),
  createPlaylist: (title: string, memberIds: string[]) => post<{ id: string }>("/api/playlists", { title, memberIds }),
  getLinkedPlaylist: (sourcePlaylistId: string) => request<SharedPlaylist>(`/api/playlists/source/${encodeURIComponent(sourcePlaylistId)}`),
  syncExistingPlaylist: (input: { sourcePlaylistId: string; title: string; tracks: { sourceItemId: string; track: Track }[] }) =>
    post<{ id: string; ownerId: string; sourcePlaylistId: string; title: string }>("/api/playlists/link-existing", input),
  addPlaylistMember: (playlistId: string, memberId: string) => post<{ ok: boolean }>(`/api/playlists/${encodeURIComponent(playlistId)}/members`, { memberId }),
  addTrack: (playlistId: string, track: Track) => post<SharedPlaylistTrack>(`/api/playlists/${encodeURIComponent(playlistId)}/tracks`, { track }),
  setTrackReaction: (playlistId: string, itemId: string, emoji: TrackReactionEmoji, reacted: boolean) =>
    post<{ reactions: TrackReaction[] }>(`/api/playlists/${encodeURIComponent(playlistId)}/tracks/${encodeURIComponent(itemId)}/reactions`, { emoji, reacted }),
  removeTrack: (playlistId: string, itemId: string) => request<{ ok: boolean }>(`/api/playlists/${encodeURIComponent(playlistId)}/tracks/${encodeURIComponent(itemId)}`, { method: "DELETE" }),
  getSessions: () => request<{ items: ListeningSession[] }>("/api/sessions").then((result) => result.items),
  createSession: (guestId: string, track: Track, positionMs = 0, playbackStatus: "playing" | "paused" = "playing") => post<ListeningSession>("/api/sessions", { guestId, track, positionMs, playbackStatus }),
  joinSession: (sessionId: string) => post<ListeningSession>(`/api/sessions/${encodeURIComponent(sessionId)}/join`),
  leaveSession: (sessionId: string) => post<{ ok: boolean }>(`/api/sessions/${encodeURIComponent(sessionId)}/leave`),
  async connectRoom(sessionId: string, onMessage: (message: RoomMessage) => void, onClose?: () => void): Promise<WebSocket> {
    const { ticket } = await post<{ ticket: string }>(`/api/sessions/${encodeURIComponent(sessionId)}/ticket`);
    const baseUrl = getBaseUrl();
    const socketUrl = new URL(`${baseUrl}/api/sessions/${encodeURIComponent(sessionId)}/ws`);
    socketUrl.protocol = socketUrl.protocol === "https:" ? "wss:" : "ws:";
    socketUrl.searchParams.set("ticket", ticket);
    const socket = new WebSocket(socketUrl);
    socket.addEventListener("message", (event) => {
      try {
        const message = JSON.parse(String(event.data));
        if (message?.type === "ended") onMessage({ type: "ended" });
        else if (message?.type === "state" && message.track) onMessage(message as RoomState);
        else if (message?.type === "presence" && Number.isFinite(message.connectedCount)) onMessage({ type: "presence", connectedCount: message.connectedCount });
        else if (message?.type === "control" && message.action) onMessage({ type: "control", action: message.action });
      } catch { /* Ignore malformed room events. */ }
    });
    socket.addEventListener("close", () => onClose?.());
    return socket;
  },
};

export function isSocialApiConfigured(): boolean {
  return Boolean(getBaseUrl());
}
