import { playerEngine } from "@/features/player";
import { usePlayerStore } from "@/features/player/store/playerStore";
import { socialApi, type ListeningSession, type RoomMessage, type RoomState } from "./socialApi";

type LocalPlayback = { trackId: string | null; status: string; positionMs: number };

export interface ListeningRoomSnapshot {
  sessionId: string;
  hostId: string;
  userId: string;
  status: string;
  connected: boolean;
  ended?: boolean;
  disconnected?: boolean;
  error?: string;
}

interface RoomRuntime {
  sessionId: string;
  hostId: string;
  userId: string;
  status: string;
  socket: WebSocket | null;
  connecting: boolean;
  unsubscribePlayer: (() => void) | null;
  unsubscribePendingPause: (() => void) | null;
  pendingPauseTrackId: string | null;
  interval: number | null;
  remoteApplying: boolean;
  lastLocal: LocalPlayback | null;
  lastHostSyncAt: number;
}

const listeners = new Set<(snapshot: ListeningRoomSnapshot) => void>();
let activeRoom: RoomRuntime | null = null;

function publish(room: RoomRuntime, update: Partial<ListeningRoomSnapshot> = {}): void {
  if (activeRoom !== room) return;
  if (update.status) room.status = update.status;
  const snapshot: ListeningRoomSnapshot = {
    sessionId: room.sessionId,
    hostId: room.hostId,
    userId: room.userId,
    status: room.status,
    connected: room.socket?.readyState === WebSocket.OPEN || room.socket?.readyState === WebSocket.CONNECTING || room.connecting,
    ...update,
  };
  for (const listener of listeners) listener(snapshot);
}

function currentPlayback(): LocalPlayback {
  const state = usePlayerStore.getState();
  return { trackId: state.currentTrack?.id ?? null, status: state.status, positionMs: state.positionMs };
}

function closeRuntime(room: RoomRuntime): void {
  room.connecting = false;
  room.unsubscribePlayer?.();
  room.unsubscribePlayer = null;
  room.unsubscribePendingPause?.();
  room.unsubscribePendingPause = null;
  room.pendingPauseTrackId = null;
  if (room.interval !== null) window.clearInterval(room.interval);
  room.interval = null;
  const socket = room.socket;
  room.socket = null;
  if (socket && socket.readyState < WebSocket.CLOSING) socket.close();
}

function finishRuntime(room: RoomRuntime, status: string): void {
  if (activeRoom !== room) return;
  publish(room, { status, ended: true, connected: false });
  closeRuntime(room);
  activeRoom = null;
}

function schedulePauseAfterLoad(room: RoomRuntime, trackId: string): void {
  if (room.pendingPauseTrackId === trackId) return;
  room.unsubscribePendingPause?.();
  room.pendingPauseTrackId = trackId;
  const cleanup = () => {
    room.unsubscribePendingPause?.();
    room.unsubscribePendingPause = null;
    room.pendingPauseTrackId = null;
  };
  room.unsubscribePendingPause = usePlayerStore.subscribe((next) => {
    if (next.currentTrack?.id !== trackId || next.status === "error") {
      cleanup();
    } else if (next.status === "playing") {
      playerEngine.pause();
      room.lastLocal = currentPlayback();
      cleanup();
    }
  });
}

