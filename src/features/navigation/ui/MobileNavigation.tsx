import { Link, useLocation } from "react-router-dom";
import { Capacitor } from "@capacitor/core";
import { useTranslation } from "@/languages";
import { sidebarNavItems } from "../data/navigation";
import { useModalStore } from "@/features/library";

interface MobileNavigationProps {
  searchOpen: boolean;
  onSearchToggle: () => void;
}

export default function MobileNavigation({
  searchOpen,
  onSearchToggle,
}: MobileNavigationProps) {
  const { pathname } = useLocation();
  const { t } = useTranslation();
  const settingsOpen = useModalStore((state) => state.settingsOpen);
  const toggleSettings = useModalStore((state) => state.toggleSettings);

  const isRouteActive = (href?: string) => {
    if (!href) return false;
    if (href === "/") return pathname === "/" || pathname === "/home";
    return pathname === href || pathname.startsWith(`${href}/`);
  };

  return (
    <nav
      aria-label="Main navigation"
      className="relative z-[45] grid shrink-0 grid-cols-5 border-t border-border-primary/60 bg-bg-primary/95 backdrop-blur-xl md:hidden"
      style={
        Capacitor.isNativePlatform()
          ? {
              height: "calc(62px + env(safe-area-inset-bottom))",
              paddingBottom: "env(safe-area-inset-bottom)",
            }
          : { height: 62 }
      }
    >
      {sidebarNavItems.map((item) => {
        const Icon = item.Icon;
        const active =
          item.id === "search"
            ? searchOpen
            : item.id === "settings"
              ? settingsOpen
              : isRouteActive(item.href);
        const label = t(`common.sidebar.${item.id}`) || item.label;
        const content = (
          <>
            <Icon size={21} className={active ? "text-accent-primary" : "text-text-tertiary"} />
            <span className={`text-[10px] leading-none ${active ? "text-text-primary font-medium" : "text-text-tertiary"}`}>
              {label}
            </span>
          </>
        );

        if (item.id === "search") {
          return (
            <button
              key={item.id}
              type="button"
              aria-label={label}
              aria-pressed={searchOpen}
              onClick={onSearchToggle}
              className="flex min-w-0 flex-col items-center justify-center gap-[5px] border-0 bg-transparent p-0 active:scale-95"
            >
              {content}
            </button>
          );
        }

        if (item.id === "settings") {
          return (
            <button
              key={item.id}
              type="button"
              aria-label={label}
              aria-pressed={settingsOpen}
              onClick={toggleSettings}
              className="flex min-w-0 flex-col items-center justify-center gap-[5px] border-0 bg-transparent p-0 active:scale-95"
            >
              {content}
            </button>
          );
        }

        return (
          <Link
            key={item.id}
            to={item.href!}
            aria-label={label}
            aria-current={active ? "page" : undefined}
            className="flex min-w-0 flex-col items-center justify-center gap-[5px] no-underline active:scale-95"
          >
            {content}
          </Link>
        );
      })}
    </nav>
  );
}
