import { Capacitor, CapacitorHttp } from "@capacitor/core";
import { parseVisitorData } from "./visitorData";

/**
 * Client-side YouTube visitorData session manager.
 * Fetches fresh, authentic visitorData directly from the client's residential IP
 * and caches it in-memory / session for up to 6 hours.
 */

interface VisitorSession {
  visitorData: string;
  expiresAt: number;
}

let cachedSession: VisitorSession | null = null;
let pendingFetch: Promise<string> | null = null;

const SESSION_TTL_MS = 5.5 * 60 * 60 * 1000; // 5.5 hours
const VISITOR_DATA_URL = "https://www.youtube.com/sw.js_data";

async function fetchVisitorDataText(): Promise<string> {
  if (Capacitor.isNativePlatform()) {
    const response = await CapacitorHttp.get({
      url: VISITOR_DATA_URL,
      headers: {
        accept: "text/plain, */*",
        ...(typeof navigator !== "undefined" ? { "user-agent": navigator.userAgent } : {}),
      },
      responseType: "text",
      connectTimeout: 15_000,
      readTimeout: 20_000,
    });
    if (response.status < 200 || response.status >= 300) {
      throw new Error(`sw.js_data returned ${response.status}`);
    }
    if (typeof response.data !== "string") throw new Error("sw.js_data returned invalid text");
    return response.data;
  }

  const response = await fetch(VISITOR_DATA_URL, {
    headers: {
      "user-agent":
        typeof navigator !== "undefined"
          ? navigator.userAgent
          : "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    },
  });
  if (!response.ok) throw new Error(`sw.js_data returned ${response.status}`);
  return response.text();
}

export function resetClientVisitorData(): void {
  cachedSession = null;
}

export async function getClientVisitorData(): Promise<string> {
  const now = Date.now();
  if (cachedSession && cachedSession.expiresAt > now) {
    return cachedSession.visitorData;
  }

  if (pendingFetch) {
    return pendingFetch;
  }

  pendingFetch = (async () => {
    try {
      const text = await fetchVisitorDataText();
      const visitorData = parseVisitorData(text);
      if (!visitorData) {
        throw new Error("Could not parse visitorData from sw.js_data");
      }

      cachedSession = {
        visitorData,
        expiresAt: Date.now() + SESSION_TTL_MS,
      };

      console.info(
        `%c[VisitorSession]%c Ready: ${visitorData.slice(0, 16)}... (valid 5.5h)`,
        "color: #10b981; font-weight: bold;",
        "color: inherit;",
      );

      return visitorData;
    } catch (err) {
      console.warn("[VisitorSession] Failed to fetch fresh visitorData:", err);
      // Fallback: if cached exists even if slightly expired, keep it
      if (cachedSession?.visitorData) {
        return cachedSession.visitorData;
      }
      return "";
    } finally {
      pendingFetch = null;
    }
  })();

  return pendingFetch;
}

/**
 * Eagerly warm up the client's visitorData on app launch in the background.
 */
export function initClientVisitorSession(): void {
  void getClientVisitorData().catch(() => {});
}
