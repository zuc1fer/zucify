import { useMemo, useState } from "react";
import DropdownMenu, { type DropdownMenuItem } from "@/shared/ui/DropdownMenu";
import {
  TRACK_REACTION_EMOJIS,
  type TrackReaction,
  type TrackReactionEmoji,
} from "../socialApi";

interface TrackReactionsProps {
  title: string;
  reactions: TrackReaction[];
  disabled?: boolean;
  onReaction: (emoji: TrackReactionEmoji, reacted: boolean) => void;
}

export default function TrackReactions({
  title,
  reactions,
  disabled = false,
  onReaction,
}: TrackReactionsProps) {
  const [open, setOpen] = useState(false);
  const total = reactions.reduce((sum, reaction) => sum + reaction.count, 0);
  const selected = reactions.find((reaction) => reaction.reactedByMe);
  const items = useMemo<DropdownMenuItem[]>(
    () =>
      TRACK_REACTION_EMOJIS.map((emoji) => {
        const reaction = reactions.find((item) => item.emoji === emoji);
        const count = reaction?.count ?? 0;
        const reacted = reaction?.reactedByMe ?? false;
        return {
          id: emoji,
          label: `React with ${emoji}${count > 0 ? ` · ${count}` : ""}`,
          disabled,
          onClick: () => onReaction(emoji, !reacted),
        };
      }),
    [disabled, onReaction, reactions],
  );

  return (
    <div
      role="group"
      aria-label={`${title} reactions`}
      onClick={(event) => event.stopPropagation()}
      className="flex shrink-0 items-center"
    >
      <DropdownMenu
        trigger={
          <button
            type="button"
            aria-label={`Choose a reaction for ${title}`}
            aria-haspopup="menu"
            aria-expanded={open}
            aria-pressed={Boolean(selected)}
            disabled={disabled}
            title={`React to ${title}`}
            className={`inline-flex h-7 min-w-7 items-center justify-center gap-1 rounded-full border px-2 text-[12px] transition-colors disabled:pointer-events-none disabled:opacity-50 ${selected ? "border-emerald-500/40 bg-emerald-500/15 text-text-primary" : "border-transparent bg-transparent text-text-secondary hover:bg-border-alpha-14 hover:text-text-primary"}`}
          >
            <span aria-hidden="true">{selected?.emoji ?? "😊"}</span>
            {total > 0 && <span className="text-[10px] tabular-nums">{total}</span>}
          </button>
        }
        items={items}
        open={open}
        onOpenChange={setOpen}
        side="top"
        align="end"
      />
    </div>
  );
}
