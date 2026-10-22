export type AndroidBackAction =
  | "close-player"
  | "close-search"
  | "close-right-panel"
  | "navigate-back"
  | "navigate-home"
  | "exit-app";

export interface AndroidBackState {
  pathname: string;
  historyIndex: number | null;
  fullscreenPlayerOpen: boolean;
  searchOpen: boolean;
  rightPanelOpen: boolean;
}

export function resolveAndroidBackAction(state: AndroidBackState): AndroidBackAction {
  if (state.fullscreenPlayerOpen) return "close-player";
  if (state.searchOpen) return "close-search";
  if (state.rightPanelOpen) return "close-right-panel";
  if (state.historyIndex !== null && state.historyIndex > 0) return "navigate-back";
  if (state.pathname !== "/") return "navigate-home";
  return "exit-app";
}
