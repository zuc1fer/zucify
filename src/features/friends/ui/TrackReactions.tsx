import { TRACK_REACTION_EMOJIS, type TrackReaction, type TrackReactionEmoji } from "../socialApi";

interface TrackReactionsProps {
  title: string;
  reactions: TrackReaction[];
  disabled?: boolean;
  onReaction: (emoji: TrackReactionEmoji, reacted: boolean) => void;
}

export default function TrackReactions({ title, reactions, disabled = false, onReaction }: TrackReactionsProps) {
  return (
    <div role="group" aria-label={`${title} reactions`} className="flex shrink-0 items-center gap-[3px]">
      {TRACK_REACTION_EMOJIS.map((emoji) => {
        const reaction = reactions.find((item) => item.emoji === emoji);
        const count = reaction?.count ?? 0;
        const reacted = reaction?.reactedByMe ?? false;
        return (
          <button
            key={emoji}
            type="button"
            aria-label={`React with ${emoji} to ${title}${count ? ` (${count})` : ""}`}
            aria-pressed={reacted}
            title={`React with ${emoji}`}
            disabled={disabled}
            onClick={() => onReaction(emoji, !reacted)}
            className={`inline-flex h-[28px] min-w-[28px] items-center justify-center gap-[3px] rounded-full border px-[5px] text-[12px] transition-colors disabled:pointer-events-none disabled:opacity-50 ${reacted ? "border-emerald-500/40 bg-emerald-500/15 text-text-primary" : "border-transparent bg-transparent text-text-secondary hover:bg-border-alpha-14 hover:text-text-primary"}`}
          >
            <span aria-hidden="true">{emoji}</span>
            {count > 0 && <span className="text-[10px] tabular-nums">{count}</span>}
          </button>
        );
      })}
    </div>
  );
}
