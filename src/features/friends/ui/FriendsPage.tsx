import { useCallback, useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { GroupFill, UserAddFill } from "@mingcute/react";
import { useAuthStore } from "@/features/auth/store/authStore";
import { playerEngine } from "@/features/player";
import { usePlayerStore } from "@/features/player/store/playerStore";
import {
  closeListeningRoomConnection,
  connectListeningRoom,
  getListeningRoom,
  leaveListeningRoom,
  subscribeListeningRoom,
  type ListeningRoomSnapshot,
} from "../listeningRoom";
import Button from "@/shared/ui/Button";
import TextInput from "@/shared/ui/TextInput";
import UserAvatar from "@/shared/ui/UserAvatar";
import TrackReactions from "./TrackReactions";
import {
  isSocialApiConfigured,
  socialApi,
  type FriendRequest,
  type ListeningSession,
  type SharedPlaylist,
  type SharedPlaylistTrack,
  type SocialMessage,
  type SocialPerson,
  type TrackReactionEmoji,
} from "../socialApi";

type PageTab = "people" | "messages" | "playlists" | "listening";

function personName(person?: SocialPerson | null): string {
  return person?.displayName?.trim() || person?.username?.trim() || "Zucify listener";
}

function personHandle(person?: SocialPerson | null): string {
  return person?.username ? `@${person.username}` : "";
}

function messageTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function trackLine(track?: { title?: string; artists?: string } | null): string {
  return track ? `${track.title} · ${track.artists}` : "No song selected";
}

function addedByName(item: SharedPlaylistTrack, currentUser?: SocialPerson | null): string {
  if (item.addedByUser) return personName(item.addedByUser);
  if (currentUser?.id === item.addedBy) return personName(currentUser);
  return "a playlist member";
}

function ErrorNotice({ children }: { children: ReactNode }) {
  return <div role="alert" className="rounded-md border border-red-500/25 bg-red-500/10 px-[14px] py-[10px] text-[13px] text-red-500">{children}</div>;
}

function EmptyState({ children }: { children: ReactNode }) {
  return <div className="flex min-h-[150px] items-center justify-center rounded-lg border border-dashed border-border-primary px-[18px] text-center text-[13px] text-text-tertiary">{children}</div>;
}

export default function FriendsPage() {
  const user = useAuthStore((state) => state.user);
  const currentTrack = usePlayerStore((state) => state.currentTrack);
  const playerStatus = usePlayerStore((state) => state.status);
  const playerPosition = usePlayerStore((state) => state.positionMs);
  const [activeTab, setActiveTab] = useState<PageTab>("people");
  const [friends, setFriends] = useState<SocialPerson[]>([]);
  const [requests, setRequests] = useState<FriendRequest[]>([]);
  const [playlists, setPlaylists] = useState<SharedPlaylist[]>([]);
  const [sessions, setSessions] = useState<ListeningSession[]>([]);
  const [messages, setMessages] = useState<SocialMessage[]>([]);
  const [selectedFriendId, setSelectedFriendId] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SocialPerson[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [messageDraft, setMessageDraft] = useState("");
  const [playlistTitle, setPlaylistTitle] = useState("");
  const [activeSessionId, setActiveSessionId] = useState("");
  const [roomStatus, setRoomStatus] = useState("");
  const friendsConfigured = isSocialApiConfigured();
  const selectedFriend = friends.find((friend) => friend.id === selectedFriendId) ?? null;
  const pendingIncoming = useMemo(() => requests.filter((request) => request.direction === "incoming"), [requests]);
  const pendingOutgoing = useMemo(() => requests.filter((request) => request.direction === "outgoing"), [requests]);
  const activeSession = sessions.find((session) => session.id === activeSessionId) ?? null;

  const reloadOverview = useCallback(async (showSpinner = false) => {
    if (!user?.id || !friendsConfigured) {
      setLoading(false);
      return;
    }
    if (showSpinner) setLoading(true);
    setError("");
    try {
      const overview = await socialApi.getOverview();
      const { friends: nextFriends, requests: nextRequests, playlists: nextPlaylists, sessions: nextSessions } = overview;
      setFriends(nextFriends);
      setRequests(nextRequests);
      setPlaylists(nextPlaylists);
      setSessions(nextSessions);
      setSelectedFriendId((current) => current && nextFriends.some((friend) => friend.id === current)
        ? current
        : nextFriends[0]?.id ?? "");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load Friends.");
    } finally {
      setLoading(false);
    }
  }, [user?.id, friendsConfigured]);

  useEffect(() => { void reloadOverview(true); }, [reloadOverview]);

  useEffect(() => {
    const existing = getListeningRoom();
    if (!user?.id) {
      if (existing) closeListeningRoomConnection(existing.sessionId);
      return;
    }
    if (existing && existing.userId !== user.id) {
      closeListeningRoomConnection(existing.sessionId);
      return;
    }
    const syncRoom = (snapshot: ListeningRoomSnapshot) => {
      if (snapshot.userId !== user.id) return;
      setRoomStatus(snapshot.status);
      if (snapshot.error) setError(snapshot.error);
      if (snapshot.ended) {
        setActiveSessionId("");
        void reloadOverview(false);
      } else if (snapshot.disconnected) {
        setActiveSessionId("");
      } else {
        setActiveSessionId(snapshot.sessionId);
      }
    };
    const unsubscribe = subscribeListeningRoom(syncRoom);
    if (existing) {
      syncRoom(existing);
      void connectListeningRoom({ id: existing.sessionId, hostId: existing.hostId }, user.id).catch((err) => {
        setError(err instanceof Error ? err.message : "Could not reconnect to the listening room.");
      });
    }
    return unsubscribe;
  }, [user?.id, reloadOverview]);

  useEffect(() => {
    if (!friendsConfigured || !user?.id) return;
    const interval = window.setInterval(() => { void reloadOverview(false); }, 15_000);
    return () => window.clearInterval(interval);
  }, [friendsConfigured, user?.id, reloadOverview]);

  useEffect(() => {
    const query = searchQuery.trim();
    if (query.length < 2) {
      setSearchResults([]);
      setSearchLoading(false);
      setSearchError("");
      return;
    }
    let cancelled = false;
    const timeout = window.setTimeout(async () => {
      setSearchLoading(true);
      setSearchError("");
      try {
        const results = await socialApi.searchPeople(query);
        if (!cancelled) setSearchResults(results.filter((person) => person.id !== user?.id));
      } catch (err) {
        if (!cancelled) {
          setSearchResults([]);
          setSearchError(err instanceof Error ? err.message : "Could not search for people.");
        }
      } finally {
        if (!cancelled) setSearchLoading(false);
      }
    }, 350);
    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
    };
  }, [searchQuery, user?.id]);

  useEffect(() => {
    if (activeTab !== "messages" || !selectedFriendId || !user?.id || !friendsConfigured) {
      setMessages([]);
      return;
    }
    let cancelled = false;
    const load = async () => {
      try {
        const result = await socialApi.getMessages(selectedFriendId);
        if (!cancelled) setMessages(result);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not load messages.");
      }
    };
    void load();
    const interval = window.setInterval(() => { void load(); }, 10_000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [activeTab, selectedFriendId, user?.id, friendsConfigured]);

  const runAction = async (action: () => Promise<unknown>, successMessage?: string) => {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await action();
      if (successMessage) setNotice(successMessage);
      await reloadOverview(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "That action did not work.");
    } finally {
      setBusy(false);
    }
  };

  const acceptRequest = (request: FriendRequest) => runAction(
    () => socialApi.respondToRequest(request.id, "accept"),
    `You and ${personName(request.from)} are now friends.`,
  );

  const declineRequest = (request: FriendRequest) => runAction(
    () => socialApi.respondToRequest(request.id, "decline"),
    "Friend request declined.",
  );

  const sendRequest = (person: SocialPerson) => runAction(
    () => socialApi.sendFriendRequest(person),
    `Friend request sent to ${personName(person)}.`,
  );

  const inviteStatus = (personId: string): "friend" | "incoming" | "outgoing" | null => {
    if (friends.some((friend) => friend.id === personId)) return "friend";
    const request = requests.find((item) => item.from.id === personId || item.to.id === personId);
    if (!request) return null;
    return request.direction === "incoming" ? "incoming" : "outgoing";
  };

  const sendMessage = async (event: FormEvent) => {
    event.preventDefault();
    const body = messageDraft.trim();
    if (!selectedFriendId || !body) return;
    setBusy(true);
    setError("");
    try {
      await socialApi.sendText(selectedFriendId, body);
      setMessageDraft("");
      setMessages(await socialApi.getMessages(selectedFriendId));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Message could not be sent.");
    } finally {
      setBusy(false);
    }
  };

  const shareCurrentSong = async () => {
    if (!selectedFriendId || !currentTrack) return;
    setBusy(true);
    setError("");
    try {
      await socialApi.sendSong(selectedFriendId, currentTrack);
      setMessages(await socialApi.getMessages(selectedFriendId));
      setNotice(`Shared “${currentTrack.title}” with ${personName(selectedFriend)}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Song could not be shared.");
    } finally {
      setBusy(false);
    }
  };

  const createPlaylist = async (event: FormEvent) => {
    event.preventDefault();
    const title = playlistTitle.trim();
    if (!title) return;
    setBusy(true);
    setError("");
    try {
      await socialApi.createPlaylist(title, selectedFriendId ? [selectedFriendId] : []);
      setPlaylistTitle("");
      setNotice("Shared playlist created.");
      await reloadOverview(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Playlist could not be created.");
    } finally {
      setBusy(false);
    }
  };

  const addCurrentTrack = async (playlist: SharedPlaylist) => {
    if (!currentTrack) return;
    await runAction(() => socialApi.addTrack(playlist.id, currentTrack), `Added “${currentTrack.title}” to ${playlist.title}.`);
  };

  const setTrackReaction = async (
    playlist: SharedPlaylist,
    item: SharedPlaylistTrack,
    emoji: TrackReactionEmoji,
    reacted: boolean,
  ) => {
    setBusy(true);
    setError("");
    try {
      const result = await socialApi.setTrackReaction(playlist.id, item.id, emoji, reacted);
      setPlaylists((current) => current.map((entry) => entry.id !== playlist.id ? entry : {
        ...entry,
        tracks: entry.tracks.map((track) => track.id === item.id ? { ...track, reactions: result.reactions } : track),
      }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update that reaction.");
    } finally {
      setBusy(false);
    }
  };

  const sharePlaylist = async (playlist: SharedPlaylist) => {
    if (!selectedFriendId) return;
    await runAction(() => socialApi.sendPlaylist(selectedFriendId, playlist.id), `Shared ${playlist.title} in your chat.`);
  };

  const addPlaylistFriend = async (playlist: SharedPlaylist) => {
    if (!selectedFriendId) return;
    await runAction(() => socialApi.addPlaylistMember(playlist.id, selectedFriendId), `${personName(selectedFriend)} added to ${playlist.title}.`);
  };

  const startListeningParty = async () => {
    if (!currentTrack) return;
    setBusy(true);
    setError("");
    try {
      const session = await socialApi.createHostedSession(currentTrack, playerPosition, playerStatus === "playing" ? "playing" : "paused");
      await connectListeningRoom(session, user!.id);
      await reloadOverview(false);
      const room = getListeningRoom();
      setActiveSessionId(room?.sessionId === session.id && room.connected ? session.id : "");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start a listening party.");
    } finally {
      setBusy(false);
    }
  };

  const joinListening = async (session: ListeningSession) => {
    setBusy(true);
    setError("");
    try {
      const joined = await socialApi.joinSession(session.id);
      await connectListeningRoom(joined, user!.id);
      await reloadOverview(false);
      const room = getListeningRoom();
      setActiveSessionId(room?.sessionId === session.id && room.connected ? session.id : "");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not join the listening room.");
    } finally {
      setBusy(false);
    }
  };

  const leaveListening = async () => {
    if (!activeSessionId) return;
    const id = activeSessionId;
    setBusy(true);
    try {
      await leaveListeningRoom(id);
      setActiveSessionId("");
      setRoomStatus("You left the listening session.");
      await reloadOverview(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not leave the session.");
    } finally {
      setBusy(false);
    }
  };

  const tabs: { id: PageTab; label: string; count?: number }[] = [
    { id: "people", label: "People", count: friends.length + pendingIncoming.length },
    { id: "messages", label: "Messages" },
    { id: "playlists", label: "Shared playlists" },
    { id: "listening", label: "Listening together", count: sessions.length },
  ];

  const renderRequest = (request: FriendRequest) => {
    const incoming = request.direction === "incoming";
    const person = incoming ? request.from : request.to;
    return (
      <div key={request.id} className="flex items-center gap-[12px] rounded-lg border border-border-primary bg-bg-primary px-[12px] py-[10px]">
        <UserAvatar user={person} size={38} />
        <div className="min-w-0 flex-1">
          <p className="m-0 truncate text-[13px] font-medium text-text-primary">{personName(person)}</p>
          <p className="m-0 truncate text-[12px] text-text-tertiary">{incoming ? "Wants to be your friend" : "Waiting for a reply"}</p>
        </div>
        {incoming ? <>
          <Button size="sm" onClick={() => void acceptRequest(request)} disabled={busy}>Accept</Button>
          <Button size="sm" variant="ghost" onClick={() => void declineRequest(request)} disabled={busy}>Decline</Button>
        </> : <span className="text-[12px] text-text-tertiary">Pending</span>}
      </div>
    );
  };

  if (!user) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-[14px] px-[24px] text-center">
        <GroupFill size={38} className="text-text-tertiary" />
        <h1 className="m-0 text-[23px] font-medium text-text-primary">Friends</h1>
        <p className="m-0 max-w-[420px] text-[14px] text-text-secondary">Sign in with your Liner account to find friends and listen together.</p>
        <Link to="/login" className="text-[14px] text-text-primary underline">Sign in</Link>
      </div>
    );
  }

  if (!friendsConfigured) {
    return (
      <div className="mx-auto flex max-w-[780px] flex-col gap-[16px] px-[28px] py-[48px]">
        <div className="flex items-center gap-[14px]"><GroupFill size={30} className="text-text-secondary" /><h1 className="m-0 text-[24px] font-medium text-text-primary">Friends</h1></div>
        <ErrorNotice>Set <code>VITE_SOCIAL_API_URL</code> in <code>.env.local</code> to your deployed Cloudflare Worker URL, then restart Zucify.</ErrorNotice>
        <p className="m-0 text-[13px] text-text-tertiary">The setup commands are in <code>cloudflare/social-worker/README.md</code>.</p>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto flex w-full max-w-[1100px] flex-col gap-[22px] px-[clamp(18px,4vw,42px)] py-[34px] pb-[50px]">
        <header className="flex flex-wrap items-end justify-between gap-[18px]">
          <div>
            <div className="mb-[7px] flex items-center gap-[10px] text-text-secondary"><GroupFill size={24} /><span className="text-[12px] uppercase tracking-[0.12em]">Zucify</span></div>
            <h1 className="m-0 text-[28px] font-medium leading-tight text-text-primary">Friends</h1>
            <p className="mb-0 mt-[6px] text-[13px] text-text-secondary">Find your people, share music, and press play together.</p>
          </div>
          <div className="flex items-center gap-[8px] text-[12px] text-text-tertiary"><span className="h-[7px] w-[7px] rounded-full bg-emerald-500" /> Signed in as {personName(user)}</div>
        </header>

        <nav className="flex w-fit max-w-full gap-[5px] overflow-x-auto rounded-lg border border-border-primary bg-bg-panel p-[4px]" aria-label="Friends sections">
          {tabs.map((tab) => (
            <button key={tab.id} type="button" onClick={() => setActiveTab(tab.id)} aria-current={activeTab === tab.id ? "page" : undefined}
              className={`flex shrink-0 items-center gap-[7px] rounded-md border-0 px-[13px] py-[9px] text-[13px] transition-colors ${activeTab === tab.id ? "bg-bg-primary text-text-primary shadow-sm" : "bg-transparent text-text-secondary hover:text-text-primary"}`}>
              {tab.label}{tab.count ? <span className="rounded-full bg-border-alpha-14 px-[6px] py-[1px] text-[10px]">{tab.count}</span> : null}
            </button>
          ))}
        </nav>

        {error && <ErrorNotice>{error}</ErrorNotice>}
        {notice && <div role="status" className="rounded-md border border-emerald-500/25 bg-emerald-500/10 px-[14px] py-[10px] text-[13px] text-emerald-600 dark:text-emerald-400">{notice}</div>}

        {loading ? <div className="py-[60px] text-center text-[13px] text-text-tertiary">Loading your friends…</div> : null}

        {!loading && activeTab === "people" && <section className="flex flex-col gap-[22px]">
          <div className="rounded-xl border border-border-primary bg-bg-panel p-[18px]">
            <div className="mb-[12px] flex items-center gap-[9px]"><UserAddFill size={19} className="text-text-secondary" /><h2 className="m-0 text-[16px] font-medium text-text-primary">Find people</h2></div>
            <TextInput value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="Search Zucify username or name" aria-label="Search people" />
            <p className="mb-0 mt-[8px] text-[11px] text-text-tertiary">People appear after they open Friends in Zucify once.</p>
            <div className="mt-[12px] flex flex-col gap-[8px]">
              {searchLoading && <p className="m-0 text-[12px] text-text-tertiary">Searching Zucify listeners…</p>}
              {searchError && <p role="alert" className="m-0 text-[12px] text-red-500">{searchError}</p>}
              {!searchLoading && !searchError && searchQuery.trim().length >= 2 && searchResults.length === 0 && <p className="m-0 text-[12px] text-text-tertiary">No matching people found.</p>}
              {searchResults.map((person) => {
                const status = inviteStatus(person.id);
                return <div key={person.id} className="flex items-center gap-[12px] rounded-lg border border-border-primary bg-bg-primary px-[12px] py-[10px]">
                  <UserAvatar user={person} size={40} />
                  <div className="min-w-0 flex-1"><p className="m-0 truncate text-[13px] font-medium text-text-primary">{personName(person)}</p><p className="m-0 truncate text-[12px] text-text-tertiary">{personHandle(person)}</p></div>
                  {status === "friend" ? <span className="text-[12px] text-text-tertiary">Friends</span>
                    : status === "outgoing" ? <span className="text-[12px] text-text-tertiary">Request sent</span>
                    : status === "incoming" ? <span className="text-[12px] text-text-tertiary">Check requests below</span>
                    : <Button size="sm" onClick={() => void sendRequest(person)} disabled={busy}>Add friend</Button>}
                </div>;
              })}
            </div>
          </div>

          {pendingIncoming.length > 0 && <div className="flex flex-col gap-[9px]"><h2 className="m-0 text-[15px] font-medium text-text-primary">Friend requests <span className="text-text-tertiary">({pendingIncoming.length})</span></h2>{pendingIncoming.map(renderRequest)}</div>}
          {pendingOutgoing.length > 0 && <div className="flex flex-col gap-[9px]"><h2 className="m-0 text-[15px] font-medium text-text-primary">Sent requests</h2>{pendingOutgoing.map(renderRequest)}</div>}
          <div className="flex flex-col gap-[9px]"><h2 className="m-0 text-[15px] font-medium text-text-primary">Your friends <span className="text-text-tertiary">({friends.length})</span></h2>
            {friends.length === 0 ? <EmptyState>Search for a friend above and send your first invite.</EmptyState> : friends.map((friend) => <div key={friend.id} className="flex items-center gap-[12px] rounded-lg border border-border-primary bg-bg-panel px-[12px] py-[10px]">
              <UserAvatar user={friend} size={42} /><div className="min-w-0 flex-1"><p className="m-0 truncate text-[13px] font-medium text-text-primary">{personName(friend)}</p><p className="m-0 truncate text-[12px] text-text-tertiary">{personHandle(friend)}</p></div>
              <Button size="sm" variant="secondary" onClick={() => { setSelectedFriendId(friend.id); setActiveTab("messages"); }}>Message</Button>
              <Button size="sm" variant="ghost" disabled={busy} onClick={() => void runAction(() => socialApi.removeFriend(friend.id), `${personName(friend)} removed from your friends.`)}>Remove</Button>
            </div>)}
          </div>
        </section>}

        {!loading && activeTab === "messages" && <section className="grid min-h-[430px] gap-[14px] md:grid-cols-[230px_minmax(0,1fr)]">
          <div className="flex flex-col gap-[6px] rounded-xl border border-border-primary bg-bg-panel p-[10px]">
            <h2 className="mb-[4px] mt-[4px] px-[7px] text-[12px] font-medium uppercase tracking-wide text-text-tertiary">Chats</h2>
            {friends.map((friend) => <button key={friend.id} onClick={() => setSelectedFriendId(friend.id)} className={`flex items-center gap-[9px] rounded-md border-0 p-[8px] text-left ${selectedFriendId === friend.id ? "bg-bg-primary" : "bg-transparent hover:bg-border-alpha-14"}`}>
              <UserAvatar user={friend} size={34} /><span className="truncate text-[13px] text-text-primary">{personName(friend)}</span>
            </button>)}
            {friends.length === 0 && <p className="px-[7px] text-[12px] text-text-tertiary">Add a friend before starting a chat.</p>}
          </div>
          <div className="flex min-h-[430px] flex-col overflow-hidden rounded-xl border border-border-primary bg-bg-panel">
            {selectedFriend ? <>
              <div className="flex items-center gap-[10px] border-b border-border-primary px-[16px] py-[12px]"><UserAvatar user={selectedFriend} size={36} /><div><p className="m-0 text-[13px] font-medium text-text-primary">{personName(selectedFriend)}</p><p className="m-0 text-[11px] text-text-tertiary">{personHandle(selectedFriend)}</p></div></div>
              <div className="flex flex-1 flex-col gap-[9px] overflow-y-auto px-[14px] py-[14px]">
                {messages.length === 0 ? <EmptyState>Send a message or share a song to start the conversation.</EmptyState> : messages.map((message) => {
                  const mine = message.fromId === user.id;
                  return <div key={message.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                    <div className={`max-w-[82%] rounded-lg px-[12px] py-[9px] ${mine ? "bg-btn-primary-bg text-btn-primary-text" : "bg-bg-primary text-text-primary"}`}>
                      {message.kind === "text" && <p className="m-0 whitespace-pre-wrap break-words text-[13px]">{message.body}</p>}
                      {message.kind === "song" && <button onClick={() => message.payload?.track && void playerEngine.playTrack(message.payload.track, [message.payload.track])} className="flex items-center gap-[10px] border-0 bg-transparent p-0 text-left">
                        <img src={message.payload?.track?.coverUrl || ""} alt="" className="h-[40px] w-[40px] rounded object-cover" /><span><span className="block text-[13px] font-medium">{message.payload?.track?.title || "Shared song"}</span><span className="block max-w-[220px] truncate text-[11px] opacity-70">{message.payload?.track?.artists}</span></span>
                      </button>}
                      {message.kind === "playlist" && <p className="m-0 text-[13px]">Shared a playlist. Open Shared playlists to find it.</p>}
                      <span className={`mt-[4px] block text-right text-[10px] ${mine ? "opacity-65" : "text-text-tertiary"}`}>{messageTime(message.createdAt)}</span>
                    </div>
                  </div>;
                })}
              </div>
              <div className="border-t border-border-primary p-[12px]">
                <p className="mb-[8px] mt-0 truncate text-[11px] text-text-tertiary">Now playing: {trackLine(currentTrack)}</p>
                <form onSubmit={(event) => void sendMessage(event)} className="flex gap-[8px]">
                  <TextInput value={messageDraft} onChange={(event) => setMessageDraft(event.target.value)} placeholder="Write a message" aria-label="Write a message" maxLength={2000} />
                  <Button type="submit" size="sm" disabled={busy || !messageDraft.trim()}>Send</Button>
                  <Button type="button" size="sm" variant="secondary" disabled={busy || !currentTrack} onClick={() => void shareCurrentSong()}>Share song</Button>
                </form>
              </div>
            </> : <EmptyState>Select a friend to see your messages.</EmptyState>}
          </div>
        </section>}

        {!loading && activeTab === "playlists" && <section className="flex flex-col gap-[18px]">
          <form onSubmit={(event) => void createPlaylist(event)} className="flex flex-wrap items-end gap-[9px] rounded-xl border border-border-primary bg-bg-panel p-[16px]">
            <label className="min-w-[200px] flex-1 text-[12px] text-text-secondary">Playlist name<TextInput className="mt-[6px]" value={playlistTitle} onChange={(event) => setPlaylistTitle(event.target.value)} placeholder="Late night mix" maxLength={100} /></label>
            <label className="min-w-[180px] text-[12px] text-text-secondary">Share with<select value={selectedFriendId} onChange={(event) => setSelectedFriendId(event.target.value)} className="mt-[6px] h-[44px] w-full rounded-md border border-border-primary bg-bg-primary px-[12px] text-[13px] text-text-primary" disabled={friends.length === 0}><option value="">Just me for now</option>{friends.map((friend) => <option key={friend.id} value={friend.id}>{personName(friend)}</option>)}</select></label>
            <Button type="submit" disabled={busy || !playlistTitle.trim()}>Create shared playlist</Button>
          </form>
          {playlists.length === 0 ? <EmptyState>Create a playlist above and add songs you and your friends want to hear.</EmptyState> : playlists.map((playlist) => <div key={playlist.id} className="overflow-hidden rounded-xl border border-border-primary bg-bg-panel">
            <div className="flex flex-wrap items-center gap-[10px] border-b border-border-primary px-[15px] py-[13px]"><div className="min-w-0 flex-1"><h2 className="m-0 truncate text-[15px] font-medium text-text-primary">{playlist.title}</h2><p className="m-0 mt-[3px] text-[11px] text-text-tertiary">{playlist.sourcePlaylistId ? "Linked playlist · " : ""}{playlist.members.length} member{playlist.members.length === 1 ? "" : "s"} · {playlist.tracks.length} song{playlist.tracks.length === 1 ? "" : "s"}</p></div>
              {friends.length > 0 && <Button size="sm" variant="secondary" onClick={() => void addPlaylistFriend(playlist)} disabled={busy || !selectedFriendId || playlist.members.some((member) => member.id === selectedFriendId)}>Add selected friend</Button>}
              {selectedFriendId && <Button size="sm" variant="ghost" onClick={() => void sharePlaylist(playlist)} disabled={busy}>Send to chat</Button>}
              <Button size="sm" variant="ghost" onClick={() => void addCurrentTrack(playlist)} disabled={busy || !currentTrack}>Add current song</Button>
            </div>
            {playlist.tracks.length === 0 ? <p className="m-[15px] text-[12px] text-text-tertiary">No songs yet. Play a song, then add it here.</p> : <div className="divide-y divide-border-primary">
              {playlist.tracks.map((item, index) => <div key={item.id} className="flex flex-wrap items-center gap-[8px] px-[14px] py-[9px]">
                <span className="w-[18px] text-center text-[11px] text-text-tertiary">{index + 1}</span><button className="flex min-w-[180px] flex-1 items-center gap-[10px] border-0 bg-transparent p-0 text-left" onClick={() => void playerEngine.playTrack(item.track, playlist.tracks.map((entry) => entry.track), `shared:${playlist.id}`)}>
                  <img src={item.track.coverUrl || ""} alt="" className="h-[38px] w-[38px] rounded object-cover" /><span className="min-w-0"><span className="block truncate text-[13px] text-text-primary">{item.track.title}</span><span className="block truncate text-[11px] text-text-tertiary">{item.track.artists}</span><span className="block truncate text-[10px] text-text-tertiary">Added by {addedByName(item, user)}</span></span>
                </button><TrackReactions title={item.track.title} reactions={item.reactions ?? []} disabled={busy} onReaction={(emoji, reacted) => void setTrackReaction(playlist, item, emoji, reacted)} />{!item.sourceItemId && <Button size="sm" variant="ghost" onClick={() => void runAction(() => socialApi.removeTrack(playlist.id, item.id), "Song removed from the shared playlist.")} disabled={busy}>Remove</Button>}
              </div>)}
            </div>}
          </div>)}
        </section>}

        {!loading && activeTab === "listening" && <section className="flex flex-col gap-[18px]">
          <div className="rounded-xl border border-border-primary bg-bg-panel p-[17px]">
            <h2 className="m-0 text-[16px] font-medium text-text-primary">Host a listening party</h2>
            <p className="mb-[14px] mt-[5px] text-[12px] text-text-secondary">Your friends can find and join this room here. You control playback; everyone else follows along.</p>
            <div className="flex flex-wrap items-center gap-[9px]">
              <div className="min-w-[220px] flex-1 rounded-md border border-border-primary bg-bg-primary px-[12px] py-[10px]"><p className="m-0 text-[10px] text-text-tertiary">Currently playing</p><p className="m-0 mt-[3px] truncate text-[12px] text-text-primary">{trackLine(currentTrack)}</p></div>
              <Button onClick={() => void startListeningParty()} disabled={busy || !currentTrack || !!activeSessionId}>Start listening party</Button>
            </div>
          </div>

          {activeSession && <div className="flex flex-wrap items-center gap-[13px] rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-[15px]">
            <img src={activeSession.track?.coverUrl || ""} alt="" className="h-[48px] w-[48px] rounded-md object-cover" />
            <div className="min-w-[160px] flex-1"><p className="m-0 text-[13px] font-medium text-text-primary">{activeSession.partyType === "playlist" ? `${activeSession.playlistTitle || "Shared playlist"} party` : trackLine(activeSession.track)}</p><p className="m-0 mt-[3px] text-[11px] text-emerald-600 dark:text-emerald-400">{roomStatus || (activeSession.status === "waiting" ? "Waiting for listeners…" : "Listening together")}</p></div>
            <Button size="sm" variant="secondary" onClick={() => void leaveListening()} disabled={busy}>{activeSession.partyType === "friends" && activeSession.hostId === user.id ? "End party" : "Leave party"}</Button>
          </div>}

          {sessions.length === 0 ? <EmptyState>No active listening parties. Start one, or join a friend’s room when it appears here.</EmptyState> : <div className="flex flex-col gap-[9px]">{sessions.map((session) => {
            const isHost = session.hostId === user.id;
            const other = isHost ? session.guest : session.host;
            const current = session.id === activeSessionId;
            return <div key={session.id} className="flex flex-wrap items-center gap-[12px] rounded-lg border border-border-primary bg-bg-panel px-[13px] py-[11px]">
              <img src={session.track?.coverUrl || ""} alt="" className="h-[42px] w-[42px] rounded object-cover" />
              <div className="min-w-[180px] flex-1"><p className="m-0 truncate text-[13px] font-medium text-text-primary">
                {session.partyType === "playlist"
                  ? `${session.playlistTitle || "Shared playlist"} party`
                  : session.partyType === "friends"
                    ? isHost ? "Your listening party" : `${personName(session.host)}’s listening party`
                    : isHost ? `You invited ${personName(other)}` : `${personName(session.host)} invited you`}
              </p><p className="m-0 mt-[2px] truncate text-[11px] text-text-tertiary">{session.partyType === "playlist" ? `${trackLine(session.track)} · ${session.memberCount ?? 1} members` : session.partyType === "friends" ? `${trackLine(session.track)} · ${session.memberCount ?? 1} listening` : trackLine(session.track)}</p></div>
              <span className="text-[11px] text-text-tertiary">{session.myStatus === "invited" ? "Invitation" : !session.myStatus && session.partyType === "friends" ? "Open to friends" : session.status === "waiting" ? "Waiting for listeners" : "In progress"}</span>
              {current ? <Button size="sm" variant="secondary" onClick={() => setRoomStatus("Listening together")}>In this room</Button>
                : <Button size="sm" onClick={() => void joinListening(session)} disabled={busy}>{isHost ? "Reconnect" : !session.myStatus ? "Join party" : "Accept & join"}</Button>}
            </div>;
          })}</div>}
          <p className="m-0 text-[11px] text-text-tertiary">Playlist party members share playback controls. In a Friends party, only the host controls playback. Each device streams separately, so a small delay can happen.</p>
        </section>}
      </div>
    </div>
  );
}
