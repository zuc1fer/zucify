import {
  audioCache,
  linerDb,
  type CachedAudioRecord,
  type DownloadedPlaylistRecord,
} from "@/shared/storage";
import { isStandaloneAudioFile } from "@/shared/storage/audioFormat";
import { downloadAudioBytes } from "@/shared/media/innertube";
import { cacheCoverArtForOffline } from "@/features/covers";
import { playerEngine } from "@/features/player/engine/playerEngine";
import { resolvePlaybackStream } from "@/features/player/engine/streamResolver";
import type { Track } from "@/shared/types";

export interface DownloadedTrack {
  track: Track;
  downloadedAt: number;
  byteSize: number;
}

export type DownloadedPlaylist = DownloadedPlaylistRecord;
export type DownloadedPlaylistInput = Omit<DownloadedPlaylistRecord, "downloadedAt">;

export async function listDownloadedPlaylists(): Promise<DownloadedPlaylist[]> {
  return linerDb.getDownloadedPlaylists();
}

export async function saveDownloadedPlaylist(
  playlist: DownloadedPlaylistInput,
): Promise<DownloadedPlaylist> {
  const previous = (await linerDb.getDownloadedPlaylists()).find((item) => item.id === playlist.id);
  const tracks = playlist.tracks ? [...playlist.tracks] : undefined;
  const record: DownloadedPlaylist = {
    ...playlist,
    coverUrls: [...playlist.coverUrls],
    trackIds: [...new Set(playlist.trackIds)],
    ...(tracks ? { tracks } : {}),
    downloadedAt: Date.now(),
  };
  if (tracks) await Promise.all(tracks.map((track) => linerDb.putTrack(track)));
  await linerDb.putDownloadedPlaylist(record);
  if (previous) {
    const remainingTrackIds = new Set(
      (await linerDb.getDownloadedPlaylists()).flatMap((item) => item.trackIds),
    );
    for (const oldTrackId of previous.trackIds) {
      if (record.trackIds.includes(oldTrackId) || remainingTrackIds.has(oldTrackId)) continue;
      const audio = await linerDb.getAudio(oldTrackId);
      if (audio?.downloadedAt) await audioCache.deleteAudio(oldTrackId);
    }
  }
  await Promise.all(
    [...new Set([record.coverUrl, ...record.coverUrls])]
      .filter(Boolean)
      .map((url) => cacheCoverArtForOffline(url)),
  );
  return record;
}

/** Remove the playlist and only delete audio that no other downloaded playlist needs. */
export async function removeDownloadedPlaylist(playlistId: string): Promise<string[]> {
  const playlists = await linerDb.getDownloadedPlaylists();
  const removedPlaylist = playlists.find((playlist) => playlist.id === playlistId);
  if (!removedPlaylist) return [];

  await linerDb.deleteDownloadedPlaylist(playlistId);
  const remainingTrackIds = new Set(
    (await linerDb.getDownloadedPlaylists()).flatMap((playlist) => playlist.trackIds),
  );
  const removedTrackIds: string[] = [];
  for (const trackId of removedPlaylist.trackIds) {
    if (remainingTrackIds.has(trackId)) continue;
    const audio = await linerDb.getAudio(trackId);
    if (audio?.downloadedAt) {
      await audioCache.deleteAudio(trackId);
      removedTrackIds.push(trackId);
    }
  }
  return removedTrackIds;
}

export async function cacheLyricsForDownloadedTracks(tracks: readonly Track[]): Promise<void> {
  const batchSize = 4;
  for (let index = 0; index < tracks.length; index += batchSize) {
    await Promise.all(
      tracks.slice(index, index + batchSize).map((track) => playerEngine.ensureLyricsCached(track)),
    );
  }
}

function isValidAudioBlob(blob: Blob): Promise<boolean> {
  return blob.slice(0, 16).arrayBuffer().then((buffer) => isStandaloneAudioFile(new Uint8Array(buffer)));
}

function offlineTrack(track: Track, record: CachedAudioRecord): DownloadedTrack {
  return {
    track,
    downloadedAt: record.downloadedAt ?? Date.now(),
    byteSize: record.byteSize || record.blob.size,
  };
}

export async function listDownloadedTracks(): Promise<DownloadedTrack[]> {
  const records = await linerDb.getDownloadedAudioRecords();
  return Promise.all(records.map(async (record) => {
    const savedTrack = await linerDb.getTrack(record.trackId);
    const track: Track = {
      id: record.trackId,
      title: savedTrack?.title ?? record.trackId,
      artists: savedTrack?.artists ?? "",
      coverUrl: savedTrack?.coverUrl ?? "",
      durationMs: savedTrack?.durationMs ?? 0,
      playCount: 0,
      ...(savedTrack?.albumId && savedTrack.albumTitle
        ? { album: { id: savedTrack.albumId, title: savedTrack.albumTitle } }
        : {}),
    };
    return offlineTrack(track, record);
  }));
}

export async function downloadTrackForOffline(
  track: Track,
  signal: AbortSignal,
  onProgress?: (downloadedBytes: number, totalBytes?: number) => void,
): Promise<DownloadedTrack> {
  if (signal.aborted) throw signal.reason ?? new DOMException("The download was cancelled.", "AbortError");

  const existing = await linerDb.getAudio(track.id);
  if (existing && await isValidAudioBlob(existing.blob)) {
    const record = existing.downloadedAt
      ? existing
      : await linerDb.markAudioDownloaded(track.id) ?? existing;
    await linerDb.putTrack(track);
    await Promise.all([
      cacheCoverArtForOffline(track.coverUrl),
      playerEngine.ensureLyricsCached(track),
    ]);
    return offlineTrack(track, record);
  }
  if (existing) await audioCache.deleteAudio(track.id);

  const generation = audioCache.currentGeneration();
  await linerDb.putTrack(track);
  const offlineMetadataTasks = Promise.all([
    cacheCoverArtForOffline(track.coverUrl),
    playerEngine.ensureLyricsCached(track),
  ]);
  const stream = await resolvePlaybackStream(track, signal);
  const bytes = stream.blob
    ? new Uint8Array(await stream.blob.arrayBuffer())
    : await downloadAudioBytes(stream.url, {
        contentLength: stream.contentLength,
        signal,
        onProgress,
      });

  if (!bytes?.byteLength) throw new Error("The audio file could not be downloaded.");
  if (signal.aborted) throw signal.reason ?? new DOMException("The download was cancelled.", "AbortError");
  if (!isStandaloneAudioFile(bytes.subarray(0, 16))) {
    throw new Error("The audio source did not return a complete playable file.");
  }

  const blob = new Blob([bytes], { type: stream.mimeType || "audio/webm" });
  const saved = await audioCache.saveAudioBlob(track.id, blob, blob.type, generation, true);
  if (!saved) throw new Error("The download was cancelled before it could be saved.");
  const record = await linerDb.getAudio(track.id);
  if (!record) throw new Error("The audio file could not be saved to this device.");
  await offlineMetadataTasks;
  return offlineTrack(track, record);
}

export async function removeDownloadedTrack(trackId: string): Promise<void> {
  await audioCache.deleteAudio(trackId);
  await linerDb.removeTrackFromDownloadedPlaylists(trackId);
}
