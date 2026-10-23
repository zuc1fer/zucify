import { Capacitor, CapacitorHttp } from "@capacitor/core";
import { runWorkerPool } from "@/shared/utils/workerPool";

export interface AudioDownloadOptions {
  contentLength?: number;
  signal?: AbortSignal;
  chunkSize?: number;
  concurrency?: number;
  onProgress?: (downloadedBytes: number, totalBytes?: number) => void;
}

const DEFAULT_CHUNK_SIZE = 1024 * 1024;
const DEFAULT_CONCURRENCY = 4;
const MAX_CHUNK_ATTEMPTS = 2;

async function fetchBytes(url: string, signal?: AbortSignal): Promise<Uint8Array<ArrayBuffer>> {
  if (Capacitor.isNativePlatform()) {
    if (signal?.aborted) throw signal.reason ?? new DOMException("The request was aborted.", "AbortError");
    const response = await CapacitorHttp.get({
      url,
      responseType: "arraybuffer",
      connectTimeout: 15_000,
      readTimeout: 30_000,
    });
    if (signal?.aborted) throw signal.reason ?? new DOMException("The request was aborted.", "AbortError");
    if (response.status < 200 || response.status >= 300) {
      throw new Error(`audio request returned HTTP ${response.status}`);
    }
    if (typeof response.data !== "string") throw new Error("audio response was not binary data");
    const binary = atob(response.data.replace(/\s/g, ""));
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    return bytes;
  }

  const response = await fetch(url, { signal });
  if (!response.ok && response.status !== 206) throw new Error(`audio request returned HTTP ${response.status}`);
  return new Uint8Array(await response.arrayBuffer());
}

export function isGoogleVideoUrl(url: string): boolean {
  try {
    return new URL(url).hostname.endsWith(".googlevideo.com");
  } catch {
    return false;
  }
}

function withRange(url: string, start: number, end: number): string {
  const parsed = new URL(url);
  parsed.searchParams.set("range", `${start}-${end}`);
  return parsed.toString();
}

async function fetchChunk(url: string, start: number, end: number, signal?: AbortSignal): Promise<Uint8Array<ArrayBuffer>> {
  const expected = end - start + 1;
  let lastError: unknown = null;
  for (let attempt = 0; attempt < MAX_CHUNK_ATTEMPTS; attempt += 1) {
    try {
      const bytes = await fetchBytes(withRange(url, start, end), signal);
      if (bytes.byteLength !== expected) throw new Error(`chunk ${start}-${end} returned ${bytes.byteLength} of ${expected} bytes`);
      return bytes;
    } catch (error) {
      if (signal?.aborted) throw error;
      lastError = error;
    }
  }
  throw lastError;
}

async function downloadInChunks(url: string, total: number, options: AudioDownloadOptions): Promise<Uint8Array<ArrayBuffer>> {
  const chunkSize = options.chunkSize ?? DEFAULT_CHUNK_SIZE;
  const starts = Array.from({ length: Math.ceil(total / chunkSize) }, (_, index) => index * chunkSize);
  const output = new Uint8Array(total);
  let downloadedBytes = 0;
  await runWorkerPool(starts, options.concurrency ?? DEFAULT_CONCURRENCY, async (start) => {
    const end = Math.min(start + chunkSize, total) - 1;
    const bytes = await fetchChunk(url, start, end, options.signal);
    output.set(bytes, start);
    downloadedBytes += bytes.byteLength;
    options.onProgress?.(downloadedBytes, total);
  });
  return output;
}

async function downloadWhole(url: string, signal?: AbortSignal): Promise<Uint8Array<ArrayBuffer> | null> {
  if (Capacitor.isNativePlatform()) {
    const bytes = await fetchBytes(url, signal);
    return bytes.byteLength > 0 ? bytes : null;
  }
  const response = await fetch(url, { signal });
  if (!response.ok && response.status !== 206) return null;
  const totalBytes = Number(/\/(\d+)$/.exec(response.headers.get("content-range") ?? "")?.[1]);
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (Number.isFinite(totalBytes) && bytes.byteLength < totalBytes) return null;
  return bytes;
}

export async function downloadAudioBytes(url: string, options: AudioDownloadOptions = {}): Promise<Uint8Array<ArrayBuffer> | null> {
  const total = options.contentLength;
  const bytes =
    total && total > 0 && isGoogleVideoUrl(url)
      ? await downloadInChunks(url, total, options)
      : await downloadWhole(url, options.signal);
  if (bytes && bytes.byteLength > 0 && (!total || !isGoogleVideoUrl(url))) {
    options.onProgress?.(bytes.byteLength, bytes.byteLength);
  }
  return bytes && bytes.byteLength > 0 ? bytes : null;
}
