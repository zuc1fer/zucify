import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  ArrowLeftLine,
  CloseLine,
  DownloadFill,
  PlayFill,
  PlaylistFill,
  Refresh3Line,
} from "@mingcute/react";
import CoverImage from "@/features/covers/ui/CoverImage";
import PlaylistCard from "@/features/library/ui/PlaylistCard";
import SongCardWithMenu from "@/features/player/ui/SongCardWithMenu";
import { playerEngine } from "@/features/player";
import { useTranslation } from "@/languages";
import { useDownloadsStore, type DownloadJob } from "../downloadsStore";
import type { DownloadedPlaylist, DownloadedTrack } from "../downloadService";

const ALL_DOWNLOADS_ID = "all-downloads";

function formatBytes(bytes: number): string {
  if (bytes <= 0) return "0 B";
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function DownloadJobRow({ job }: { job: DownloadJob }) {
  const { t } = useTranslation();
  const cancel = useDownloadsStore((state) => state.cancel);
  const enqueue = useDownloadsStore((state) => state.enqueue);
  const isFailed = job.status === "failed";

  return (
    <div className="flex min-w-0 items-center gap-3 rounded-xl bg-bg-elevated px-3 py-2.5">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-bg-panel text-text-secondary">
        {isFailed ? <CloseLine size={18} /> : <DownloadFill size={18} className="animate-pulse" />}
      </div>
      <div className="min-w-0 flex-1">
        <p className="m-0 truncate text-[13px] font-medium text-text-primary">{job.track.title}</p>
        <p className="m-0 truncate text-[11px] text-text-tertiary">
          {isFailed ? job.error || t("downloads.failed") : job.status === "queued" ? t("downloads.queued") : t("downloads.downloading")}
        </p>
        {!isFailed && job.status === "downloading" && (
          <div className="mt-2 h-1 overflow-hidden rounded-full bg-border-alpha-14">
            <div
              className={`h-full rounded-full bg-accent-primary transition-[width] duration-300 ${job.progress === 0 ? "w-1/3 animate-pulse" : ""}`}
              style={job.progress > 0 ? { width: `${job.progress}%` } : undefined}
            />
          </div>
        )}
      </div>
      {isFailed ? (
        <>
          <button type="button" aria-label={t("downloads.retry")} onClick={() => enqueue([job.track])} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border-0 bg-transparent text-text-secondary hover:bg-border-alpha-14">
            <Refresh3Line size={17} />
          </button>
          <button type="button" aria-label={t("common.remove")} onClick={() => cancel(job.track.id)} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border-0 bg-transparent text-text-tertiary hover:bg-border-alpha-14">
            <CloseLine size={17} />
          </button>
        </>
      ) : (
        <button type="button" aria-label={t("common.cancel")} onClick={() => cancel(job.track.id)} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border-0 bg-transparent text-text-tertiary hover:bg-border-alpha-14">
          <CloseLine size={17} />
        </button>
      )}
    </div>
  );
}

function getTracksForPlaylist(
  playlist: DownloadedPlaylist,
  itemsById: Map<string, DownloadedTrack>,
): DownloadedTrack[] {
  return playlist.trackIds
    .map((trackId) => itemsById.get(trackId))
    .filter((item): item is DownloadedTrack => Boolean(item));
}

export default function DownloadsPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { t } = useTranslation();
  const items = useDownloadsStore((state) => state.items);
  const playlists = useDownloadsStore((state) => state.playlists);
  const jobs = useDownloadsStore((state) => state.jobs);
  const isLoading = useDownloadsStore((state) => state.isLoading);
  const refresh = useDownloadsStore((state) => state.refresh);
  const [hasLoaded, setHasLoaded] = useState(false);
  const activeJobs = useMemo(() => Object.values(jobs), [jobs]);
  const trackCountLabel = (count: number) => count === 1
    ? t("downloads.song_count_one")
    : t("downloads.song_count", { count });
  const selectedPlaylistId = searchParams.get("playlist");
  const isAllDownloads = selectedPlaylistId === ALL_DOWNLOADS_ID;
  const totalBytes = items.reduce((sum, item) => sum + item.byteSize, 0);
  const itemsById = useMemo(() => new Map(items.map((item) => [item.track.id, item])), [items]);
  const allCoverUrls = useMemo(
    () => [...new Set([
      ...items.map((item) => item.track.coverUrl),
      ...activeJobs.map((job) => job.track.coverUrl),
    ].filter(Boolean))].slice(0, 4),
    [activeJobs, items],
  );
  const allDownloadsPlaylist = useMemo<DownloadedPlaylist>(() => ({
    id: ALL_DOWNLOADS_ID,
    title: t("downloads.all_downloads"),
    coverUrl: allCoverUrls[0] ?? "",
    coverUrls: allCoverUrls,
    trackIds: [...new Set([
      ...items.map((item) => item.track.id),
      ...activeJobs.map((job) => job.track.id),
    ])],
    downloadedAt: items[0]?.downloadedAt ?? 0,
  }), [activeJobs, allCoverUrls, items, t]);
  const savedPlaylist = playlists.find((playlist) => playlist.id === selectedPlaylistId) ?? null;
  const selectedPlaylist = isAllDownloads ? allDownloadsPlaylist : savedPlaylist;
  const visiblePlaylists = useMemo(() => playlists.filter((playlist) =>
    getTracksForPlaylist(playlist, itemsById).length > 0 || activeJobs.some((job) =>
      job.status !== "failed" && playlist.trackIds.includes(job.track.id),
    ),
  ), [activeJobs, itemsById, playlists]);
  const playlistItems = useMemo(() => {
    if (!selectedPlaylist) return [];
    if (selectedPlaylist.id === ALL_DOWNLOADS_ID) return items;
    return getTracksForPlaylist(selectedPlaylist, itemsById);
  }, [items, itemsById, selectedPlaylist]);
  const playlistTracks = useMemo(() => playlistItems.map((item) => item.track), [playlistItems]);
  const playlistJobs = useMemo(() => {
    if (!selectedPlaylist) return [];
    const trackIds = new Set(selectedPlaylist.trackIds);
    return activeJobs.filter((job) => trackIds.has(job.track.id));
  }, [activeJobs, selectedPlaylist]);
  const playlistBytes = playlistItems.reduce((sum, item) => sum + item.byteSize, 0);
  const hasContent = items.length > 0 || visiblePlaylists.length > 0 || activeJobs.length > 0;

  useEffect(() => {
    void refresh().finally(() => setHasLoaded(true));
  }, [refresh]);

  useEffect(() => {
    if (hasLoaded && selectedPlaylistId && !isAllDownloads && !savedPlaylist) {
      navigate("/downloads", { replace: true });
    }
  }, [hasLoaded, isAllDownloads, navigate, savedPlaylist, selectedPlaylistId]);

  const playAll = () => {
    const first = playlistItems[0]?.track;
    if (first && selectedPlaylist) {
      playerEngine.playTrack(first, playlistTracks, `downloads:${selectedPlaylist.id}`, selectedPlaylist.coverUrl);
    }
  };

  const openPlaylistHref = (playlistId: string) =>
    `/downloads?playlist=${encodeURIComponent(playlistId)}`;

  if (selectedPlaylist && selectedPlaylistId) {
    const coverUrl = selectedPlaylist.coverUrl || playlistItems[0]?.track.coverUrl || "";
    const coverUrls = selectedPlaylist.coverUrls.length > 0
      ? selectedPlaylist.coverUrls
      : playlistItems.map((item) => item.track.coverUrl).filter(Boolean).slice(0, 4);

    return (
      <div className="h-full w-full overflow-y-auto bg-transparent pb-24">
        <header className="px-8 pb-5 pt-7 max-md:px-4 max-md:pb-4 max-md:pt-5">
          <button
            type="button"
            onClick={() => navigate("/downloads", { replace: true })}
            className="mb-5 inline-flex h-9 items-center gap-2 rounded-lg border-0 bg-bg-elevated px-3 text-[13px] font-medium text-text-primary active:scale-[0.98]"
          >
            <ArrowLeftLine size={16} /> {t("downloads.back")}
          </button>
          <div className="flex flex-wrap items-center gap-4">
            <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-xl bg-bg-elevated max-md:h-20 max-md:w-20">
              {coverUrl ? (
                <CoverImage src={coverUrl} alt={selectedPlaylist.title} fill sizes="96px" className="object-cover" unoptimized />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-text-tertiary"><PlaylistFill size={30} /></div>
              )}
            </div>
            <div className="min-w-[180px] flex-1">
              <p className="mb-1 mt-0 text-[11px] font-medium uppercase tracking-wide text-text-tertiary">{t("downloads.offline_playlist")}</p>
              <h1 className="m-0 break-words text-[26px] font-bold tracking-tight text-text-primary max-md:text-[22px]">{selectedPlaylist.title}</h1>
              <p className="mb-0 mt-1 text-[12px] text-text-secondary">
                {trackCountLabel(playlistItems.length)} <span className="px-1.5 text-text-tertiary">·</span> {formatBytes(playlistBytes)}
              </p>
            </div>
            {playlistItems.length > 0 && (
              <button type="button" onClick={playAll} className="inline-flex h-10 items-center gap-2 rounded-xl border-0 bg-btn-primary-bg px-4 text-[13px] font-medium text-btn-primary-text active:scale-[0.98] max-md:w-full max-md:justify-center sm:ml-auto">
                <PlayFill size={16} /> {t("downloads.play_all")}
              </button>
            )}
          </div>
        </header>

        <main className="flex flex-col gap-6 px-8 pb-8 max-md:gap-5 max-md:px-4">
          {playlistJobs.length > 0 && (
            <section className="flex flex-col gap-2.5">
              <h2 className="m-0 text-[15px] font-semibold text-text-primary">{t("downloads.in_progress")}</h2>
              {playlistJobs.map((job) => <DownloadJobRow key={job.track.id} job={job} />)}
            </section>
          )}

          {isLoading ? (
            <div className="flex min-h-[30vh] items-center justify-center">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-text-tertiary border-t-text-secondary" />
            </div>
          ) : playlistItems.length === 0 && playlistJobs.length === 0 ? (
            <div className="flex min-h-[35vh] flex-col items-center justify-center gap-3 px-6 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-bg-elevated text-text-secondary"><DownloadFill size={26} /></div>
              <p className="m-0 max-w-[360px] text-[13px] leading-relaxed text-text-tertiary">{t("downloads.empty_playlist")}</p>
            </div>
          ) : (
            <section className="flex flex-col gap-1.5">
              <h2 className="mb-1 mt-0 text-[15px] font-semibold text-text-primary">{t("downloads.saved_songs")}</h2>
              {playlistItems.map((item) => (
                <SongCardWithMenu
                  key={item.track.id}
                  id={item.track.id}
                  title={item.track.title}
                  artists={item.track.artists}
                  coverUrl={item.track.coverUrl}
                  durationMs={item.track.durationMs}
                  onPlay={() => playerEngine.playTrack(item.track, playlistTracks, `downloads:${selectedPlaylist.id}`, selectedPlaylist.coverUrl)}
                  rightContent={<span className="whitespace-nowrap text-[11px] text-text-tertiary">{formatBytes(item.byteSize)}</span>}
                />
              ))}
            </section>
          )}
        </main>
      </div>
    );
  }

  return (
    <div className="h-full w-full overflow-y-auto bg-transparent pb-24">
      <header className="flex flex-wrap items-end justify-between gap-4 px-8 pb-5 pt-7 max-md:px-4 max-md:pb-4 max-md:pt-5">
        <div className="min-w-0">
          <h1 className="m-0 text-[26px] font-bold tracking-tight text-text-primary max-md:text-[22px]">{t("downloads.title")}</h1>
          <p className="mb-0 mt-1 text-[13px] text-text-tertiary">{t("downloads.subtitle")}</p>
          <p className="mb-0 mt-3 text-[12px] text-text-secondary">
            {trackCountLabel(items.length)} <span className="px-1.5 text-text-tertiary">·</span> {formatBytes(totalBytes)}
          </p>
        </div>
      </header>

      <main className="flex flex-col gap-7 px-8 pb-8 max-md:gap-5 max-md:px-4">
        {activeJobs.length > 0 && (
          <section className="flex flex-col gap-2.5">
            <h2 className="m-0 text-[15px] font-semibold text-text-primary">{t("downloads.in_progress")}</h2>
            {activeJobs.map((job) => <DownloadJobRow key={job.track.id} job={job} />)}
          </section>
        )}

        {isLoading ? (
          <div className="flex min-h-[35vh] items-center justify-center">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-text-tertiary border-t-text-secondary" />
          </div>
        ) : !hasContent ? (
          <div className="flex min-h-[42vh] flex-col items-center justify-center gap-3 px-6 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-bg-elevated text-text-secondary"><DownloadFill size={26} /></div>
            <h2 className="m-0 text-[17px] font-semibold text-text-primary">{t("downloads.empty_title")}</h2>
            <p className="m-0 max-w-[360px] text-[13px] leading-relaxed text-text-tertiary">{t("downloads.empty_desc")}</p>
            <button type="button" onClick={() => navigate("/")} className="mt-1 h-9 rounded-lg border border-border-primary bg-bg-elevated px-4 text-[13px] text-text-primary">
              {t("downloads.find_music")}
            </button>
          </div>
        ) : (
          <section className="flex flex-col gap-3">
            <h2 className="m-0 text-[15px] font-semibold text-text-primary">{t("downloads.playlists")}</h2>
            <div className="grid grid-cols-2 gap-x-4 gap-y-5 sm:grid-cols-3 lg:grid-cols-4">
              {(items.length > 0 || activeJobs.length > 0) && (
                <PlaylistCard
                  title={t("downloads.all_downloads")}
                  author={trackCountLabel(items.length)}
                  imageUrl={allCoverUrls[0] ?? ""}
                  coverUrls={allCoverUrls}
                  href={openPlaylistHref(ALL_DOWNLOADS_ID)}
                  className="w-full"
                />
              )}
              {visiblePlaylists.map((playlist) => {
                const downloadedCount = getTracksForPlaylist(playlist, itemsById).length;
                const pendingCount = activeJobs.filter((job) => playlist.trackIds.includes(job.track.id)).length;
                const coverUrls = playlist.coverUrls.length > 0
                  ? playlist.coverUrls
                  : getTracksForPlaylist(playlist, itemsById).map((item) => item.track.coverUrl).filter(Boolean).slice(0, 4);
                return (
                  <PlaylistCard
                    key={playlist.id}
                    title={playlist.title}
                    author={pendingCount > 0
                      ? t("downloads.playlist_progress", { saved: downloadedCount, pending: pendingCount })
                      : trackCountLabel(downloadedCount)}
                    imageUrl={playlist.coverUrl || coverUrls[0] || ""}
                    coverUrls={coverUrls}
                    href={openPlaylistHref(playlist.id)}
                    className="w-full"
                  />
                );
              })}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
