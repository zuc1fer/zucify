import { memo } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Radio,
  Sidebar,
  SkipNext,
  SkipPrevious,
  MaximizeSquare3,
  TrashBin2,
  Bookmark,
  PlaybackSpeed,
  VolumeCross,
  VolumeSmall,
  VolumeLoud,
  Repeat,
  RepeatOne,
  Shuffle,
} from "@solar-icons/react";
import { HeartFill, HeartLine } from "@mingcute/react";

import {
  PlayerMorphIcon,
  ICON_PLAY,
  ICON_PAUSE,
} from "./morphPlayerIcons";

import { usePlayerState } from "../hooks/usePlayerState";
import { playerEngine } from "../engine/playerEngine";
import { isRadioContext, nextRepeatMode } from "../engine/radioMode";
import Button from "@/shared/ui/Button";
import SongCard from "./SongCard";
import { useTranslation } from "@/languages";
import { useIsTrackLiked, useLikeTrack, useUnlikeTrack } from "@/features/library/hooks";
import { usePlayerStore } from "../store/playerStore";
import { toVolumeGain, toVolumeLevel } from "../engine/volume";
import { VolumePicker } from "./VolumePicker";
import { SpeedPitchPicker } from "./SpeedPitchPicker";
import { TimelineSlider } from "./TimelineSlider";
import { useTheme } from "next-themes";
import { useCoverReady, CoverImage } from "@/features/covers";
import { useCustomizationStore, getBlockStyle } from "@/features/settings";
import ExplicitBadge from "@/shared/ui/ExplicitBadge";
import { ArtistLink } from "@/features/artist";
import { BRANDING_ACCENTS } from "../branding";

export interface MiniPlayerProps {
  onQueueOpenChange?: (open: boolean) => void;
  onQueueToggle?: () => void;
  onFullscreenOpen?: () => void;
  embedded?: boolean;
  isEdgeToEdge?: boolean;
}

