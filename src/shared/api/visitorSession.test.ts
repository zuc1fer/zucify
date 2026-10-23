import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { isNativePlatform, nativeGet } = vi.hoisted(() => ({
  isNativePlatform: vi.fn(() => false),
  nativeGet: vi.fn(),
}));

vi.mock("@capacitor/core", () => ({
  Capacitor: { isNativePlatform },
  CapacitorHttp: { get: nativeGet },
}));

import { getClientVisitorData, resetClientVisitorData } from "./visitorSession";

const visitorData = `Cgt${"A".repeat(24)}`;

describe("client visitor session transport", () => {
  beforeEach(() => {
    resetClientVisitorData();
    isNativePlatform.mockReset();
    isNativePlatform.mockReturnValue(false);
    nativeGet.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    resetClientVisitorData();
  });

  it("uses native HTTP on mobile so WebView CORS cannot block visitor data", async () => {
    isNativePlatform.mockReturnValue(true);
    nativeGet.mockResolvedValue({ status: 200, data: `visitor=${visitorData}` });
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    await expect(getClientVisitorData()).resolves.toBe(visitorData);

    expect(nativeGet).toHaveBeenCalledWith(expect.objectContaining({
      url: "https://www.youtube.com/sw.js_data",
      responseType: "text",
      connectTimeout: 15_000,
      readTimeout: 20_000,
    }));
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("keeps fetch for desktop and web builds", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(`visitor=${visitorData}`, { status: 200 }),
    );

    await expect(getClientVisitorData()).resolves.toBe(visitorData);
    expect(fetchSpy).toHaveBeenCalledWith(
      "https://www.youtube.com/sw.js_data",
      expect.objectContaining({ headers: expect.objectContaining({ "user-agent": expect.any(String) }) }),
    );
    expect(nativeGet).not.toHaveBeenCalled();
  });
});
