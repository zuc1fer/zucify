import { create } from "zustand";
import type { Track } from "@/shared/types";
import {
  cacheLyricsForDownloadedTracks,
  downloadTrackForOffline,
  listDownloadedPlaylists,
  listDownloadedTracks,
  removeDownloadedPlaylist,
  removeDownloadedTrack,
  saveDownloadedPlaylist,
  type DownloadedPlaylist,
  type DownloadedPlaylistInput,
  type DownloadedTrack,
} from "./downloadService";

export type DownloadJobStatus = "queued" | "downloading" | "failed";

export interface DownloadJob {
  track: Track;
  status: DownloadJobStatus;
  progress: number;
  error?: string;
}

interface DownloadsState {
  items: DownloadedTrack[];
  playlists: DownloadedPlaylist[];
  downloadedIds: Set<string>;
  jobs: Record<string, DownloadJob>;
  isLoading: boolean;
  refresh: () => Promise<void>;
  enqueue: (tracks: readonly Track[]) => void;
  enqueuePlaylist: (playlist: DownloadedPlaylistInput, tracks: readonly Track[]) => Promise<void>;
  removePlaylist: (playlistId: string) => Promise<void>;
  cancel: (trackId: string) => void;
  remove: (trackId: string) => Promise<void>;
}

const queue: Track[] = [];
const pendingIds = new Set<string>();
const controllers = new Map<string, AbortController>();
let queueIsRunning = false;

function updateJob(
  set: (updater: (state: DownloadsState) => Partial<DownloadsState>) => void,
  trackId: string,
  update: Partial<DownloadJob> | null,
): void {
  set((state) => {
    const jobs = { ...state.jobs };
    if (update) jobs[trackId] = { ...jobs[trackId], ...update };
    else delete jobs[trackId];
    return { jobs };
  });
}

function startQueue(
  get: () => DownloadsState,
  set: (updater: (state: DownloadsState) => Partial<DownloadsState>) => void,
): void {
  if (queueIsRunning) return;
  queueIsRunning = true;

  void (async () => {
    while (queue.length > 0) {
      const track = queue.shift()!;
      pendingIds.delete(track.id);
      if (get().jobs[track.id]?.status !== "queued") continue;

      const controller = new AbortController();
      controllers.set(track.id, controller);
      updateJob(set, track.id, { status: "downloading", progress: 0 });
      try {
        const downloaded = await downloadTrackForOffline(track, controller.signal, (received, total) => {
          updateJob(set, track.id, {
            progress: total && total > 0 ? Math.min(99, Math.floor((received / total) * 100)) : 0,
          });
        });
        set((state) => {
          const items = [downloaded, ...state.items.filter((item) => item.track.id !== track.id)]
            .sort((a, b) => b.downloadedAt - a.downloadedAt);
          const downloadedIds = new Set(state.downloadedIds);
          downloadedIds.add(track.id);
          const jobs = { ...state.jobs };
          delete jobs[track.id];
          return { items, downloadedIds, jobs };
        });
      } catch (error) {
        if (controller.signal.aborted) {
          updateJob(set, track.id, null);
        } else {
          updateJob(set, track.id, {
            status: "failed",
            error: error instanceof Error ? error.message : String(error),
          });
        }
      } finally {
        controllers.delete(track.id);
      }
    }
  })().finally(() => {
    queueIsRunning = false;
    if (queue.length > 0) startQueue(get, set);
  });
}

export const useDownloadsStore = create<DownloadsState>((set, get) => ({
  items: [],
  playlists: [],
  downloadedIds: new Set(),
  jobs: {},
  isLoading: false,
  refresh: async () => {
    set({ isLoading: true });
    try {
      const [items, playlists] = await Promise.all([
        listDownloadedTracks(),
        listDownloadedPlaylists(),
      ]);
      set({ items, playlists, downloadedIds: new Set(items.map((item) => item.track.id)) });
    } finally {
      set({ isLoading: false });
    }
  },
  enqueue: (tracks) => {
    const jobsToAdd: Record<string, DownloadJob> = {};
    const existingDownloads: Track[] = [];
    for (const track of tracks) {
      if (get().downloadedIds.has(track.id)) {
        existingDownloads.push(track);
        continue;
      }
      if (pendingIds.has(track.id)) continue;
      const existing = get().jobs[track.id];
      if (existing?.status === "downloading" || existing?.status === "queued") continue;
      pendingIds.add(track.id);
      queue.push(track);
      jobsToAdd[track.id] = { track, status: "queued", progress: 0 };
    }
    if (Object.keys(jobsToAdd).length > 0) {
      set((state) => ({ jobs: { ...state.jobs, ...jobsToAdd } }));
      startQueue(get, set);
    }
    if (existingDownloads.length > 0) {
      void cacheLyricsForDownloadedTracks(existingDownloads);
    }
  },
  enqueuePlaylist: async (playlist, tracks) => {
    await saveDownloadedPlaylist(playlist);
    const [items, playlists] = await Promise.all([
      listDownloadedTracks(),
      listDownloadedPlaylists(),
    ]);
    set({ items, playlists, downloadedIds: new Set(items.map((item) => item.track.id)) });
    get().enqueue(tracks);
  },
  removePlaylist: async (playlistId) => {
    const playlist = get().playlists.find((item) => item.id === playlistId);
    if (!playlist) return;
    const remainingTrackIds = new Set(
      get().playlists
        .filter((item) => item.id !== playlistId)
        .flatMap((item) => item.trackIds),
    );
    for (const trackId of playlist.trackIds) {
      if (!remainingTrackIds.has(trackId)) get().cancel(trackId);
    }
    await removeDownloadedPlaylist(playlistId);
    const [items, playlists] = await Promise.all([
      listDownloadedTracks(),
      listDownloadedPlaylists(),
    ]);
    set({ items, playlists, downloadedIds: new Set(items.map((item) => item.track.id)) });
  },
  cancel: (trackId) => {
    controllers.get(trackId)?.abort();
    pendingIds.delete(trackId);
    for (let index = queue.length - 1; index >= 0; index -= 1) {
      if (queue[index]?.id === trackId) queue.splice(index, 1);
    }
    updateJob(set, trackId, null);
  },
  remove: async (trackId) => {
    get().cancel(trackId);
    await removeDownloadedTrack(trackId);
    const playlists = await listDownloadedPlaylists();
    set((state) => {
      const downloadedIds = new Set(state.downloadedIds);
      downloadedIds.delete(trackId);
      return {
        items: state.items.filter((item) => item.track.id !== trackId),
        playlists,
        downloadedIds,
      };
    });
  },
}));
