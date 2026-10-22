import { describe, expect, it } from "vitest";
import { resolveAndroidBackAction } from "./androidBackAction";

describe("resolveAndroidBackAction", () => {
  const baseState = {
    pathname: "/",
    historyIndex: 0,
    fullscreenPlayerOpen: false,
    searchOpen: false,
    rightPanelOpen: false,
  };

  it("closes overlays before navigating", () => {
    expect(resolveAndroidBackAction({ ...baseState, fullscreenPlayerOpen: true, searchOpen: true }))
      .toBe("close-player");
    expect(resolveAndroidBackAction({ ...baseState, searchOpen: true, rightPanelOpen: true }))
      .toBe("close-search");
    expect(resolveAndroidBackAction({ ...baseState, rightPanelOpen: true }))
      .toBe("close-right-panel");
  });

  it("returns through the in-app route history when available", () => {
    expect(resolveAndroidBackAction({ ...baseState, pathname: "/artist", historyIndex: 1 }))
      .toBe("navigate-back");
  });

  it("returns a directly opened secondary page to Home", () => {
    expect(resolveAndroidBackAction({ ...baseState, pathname: "/settings", historyIndex: 0 }))
      .toBe("navigate-home");
  });

  it("exits only from the Home root with no overlays or prior route", () => {
    expect(resolveAndroidBackAction(baseState)).toBe("exit-app");
  });
});