async function applyState(room: RoomRuntime, state: RoomState): Promise<void> {
  if (activeRoom !== room) return;
  room.remoteApplying = true;
  try {
    const before = usePlayerStore.getState();
    const trackChanged = before.currentTrack?.id !== state.track.id;
    if (trackChanged) {
      room.unsubscribePendingPause?.();
      room.unsubscribePendingPause = null;
      room.pendingPauseTrackId = null;
      await playerEngine.playTrack(state.track, [state.track]);
    }
    const current = usePlayerStore.getState();
    if (Math.abs(current.positionMs - state.positionMs) > 1500) playerEngine.seek(state.positionMs);
    if (state.status === "playing" && room.pendingPauseTrackId === state.track.id) {
      room.unsubscribePendingPause?.();
      room.unsubscribePendingPause = null;
      room.pendingPauseTrackId = null;
    }
    if (state.status === "paused" && current.status === "loading") {
      schedulePauseAfterLoad(room, state.track.id);
    } else if (state.status === "paused" && current.status === "playing") {
      playerEngine.pause();
    } else if (state.status === "playing" && current.status === "paused") {
      playerEngine.resume();
    }
  } finally {
    room.lastLocal = { trackId: state.track.id, status: state.status, positionMs: state.positionMs };
    window.setTimeout(() => { room.remoteApplying = false; }, 900);
  }
}

async function applyControl(room: RoomRuntime, action: any): Promise<void> {
  room.remoteApplying = true;
  try {
    if (action?.type === "play" && action.track) {
      await playerEngine.playTrack(action.track, [action.track]);
    } else if (action?.type === "pause") {
      playerEngine.pause();
    } else if (action?.type === "resume") {
      playerEngine.resume();
    } else if (action?.type === "seek" && Number.isFinite(action.positionMs)) {
      playerEngine.seek(action.positionMs);
    }
  } finally {
    window.setTimeout(() => { room.remoteApplying = false; }, 900);
  }
}

function observePlayback(room: RoomRuntime): void {
  if (activeRoom !== room || room.remoteApplying || room.pendingPauseTrackId) return;
  const local = usePlayerStore.getState();
  if (local.status === "loading") return;
  const track = local.currentTrack;
  if (!track) return;
  const now = Date.now();
  const current = { trackId: track.id, status: local.status, positionMs: local.positionMs };
  const previous = room.lastLocal;
  const send = (message: unknown) => {
    if (room.socket?.readyState === WebSocket.OPEN) room.socket.send(JSON.stringify(message));
  };
  if (room.hostId === room.userId) {
    const changed = !previous || previous.trackId !== current.trackId || previous.status !== current.status;
    if (changed || now - room.lastHostSyncAt >= 2500) {
      send({ type: "sync", track, positionMs: local.positionMs, status: local.status === "playing" ? "playing" : "paused" });
      room.lastHostSyncAt = now;
    }
  } else if (previous && previous.status !== "loading") {
    if (previous.trackId !== current.trackId) send({ type: "control", action: { type: "play", track } });
    else if (previous.status !== current.status) send({ type: "control", action: { type: current.status === "paused" ? "pause" : "resume" } });
    else if (Math.abs(previous.positionMs - current.positionMs) > 2500) send({ type: "control", action: { type: "seek", positionMs: current.positionMs } });
  }
  room.lastLocal = current;
}

function onRoomMessage(room: RoomRuntime, message: RoomMessage): void {
  if (activeRoom !== room) return;
  if (message.type === "ended") {
    finishRuntime(room, "Your friend left the listening session.");
  } else if (message.type === "presence") {
    publish(room, { status: message.connectedCount >= 2
      ? "Listening together"
      : room.hostId === room.userId ? "Waiting for your friend to join…" : "Waiting for your friend to reconnect…" });
  } else if (message.type === "state") {
    void applyState(room, message).catch((err) => {
      publish(room, { error: err instanceof Error ? `Playback sync failed: ${err.message}` : "Playback sync failed." });
    });
  } else if (message.type === "control" && room.hostId === room.userId) {
    void applyControl(room, message.action).catch((err) => {
      publish(room, { error: err instanceof Error ? `Playback control failed: ${err.message}` : "Playback control failed." });
    });
  }
}

