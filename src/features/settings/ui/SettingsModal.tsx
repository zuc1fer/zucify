import { useState, useMemo, useEffect } from "react";
import { motion } from "framer-motion";
import { CloseLine, Search2Line, CloseCircleFill, ExitLine, DiscordFill, KeyboardLine } from "@mingcute/react";
import {
  Play,
  Palette,
  Gallery,
  HeadphonesRound,
  InfoCircle,
  Book2,
  QuestionCircle,
  Database,
  Widget5,
} from "@solar-icons/react";
import Dialog from "@/shared/ui/Dialog";
import { UserAvatar } from "@/shared/ui";
import { useTranslation, getTranslationsForAllLocales } from "@/languages";
import { useModalStore } from "@/features/library";
import { useAuthStore } from "@/features/auth";
import {
  PlaybackTab,
  ShortcutsTab,
  AppearanceTab,
  CustomizationTab,
  AudioTab,
  StorageTab,
  AboutTab,
  OverlayTab,
  DiscordTab,
} from "./tabs";

type TabId = "Playback" | "Shortcuts" | "Overlay" | "Discord" | "Appearance" | "Customization" | "Audio" | "Storage" | "About";
const MOBILE_TAB_IDS: TabId[] = ["Playback", "Appearance", "Audio", "Storage", "About"];

const TAB_ICONS: Record<TabId, React.ComponentType<any>> = {
  Playback: Play,
  Shortcuts: KeyboardLine,
  Overlay: Widget5,
  Discord: DiscordFill,
  Appearance: Palette,
  Customization: Gallery,
  Audio: HeadphonesRound,
  Storage: Database,
  About: InfoCircle,
};

const TAB_GROUPS: { labelKey: "preferences" | "application"; ids: TabId[] }[] = [
  { labelKey: "preferences", ids: ["Playback", "Shortcuts", "Overlay", "Discord", "Audio", "Appearance", "Customization"] },
  { labelKey: "application", ids: ["Storage", "About"] },
];


