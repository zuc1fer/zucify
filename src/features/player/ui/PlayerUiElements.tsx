import { useRef, useCallback } from "react";
import { useLocation } from "react-router-dom";
import {
  SkipNext,
  SkipPrevious,
  MusicNote,
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
import { useIsTrackLiked, useLikeTrack, useUnlikeTrack } from "@/features/library/hooks";
import { AnimatePresence, motion } from "framer-motion";
import { ArtistLink } from "@/features/artist";
import { useCoverReady, CoverImage } from "@/features/covers";
import ExplicitBadge from "@/shared/ui/ExplicitBadge";
import { VolumePicker } from "./VolumePicker";
import { TimelineSlider } from "./TimelineSlider";
import { LuListPlus, LuPlus, LuShare2 } from "react-icons/lu";

import { useTranslation } from "@/languages";
import { BRANDING_ACCENTS } from "../branding";
import { useModalStore } from "@/features/library/store/modalStore";
import { useToast } from "@/shared/ui";
import { buildShareUrl } from "@/shared/utils/share";

const iconButtonClass =
  "inline-flex h-[28px] w-[28px] max-md:h-[40px] max-md:w-[40px] items-center justify-center text-white opacity-70 transition-all duration-150 ease-out hover:opacity-100 active:scale-[0.94] shrink-0 border-none bg-transparent cursor-pointer";

function PlayPauseIcon({ status }: { status: string }) {
  const loading = status === "loading";
  const playing = status === "playing";
  // keep the morph icon mounted through the loading state (spinner overlays
  // it) — unmounting the icon on "loading" would remount MorphIcon when the
  // track starts, which skips the play -> pause morph animation.
  return (
    <span className="relative flex h-[22px] w-[22px] items-center justify-center">
      <span
        className={`absolute inset-0 flex items-center justify-center ${
          loading ? "opacity-0" : ""
        } transition-transform ${playing ? "" : "translate-x-[1px]"}`}
      >
        <PlayerMorphIcon
          icon={playing ? ICON_PAUSE : ICON_PLAY}
          size={22}
        />
      </span>
      {loading && (
        <span
          className="absolute h-[18px] w-[18px] animate-spin rounded-full border-[2px] border-current border-t-transparent"
          aria-label="Loading playback"
        />
      )}
    </span>
  );
}

interface PlayerUiElementsProps {
  onDuration?: (duration: number) => void;
  onClose?: () => void;
}

export function PlayerUiElements({
  onDuration: _onDuration,
  onClose,
}: PlayerUiElementsProps) {
  const player = usePlayerState();
  const location = useLocation();
  const { toast } = useToast();
  const { t } = useTranslation();

  const track = player.currentTrack;
  const playbackControlLocked = player.playbackControlLocked;
  const playlistQueueLocked = Boolean(player.playbackQueueSnapshot);
  const coverUrl = track?.coverUrl || "";
  const trackTitle = track?.title || "";
  const trackArtists = track?.artists || "";
  const albumTitle = track?.album?.title;
  const releaseYear = track?.releaseDate?.match(/\b(?:19|20)\d{2}\b/)?.[0];
  const contextTitle = player.playbackContext?.includes(":")
    ? undefined
    : player.playbackContext;
  const isRadio = player.playbackContext?.startsWith("radio:") ?? false;
  const canEditQueue = !playbackControlLocked && !playlistQueueLocked;

  const isLiked = useIsTrackLiked(track?.id);
  const likeMutation = useLikeTrack();
  const unlikeMutation = useUnlikeTrack();
  const togglingRef = useRef(false);

  const handleLikeToggle = useCallback(() => {
    if (!track || togglingRef.current) return;
    togglingRef.current = true;
    const onSettled = () => {
      togglingRef.current = false;
    };
    if (isLiked) {
      unlikeMutation.mutate(track.id, { onSettled });
    } else {
      likeMutation.mutate(track.id, { onSettled });
    }
  }, [track, isLiked, likeMutation, unlikeMutation]);

  const handleAddToPlaylist = useCallback(() => {
    if (!track) return;
    useModalStore.getState().openAddToPlaylist({
      id: track.id,
      title: track.title,
      artists: track.artists,
      coverUrl: track.coverUrl,
      durationMs: track.durationMs,
      duration:
        track.durationMs > 0
          ? `${Math.floor(track.durationMs / 60000)}:${Math.floor(
              (track.durationMs % 60000) / 1000,
            )
              .toString()
              .padStart(2, "0")}`
          : undefined,
    });
  }, [track]);

  const handleAddToQueue = useCallback(() => {
    if (!track || !canEditQueue) return;
    playerEngine.addToQueue(track);
    toast(t("common.added_to_queue"), "checkmark", {
      description: track.title,
    });
  }, [track, canEditQueue, toast, t]);

  const handleShare = useCallback(async () => {
    if (!track) return;
    const url = buildShareUrl("track", track.id);
    try {
      if (typeof navigator.share === "function") {
        try {
          await navigator.share({
            title: track.title,
            text: track.artists,
            url,
          });
          return;
        } catch (error) {
          if (
            error &&
            typeof error === "object" &&
            "name" in error &&
            error.name === "AbortError"
          ) {
            return;
          }
        }
      }
      await navigator.clipboard.writeText(url);
      toast(t("common.link_copied"), "checkmark", {
        description: track.title,
      });
    } catch {
      toast(t("common.failed_to_resolve_link"), "error");
    }
  }, [track, toast, t]);

  const isCoverLoaded = useCoverReady(coverUrl);

  return (
    <>
      {/* Artwork (Compact, flat, no drop shadows) */}
      <div
        className={`relative shrink-0 overflow-hidden rounded-2xl w-[280px] h-[280px] max-md:w-[min(340px,82vw,38dvh)] max-md:h-[min(340px,82vw,38dvh)] bg-black/20 ${
          coverUrl && !isCoverLoaded ? "animate-pulse" : ""
        }`}
      >
        <AnimatePresence>
          <motion.div
            key={track?.id || coverUrl || "empty"}
            initial={{ opacity: 0, filter: "blur(8px)" }}
            animate={{ opacity: 1, filter: "blur(0px)" }}
            exit={{ opacity: 0, filter: "blur(8px)" }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="absolute inset-0"
          >
            {coverUrl ? (
              <CoverImage
                key={coverUrl}
                src={coverUrl}
                alt={trackTitle}
                fill
                sizes="280px"
                priority
                unoptimized
                className="rounded-xl object-cover"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center bg-white/5 text-white/40">
                <MusicNote size={64} />
              </div>
            )}
          </motion.div>
        </AnimatePresence>
        {/* like button on the cover corner (no tooltip; aria-label names it) */}
        <button
          type="button"
          aria-label={isLiked ? t("common.unlike") : t("common.like")}
          className={`absolute bottom-2.5 left-2.5 z-20 inline-flex h-[30px] w-[30px] max-md:h-[40px] max-md:w-[40px] items-center justify-center rounded-full transition-colors duration-200 ease-out active:scale-[0.92] bg-black/40 backdrop-blur-md border-none hover:bg-black/60 ${
            isLiked ? "text-white" : "text-white/70 hover:text-white"
          }`}
          onClick={handleLikeToggle}
          style={{ cursor: "pointer" }}
        >
          {/* subtle crossfade: outline heart out, filled heart in with a slight scale */}
          <motion.div
            initial={false}
            animate={{ scale: isLiked ? 0.85 : 1, opacity: isLiked ? 0 : 1 }}
            transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
            className="absolute inset-0 flex items-center justify-center"
          >
            <HeartLine size={16} />
          </motion.div>
          <motion.div
            initial={false}
            animate={{ scale: isLiked ? 1 : 0.75, opacity: isLiked ? 1 : 0 }}
            transition={
              isLiked
                ? { type: "spring", stiffness: 500, damping: 30, mass: 0.6 }
                : { duration: 0.16, ease: "easeOut" }
            }
            className="absolute inset-0 flex items-center justify-center"
          >
            <HeartFill size={16} />
          </motion.div>
        </button>
      </div>

      {/* Track info */}
      <div className="w-[280px] max-md:w-[min(340px,84vw)] flex items-start justify-center min-w-0 max-md:justify-start">
        <div className="flex flex-col gap-[2px] min-w-0 text-center max-md:text-left">
          <p
            className="m-0 text-[15px] font-[600] text-white flex items-center justify-center gap-[6px] max-w-[280px] max-md:max-w-full max-md:justify-start max-md:text-[17px]"
            style={{ letterSpacing: "-0.03em" }}
          >
            <span className="min-w-0 truncate">{trackTitle}</span>
          </p>
          <p className="m-0 flex items-center justify-center gap-[5px] text-[12px] text-white/60 leading-snug max-w-[320px] overflow-hidden max-md:max-w-full max-md:justify-start max-md:text-[13px]">
            {track?.explicit && (
              <ExplicitBadge className="!bg-white/60 !text-black !pb-0 !leading-none shrink-0" />
            )}
            <ArtistLink
              name={trackArtists}
              artistId={track?.artistId}
              artistList={track?.artistList}
              onNavigate={() => {
                if (location.pathname !== "/player") {
                  onClose?.();
                }
              }}
              className="text-white/60"
            />
          </p>
        </div>
      </div>

      {/* Song details and quick actions */}
      {(albumTitle || releaseYear || contextTitle || isRadio) && (
        <div className="hidden w-[min(340px,88vw)] max-w-full flex-wrap items-center justify-center gap-x-2 gap-y-1 text-[11px] text-white/55 max-md:flex max-md:justify-start">
          {albumTitle && (
            <span className="inline-flex min-w-0 items-center gap-1.5">
              <MusicNote size={13} className="shrink-0" />
              <span className="truncate">{t("collection.album")}: {albumTitle}</span>
            </span>
          )}
          {releaseYear && <span>{releaseYear}</span>}
          {isRadio && <span>{t("player.autoplay_radio")}</span>}
          {!albumTitle && !isRadio && contextTitle && (
            <span className="truncate">{t("player.playing_from")}: {contextTitle}</span>
          )}
        </div>
      )}

      <div className="hidden w-[min(340px,88vw)] max-w-full items-center gap-2 max-md:flex max-md:gap-1.5">
        <button
          type="button"
          aria-label={t("common.add_to_playlist")}
          title={t("common.add_to_playlist")}
          disabled={!track}
          onClick={handleAddToPlaylist}
          className="inline-flex h-10 min-w-0 flex-1 items-center justify-center gap-1.5 rounded-full border border-white/10 bg-black/20 px-2 text-[11px] font-medium text-white/80 transition-colors hover:bg-white/10 active:scale-[0.97] disabled:opacity-40"
        >
          <LuPlus size={16} className="shrink-0" />
          <span className="truncate">{t("common.add_to_playlist")}</span>
        </button>
        <button
          type="button"
          aria-label={t("common.add_to_queue")}
          title={playbackControlLocked ? "Playback is controlled by the host" : t("common.add_to_queue")}
          disabled={!track || !canEditQueue}
          onClick={handleAddToQueue}
          className="inline-flex h-10 min-w-0 flex-1 items-center justify-center gap-1.5 rounded-full border border-white/10 bg-black/20 px-2 text-[11px] font-medium text-white/80 transition-colors hover:bg-white/10 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-40"
        >
          <LuListPlus size={16} className="shrink-0" />
          <span className="truncate">{t("common.add_to_queue")}</span>
        </button>
        <button
          type="button"
          aria-label={t("common.share")}
          title={t("common.share")}
          disabled={!track}
          onClick={() => void handleShare()}
          className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/10 bg-black/20 text-[11px] font-medium text-white/80 transition-colors hover:bg-white/10 active:scale-[0.97] disabled:opacity-40"
        >
          <LuShare2 size={16} />
        </button>
      </div>

      {/* Timeline (Compact, with smooth spring pill, no thumb) */}
      <TimelineSlider
        positionMs={player.positionMs}
        durationMs={player.durationMs}
        onSeek={(pos) => playerEngine.seek(pos)}
        disabled={playbackControlLocked}
        showTime
        size="md"
        className="w-[320px] max-md:w-[min(340px,88vw)]"
        fillColor={BRANDING_ACCENTS[player.accentVariant]}
      />

      {/* Primary Playback Controls */}
      <div className="flex items-center gap-[14px] max-md:gap-[min(12px,2.5vw)]">
        {playbackControlLocked && <span className="text-[10px] text-white/55">Following host</span>}
        <button
          type="button"
          aria-label={player.shuffle ? t("player.shuffle_on") : t("player.shuffle_off")}
          title={playbackControlLocked ? "Playback is controlled by the host" : playlistQueueLocked ? "The party playlist order is fixed" : undefined}
          disabled={playbackControlLocked || playlistQueueLocked}
          onClick={() => playerEngine.setShuffle(!player.shuffle)}
          className={`${iconButtonClass} disabled:cursor-not-allowed disabled:opacity-30 ${
            player.shuffle ? "!text-white !opacity-100" : "!text-white/40"
          }`}
        >
          <Shuffle size={18} weight="Outline" />
        </button>

        <button
          type="button"
          aria-label="Previous track"
          title={playbackControlLocked ? "Playback is controlled by the host" : undefined}
          disabled={playbackControlLocked}
          onClick={() => void playerEngine.skipPrevious()}
          className={`${iconButtonClass} disabled:cursor-not-allowed disabled:opacity-30`}
        >
          <SkipPrevious size={20} weight="Bold" />
        </button>

        <button
          type="button"
          aria-label={playbackControlLocked ? "Following the host" : player.status === "playing" ? "Pause" : "Play"}
          title={playbackControlLocked ? "Playback is controlled by the host" : undefined}
          disabled={playbackControlLocked}
          onClick={() => void playerEngine.togglePlayPause()}
          className="inline-flex h-[36px] w-[36px] max-md:h-[52px] max-md:w-[52px] items-center justify-center text-white opacity-85 transition-all duration-150 ease-out hover:opacity-100 active:scale-[0.94] shrink-0 border-none bg-transparent cursor-pointer disabled:cursor-not-allowed disabled:opacity-30"
        >
          <PlayPauseIcon status={player.status} />
        </button>

        <button
          type="button"
          aria-label="Next track"
          title={playbackControlLocked ? "Playback is controlled by the host" : undefined}
          disabled={playbackControlLocked}
          onClick={() => void playerEngine.skipNext()}
          className={`${iconButtonClass} disabled:cursor-not-allowed disabled:opacity-30`}
        >
          <SkipNext size={20} weight="Bold" />
        </button>

        <button
          type="button"
          aria-label="Repeat"
          title={playbackControlLocked ? "Playback is controlled by the host" : playlistQueueLocked ? "The party playlist order is fixed" : undefined}
          disabled={playbackControlLocked || playlistQueueLocked}
          onClick={() =>
            playerEngine.setRepeat(
              // radio has no repeat-all: it refills instead of looping
              nextRepeatMode(player.repeat, isRadioContext(player.playbackContext)),
            )
          }
          className={`${iconButtonClass} disabled:cursor-not-allowed disabled:opacity-30 ${
            player.repeat !== "off" ? "!text-white !opacity-100" : "!text-white/40"
          }`}
        >
          {player.repeat === "one" ? (
            <RepeatOne size={18} />
          ) : (
            <Repeat size={18} />
          )}
        </button>
      </div>

      {/* Volume (Compact smooth slider, size sm) */}
      <VolumePicker className="w-[180px] max-md:hidden" size="sm" />
    </>
  );
}

export default PlayerUiElements;
