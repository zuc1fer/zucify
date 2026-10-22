import UserAvatar from "@/shared/ui/UserAvatar";
import type { SharedPlaylistListener } from "../socialApi";

interface ListeningNowProps {
  listeners?: SharedPlaylistListener[];
  trackId: string;
}

function personName(listener: SharedPlaylistListener): string {
  return listener.user.displayName?.trim() || listener.user.username?.trim() || "A friend";
}

export default function ListeningNow({ listeners, trackId }: ListeningNowProps) {
  const active = (listeners ?? []).filter((listener) => listener.trackId === trackId);
  if (!active.length) return null;

  const description = active.map((listener) =>
    `${personName(listener)} ${listener.status === "paused" ? "paused on" : "is listening to"} this song`,
  ).join(", ");

  return (
    <div
      className="flex max-w-[170px] items-center gap-[5px] text-[10px] leading-none text-emerald-500"
      title={description}
      aria-label={description}
    >
      <span className="h-[6px] w-[6px] shrink-0 rounded-full bg-emerald-500" />
      <span className="shrink-0">Listening</span>
      <span className="flex shrink-0 -space-x-[5px]">
        {active.slice(0, 3).map((listener) => (
          <UserAvatar
            key={listener.userId}
            user={listener.user}
            size={17}
            className="!rounded-full border-bg-panel"
          />
        ))}
      </span>
      <span className="min-w-0 truncate text-text-secondary">
        {active.length === 1 ? personName(active[0]) : `${personName(active[0])} +${active.length - 1}`}
      </span>
    </div>
  );
}
