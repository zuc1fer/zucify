import React, { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import TrackReactions from "./TrackReactions";

// @ts-expect-error - act support flag in vitest browserless DOM environment
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

describe("TrackReactions", () => {
  let container: HTMLDivElement | null = null;
  let root: Root | null = null;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root?.unmount());
    container?.remove();
    container = null;
    root = null;
  });

  it("shows reaction counts and the current user's selected reaction", () => {
    act(() => root?.render(
      <TrackReactions
        title="Song"
        reactions={[{ emoji: "🔥", count: 3, reactedByMe: true }]}
        onReaction={vi.fn()}
      />,
    ));

    const fireButton = container?.querySelector<HTMLButtonElement>('button[aria-pressed="true"]');
    expect(fireButton?.getAttribute("aria-pressed")).toBe("true");
    expect(fireButton?.getAttribute("aria-label")).toContain("🔥");
    expect(fireButton?.textContent).toContain("3");
    expect(container?.querySelectorAll("button")).toHaveLength(5);
  });

  it("requests the inverse reaction state when a button is clicked", () => {
    const onReaction = vi.fn();
    act(() => root?.render(
      <TrackReactions title="Song" reactions={[]} onReaction={onReaction} />,
    ));

    const heartButton = container?.querySelector<HTMLButtonElement>('button[aria-label="React with ❤️ to Song"]');
    act(() => heartButton?.click());

    expect(onReaction).toHaveBeenCalledWith("❤️", true);
  });
});
