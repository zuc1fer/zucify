import React, { act } from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import ListeningNow from "./ListeningNow";

// @ts-expect-error - act support flag in vitest browserless DOM environment
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

describe("ListeningNow", () => {
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

  it("shows the friend listening to the matching track", () => {
    act(() => root?.render(
      <ListeningNow
        trackId="song-1"
        listeners={[
          {
            userId: "friend-1",
            trackId: "song-1",
            status: "playing",
            updatedAt: Date.now(),
            user: { id: "friend-1", username: "mixmaster" },
          },
          {
            userId: "friend-2",
            trackId: "song-2",
            status: "playing",
            updatedAt: Date.now(),
            user: { id: "friend-2", username: "elsewhere" },
          },
        ]}
      />,
    ));

    expect(container?.textContent).toContain("Listening");
    expect(container?.textContent).toContain("mixmaster");
    expect(container?.textContent).not.toContain("elsewhere");
    expect(container?.querySelector('[aria-label="mixmaster is listening to this song"]')).not.toBeNull();
  });

  it("renders nothing when nobody is listening to the track", () => {
    act(() => root?.render(<ListeningNow trackId="song-1" listeners={[]} />));
    expect(container?.firstChild).toBeNull();
  });
});
