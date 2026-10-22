import { memo, useCallback, useMemo, useState } from "react";
import SongCard from "./SongCard";
import { useSongMenuItems } from "../hooks/useSongMenuItems";
import { playerEngine } from "../engine/playerEngine";
import { usePlayerStore } from "../store/playerStore";
import { BRANDING_ACCENTS } from "../branding";
import { useToast } from "@/shared/ui";
import { useTranslation } from "@/languages";

import type { TrackArtist } from "@/shared/types";

export interface SongCardWithMenuProps {
  id?: string;
  title: string;
  artists: string;
  artistId?: string;
  artistList?: TrackArtist[];
  coverUrl: string;
  className?: string;
  onPlay?: () => void;
  duration?: string;
  durationMs?: number;
  releaseDate?: string;
  explicit?: boolean;
  imageShape?: "square" | "circle";
  trackNumber?: number;
  repostedBy?: string;
  searchType?: "track" | "album" | "artist" | "playlist";
  totalTracks?: number;
  playlistId?: string;
  playlistItemId?: string;
  playlistTitle?: string;
  onNavigate?: () => void;
  compact?: boolean;
  icon?: React.ReactNode;
  rightContent?: React.ReactNode;
  showReorderHandle?: boolean;
  onGrabStart?: (e: React.PointerEvent<HTMLDivElement>) => void;
  highlight?: string;
}

function SongCardWithMenu({
  id,
  title,
  artists,
  artistId,
  artistList,
  coverUrl,
  className,
  onPlay,
  duration,
  durationMs,
  releaseDate,
  explicit,
  imageShape,
  trackNumber,
  repostedBy,
  searchType,
  totalTracks,
  playlistId,
  playlistItemId,
  playlistTitle,
  onNavigate,
  compact,
  icon,
  rightContent,
  showReorderHandle,
  onGrabStart,
  highlight,
}: SongCardWithMenuProps) {
  const resolvedDurationMs = useMemo(() => {
    if (durationMs !== undefined) return durationMs;
    if (!duration) return 0;
    const parts = duration.split(":").map(Number);
    if (parts.length === 2) {
      return (parts[0] * 60 + parts[1]) * 1000;
    }
    if (parts.length === 3) {
      return (parts[0] * 3600 + parts[1] * 60 + parts[2]) * 1000;
    }
    return 0;
  }, [duration, durationMs]);

  const menuItems = useSongMenuItems({
    id,
    title,
    artists,
    coverUrl,
    duration,
    durationMs: resolvedDurationMs,
    searchType,
    totalTracks,
    playlistId,
    playlistItemId,
    playlistTitle,
  });

  const [menuOpen, setMenuOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState<{
    x: number;
    y: number;
  } | null>(null);

  const { t } = useTranslation();
  const { toast } = useToast();
  const trackDoubleClickBehavior = usePlayerStore(
    (state) => state.trackDoubleClickBehavior,
  );
  const currentTrackId = usePlayerStore((state) => state.currentTrack?.id);
  const playbackStatus = usePlayerStore((state) => state.status);
  const accentVariant = usePlayerStore((state) => state.accentVariant);
  const isCurrentTrack = Boolean(
    id && id === currentTrackId && ["playing", "paused", "loading"].includes(playbackStatus),
  );
  const isPlaying = isCurrentTrack && playbackStatus === "playing";

  const handleDoubleClick = useCallback(() => {
    if (!id) return;
    if (trackDoubleClickBehavior === "queue") {
      playerEngine.addToQueue({
        id,
        title,
        artists,
        coverUrl,
        durationMs: resolvedDurationMs,
        playCount: 0,
      });
      toast(t("common.added_to_queue"), "checkmark", {
        description: artists ? `${title} — ${artists}` : title,
      });
    } else if (onPlay) {
      onPlay();
    }
  }, [
    trackDoubleClickBehavior,
    id,
    title,
    artists,
    coverUrl,
    resolvedDurationMs,
    onPlay,
    toast,
    t,
  ]);

  const handleContextMenu = useCallback(
    (e: React.MouseEvent) => {
      if (menuItems.length === 0) return;
      e.preventDefault();
      e.stopPropagation();
      setMenuPosition({ x: e.clientX, y: e.clientY });
      setMenuOpen(true);
    },
    [menuItems],
  );

  const handleMenuOpenChange = useCallback((isOpen: boolean) => {
    setMenuOpen(isOpen);
    if (!isOpen) setMenuPosition(null);
  }, []);

  return (
    <SongCard
      id={id}
      isCurrentTrack={isCurrentTrack}
      isPlaying={isPlaying}
      playbackAccent={BRANDING_ACCENTS[accentVariant]}
      title={title}
      highlight={highlight}
      artists={artists}
      artistId={artistId}
      artistList={artistList}
      coverUrl={coverUrl}
      className={className}
      onPlay={onPlay}
      onDoubleClick={handleDoubleClick}
      duration={duration}
      releaseDate={releaseDate}
      explicit={explicit}
      imageShape={imageShape}
      trackNumber={trackNumber}
      repostedBy={repostedBy}
      menuItems={menuItems}
      menuOpen={menuOpen}
      onMenuOpenChange={handleMenuOpenChange}
      onContextMenu={handleContextMenu}
      menuPosition={menuPosition}
      onNavigate={onNavigate}
      compact={compact}
      icon={icon}
      rightContent={rightContent}
      showReorderHandle={showReorderHandle}
      onGrabStart={onGrabStart}
    />
  );
}

export default memo(SongCardWithMenu);
