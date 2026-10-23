import { useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { DownloadFill, CloseLine, PlayFill, Refresh3Line } from "@mingcute/react";
import SongCardWithMenu from "@/features/player/ui/SongCardWithMenu";
import { playerEngine } from "@/features/player";
import { useTranslation } from "@/languages";
import { useDownloadsStore, type DownloadJob } from "../downloadsStore";

function formatBytes(bytes: number): string {
  if (bytes <= 0) return "0 B";
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function DownloadJobRow({ job }: { job: DownloadJob }) {
  const { t } = useTranslation();
  const cancel = useDownloadsStore((state) => state.cancel);
  const enqueue = useDownloadsStore((state) => state.enqueue);
  const dismiss = useDownloadsStore((state) => state.cancel);
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
          <button type="button" aria-label={t("common.remove")} onClick={() => dismiss(job.track.id)} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border-0 bg-transparent text-text-tertiary hover:bg-border-alpha-14">
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

export default function DownloadsPage() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const items = useDownloadsStore((state) => state.items);
  const jobs = useDownloadsStore((state) => state.jobs);
  const isLoading = useDownloadsStore((state) => state.isLoading);
  const refresh = useDownloadsStore((state) => state.refresh);
  const activeJobs = useMemo(() => Object.values(jobs), [jobs]);
  const tracks = useMemo(() => items.map((item) => item.track), [items]);
  const totalBytes = items.reduce((sum, item) => sum + item.byteSize, 0);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const playAll = () => {
    const first = items[0]?.track;
    if (first) playerEngine.playTrack(first, tracks, "downloads", first.coverUrl);
  };

  return (
    <div className="h-full w-full overflow-y-auto bg-transparent pb-24">
      <header className="flex flex-wrap items-end justify-between gap-4 px-8 pb-5 pt-7 max-md:px-4 max-md:pb-4 max-md:pt-5">
        <div className="min-w-0">
          <h1 className="m-0 text-[26px] font-bold tracking-tight text-text-primary max-md:text-[22px]">{t("downloads.title")}</h1>
          <p className="mb-0 mt-1 text-[13px] text-text-tertiary">{t("downloads.subtitle")}</p>
          <p className="mb-0 mt-3 text-[12px] text-text-secondary">
            {t("downloads.song_count", { count: items.length })} <span className="px-1.5 text-text-tertiary">·</span> {formatBytes(totalBytes)}
          </p>
        </div>
        {items.length > 0 && (
          <button type="button" onClick={playAll} className="inline-flex h-10 items-center gap-2 rounded-xl border-0 bg-btn-primary-bg px-4 text-[13px] font-medium text-btn-primary-text active:scale-[0.98]">
            <PlayFill size={16} /> {t("downloads.play_all")}
          </button>
        )}
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
        ) : items.length === 0 ? (
          <div className="flex min-h-[42vh] flex-col items-center justify-center gap-3 px-6 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-bg-elevated text-text-secondary">
              <DownloadFill size={26} />
            </div>
            <h2 className="m-0 text-[17px] font-semibold text-text-primary">{t("downloads.empty_title")}</h2>
            <p className="m-0 max-w-[360px] text-[13px] leading-relaxed text-text-tertiary">{t("downloads.empty_desc")}</p>
            <button type="button" onClick={() => navigate("/")} className="mt-1 h-9 rounded-lg border border-border-primary bg-bg-elevated px-4 text-[13px] text-text-primary">
              {t("downloads.find_music")}
            </button>
          </div>
        ) : (
          <section className="flex flex-col gap-1.5">
            <h2 className="mb-1 mt-0 text-[15px] font-semibold text-text-primary">{t("downloads.saved_songs")}</h2>
            {items.map((item) => (
              <SongCardWithMenu
                key={item.track.id}
                id={item.track.id}
                title={item.track.title}
                artists={item.track.artists}
                coverUrl={item.track.coverUrl}
                durationMs={item.track.durationMs}
                onPlay={() => playerEngine.playTrack(item.track, tracks, "downloads", item.track.coverUrl)}
                rightContent={
                  <span className="whitespace-nowrap text-[11px] text-text-tertiary">{formatBytes(item.byteSize)}</span>
                }
              />
            ))}
          </section>
        )}
      </main>
    </div>
  );
}