const SETTING_ITEMS: { tabId: TabId; titleKey: string; descKey?: string }[] = [
  // Playback
  { tabId: "Playback", titleKey: "settings.autoplay_similar.title", descKey: "settings.autoplay_similar.description" },
  { tabId: "Playback", titleKey: "settings.track_double_click.title", descKey: "settings.track_double_click.description" },
  { tabId: "Playback", titleKey: "settings.default_playback_context.title", descKey: "settings.default_playback_context.description" },
  { tabId: "Playback", titleKey: "settings.audio.pause_on_device_change.title", descKey: "settings.audio.pause_on_device_change.description" },

  // Shortcuts
  { tabId: "Shortcuts", titleKey: "settings.shortcuts.global_section", descKey: "settings.shortcuts.global_desc" },
  { tabId: "Shortcuts", titleKey: "settings.shortcuts.main_app_section", descKey: "settings.shortcuts.main_app_desc" },
  { tabId: "Shortcuts", titleKey: "settings.shortcuts.miniplayer_section", descKey: "settings.shortcuts.miniplayer_desc" },
  { tabId: "Shortcuts", titleKey: "settings.shortcuts.toggle_overlay", descKey: "settings.shortcuts.toggle_overlay_desc" },
  { tabId: "Shortcuts", titleKey: "settings.shortcuts.quick_like_song", descKey: "settings.shortcuts.quick_like_song_desc" },
  { tabId: "Shortcuts", titleKey: "settings.shortcuts.play_pause", descKey: "settings.shortcuts.play_pause_desc" },
  { tabId: "Shortcuts", titleKey: "settings.shortcuts.next_track", descKey: "settings.shortcuts.next_track_desc" },
  { tabId: "Shortcuts", titleKey: "settings.shortcuts.prev_track", descKey: "settings.shortcuts.prev_track_desc" },
  { tabId: "Shortcuts", titleKey: "settings.shortcuts.like_track", descKey: "settings.shortcuts.like_track_desc" },

  // Overlay
  { tabId: "Overlay", titleKey: "settings.overlay.position.title", descKey: "settings.overlay.position.description" },
  { tabId: "Overlay", titleKey: "settings.overlay.show_lyrics.title", descKey: "settings.overlay.show_lyrics.description" },
  { tabId: "Overlay", titleKey: "settings.overlay.auto_show_on_minimize.title", descKey: "settings.overlay.auto_show_on_minimize.description" },
  { tabId: "Overlay", titleKey: "settings.overlay.always_on_top.title", descKey: "settings.overlay.always_on_top.description" },

  // Discord
  { tabId: "Discord", titleKey: "settings.discord.enable.title", descKey: "settings.discord.enable.description" },
  { tabId: "Discord", titleKey: "settings.discord.show_timeline.title", descKey: "settings.discord.show_timeline.description" },
  { tabId: "Discord", titleKey: "settings.discord.show_artwork.title", descKey: "settings.discord.show_artwork.description" },
  { tabId: "Discord", titleKey: "settings.discord.show_artist_image.title", descKey: "settings.discord.show_artist_image.description" },
  { tabId: "Discord", titleKey: "settings.discord.show_paused.title", descKey: "settings.discord.show_paused.description" },
  { tabId: "Discord", titleKey: "settings.discord.show_button.title", descKey: "settings.discord.show_button.description" },
  { tabId: "Discord", titleKey: "settings.discord.show_download_button.title", descKey: "settings.discord.show_download_button.description" },

  // Appearance
  { tabId: "Appearance", titleKey: "settings.language.label", descKey: "settings.language.description" },
  { tabId: "Appearance", titleKey: "settings.theme.title", descKey: "settings.theme.description" },
  { tabId: "Appearance", titleKey: "settings.branding.title", descKey: "settings.branding.description" },

  // Customization
  { tabId: "Customization", titleKey: "settings.customization.wallpaper_title", descKey: "settings.customization.wallpaper_description" },
  { tabId: "Customization", titleKey: "settings.customization.blocks_title", descKey: "settings.customization.blocks_description" },
  { tabId: "Customization", titleKey: "settings.customization.reset_all", descKey: "settings.customization.reset_all_desc" },

  // Audio
  { tabId: "Audio", titleKey: "settings.audio.title", descKey: "settings.audio.description" },
  { tabId: "Audio", titleKey: "settings.connection.checks_title" },

  // Storage
  { tabId: "Storage", titleKey: "settings.storage.title", descKey: "settings.storage.description" },
  { tabId: "Storage", titleKey: "settings.storage.usage_title" },
  { tabId: "Storage", titleKey: "settings.storage.open_folder", descKey: "settings.storage.open_folder_description" },

  // About
  { tabId: "About", titleKey: "settings.about.liner", descKey: "common.app.version" },
  { tabId: "About", titleKey: "settings.notifications.test_button" },
];

const font = { fontFamily: "var(--font-inter), sans-serif" } as const;

