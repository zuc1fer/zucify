import type { ReactNode } from "react";
import { ArrowLeftLine } from "@mingcute/react";

export const SIDEBAR_TITLE_CLASS =
  "m-0 text-[22px] leading-[1.2] tracking-[-0.02em] text-text-primary line-clamp-2";

export const SIDEBAR_SUBTITLE_CLASS =
  "m-0 text-[13px] leading-[1.55] text-text-secondary line-clamp-3";

export interface EntitySidebarProps {
  cover: ReactNode;
  coverClassName?: string;
  title: ReactNode;
  subtitle?: ReactNode;
  meta?: ReactNode;
  primaryAction?: ReactNode;
  actions?: ReactNode;
  onBack?: () => void;
  backLabel?: string;
  mobileCompact?: boolean;
}

export function EntitySidebar({
  cover,
  coverClassName,
  title,
  subtitle,
  meta,
  primaryAction,
  actions,
  onBack,
  backLabel = "Back",
  mobileCompact = false,
}: EntitySidebarProps) {
  const mobileAside = mobileCompact
    ? "max-md:static max-md:w-full max-md:shrink-0 max-md:flex max-md:flex-col max-md:items-center max-md:pt-[calc(env(safe-area-inset-top)+60px)] max-md:pb-4"
    : "";

  return (
    <aside className={`sticky top-[20px] w-[280px] shrink-0 self-start ${mobileAside}`} data-no-window-drag>
      {onBack && (
        <button
          type="button"
          onClick={onBack}
          className="inline-flex h-[32px] cursor-pointer items-center gap-[6px] rounded-md border-0 bg-transparent px-[8px] ml-[-8px] text-[13px] font-[500] text-text-tertiary transition-colors hover:bg-border-alpha-14 hover:text-text-primary"
          style={{ fontFamily: "var(--font-inter), sans-serif" }}
        >
          <ArrowLeftLine size={16} />
          <span className="relative -left-[1.5px] top-[1px]">{backLabel}</span>
        </button>
      )}

      <div
        className={`relative flex aspect-square w-full items-center justify-center overflow-hidden rounded-md ${
          coverClassName || "bg-border-alpha-14"
        } ${onBack ? "mt-[16px]" : ""} ${mobileCompact ? "max-md:w-[min(220px,58vw)] max-md:rounded-2xl" : ""}`}
      >
        {cover}
      </div>

      <div
        className={`mt-[16px] min-w-0 ${mobileCompact ? "max-md:w-full max-md:text-center" : ""}`}
        style={{ fontFamily: "var(--font-inter), sans-serif", fontWeight: 600 }}
      >
        {title}
      </div>

      {subtitle && (
        <div
          className={`mt-[6px] ${mobileCompact ? "max-md:w-full max-md:text-center" : ""}`}
          style={{ fontFamily: "var(--font-inter), sans-serif" }}
        >
          {subtitle}
        </div>
      )}

      {meta && (
        <div
          className={`m-0 mt-[8px] text-[12px] leading-[1.4] text-text-tertiary ${mobileCompact ? "max-md:w-full max-md:text-center" : ""}`}
          style={{ fontFamily: "var(--font-inter), sans-serif", fontWeight: 400 }}
        >
          {meta}
        </div>
      )}

      {primaryAction && <div className={`mt-[16px] ${mobileCompact ? "max-md:w-full max-md:max-w-[420px]" : ""}`}>{primaryAction}</div>}

      {actions && (
        <div className="mt-[8px] flex items-center gap-[8px]">{actions}</div>
      )}
    </aside>
  );
}

export default EntitySidebar;
