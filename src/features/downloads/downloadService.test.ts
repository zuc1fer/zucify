import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { audioCache, linerDb, resolvePlaybackStream, downloadAudioBytes, records } = vi.hoisted(() => ({
  audioCache: {
    currentGeneration: vi.fn(() => 4),
    saveAudioBlob: vi.fn(),
    deleteAudio: vi.fn(),
  },
  linerDb: {
    getAudio: vi.fn(),
    getTrack: vi.fn(),
    putTrack: vi.fn(),
    markAudioDownloaded: vi.fn(),
    getDownloadedAudioRecords: vi.fn(),
  },
  resolvePlaybackStream: vi.fn(),
  downloadAudioBytes: vi.fn(),
  records: { audio: null as any },
}));

vi.mock("@/shared/storage", () => ({ audioCache, linerDb }));
vi.mock("@/features/player/engine/streamResolver", () => ({ resolvePlaybackStream }));
vi.mock("@/shared/media/innertube", () => ({ downloadAudioBytes }));

import { downloadTrackForOffline, removeDownloadedTrack } from "./downloadService";

const track = {
  id: "track-offline-1",
  title: "Offline Song",
  artists: "Offline Artist",
  coverUrl: "cover.jpg",
  durationMs: 180_000,
  playCount: 0,
};
const audioBytes = Uint8Array.from([0x4f, 0x67, 0x67, 0x53, 0, 0, 0, 0, 0, 0, 0, 0]);

beforeEach(() => {
  vi.clearAllMocks();
  records.audio = null;
  linerDb.getAudio.mockImplementation(async () => records.audio);
  linerDb.markAudioDownloaded.mockImplementation(async (trackId: string) => {
    if (!records.audio || records.audio.trackId !== trackId) return null;
    records.audio = { ...records.audio, downloadedAt: 1234 };
    return records.audio;
  });
  audioCache.saveAudioBlob.mockImplementation(async (trackId: string, blob: Blob, mimeType: string, _generation: number, downloaded: boolean) => {
    records.audio = { trackId, blob, mimeType, byteSize: blob.size, savedAt: 1000, downloadedAt: downloaded ? 1234 : undefined };
    return true;
  });
  resolvePlaybackStream.mockResolvedValue({
    url: "https://audio.example/song",
    mimeType: "audio/ogg",
    codec: "opus",
    bitrate: 128_000,
    expiresAtMs: null,
    contentLength: audioBytes.length,
  });
  downloadAudioBytes.mockResolvedValue(audioBytes);
});

afterEach(() => vi.restoreAllMocks());

describe("offline track downloads", () => {
  it("downloads, validates, and pins a playable audio file", async () => {
    const controller = new AbortController();
    const result = await downloadTrackForOffline(track, controller.signal);

    expect(resolvePlaybackStream).toHaveBeenCalledWith(track, controller.signal);
    expect(downloadAudioBytes).toHaveBeenCalledWith("https://audio.example/song", expect.objectContaining({
      contentLength: audioBytes.length,
      signal: controller.signal,
    }));
    expect(audioCache.saveAudioBlob).toHaveBeenCalledWith(track.id, expect.any(Blob), "audio/ogg", 4, true);
    expect(result).toMatchObject({ track, downloadedAt: 1234, byteSize: audioBytes.length });
    expect(linerDb.putTrack).toHaveBeenCalledWith(track);
  });

  it("marks an existing playback cache entry for offline use without downloading again", async () => {
    records.audio = {
      trackId: track.id,
      blob: new Blob([audioBytes], { type: "audio/ogg" }),
      mimeType: "audio/ogg",
      byteSize: audioBytes.length,
      savedAt: 1000,
    };
    const result = await downloadTrackForOffline(track, new AbortController().signal);

    expect(result.downloadedAt).toBe(1234);
    expect(resolvePlaybackStream).not.toHaveBeenCalled();
    expect(audioCache.saveAudioBlob).not.toHaveBeenCalled();
  });

  it("rejects incomplete or invalid audio instead of saving it", async () => {
    downloadAudioBytes.mockResolvedValue(new Uint8Array(12));
    await expect(downloadTrackForOffline(track, new AbortController().signal)).rejects.toThrow(/complete playable file/);
    expect(audioCache.saveAudioBlob).not.toHaveBeenCalled();
  });

  it("removes a saved offline copy from local audio storage", async () => {
    await removeDownloadedTrack(track.id);
    expect(audioCache.deleteAudio).toHaveBeenCalledWith(track.id);
  });
});