export default function SettingsModal() {
  const { t } = useTranslation();
  const open = useModalStore((state) => state.settingsOpen);
  const close = useModalStore((state) => state.closeSettings);

  const [activeTab, setActiveTab] = useState<TabId>("Playback");
  const [searchQuery, setSearchQuery] = useState("");
  const [mobileDetailOpen, setMobileDetailOpen] = useState(false);

  const handleClose = () => {
    setSearchQuery("");
    setMobileDetailOpen(false);
    close();
  };

  const tabLabels: Record<TabId, string> = {
    Playback: t("settings.tabs.playback"),
    Shortcuts: t("settings.tabs.shortcuts") || "Shortcuts",
    Overlay: t("settings.tabs.overlay") || "Overlay",
    Discord: t("settings.tabs.discord") || "Discord RPC",
    Appearance: t("settings.tabs.appearance"),
    Customization: t("settings.tabs.customization") || "Customization",
    Audio: t("settings.tabs.audio"),
    Storage: t("settings.tabs.storage"),
    About: t("settings.tabs.about"),
  };

  const tabDescriptions: Record<TabId, string> = {
    Playback: t("settings.playback.description"),
    Shortcuts: t("settings.shortcuts.description") || "System-wide and player keyboard shortcuts.",
    Overlay: t("settings.overlay.description") || "Desktop overlay behavior, position and lyrics display.",
    Discord: t("settings.discord.description") || "Show what you're listening to on Discord with artwork, artist badge and progress bar.",
    Appearance: t("settings.theme.description"),
    Customization: t("settings.customization.description") || "Window background wallpaper, transparency and block blur effects.",
    Audio: t("settings.audio.description"),
    Storage: t("settings.storage.description"),
    About: t("settings.about.tagline"),
  };

  const matchingTabIds = useMemo(() => {
    if (!searchQuery.trim()) return null;
    const query = searchQuery.toLowerCase().trim();
    const set = new Set<TabId>();

    const TAB_LABEL_KEYS: Record<TabId, string> = {
      Playback: "settings.tabs.playback",
      Shortcuts: "settings.tabs.shortcuts",
      Overlay: "settings.tabs.overlay",
      Discord: "settings.tabs.discord",
      Appearance: "settings.theme.title",
      Customization: "settings.tabs.customization",
      Audio: "settings.tabs.audio",
      Storage: "settings.tabs.storage",
      About: "settings.tabs.about",
    };

    const TAB_DESC_KEYS: Record<TabId, string> = {
      Playback: "settings.playback.description",
      Shortcuts: "settings.shortcuts.description",
      Overlay: "settings.overlay.description",
      Discord: "settings.discord.description",
      Appearance: "settings.theme.description",
      Customization: "settings.customization.description",
      Audio: "settings.audio.description",
      Storage: "settings.storage.description",
      About: "settings.about.tagline",
    };


    (Object.keys(TAB_LABEL_KEYS) as TabId[]).forEach((tabId) => {
      const texts = [
        ...getTranslationsForAllLocales(TAB_LABEL_KEYS[tabId]),
        ...getTranslationsForAllLocales(TAB_DESC_KEYS[tabId]),
      ];
      if (texts.some((txt) => txt.toLowerCase().includes(query))) {
        set.add(tabId);
      }
    });

    SETTING_ITEMS.forEach((item) => {
      const texts = [
        ...getTranslationsForAllLocales(item.titleKey),
        ...(item.descKey ? getTranslationsForAllLocales(item.descKey) : []),
      ];
      if (texts.some((txt) => txt.toLowerCase().includes(query))) {
        set.add(item.tabId);
      }
    });

    return set;
  }, [searchQuery]);

  const filteredGroups = useMemo(() => {
    if (!matchingTabIds) return TAB_GROUPS;

    return TAB_GROUPS.map((group) => {
      const ids = group.ids.filter((id) => matchingTabIds.has(id));
      return { ...group, ids };
    }).filter((group) => group.ids.length > 0);
  }, [matchingTabIds]);

  useEffect(() => {
    if (!searchQuery.trim()) return;
    if (matchingTabIds && matchingTabIds.size > 0 && !matchingTabIds.has(activeTab)) {
      const candidateTabs =
        typeof window !== "undefined" && window.matchMedia("(max-width: 767px)").matches
          ? MOBILE_TAB_IDS
          : TAB_GROUPS.flatMap((group) => group.ids);
      const firstMatch = candidateTabs.find((id) => matchingTabIds.has(id));
      if (firstMatch) {
        setActiveTab(firstMatch);
      }
    }
  }, [searchQuery, matchingTabIds, activeTab]);

  const openExternal = (url: string) => {
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const user = useAuthStore((state) => state.user);
  const logout = useAuthStore((state) => state.logout);
  const displayName =
    user?.displayName ||
    user?.username ||
    user?.email?.split("@")[0] ||
    "Zucify";
  const handle = user?.username ? `@${user.username}` : (user?.email ?? t("settings.manage_account"));

  const renderActiveTab = () => (
    <>
      {activeTab === "Playback" && <PlaybackTab searchQuery={searchQuery} />}
      {activeTab === "Shortcuts" && <ShortcutsTab searchQuery={searchQuery} />}
      {activeTab === "Overlay" && <OverlayTab searchQuery={searchQuery} />}
      {activeTab === "Discord" && <DiscordTab searchQuery={searchQuery} />}
      {activeTab === "Appearance" && <AppearanceTab searchQuery={searchQuery} />}
      {activeTab === "Customization" && <CustomizationTab searchQuery={searchQuery} />}
      {activeTab === "Audio" && <AudioTab searchQuery={searchQuery} />}
      {activeTab === "Storage" && <StorageTab searchQuery={searchQuery} />}
      {activeTab === "About" && <AboutTab searchQuery={searchQuery} />}
    </>
  );

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => (!next ? handleClose() : undefined)}
      maxWidth={880}
      className="p-0 h-[620px] max-h-[86vh] !flex-row overflow-hidden !bg-bg-elevated !border-0 max-md:!m-0 max-md:!h-[100dvh] max-md:!max-h-none max-md:!max-w-none max-md:!flex-col max-md:!rounded-none max-md:pt-[env(safe-area-inset-top)]"
    >
      <div className="flex md:hidden min-h-0 flex-1 flex-col bg-bg-primary">
        {!mobileDetailOpen ? (
          <>
            <header className="flex shrink-0 items-center justify-between gap-4 border-b border-border-primary px-5 py-4">
              <div>
                <h2 className="m-0 text-[22px] font-semibold text-text-primary" style={font}>
                  {t("settings.title")}
                </h2>
              </div>
              <button
                type="button"
                aria-label={t("common.close") || "Close"}
                onClick={handleClose}
                className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-0 bg-border-alpha-14 text-text-primary"
              >
                <CloseLine size={19} />
              </button>
            </header>

            <div className="shrink-0 px-4 py-3">
              <div className="relative flex items-center">
                <Search2Line size={17} className="pointer-events-none absolute left-3 text-text-tertiary" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder={t("settings.search_placeholder")}
                  aria-label={t("settings.search_placeholder")}
                  className="h-11 w-full rounded-xl border-0 bg-border-alpha-14 pl-10 pr-10 text-base text-text-primary outline-none placeholder:text-text-tertiary focus:bg-border-alpha-20"
                  style={font}
                />
                {searchQuery ? (
                  <button
                    type="button"
                    aria-label={t("common.clear") || "Clear search"}
                    onClick={() => setSearchQuery("")}
                    className="absolute right-3 border-0 bg-transparent p-0 text-text-tertiary"
                  >
                    <CloseCircleFill size={17} />
                  </button>
                ) : null}
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-[calc(env(safe-area-inset-bottom)+16px)]">
              {TAB_GROUPS.map((group) => {
                const mobileIds = group.ids.filter(
                  (id) => MOBILE_TAB_IDS.includes(id) && (!matchingTabIds || matchingTabIds.has(id)),
                );
                if (mobileIds.length === 0) return null;
                return (
                  <section key={group.labelKey} className="mb-5">
                    <h3 className="mb-2 mt-2 px-1 text-[11px] font-semibold uppercase tracking-[0.1em] text-text-tertiary">
                      {t(`settings.groups.${group.labelKey}`)}
                    </h3>
                    <div className="overflow-hidden rounded-2xl border border-border-primary bg-bg-panel">
                      {mobileIds.map((id) => {
                        const Icon = TAB_ICONS[id];
                        return (
                          <button
                            key={id}
                            type="button"
                            onClick={() => {
                              setActiveTab(id);
                              setMobileDetailOpen(true);
                            }}
                            className="flex min-h-[70px] w-full items-center gap-3 border-0 border-b border-solid border-border-primary bg-transparent px-4 py-3 text-left last:border-b-0 active:bg-border-alpha-14"
                          >
                            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-border-alpha-14 text-text-secondary">
                              <Icon size={20} weight="Bold" />
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block text-[14px] font-medium text-text-primary">{tabLabels[id]}</span>
                              <span className="mt-1 block text-[12px] leading-snug text-text-tertiary">{tabDescriptions[id]}</span>
                            </span>
                            <span aria-hidden className="text-[25px] leading-none text-text-tertiary">&gt;</span>
                          </button>
                        );
                      })}
                    </div>
                  </section>
                );
              })}
              {searchQuery && !MOBILE_TAB_IDS.some((id) => !matchingTabIds || matchingTabIds.has(id)) ? (
                <p className="px-2 py-8 text-center text-[13px] text-text-tertiary">{t("search.no_results") || "No results found."}</p>
              ) : null}

              <div className="flex items-center gap-3 rounded-2xl border border-border-primary bg-bg-panel p-4">
                <UserAvatar user={user ?? null} size={40} />
                <div className="min-w-0 flex-1">
                  <p className="m-0 truncate text-[13px] font-medium text-text-primary">{displayName}</p>
                  <p className="m-0 mt-0.5 truncate text-[12px] text-text-tertiary">{handle}</p>
                </div>
                <button
                  type="button"
                  onClick={async () => {
                    handleClose();
                    await logout();
                  }}
                  aria-label={t("settings.profile.sign_out") || "Log out"}
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-0 bg-border-alpha-14 text-text-secondary"
                >
                  <ExitLine size={18} />
                </button>
              </div>
            </div>
          </>
        ) : (
          <>
            <header className="flex shrink-0 items-center gap-3 border-b border-border-primary px-4 py-3">
              <button
                type="button"
                onClick={() => setMobileDetailOpen(false)}
                aria-label={t("settings.title")}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-0 bg-border-alpha-14 text-text-primary"
              >
                <span aria-hidden className="text-[24px] leading-none">&lt;</span>
              </button>
              <h2 className="m-0 min-w-0 flex-1 truncate text-[18px] font-semibold text-text-primary" style={font}>
                {tabLabels[activeTab]}
              </h2>
              <button
                type="button"
                aria-label={t("common.close") || "Close"}
                onClick={handleClose}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-0 bg-border-alpha-14 text-text-primary"
              >
                <CloseLine size={19} />
              </button>
            </header>
            <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-[calc(env(safe-area-inset-bottom)+20px)] pt-3">
              <motion.div
                key={activeTab}
                initial={{ opacity: 0, y: 7 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.16, ease: "easeOut" }}
                className="flex flex-col"
              >
                {renderActiveTab()}
              </motion.div>
            </div>
          </>
        )}
      </div>

      <div className="hidden md:flex flex-1 min-w-0 min-h-0">
      <aside className="w-[248px] shrink-0 flex flex-col min-h-0 bg-transparent">
        <div className="hidden max-md:flex items-center justify-between px-4 pt-3 pb-2">
          <div className="min-w-0">
            <h2 className="m-0 text-[20px] font-semibold text-text-primary" style={font}>
              {t("settings.title")}
            </h2>
          </div>
          <button
            type="button"
            aria-label={t("common.close") || "Close"}
            onClick={handleClose}
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-0 bg-border-alpha-14 text-text-primary"
          >
            <CloseLine size={19} />
          </button>
        </div>
        <div className="px-[12px] pt-[14px] pb-[8px] max-md:px-4 max-md:pt-1 max-md:pb-3">
          <div className="relative flex items-center">
            <Search2Line
              size={15}
              className="absolute left-[10px] text-text-tertiary pointer-events-none"
            />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t("settings.search_placeholder")}
              className="w-full h-[32px] pl-[30px] pr-[26px] bg-border-alpha-14 text-text-primary text-[13px] rounded-[8px] border-0 outline-none placeholder:text-text-tertiary focus:bg-border-alpha-20 transition-colors max-md:h-11 max-md:rounded-xl max-md:pl-10 max-md:text-base"
              style={font}
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="absolute right-[6px] p-0 border-0 bg-transparent text-text-tertiary hover:text-text-primary cursor-pointer flex items-center justify-center"
              >
                <CloseCircleFill size={14} />
              </button>
            )}
          </div>
        </div>

        <nav
          className="flex-1 min-h-0 overflow-y-auto px-[12px] pb-[12px] flex flex-col gap-[14px] max-md:hidden"
          role="tablist"
          aria-label={t("settings.title")}
        >
          {filteredGroups.length === 0 ? (
            <p className="text-text-tertiary text-[12px] px-[10px] py-[8px] m-0" style={font}>
              {t("search.no_results") || "Ничего не найдено"}
            </p>
          ) : (
            filteredGroups.map((group) => (
            <div key={group.labelKey} className="flex flex-col gap-[2px]">
              <p
                className="text-text-tertiary text-[11px] font-[500] m-0 px-[10px] pb-[4px] pt-[2px]"
                style={font}
              >
                {t(`settings.groups.${group.labelKey}`)}
              </p>
              {group.ids.map((id) => {
                const isActive = id === activeTab;
                const Icon = TAB_ICONS[id];
                return (
                  <button
                    key={id}
                    type="button"
                    role="tab"
                    aria-selected={isActive}
                    onClick={() => setActiveTab(id)}
                    className={`w-full flex items-center gap-[10px] px-[10px] py-[8px] rounded-[8px] border-0 cursor-pointer text-left transition-colors ${
                      isActive
                        ? "bg-border-alpha-14 text-text-primary"
                        : "bg-transparent text-text-secondary hover:bg-border-alpha-14 hover:text-text-primary"
                    }`}
                    style={{ ...font, fontSize: "13.5px", fontWeight: isActive ? 500 : 400 }}
                  >
                    <Icon
                      size={18}
                      weight="Bold"
                      className={isActive ? "text-text-primary shrink-0" : "text-text-tertiary shrink-0"}
                    />
                    <span className="truncate leading-none">{tabLabels[id]}</span>
                  </button>
                );
              })}
            </div>
          )))}

          <div className="flex flex-col gap-[2px] pt-[2px] mt-[2px] border-t border-solid border-border-primary">
            <p
              className="text-text-tertiary text-[11px] font-[500] m-0 px-[10px] pt-[10px] pb-[4px]"
              style={font}
            >
              {t("settings.groups.help")}
            </p>
            <button
              type="button"
              onClick={() => openExternal("https://github.com/zuc1fer/zucify/blob/main/README.md")}
              className="w-full flex items-center gap-[10px] px-[10px] py-[8px] rounded-[8px] border-0 bg-transparent text-text-secondary hover:bg-border-alpha-14 hover:text-text-primary cursor-pointer text-left transition-colors"
              style={{ ...font, fontSize: "13.5px" }}
            >
              <Book2 size={18} weight="Bold" className="text-text-tertiary shrink-0" />
              <span className="leading-none">{t("settings.docs")}</span>
            </button>
            <button
              type="button"
              onClick={() => openExternal("https://t.me/liner_app?direct")}
              className="w-full flex items-center gap-[10px] px-[10px] py-[8px] rounded-[8px] border-0 bg-transparent text-text-secondary hover:bg-border-alpha-14 hover:text-text-primary cursor-pointer text-left transition-colors"
              style={{ ...font, fontSize: "13.5px" }}
            >
              <QuestionCircle size={18} weight="Bold" className="text-text-tertiary shrink-0" />
              <span className="leading-none">{t("settings.support")}</span>
            </button>
          </div>
        </nav>

        <nav
          className="hidden max-md:flex min-w-0 flex-none gap-2 overflow-x-auto px-4 pb-3"
          role="tablist"
          aria-label={t("settings.title")}
          style={{ scrollbarWidth: "none" }}
        >
          {TAB_GROUPS.flatMap((group) => group.ids)
            .filter((id) => !matchingTabIds || matchingTabIds.has(id))
            .map((id) => {
              const isActive = activeTab === id;
              const Icon = TAB_ICONS[id];
              return (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  onClick={() => setActiveTab(id)}
                  className={`inline-flex h-10 shrink-0 items-center gap-2 rounded-full border px-3 text-[12px] transition-colors ${
                    isActive
                      ? "border-border-alpha-20 bg-border-alpha-14 text-text-primary"
                      : "border-transparent bg-transparent text-text-secondary"
                  }`}
                  style={font}
                >
                  <Icon size={16} weight="Bold" />
                  <span>{tabLabels[id]}</span>
                </button>
              );
            })}
          <button
            type="button"
            onClick={() => openExternal("https://github.com/zuc1fer/zucify/blob/main/README.md")}
            className="inline-flex h-10 shrink-0 items-center gap-2 rounded-full border border-transparent bg-transparent px-3 text-[12px] text-text-secondary"
            style={font}
          >
            <Book2 size={16} weight="Bold" />
            <span>{t("settings.docs")}</span>
          </button>
          <button
            type="button"
            onClick={() => openExternal("https://t.me/liner_app?direct")}
            className="inline-flex h-10 shrink-0 items-center gap-2 rounded-full border border-transparent bg-transparent px-3 text-[12px] text-text-secondary"
            style={font}
          >
            <QuestionCircle size={16} weight="Bold" />
            <span>{t("settings.support")}</span>
          </button>
        </nav>

        <div className="shrink-0 p-[12px] pt-[8px] max-md:px-4 max-md:py-2">
          <div className="flex items-center gap-[10px] px-[6px] py-[4px] min-w-0">
            <span className="relative shrink-0">
              <UserAvatar user={user ?? null} size={32} />
              <span className="absolute right-[-1px] bottom-[-1px] w-[10px] h-[10px] rounded-full bg-[#12B76A] border-2 border-bg-primary" aria-hidden />
            </span>
            <span className="flex-1 min-w-0 flex flex-col leading-tight">
              <span
                className="text-text-primary text-[13px] font-[500] truncate"
                style={font}
              >
                {displayName}
              </span>
              <span
                className="text-text-tertiary text-[12px] truncate"
                style={font}
              >
                {handle}
              </span>
            </span>
            <button
              type="button"
              onClick={async () => {
                handleClose();
                await logout();
              }}
              title={t("settings.profile.sign_out") || "Log out"}
              aria-label={t("settings.profile.sign_out") || "Log out"}
              className="p-1.5 rounded-md text-text-tertiary hover:text-[#E81123] hover:bg-border-alpha-14 transition-colors border-0 bg-transparent cursor-pointer flex items-center justify-center shrink-0"
            >
              <ExitLine size={18} className="shrink-0" />
            </button>
          </div>
        </div>
      </aside>

      {/* ── Right secondary frame: same roundness, inset with padding, darker ── */}
      <div className="flex-1 min-w-0 min-h-0 p-[2px] flex">
        <div className="flex-1 min-w-0 min-h-0 flex flex-col rounded-xl bg-bg-primary overflow-hidden">
        <div className="flex items-start justify-between gap-[16px] px-[24px] pt-[20px] pb-[10px] shrink-0 max-md:px-4 max-md:pt-3 max-md:pb-2">
          <div className="min-w-0">
            <h3
              className="text-text-primary text-[15px] m-0 font-[600] tracking-[-0.01em]"
              style={font}
            >
              {tabLabels[activeTab]}
            </h3>
            <p
              className="text-text-tertiary text-[13px] m-0 mt-[3px] leading-snug"
              style={font}
            >
              {tabDescriptions[activeTab]}
            </p>
          </div>
          <button
            type="button"
            aria-label={t("common.close") || "Close"}
            onClick={handleClose}
            className="w-[28px] h-[28px] shrink-0 inline-flex items-center justify-center rounded-md text-text-tertiary hover:text-text-primary hover:bg-border-alpha-14 transition-colors border-0 bg-transparent p-0 cursor-pointer max-md:hidden"
          >
            <CloseLine size={17} />
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto px-[24px] pb-[16px] flex flex-col max-md:px-4 max-md:pb-[calc(env(safe-area-inset-bottom)+16px)]">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 7 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.12, ease: "easeOut" }}
            className="flex-1 flex flex-col"
          >
            {renderActiveTab()}
          </motion.div>
        </div>
        </div>
      </div>
      </div>
    </Dialog>
  );
}
