import { describe, expect, it } from "vitest";
import { ListeningRoom } from "./index";

const track = (id: string) => ({
  id,
  title: `Track ${id}`,
  artists: "Test artist",
  coverUrl: "",
  durationMs: 180_000,
  playCount: 0,
});

function createRoom(partyType: "friends" | "playlist") {
  const sessionId = "session-1";
  const currentTrack = track("seed");
  const updates: unknown[][] = [];
  const queuedTracks = new Set(["seed", "queued-track"]);
  const memberships = new Set(["host", "guest"]);
  const sockets = ["host", "guest"].map((userId) => ({
    sent: [] as string[],
    deserializeAttachment: () => ({ userId, sessionId }),
    send(message: string) { this.sent.push(message); },
  }));
  const storageValues = new Map<string, unknown>([["snapshot", {
    hostId: "host",
    track: currentTrack,
    positionMs: 12_000,
    status: "playing",
    sharedPlaylistId: partyType === "playlist" ? "playlist-1" : null,
    partyType,
    updatedAt: Date.now(),
  }]]);
  const state = {
    storage: {
      get: async (key: string) => storageValues.get(key),
      put: async (key: string, value: unknown) => { storageValues.set(key, value); },
    },
    getWebSockets: () => sockets,
  };
  const DB = {
    prepare(query: string) {
      let values: unknown[] = [];
      return {
        bind(...args: unknown[]) { values = args; return this; },
        async first() {
          if (query.includes("FROM listening_sessions")) {
            return {
              host_id: "host",
              partyType,
              sharedPlaylistId: partyType === "playlist" ? "playlist-1" : null,
              status: "active",
            };
          }
          if (query.includes("FROM listening_session_members")) {
            return memberships.has(String(values[1])) ? { ok: 1 } : null;
          }
          if (query.includes("FROM listening_session_tracks")) {
            return queuedTracks.has(String(values[1])) ? { ok: 1 } : null;
          }
          return null;
        },
        async run() { updates.push(values); return { success: true }; },
      };
    },
  };
  const room = new ListeningRoom(state as any, { DB } as any);
  return { room, sockets, updates, currentTrack, storageValues };
}

function syncMessage(trackId: string) {
  return JSON.stringify({ type: "sync", track: track(trackId), positionMs: 0, status: "playing" });
}

function controlMessage(action: Record<string, unknown>) {
  return JSON.stringify({ type: "control", action });
}

describe("ListeningRoom party permissions", () => {
  it("lets the host control a Friends party and ignores guest playback changes", async () => {
    const { room, sockets, updates } = createRoom("friends");

    await room.webSocketMessage(sockets[1], syncMessage("guest-track"));
    expect(updates).toHaveLength(0);

    await room.webSocketMessage(sockets[0], syncMessage("host-track"));
    expect(updates).toHaveLength(1);
    expect(JSON.parse(sockets[1].sent.at(-1)!).track.id).toBe("host-track");
  });

  it("applies playlist member controls to everyone and accepts only queued tracks", async () => {
    const { room, sockets, updates, storageValues } = createRoom("playlist");

    await room.webSocketMessage(sockets[1], syncMessage("added-after-start"));
    expect(updates).toHaveLength(0);
    expect(sockets[1].sent).toHaveLength(0);

    await room.webSocketMessage(sockets[1], controlMessage({ type: "play", track: track("added-after-start") }));
    expect(sockets[0].sent).toHaveLength(0);

    await room.webSocketMessage(sockets[1], controlMessage({ type: "play", track: track("queued-track") }));
    expect(updates).toHaveLength(1);
    expect(JSON.parse(sockets[0].sent.at(-1)!).track.id).toBe("queued-track");
    expect(JSON.parse(sockets[1].sent.at(-1)!).track.id).toBe("queued-track");

    await room.webSocketMessage(sockets[1], syncMessage("queued-track"));
    expect(updates).toHaveLength(1);

    await room.webSocketMessage(sockets[1], controlMessage({ type: "pause" }));
    expect(JSON.parse(sockets[0].sent.at(-1)!).status).toBe("paused");
    await room.webSocketMessage(sockets[1], controlMessage({ type: "seek", positionMs: 45_000 }));
    expect(JSON.parse(sockets[0].sent.at(-1)!).positionMs).toBe(45_000);
    expect((storageValues.get("snapshot") as any).positionMs).toBe(45_000);

    await room.webSocketMessage(sockets[0], syncMessage("queued-track"));
    expect(updates).toHaveLength(4);
    expect(JSON.parse(sockets[1].sent.at(-1)!).track.id).toBe("queued-track");
  });
});
