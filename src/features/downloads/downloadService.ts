import { audioCache, linerDb, type CachedAudioRecord } from "@/shared/storage";
import { isStandaloneAudioFile } from "@/shared/storage/audioFormat";
import { downloadAudioBytes } from "@/shared/media/innertube";
import { resolvePlaybackStream } from "@/features/player/engine/streamResolver";
import type { Track } from "@/shared/types";

export interface DownloadedTrack {
  track: Track;
  downloadedAt: number;
  byteSize: number;
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
    return offlineTrack(track, record);
  }
  if (existing) await audioCache.deleteAudio(track.id);

  const generation = audioCache.currentGeneration();
  await linerDb.putTrack(track);
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
  return offlineTrack(track, record);
}

export async function removeDownloadedTrack(trackId: string): Promise<void> {
  await audioCache.deleteAudio(trackId);
}
