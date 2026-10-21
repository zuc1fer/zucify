import { describe, expect, it } from "vitest";
import { findDeeplinkArg, parseDeeplink } from "./deeplink";

describe("parseDeeplink", () => {
  it("accepts real share targets", () => {
    expect(parseDeeplink("zucify://artist?id=UCGtGpOIGHfRu1KYL9pi-mNQ")).toEqual({
      type: "artist",
      id: "UCGtGpOIGHfRu1KYL9pi-mNQ",
    });
    expect(parseDeeplink("zucify://album?id=MPREb_xCxkOKReFZv")).toEqual({
      type: "album",
      id: "MPREb_xCxkOKReFZv",
    });
    expect(
      parseDeeplink("zucify://playlist?id=VLPLD8jNKEyHYB2DHh5vXSI4USLFo29vzUYl"),
    ).toEqual({ type: "playlist", id: "VLPLD8jNKEyHYB2DHh5vXSI4USLFo29vzUYl" });
    expect(parseDeeplink("zucify://track?id=RGdkabupfPI")).toEqual({
      type: "track",
      id: "RGdkabupfPI",
    });
  });

  it("continues accepting existing Liner shares", () => {
    expect(parseDeeplink("liner://track?id=RGdkabupfPI")).toEqual({
      type: "track",
      id: "RGdkabupfPI",
    });
  });

  it("rejects smuggled urls", () => {
    expect(parseDeeplink("https://evil.com")).toBeNull();
    expect(parseDeeplink("javascript:alert(1)")).toBeNull();
    expect(parseDeeplink("zucify://artist?id=UCaaaaaaaaaaaaaaaaaaaaaa&x=1&y=2")).toEqual({
      type: "artist",
      id: "UCaaaaaaaaaaaaaaaaaaaaaa",
    });
    expect(
      parseDeeplink("zucify://artist?id=UCaaaaaaaaaaaaaaaaaaaaaa&id=UCbbbbbbbbbbbbbbbbbbbbbb"),
    ).toBeNull();
    expect(parseDeeplink("zucify://artist")).toBeNull();
    expect(parseDeeplink("zucify://evil?id=RGdkabupfPI")).toBeNull();
    expect(parseDeeplink("zucify://track?id=RGdkabupfPIextra")).toBeNull();
    expect(parseDeeplink("zucify://artist?id=ABaaaaaaaaaaaaaaaaaaaaaa")).toBeNull();
    expect(parseDeeplink("zucify://artist?id=UCaaa/../../../../etc")).toBeNull();
    expect(parseDeeplink("not a url")).toBeNull();
  });

  it("finds the deeplink arg anywhere in argv", () => {
    expect(
      findDeeplinkArg(["/usr/bin/zucify", "zucify://track?id=RGdkabupfPI"]),
    ).toBe("zucify://track?id=RGdkabupfPI");
    expect(findDeeplinkArg(["/usr/bin/zucify", "liner://track?id=RGdkabupfPI"])).toBe(
      "liner://track?id=RGdkabupfPI",
    );
    expect(findDeeplinkArg(["/usr/bin/zucify", "--no-sandbox"])).toBeUndefined();
  });
});