async function openRuntime(room: RoomRuntime): Promise<void> {
  room.connecting = true;
  publish(room, { status: "Connecting to the listening room…" });
  try {
    const socket = await socialApi.connectRoom(room.sessionId, (message) => onRoomMessage(room, message), () => {
      if (activeRoom !== room) return;
      room.socket = null;
      room.connecting = false;
      room.unsubscribePlayer?.();
      room.unsubscribePlayer = null;
      if (room.interval !== null) window.clearInterval(room.interval);
      room.interval = null;
      room.unsubscribePendingPause?.();
      room.unsubscribePendingPause = null;
      room.pendingPauseTrackId = null;
      publish(room, { status: "Connection lost. Reconnect within one minute.", connected: false, disconnected: true });
    });
    if (activeRoom !== room) {
      socket.close();
      return;
    }
    room.socket = socket;
    room.connecting = false;
    if (socket.readyState === WebSocket.CLOSING || socket.readyState === WebSocket.CLOSED) {
      room.socket = null;
      publish(room, { status: "Connection lost. Reconnect within one minute.", connected: false, disconnected: true });
      return;
    }
    const onOpen = () => {
      if (activeRoom !== room) return;
      publish(room, { status: room.hostId === room.userId ? "Waiting for your friend to join…" : "Connected" });
      room.lastLocal = currentPlayback();
      observePlayback(room);
    };
    socket.addEventListener("open", onOpen, { once: true });
    if (socket.readyState === WebSocket.OPEN) onOpen();
    room.unsubscribePlayer = playerEngine.subscribe(() => observePlayback(room));
    room.interval = window.setInterval(() => observePlayback(room), 1000);
  } catch (err) {
    room.connecting = false;
    publish(room, {
      status: "Could not connect. Reconnect to try again.",
      disconnected: true,
      error: err instanceof Error ? err.message : "Could not connect to the listening room.",
    });
    throw err;
  }
}

export function getListeningRoom(): ListeningRoomSnapshot | null {
  if (!activeRoom) return null;
  return {
    sessionId: activeRoom.sessionId,
    hostId: activeRoom.hostId,
    userId: activeRoom.userId,
    status: activeRoom.status,
    connected: activeRoom.socket?.readyState === WebSocket.OPEN || activeRoom.socket?.readyState === WebSocket.CONNECTING || activeRoom.connecting,
  };
}

export function subscribeListeningRoom(listener: (snapshot: ListeningRoomSnapshot) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export async function connectListeningRoom(session: Pick<ListeningSession, "id" | "hostId">, userId: string): Promise<void> {
  if (activeRoom && activeRoom.sessionId === session.id && activeRoom.userId === userId) {
    if (activeRoom.connecting || activeRoom.socket?.readyState === WebSocket.OPEN || activeRoom.socket?.readyState === WebSocket.CONNECTING) {
      publish(activeRoom);
      return;
    }
    activeRoom.hostId = session.hostId;
    await openRuntime(activeRoom);
    return;
  }
  if (activeRoom) {
    const previous = activeRoom;
    try { await socialApi.leaveSession(previous.sessionId); } catch {}
    closeRuntime(previous);
    activeRoom = null;
  }
  const room: RoomRuntime = {
    sessionId: session.id,
    hostId: session.hostId,
    userId,
    status: "Connecting to the listening room…",
    socket: null,
    connecting: false,
    unsubscribePlayer: null,
    unsubscribePendingPause: null,
    pendingPauseTrackId: null,
    interval: null,
    remoteApplying: false,
    lastLocal: null,
    lastHostSyncAt: 0,
  };
  activeRoom = room;
  await openRuntime(room);
}

export function closeListeningRoomConnection(sessionId?: string): void {
  const room = activeRoom;
  if (!room || (sessionId && room.sessionId !== sessionId)) return;
  publish(room, { status: "Connection closed. Reconnect within one minute.", connected: false, disconnected: true });
  closeRuntime(room);
  activeRoom = null;
}

export async function leaveListeningRoom(sessionId: string): Promise<void> {
  await socialApi.leaveSession(sessionId);
  const room = activeRoom;
  if (room?.sessionId === sessionId) finishRuntime(room, "You left the listening session.");
}
