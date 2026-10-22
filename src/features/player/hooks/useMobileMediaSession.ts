import { useEffect } from "react";
import { Capacitor } from "@capacitor/core";
import {
  MediaSession,
  type MediaSessionAction,
} from "@capgo/capacitor-media-session";
import { playerEngine } from "../engine/playerEngine";
import { usePlayerState } from "./usePlayerState";

const SEEK_STEP_MS = 10_000;
let mediaActionsRegistered = false;

function handleMediaAction(action: MediaSessionAction, seekTime?: number | null) {
  const player = playerEngine.getSnapshot();

  switch (action) {
    case "play":
      if (player.status === "paused" || player.status === "idle") {
        playerEngine.resume();
      }
      break;
    case "pause":
      if (player.status === "playing" || player.status === "loading") {
        playerEngine.pause();
      }
      break;
    case "stop":
      playerEngine.pause();
      break;
    case "nexttrack":
      void playerEngine.skipNext();
      break;
    case "previoustrack":
      void playerEngine.skipPrevious();
      break;
    case "seekto":
      if (typeof seekTime === "number" && Number.isFinite(seekTime)) {
        playerEngine.seek(seekTime * 1000);
      }
      break;
    case "seekforward":
      playerEngine.seek(
        Math.min(player.durationMs, player.positionMs + SEEK_STEP_MS),
      );
      break;
    case "seekbackward":
      playerEngine.seek(Math.max(0, player.positionMs - SEEK_STEP_MS));
      break;
  }
}

export function useMobileMediaSession(): void {
  const player = usePlayerState();
  const track = player.currentTrack;

  useEffect(() => {
    if (!Capacitor.isNativePlatform() || mediaActionsRegistered) return;
    mediaActionsRegistered = true;

    const actions: MediaSessionAction[] = [
      "play",
      "pause",
      "stop",
      "nexttrack",
      "previoustrack",
      "seekto",
      "seekforward",
      "seekbackward",
    ];

    for (const action of actions) {
      void MediaSession.setActionHandler({ action }, ({ seekTime }) => {
        handleMediaAction(action, seekTime);
      }).catch((error) => {
        console.warn("[MobileMediaSession] Could not register media action:", action, error);
      });
    }
  }, []);

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    if (!track) {
      void MediaSession.setPlaybackState({ playbackState: "none" }).catch(() => {});
      return;
    }

    void MediaSession.setMetadata({
      title: track.title,
      artist: track.artists,
      album: track.album?.title || "Zucify",
      artwork: track.coverUrl
        ? [{ src: track.coverUrl, sizes: "512x512", type: "image/jpeg" }]
        : undefined,
    }).catch((error) => {
      console.warn("[MobileMediaSession] Could not update track metadata:", error);
    });
  }, [track?.id, track?.title, track?.artists, track?.album?.title, track?.coverUrl]);

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    const playbackState =
      player.status === "playing" || player.status === "loading"
        ? "playing"
        : player.status === "paused"
          ? "paused"
          : "none";
    void MediaSession.setPlaybackState({ playbackState }).catch(() => {});
  }, [player.status]);

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    const updatePosition = () => {
      const state = playerEngine.getSnapshot();
      if (!state.currentTrack || state.durationMs <= 0) return;
      void MediaSession.setPositionState({
        duration: state.durationMs / 1000,
        position: Math.min(state.durationMs, state.positionMs) / 1000,
        playbackRate: state.playbackRate,
      }).catch(() => {});
    };

    updatePosition();
    const interval = window.setInterval(updatePosition, 1000);
    return () => window.clearInterval(interval);
  }, []);
}
