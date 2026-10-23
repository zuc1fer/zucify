import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { isNativePlatform, nativePost } = vi.hoisted(() => ({
  isNativePlatform: vi.fn(() => false),
  nativePost: vi.fn(),
}));

vi.mock("@capacitor/core", () => ({
  Capacitor: { isNativePlatform },
  CapacitorHttp: { post: nativePost },
}));

vi.mock("@/shared/api/visitorSession", () => ({
  getClientVisitorData: vi.fn(async () => "visitor-test"),
}));

import { InnertubeError, postInnertube } from "./innertubeClient";

describe("postInnertube transport", () => {
  beforeEach(() => {
    isNativePlatform.mockReset();
    isNativePlatform.mockReturnValue(false);
    nativePost.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("uses Capacitor's native HTTP transport on mobile", async () => {
    isNativePlatform.mockReturnValue(true);
    nativePost.mockResolvedValue({ status: 200, data: { contents: [] } });

    await expect(postInnertube("search", { query: "love" })).resolves.toEqual({ contents: [] });
    expect(nativePost).toHaveBeenCalledWith(expect.objectContaining({
      url: "https://music.youtube.com/youtubei/v1/search?prettyPrint=false",
      responseType: "json",
      data: expect.objectContaining({
        query: "love",
        context: { client: expect.objectContaining({ visitorData: "visitor-test" }), user: { lockedSafetyMode: false } },
      }),
    }));
  });

  it("preserves native HTTP status errors", async () => {
    isNativePlatform.mockReturnValue(true);
    nativePost.mockResolvedValue({ status: 429, data: {} });

    await expect(postInnertube("search", { query: "love" })).rejects.toMatchObject({
      name: "InnertubeError",
      status: 429,
    });
  });

  it("keeps the browser fetch transport for non-native builds", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ contents: [] }), { status: 200, headers: { "content-type": "application/json" } }),
    );

    await expect(postInnertube("search", { query: "love" })).resolves.toEqual({ contents: [] });
    expect(fetchSpy).toHaveBeenCalledOnce();
    expect(nativePost).not.toHaveBeenCalled();
  });
});
