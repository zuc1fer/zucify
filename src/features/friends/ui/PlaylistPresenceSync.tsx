import { useEffect } from "react";
import { useAuthStore } from "@/features/auth/store/authStore";
import { usePlayerStore, type PlayerState } from "@/features/player/store/playerStore";
import { isSocialApiConfigured, socialApi } from "../socialApi";

type PresenceTarget = { kind: "shared" | "source"; id: string; key: string };

function getPresenceTarget(context: string | null): PresenceTarget | null {
  if (context?.startsWith("playlist:shared:")) {
    const id = context.slice("playlist:shared:".length);
    return id ? { kind: "shared", id, key: `shared:${id}` } : null;
  }
  if (context?.startsWith("shared:")) {
    const id = context.slice("shared:".length);
    return id ? { kind: "shared", id, key: `shared:${id}` } : null;
  }
  if (context?.startsWith("playlist:")) {
    const id = context.slice("playlist:".length);
    return id ? { kind: "source", id, key: `source:${id}` } : null;
  }
  return null;
}

function setPresence(
  target: PresenceTarget,
  presence: { trackId: string; status: "playing" | "paused" } | null,
): Promise<{ ok: boolean }> {
  return target.kind === "shared"
    ? socialApi.setPlaylistPresence(target.id, presence)
    : socialApi.setSourcePlaylistPresence(target.id, presence);
}

export default function PlaylistPresenceSync() {
  const userId = useAuthStore((state) => state.user?.id);

  useEffect(() => {
    if (!userId || !isSocialApiConfigured()) return;
    let activeTarget: PresenceTarget | null = null;
    let pendingUpdate = Promise.resolve();
    const enqueuePresence = (target: PresenceTarget, presence: { trackId: string; status: "playing" | "paused" } | null) => {
      pendingUpdate = pendingUpdate.then(() => setPresence(target, presence)).then(() => undefined).catch(() => undefined);
    };

    const publish = (state: PlayerState) => {
      const nextTarget = getPresenceTarget(state.playbackContext);
      if (activeTarget && activeTarget.key !== nextTarget?.key) enqueuePresence(activeTarget, null);
      activeTarget = nextTarget;
      if (!nextTarget) return;

      const track = state.currentTrack;
      if (!track || (state.status !== "playing" && state.status !== "paused")) {
        enqueuePresence(nextTarget, null);
        return;
      }
      enqueuePresence(nextTarget, { trackId: track.id, status: state.status });
    };

    publish(usePlayerStore.getState());
    const unsubscribe = usePlayerStore.subscribe((state, previous) => {
      if (state.currentTrack?.id !== previous.currentTrack?.id
        || state.status !== previous.status
        || state.playbackContext !== previous.playbackContext) {
        publish(state);
      }
    });
    const interval = window.setInterval(() => {
      const state = usePlayerStore.getState();
      if (document.visibilityState === "visible" && state.status === "playing") publish(state);
    }, 15_000);

    return () => {
      unsubscribe();
      window.clearInterval(interval);
      if (activeTarget) enqueuePresence(activeTarget, null);
    };
  }, [userId]);

  return null;
}
