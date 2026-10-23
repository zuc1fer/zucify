import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  nativeGet: vi.fn(),
  nativePost: vi.fn(),
  createBotGuard: vi.fn(),
  createMinter: vi.fn(),
  mint: vi.fn(),
  snapshot: vi.fn(),
}));

vi.mock("@capacitor/core", () => ({
  CapacitorHttp: { get: mocks.nativeGet, post: mocks.nativePost },
}));

vi.mock("bgutils-js/botguard", () => ({
  BotGuardClient: { create: mocks.createBotGuard },
}));

vi.mock("bgutils-js/webpo", () => ({
  WebPoMinter: { create: mocks.createMinter },
}));

vi.mock("bgutils-js/utils", () => ({
  buildURL: () => "https://www.google.com/generate-it",
  GOOG_API_KEY: "test-api-key",
}));

import { mintMobilePoToken, resetMobilePoTokenCache } from "./mobilePoToken";

describe("mobile YouTube PO token minting", () => {
  beforeEach(() => {
    resetMobilePoTokenCache();
    mocks.nativeGet.mockReset();
    mocks.nativePost.mockReset();
    mocks.createBotGuard.mockReset();
    mocks.createMinter.mockReset();
    mocks.mint.mockReset();
    mocks.snapshot.mockReset();

    mocks.nativePost
      .mockResolvedValueOnce({
        status: 200,
        data: {
          bgChallenge: {
            interpreterUrl: {
              privateDoNotAccessOrElseTrustedResourceUrlWrappedValue: "//www.gstatic.com/botguard/interpreter.js",
            },
            program: "program",
            globalName: "botguard",
          },
        },
      })
      .mockResolvedValueOnce({ status: 200, data: ["integrity-token", 3600] });
    mocks.nativeGet.mockResolvedValue({ status: 200, data: "globalThis.__botguardTest = true;" });
    mocks.snapshot.mockResolvedValue("botguard-response");
    mocks.createBotGuard.mockResolvedValue({ snapshot: mocks.snapshot });
    mocks.mint.mockImplementation(async (videoId: string) => `token-${videoId}`);
    mocks.createMinter.mockResolvedValue({ mintAsWebsafeString: mocks.mint });
  });

  afterEach(() => {
    resetMobilePoTokenCache();
    vi.restoreAllMocks();
  });

  it("mints video-bound tokens and reuses the integrity minter", async () => {
    await expect(mintMobilePoToken("dQw4w9WgXcQ")).resolves.toBe("token-dQw4w9WgXcQ");
    await expect(mintMobilePoToken("M7lc1UVf-VE")).resolves.toBe("token-M7lc1UVf-VE");

    expect(mocks.nativePost).toHaveBeenCalledTimes(2);
    expect(mocks.nativePost).toHaveBeenNthCalledWith(1, expect.objectContaining({
      url: "https://www.youtube.com/youtubei/v1/att/get?prettyPrint=false",
      responseType: "json",
    }));
    expect(mocks.nativeGet).toHaveBeenCalledWith(expect.objectContaining({
      url: "https://www.gstatic.com/botguard/interpreter.js",
      responseType: "text",
    }));
    expect(mocks.mint).toHaveBeenNthCalledWith(1, "dQw4w9WgXcQ");
    expect(mocks.mint).toHaveBeenNthCalledWith(2, "M7lc1UVf-VE");
  });

  it("rejects interpreter scripts from untrusted hosts", async () => {
    mocks.nativePost.mockReset().mockResolvedValue({
      status: 200,
      data: {
        bgChallenge: {
          interpreterUrl: {
            privateDoNotAccessOrElseTrustedResourceUrlWrappedValue: "https://attacker.invalid/interpreter.js",
          },
          program: "program",
          globalName: "botguard",
        },
      },
    });

    await expect(mintMobilePoToken("dQw4w9WgXcQ")).rejects.toThrow("BotGuard interpreter host is not allowed");
    expect(mocks.nativeGet).not.toHaveBeenCalled();
  });

  it("rejects invalid video identifiers", async () => {
    await expect(mintMobilePoToken("not-a-video-id")).rejects.toThrow("Invalid YouTube video ID");
    expect(mocks.nativePost).not.toHaveBeenCalled();
  });
});