function MiniPlayer({
  onQueueOpenChange,
  onQueueToggle,
  onFullscreenOpen,
  embedded = false,
  isEdgeToEdge = false,
}: MiniPlayerProps) {
  const player = usePlayerState();
  const playbackControlLocked = player.playbackControlLocked;
  const { t } = useTranslation();
  const { resolvedTheme } = useTheme();
  const isLight =
    resolvedTheme
      ? resolvedTheme === "light"
      : typeof document !== "undefined" && document.documentElement.getAttribute("data-theme") === "light";
  const miniPlayerStyle = usePlayerStore((state) => state.miniPlayerStyle);
  const usesRoundedStyle = !embedded && miniPlayerStyle === "rounded";
  const usesBackgroundProgress = true;
  const accentColorSolid = BRANDING_ACCENTS[player.accentVariant];
  const accentColor = `color-mix(in srgb, ${accentColorSolid} 10%, transparent)`;
  const backgroundImage = useCustomizationStore((state) => state.backgroundImage);
  const miniplayerConfig = useCustomizationStore((state) => state.miniplayer);
  const hasCustomBg = Boolean(backgroundImage && !isLight);
  const miniplayerCustomStyle = getBlockStyle(miniplayerConfig, !isLight, hasCustomBg);
  const coverUrl = player.currentTrack?.coverUrl || "";

  const [queueLimit, setQueueLimit] = useState(50);
  const [volumeOpen, setVolumeOpen] = useState(false);
  const [volumePopupStyle, setVolumePopupStyle] = useState<React.CSSProperties>(
    { bottom: 52 },
  );
  const [speedOpen, setSpeedOpen] = useState(false);
  const [speedPopupStyle, setSpeedPopupStyle] = useState<React.CSSProperties>(
    {},
  );
  const miniPlayerRootRef = useRef<HTMLDivElement>(null);
  const queuePopupRef = useRef<HTMLDivElement>(null);
  const volumePopupRef = useRef<HTMLDivElement>(null);
  const volumeToggleRef = useRef<HTMLButtonElement>(null);
  const speedPopupRef = useRef<HTMLDivElement>(null);
  const speedToggleRef = useRef<HTMLButtonElement>(null);
  const volumeHoverCloseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const [isVolumeDragging, setIsVolumeDragging] = useState(false);
  const lastNonZeroVolumeRef = useRef<number>(0.7);

  const currentTrack = player.currentTrack;
  const volumeLevel = toVolumeLevel(player.volume);
  const isLiked = useIsTrackLiked(currentTrack?.id);
  const likeMutation = useLikeTrack();
  const unlikeMutation = useUnlikeTrack();
  const togglingRef = useRef(false);

  const handleLikeToggle = useCallback(() => {
    if (!currentTrack || togglingRef.current) return;
    togglingRef.current = true;
    const onSettled = () => {
      togglingRef.current = false;
    };
    if (isLiked) {
      unlikeMutation.mutate(currentTrack.id, { onSettled });
    } else {
      likeMutation.mutate(currentTrack.id, { onSettled });
    }
  }, [currentTrack, isLiked, likeMutation, unlikeMutation]);

  const durationMs =
    player.durationMs > 0
      ? player.durationMs
      : (player.currentTrack?.durationMs ?? 0);
  const progress =
    durationMs > 0
      ? Math.min(1, Math.max(0, player.positionMs / durationMs))
      : 0;

  const isPlaying = player.status === "playing";
  const isLoading = player.status === "loading";
  const trackTitle = player.currentTrack?.title ?? t("player.nothing_playing");
  const trackArtists =
    player.currentTrack?.artists ?? t("player.choose_track");

  const isCoverLoaded = useCoverReady(coverUrl);

  const queueItems = useMemo(() => {
    return player.queue.slice(0, queueLimit).map((item, index) => {
      const isCurrent = index === player.currentIndex;
      return (
        <SongCard
          key={`${item.id}-${index}`}
          title={item.title}
          artists={item.artists}
          artistId={item.artistId}
          artistList={item.artistList}
          coverUrl={item.coverUrl || ""}
          duration={
            item.durationMs
              ? `${Math.floor(item.durationMs / 60000)}:${Math.floor(
                  (item.durationMs % 60000) / 1000,
                )
                  .toString()
                  .padStart(2, "0")}`
              : undefined
          }
          explicit={item.explicit}
          onPlay={() => {
            void playerEngine.playTrack(
              item,
              player.queue,
              player.playbackContext,
              player.playbackContextCover,
              index,
              true,
            );
          }}
          className={`rounded-[12px] px-[8px] py-[10px] text-left transition-all duration-200 ${
            isCurrent
              ? "bg-black/[0.065] dark:bg-white/[0.08]"
              : "bg-transparent hover:bg-black/[0.035] dark:hover:bg-white/[0.04]"
          }`}
        />
      );
    });
  }, [
    player.queue,
    queueLimit,
    player.currentIndex,
    player.playbackContext,
    player.playbackContextCover,
  ]);

  // off -> all (loop the whole queue/playlist) -> one (loop the track) -> off
  const repeatIcon = useMemo(() => {
    if (player.repeat === "one") return <RepeatOne size={18} weight="Outline" />;
    return <Repeat size={18} weight="Outline" />;
  }, [player.repeat]);
  const repeatLabel = t(`player.repeat_${player.repeat}`);

  // "on" state for the shuffle / repeat toggles: the hover tint, but opaque, so the
  // progress fill sliding underneath never changes it. Values are the hover tint
  // pre-composited over the toolbox on bg-primary (dark #0a0a0a, light #f5f5f7).
  // The toolbox pill itself is the opaque bg-toolbox equivalent for the same reason.
  const activeToggleClass = "!bg-[#dfdfe1] dark:!bg-[#292929] !text-text-primary";

  const iconButtonClass =
    "inline-flex h-[30px] w-[30px] items-center justify-center rounded-md text-text-secondary transition-colors duration-150 hover:bg-black/[0.05] dark:hover:bg-white/[0.09] hover:text-text-primary active:scale-[0.96] border-none bg-transparent cursor-pointer";

  const clearVolumeHoverTimer = useCallback(() => {
    if (volumeHoverCloseTimerRef.current) {
      clearTimeout(volumeHoverCloseTimerRef.current);
      volumeHoverCloseTimerRef.current = null;
    }
  }, []);

  const updateVolumePopupPosition = useCallback(() => {
    const toggle = volumeToggleRef.current;
    const root = miniPlayerRootRef.current;
    if (!toggle || !root) return;
    const toggleRect = toggle.getBoundingClientRect();
    const rootRect = root.getBoundingClientRect();
    const bar =
      toggle.closest<HTMLElement>(".bg-bg-toolbox") || toggle.parentElement;
    const barRect = bar?.getBoundingClientRect();

    const popupW = 38;
    const btnW = toggleRect.width;
    const right = rootRect.right - toggleRect.right + (btnW - popupW) / 2;
    const targetTop = barRect ? barRect.top : toggleRect.top;
    const bottom = rootRect.bottom - targetTop + 2;

    setVolumePopupStyle({
      right: Math.max(8, right),
      bottom: Math.round(bottom),
    });
  }, []);

  const handleVolumeMouseEnter = useCallback(() => {
    clearVolumeHoverTimer();
    updateVolumePopupPosition();
    setSpeedOpen(false);
    setVolumeOpen(true);
  }, [clearVolumeHoverTimer, updateVolumePopupPosition]);

  const handleVolumeMouseLeave = useCallback(() => {
    clearVolumeHoverTimer();
    // Keep open while user is actively dragging the slider
    if (isVolumeDragging) return;
    volumeHoverCloseTimerRef.current = setTimeout(() => {
      setVolumeOpen(false);
    }, 140);
  }, [clearVolumeHoverTimer, isVolumeDragging]);

  const handleToggleMute = useCallback(() => {
    if (volumeLevel > 0) {
      lastNonZeroVolumeRef.current = volumeLevel;
      playerEngine.setVolume(0);
    } else {
      const restore = lastNonZeroVolumeRef.current || 0.7;
      playerEngine.setVolume(toVolumeGain(restore));
    }
  }, [volumeLevel]);

  const handleVolumeWheel = useCallback(
    (e: React.WheelEvent) => {
      e.stopPropagation();
      e.preventDefault();
      const delta = e.deltaY < 0 ? 0.04 : -0.04;
      const nextLevel = Math.min(1, Math.max(0, volumeLevel + delta));
      playerEngine.setVolume(toVolumeGain(nextLevel));
      setVolumeOpen(true);
      clearVolumeHoverTimer();
      volumeHoverCloseTimerRef.current = setTimeout(() => {
        setVolumeOpen(false);
      }, 1200);
    },
    [clearVolumeHoverTimer, volumeLevel],
  );

  const handleVolumeDraggingChange = useCallback((dragging: boolean) => {
    setIsVolumeDragging(dragging);
  }, []);

  useEffect(() => {
    return () => {
      clearVolumeHoverTimer();
    };
  }, [clearVolumeHoverTimer]);

  useEffect(() => {
    if (!volumeOpen) return;
    updateVolumePopupPosition();
  }, [volumeOpen, updateVolumePopupPosition]);

  useEffect(() => {
    if (!speedOpen) return;
    const toggle = speedToggleRef.current;
    const root = miniPlayerRootRef.current;
    if (!toggle || !root) return;
    const toggleRect = toggle.getBoundingClientRect();
    const rootRect = root.getBoundingClientRect();
    const popupW = 270;
    const btnW = toggleRect.width;
    const right = rootRect.right - toggleRect.right + (btnW - popupW) / 2;
    setSpeedPopupStyle({ right: Math.max(8, right) });
  }, [speedOpen]);

  useEffect(() => {
    const onDocumentPointerDown = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (!target) {
        return;
      }

      if (volumeOpen) {
        const clickedVolumePopup = volumePopupRef.current?.contains(target);
        const clickedVolumeToggle =
          volumeToggleRef.current?.contains(target);
        if (!clickedVolumePopup && !clickedVolumeToggle) {
          clearVolumeHoverTimer();
          setVolumeOpen(false);
        }
      }

      if (speedOpen) {
        const clickedSpeedPopup = speedPopupRef.current?.contains(target);
        const clickedSpeedToggle =
          speedToggleRef.current?.contains(target);
        if (!clickedSpeedPopup && !clickedSpeedToggle) {
          setSpeedOpen(false);
        }
      }
    };

    const onDocumentKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (volumeOpen) {
          event.preventDefault();
          event.stopPropagation();
          clearVolumeHoverTimer();
          setVolumeOpen(false);
        }
        if (speedOpen) {
          event.preventDefault();
          event.stopPropagation();
          setSpeedOpen(false);
        }
      }
    };

    document.addEventListener("mousedown", onDocumentPointerDown, true);
    document.addEventListener("keydown", onDocumentKeyDown, true);
    return () => {
      document.removeEventListener("mousedown", onDocumentPointerDown, true);
      document.removeEventListener("keydown", onDocumentKeyDown, true);
    };
  }, [clearVolumeHoverTimer, speedOpen, volumeOpen]);

  const handleMiniPlayerClick = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      const target = event.target as Element | null;
      if (
        target?.closest?.(
          "button, a, input, [role='button'], [role='slider'], .prevent-seek",
        )
      ) {
        return;
      }
      onFullscreenOpen?.();
    },
    [onFullscreenOpen],
  );

  const handleMiniPlayerKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (event.target !== event.currentTarget) return;
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        onFullscreenOpen?.();
      }
    },
    [onFullscreenOpen],
  );

  return (
    <div
      ref={miniPlayerRootRef}
      className="relative h-[64px] w-full select-none max-md:rounded-none"
    >
      <AnimatePresence>
        {volumeOpen && (
          <motion.div
            key="volume-popup"
            ref={volumePopupRef}
            initial={{ opacity: 0, y: 8, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 6, scale: 0.96 }}
            transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
            className="absolute bottom-[52px] z-[99] w-[38px] rounded-xl bg-bg-surface/90 dark:bg-[#161618]/95 backdrop-blur-2xl pt-[6px] pb-[8px] px-[4px] shadow-[0_8px_24px_rgba(0,0,0,0.14)] dark:shadow-[0_12px_32px_rgba(0,0,0,0.5)] prevent-seek"
            style={volumePopupStyle}
            onPointerDown={(e) => e.stopPropagation()}
            onMouseEnter={clearVolumeHoverTimer}
            onMouseLeave={handleVolumeMouseLeave}
          >
            {/* Seamless invisible hit zone bridging popup and toggle button */}
            <div className="absolute -inset-x-3 -bottom-[22px] top-0 pointer-events-auto" />

            <VolumePicker
              orientation="vertical"
              showValue
              showIcon={false}
              onDraggingChange={handleVolumeDraggingChange}
              trackClassName="bg-black/[0.08] dark:bg-white/[0.12]"
              fillClassName="bg-text-primary dark:bg-white"
            />
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {speedOpen && (
          <motion.div
            key="speed-popup"
            ref={speedPopupRef}
            initial={{ opacity: 0, y: 10, scale: 0.985 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.985 }}
            transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
            className="absolute bottom-[74px] z-[92] w-[270px] rounded-xl bg-bg-primary border border-border-primary/50 p-[12px] shadow-2xl prevent-seek"
            style={speedPopupStyle}
            onPointerDown={(e) => e.stopPropagation()}
          >
            <SpeedPitchPicker onClose={() => setSpeedOpen(false)} />
          </motion.div>
        )}
      </AnimatePresence>

      <div
        className={`relative h-[64px] w-full overflow-hidden cursor-pointer max-md:rounded-none ${
          usesRoundedStyle
            ? `rounded-full border-[0.5px] border-border-tertiary ${
                hasCustomBg ? "" : "bg-bg-primary"
              }`
            : embedded
              ? `rounded-sm ${
                  isEdgeToEdge ? "rounded-br-none" : "rounded-br-xl"
                } ${
                  hasCustomBg ? "" : "bg-bg-primary"
                }`
              : `rounded-3xl border-[0.5px] border-border-tertiary ${
                  hasCustomBg ? "" : "bg-bg-primary"
                }`
        }`}
        style={miniplayerCustomStyle}
        onClick={handleMiniPlayerClick}
        onKeyDown={handleMiniPlayerKeyDown}
        role="group"
        aria-label={t("player.open_player")}
        tabIndex={0}
      >
        {usesBackgroundProgress && (
          <div
            className="absolute inset-y-0 left-0 z-0 pointer-events-none"
            style={{
              backgroundColor: accentColor,
              width: `${progress * 100}%`,
              willChange: "width",
              transition: "width 200ms cubic-bezier(0.22, 1, 0.36, 1)",
            }}
          />
        )}

        {embedded ? null : (
          <div
            className={`absolute z-30 prevent-seek ${
              usesRoundedStyle
                ? "left-[18px] right-[18px] bottom-[2px]"
                : "left-[8px] right-[8px] bottom-[2px]"
            }`}
            onPointerDown={(e) => e.stopPropagation()}
          >
            <TimelineSlider
              positionMs={player.positionMs}
              durationMs={durationMs}
              onSeek={(pos) => playerEngine.seek(pos)}
              disabled={playbackControlLocked}
              size="xs"
              fillColor={accentColorSolid}
              trackBg={isLight ? "rgba(0, 0, 0, 0.08)" : "rgba(255, 255, 255, 0.15)"}
              trackActiveBg={isLight ? "rgba(0, 0, 0, 0.16)" : "rgba(255, 255, 255, 0.32)"}
              className="!h-[14px]"
            />
          </div>
        )}
        <div
          className={`relative grid h-full pointer-events-none ${
            embedded
              ? "grid-cols-[minmax(0,1fr)_auto] md:grid-cols-[280px_minmax(0,1fr)_260px]"
              : "grid-cols-[286px_minmax(0,1fr)]"
          } ${!usesRoundedStyle && !embedded ? "pb-[4px]" : ""}`}
        >
          <div className="flex h-full min-w-0 items-center gap-[8px] px-[10px] pt-[1px] pr-[104px] pointer-events-none cursor-default md:gap-[16px] md:px-[18px]">
            <div
              role="button"
              tabIndex={0}
              aria-label="Open player"
              className={`relative h-[38px] w-[38px] shrink-0 overflow-hidden rounded-[8px] bg-bg-elevated cursor-pointer pointer-events-auto prevent-seek ${
                coverUrl && !isCoverLoaded ? "animate-pulse" : ""
              }`}
              onClick={onFullscreenOpen}
              onPointerDown={(e) => e.stopPropagation()}
            >
              <CoverImage
                key={coverUrl}
                src={coverUrl}
                alt="Track artwork"
                width={38}
                height={38}
                priority
                draggable={false}
                className="h-[38px] w-[38px] object-cover rounded-[8px]"
              />
            </div>
            <div className="flex min-w-0 flex-col pointer-events-none">
              <p
                className="m-0 truncate text-[16px] font-[400] text-text-primary flex items-center gap-[6px] pointer-events-none"
                style={{
                  fontFamily: "var(--font-inter), sans-serif",
                  lineHeight: "18px",
                  letterSpacing: "0",
                }}
              >
                <span
                  role="button"
                  tabIndex={0}
                  aria-label="Open player"
                  className="min-w-0 truncate cursor-pointer pointer-events-auto prevent-seek"
                  onClick={onFullscreenOpen}
                  onPointerDown={(e) => e.stopPropagation()}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      onFullscreenOpen?.();
                    }
                  }}
                >
                  {trackTitle}
                </span>
              </p>
              <p
                className="m-0 mt-[4px] flex min-w-0 items-center gap-[5px] text-[13px] font-[300] text-text-tertiary pointer-events-none"
                style={{
                  fontFamily: "var(--font-inter), sans-serif",
                  lineHeight: "15px",
                }}
              >
                {player.currentTrack?.explicit && <ExplicitBadge />}
                <ArtistLink
                  name={trackArtists}
                  artistId={player.currentTrack?.artistId}
                  artistList={player.currentTrack?.artistList}
                  className="text-text-tertiary pointer-events-auto"
                />
              </p>
            </div>
            <button
              type="button"
              aria-label={isLiked ? "Unlike" : "Like"}
              className={`${iconButtonClass} hidden shrink-0 transition-colors duration-150 pointer-events-auto prevent-seek md:inline-flex ${
                isLiked ? "text-accent-primary" : "text-text-secondary hover:text-text-primary"
              }`}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={handleLikeToggle}
              style={{ cursor: "pointer" }}
            >
              {isLiked ? <HeartFill size={20} /> : <HeartLine size={20} />}
            </button>
          </div>

          <div
            className={`flex h-full items-center pl-[10px] pr-[18px] pointer-events-none max-md:hidden ${
              embedded ? "col-start-2 md:col-start-3" : ""
            }`}
          >
            <div
              className="ml-auto flex items-center gap-[2px] rounded-lg bg-[#ebebed] dark:bg-[#141414] p-[3px] pointer-events-auto prevent-seek cursor-default"
              onPointerDown={(e) => e.stopPropagation()}
            >
              <button
                type="button"
                aria-label="Shuffle"
                title={player.shuffle ? t("player.shuffle_on") : t("player.shuffle_off")}
                className={`${iconButtonClass} ${
                  player.shuffle ? activeToggleClass : ""
                }`}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={() => playerEngine.setShuffle(!player.shuffle)}
              >
                <Shuffle size={18} weight="Outline" />
              </button>
              <button
                type="button"
                aria-label={repeatLabel}
                title={repeatLabel}
                className={`${iconButtonClass} ${
                  player.repeat !== "off" ? activeToggleClass : ""
                }`}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={() =>
                  playerEngine.setRepeat(
                    // radio has no repeat-all: it refills instead of looping
                    nextRepeatMode(player.repeat, isRadioContext(player.playbackContext)),
                  )
                }
              >
                {repeatIcon}
              </button>
              <button
                ref={speedToggleRef}
                type="button"
                aria-label="Speed and Pitch"
                title={`${t("player.speed_pitch")}: x${(player.playbackRate ?? 1).toFixed(2)}`}
                className={`${iconButtonClass} ${
                  speedOpen ||
                  Math.abs((player.playbackRate ?? 1) - 1) > 0.001 ||
                  Math.abs(player.pitchSemitones ?? 0) > 0.001
                    ? "bg-white/[0.09] text-white"
                    : ""
                }`}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={() => {
                  setVolumeOpen(false);
                  onQueueOpenChange?.(false);
                  setSpeedOpen((prev) => !prev);
                }}
                style={{ cursor: "pointer" }}
              >
                <motion.div
                  animate={{
                    scale: speedOpen ? 1.08 : 1,
                  }}
                  transition={{ type: "spring", stiffness: 350, damping: 22 }}
                  className="flex items-center justify-center"
                >
                  <PlaybackSpeed
                    size={18}
                    weight={
                      Math.abs((player.playbackRate ?? 1) - 1) > 0.001 ||
                      Math.abs(player.pitchSemitones ?? 0) > 0.001
                        ? "Bold"
                        : "Outline"
                    }
                  />
                </motion.div>
              </button>
              <button
                ref={volumeToggleRef}
                type="button"
                aria-label="Volume"
                className={`${iconButtonClass} ${
                  volumeOpen ? "bg-bg-toolbox-active text-text-primary" : ""
                }`}
                onPointerDown={(e) => e.stopPropagation()}
                onMouseEnter={handleVolumeMouseEnter}
                onMouseLeave={handleVolumeMouseLeave}
                onWheel={handleVolumeWheel}
                onClick={(e) => {
                  e.stopPropagation();
                  setSpeedOpen(false);
                  onQueueOpenChange?.(false);
                  handleToggleMute();
                  setVolumeOpen(true);
                }}
                style={{ cursor: "pointer" }}
              >
                {volumeLevel === 0 ? (
                  <VolumeCross size={18} weight="Outline" />
                ) : volumeLevel < 0.33 ? (
                  <VolumeSmall size={18} weight="Outline" />
                ) : (
                  <VolumeLoud size={18} weight="Outline" />
                )}
              </button>
              <button
                type="button"
                aria-label={t("player.open_player")}
                title={t("player.open_player")}
                className={iconButtonClass}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={() => {
                  setSpeedOpen(false);
                  setVolumeOpen(false);
                  onFullscreenOpen?.();
                }}
              >
                <MaximizeSquare3 size={18} weight="Outline" />
              </button>
              <span
                className="mx-[3px] h-[16px] w-px bg-border-toolbox-divider"
                aria-hidden="true"
              />
              <button
                type="button"
                aria-label={t("player.queue")}
                title={t("player.queue")}
                className={iconButtonClass}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={() => {
                  setSpeedOpen(false);
                  setVolumeOpen(false);
                  setQueueLimit(50);
                  onQueueToggle?.();
                }}
                style={{ cursor: "pointer" }}
              >
                <Sidebar size={20} weight="Bold" />
              </button>
            </div>
          </div>
        </div>

        <div className="pointer-events-none absolute inset-0 flex items-center justify-center max-md:justify-end max-md:pr-[8px]">
          <div
            className="pointer-events-auto flex items-center gap-[8px] prevent-seek cursor-default"
            onPointerDown={(e) => e.stopPropagation()}
          >
            {playbackControlLocked && <span className="text-[10px] text-text-tertiary">Following host</span>}
            <button
              type="button"
              aria-label="Previous track"
              title={playbackControlLocked ? "Playback is controlled by the host" : undefined}
              disabled={playbackControlLocked}
              className={`${iconButtonClass} text-text-secondary hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-30`}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={() => {
                void playerEngine.skipPrevious();
              }}
              style={{ cursor: "pointer" }}
            >
              <SkipPrevious size={18} weight="Bold" />
            </button>
            <button
              type="button"
              aria-label={playbackControlLocked ? "Following the host" : isPlaying ? "Pause" : "Play"}
              title={playbackControlLocked ? "Playback is controlled by the host" : undefined}
              disabled={playbackControlLocked}
              className="inline-flex h-[34px] w-[34px] items-center justify-center rounded-full bg-btn-primary-bg text-btn-primary-text transition-all duration-150 ease-out hover:scale-105 active:scale-[0.96] border-none cursor-pointer shadow-sm disabled:cursor-not-allowed disabled:opacity-30"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={() => {
                void playerEngine.togglePlayPause();
              }}
              style={{ cursor: "pointer" }}
            >
              {/* keep the morph icon mounted through the loading state
                  (spinner overlays it) — swapping it out on "loading" would
                  remount MorphIcon when the track starts, which skips the
                  play -> pause morph animation. */}
              <span className="relative flex h-[16px] w-[16px] items-center justify-center">
                <span
                  className={`absolute inset-0 flex items-center justify-center ${
                    isLoading ? "opacity-0" : ""
                  } transition-transform ${
                    isPlaying ? "" : "translate-x-[0.5px]"
                  }`}
                >
                  <PlayerMorphIcon
                    icon={isPlaying ? ICON_PAUSE : ICON_PLAY}
                    size={16}
                  />
                </span>
                {isLoading && (
                  <span
                    className="absolute h-[16px] w-[16px] animate-spin rounded-full border-[2px] border-current border-t-transparent"
                    aria-label="Loading playback"
                  />
                )}
              </span>
            </button>
            <button
              type="button"
              aria-label="Next track"
              title={playbackControlLocked ? "Playback is controlled by the host" : undefined}
              disabled={playbackControlLocked}
              className={`${iconButtonClass} text-text-secondary hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-30`}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={() => {
                void playerEngine.skipNext();
              }}
              style={{ cursor: "pointer" }}
            >
              <SkipNext size={18} weight="Bold" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default memo(MiniPlayer);
