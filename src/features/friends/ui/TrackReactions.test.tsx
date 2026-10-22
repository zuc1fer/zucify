import React, { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import TrackReactions from "./TrackReactions";
import { TRACK_REACTION_EMOJIS } from "../socialApi";

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

  it("keeps the track row compact and shows reaction counts on its trigger", () => {
    act(() => root?.render(
      <TrackReactions
        title="Song"
        reactions={[{ emoji: TRACK_REACTION_EMOJIS[1], count: 3, reactedByMe: true }]}
        onReaction={vi.fn()}
      />,
    ));

    const trigger = container?.querySelector<HTMLButtonElement>("button");
    expect(container?.querySelectorAll("button")).toHaveLength(1);
    expect(trigger?.getAttribute("aria-pressed")).toBe("true");
    expect(trigger?.textContent).toContain("3");
  });

  it("opens the reaction choices and toggles the selected emoji", () => {
    const onReaction = vi.fn();
    act(() => root?.render(
      <TrackReactions title="Song" reactions={[]} onReaction={onReaction} />,
    ));

    const trigger = container?.querySelector<HTMLButtonElement>(
      'button[aria-label="Choose a reaction for Song"]',
    );
    act(() => trigger?.click());

    const choices = Array.from(
      document.querySelectorAll<HTMLButtonElement>("[data-dropdown-menu] button"),
    );
    expect(choices).toHaveLength(TRACK_REACTION_EMOJIS.length);
    act(() => choices[0]?.click());
    expect(onReaction).toHaveBeenCalledWith(TRACK_REACTION_EMOJIS[0], true);
  });
});
