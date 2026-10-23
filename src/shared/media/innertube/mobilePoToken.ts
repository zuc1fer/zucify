import { CapacitorHttp } from "@capacitor/core";
import { BotGuardClient } from "bgutils-js/botguard";
import { buildURL, GOOG_API_KEY } from "bgutils-js/utils";
import { WebPoMinter } from "bgutils-js/webpo";

const REQUEST_KEY = "O43z0dpjhgX20SCx4KAo";
const WEB_CLIENT_VERSION = "2.20250925.01.00";
const DEFAULT_TTL_MS = 6 * 60 * 60 * 1000;
const REFRESH_MARGIN_MS = 10 * 60 * 1000;
const INTERPRETER_HOSTS = new Set(["www.google.com", "www.gstatic.com"]);

interface BotGuardChallenge {
  interpreterUrl?: {
    privateDoNotAccessOrElseTrustedResourceUrlWrappedValue?: string;
  };
  program?: string;
  globalName?: string;
}

interface MobileMinter {
  minter: WebPoMinter;
  expiresAt: number;
}

let cachedMinter: MobileMinter | null = null;
let minterPromise: Promise<MobileMinter> | null = null;

async function createMinter(): Promise<MobileMinter> {
  const challengeResponse = await CapacitorHttp.post({
    url: "https://www.youtube.com/youtubei/v1/att/get?prettyPrint=false",
    headers: { "content-type": "application/json" },
    data: {
      context: {
        client: { clientName: "WEB", clientVersion: WEB_CLIENT_VERSION, hl: "en", gl: "US" },
      },
      engagementType: "ENGAGEMENT_TYPE_UNBOUND",
    },
    responseType: "json",
    connectTimeout: 15_000,
    readTimeout: 20_000,
  });
  if (challengeResponse.status < 200 || challengeResponse.status >= 300) {
    throw new Error(`BotGuard challenge request returned ${challengeResponse.status}`);
  }

  const challenge = (challengeResponse.data as { bgChallenge?: BotGuardChallenge } | null)?.bgChallenge;
  const interpreterPath = challenge?.interpreterUrl?.privateDoNotAccessOrElseTrustedResourceUrlWrappedValue;
  if (!interpreterPath || !challenge?.program || !challenge.globalName) {
    throw new Error("BotGuard challenge is missing required fields");
  }

  const interpreterUrl = new URL(interpreterPath, "https://www.youtube.com");
  if (interpreterUrl.protocol !== "https:" || !INTERPRETER_HOSTS.has(interpreterUrl.hostname)) {
    throw new Error("BotGuard interpreter host is not allowed");
  }
  const interpreterResponse = await CapacitorHttp.get({
    url: interpreterUrl.toString(),
    responseType: "text",
    connectTimeout: 15_000,
    readTimeout: 20_000,
  });
  if (interpreterResponse.status < 200 || interpreterResponse.status >= 300) {
    throw new Error(`BotGuard interpreter request returned ${interpreterResponse.status}`);
  }
  if (typeof interpreterResponse.data !== "string" || !interpreterResponse.data) {
    throw new Error("BotGuard interpreter was empty");
  }

  new Function(interpreterResponse.data)();
  const webPoSignalOutput: Parameters<typeof WebPoMinter.create>[1] = [];
  const botguard = await BotGuardClient.create({
    program: challenge.program,
    globalName: challenge.globalName,
    globalObject: globalThis,
  });
  const botguardResponse = await botguard.snapshot({ webPoSignalOutput });
  const integrityResponse = await CapacitorHttp.post({
    url: buildURL("GenerateIT", true),
    headers: {
      "content-type": "application/json+protobuf",
      "x-goog-api-key": GOOG_API_KEY,
      "x-user-agent": "grpc-web-javascript/0.1",
    },
    data: JSON.stringify([REQUEST_KEY, botguardResponse]),
    responseType: "json",
    connectTimeout: 15_000,
    readTimeout: 20_000,
  });
  if (integrityResponse.status < 200 || integrityResponse.status >= 300) {
    throw new Error(`BotGuard integrity request returned ${integrityResponse.status}`);
  }

  const [integrityToken, ttlSeconds] = integrityResponse.data as [string | null, number?];
  if (!integrityToken) throw new Error("BotGuard returned no integrity token");
  const minter = await WebPoMinter.create({ integrityToken }, webPoSignalOutput);
  const ttlMs = typeof ttlSeconds === "number" && ttlSeconds > 0 ? ttlSeconds * 1000 : DEFAULT_TTL_MS;
  return { minter, expiresAt: Date.now() + Math.max(ttlMs - REFRESH_MARGIN_MS, 60_000) };
}

async function getMinter(): Promise<MobileMinter> {
  if (cachedMinter && Date.now() < cachedMinter.expiresAt) return cachedMinter;
  if (!minterPromise) {
    minterPromise = createMinter()
      .then((entry) => {
        cachedMinter = entry;
        return entry;
      })
      .finally(() => {
        minterPromise = null;
      });
  }
  return minterPromise;
}

export async function mintMobilePoToken(videoId: string): Promise<string> {
  if (!/^[\w-]{11}$/.test(videoId)) throw new Error("Invalid YouTube video ID");
  const { minter } = await getMinter();
  return minter.mintAsWebsafeString(videoId);
}

export function resetMobilePoTokenCache(): void {
  cachedMinter = null;
  minterPromise = null;
}
