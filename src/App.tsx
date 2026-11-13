import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { AlertCircle, X } from 'lucide-react';
import { BriefSocket } from './lib/socket';
import { generateSecretCode, normalizeUsername } from './lib/utils';
import type { ActiveChatUser, ClientWsEvent, PeerInfo, ServerWsEvent } from './types/chat';
import type { ChatMessage, SystemNote } from './components/types';
import NameScreen from './components/NameScreen';
import Lobby from './components/Lobby';
import ChatRoom from './components/ChatRoom';
import GuideBot from './components/GuideBot';

type Step = 'name' | 'lobby' | 'room';
type ConnStatus = 'connecting' | 'open' | 'closed';

interface RoomInfo {
  code: string;
  peers: PeerInfo[];
}

/** Invite parameters are read once and removed from the address bar. */
function readInviteFromUrl(): { code: string; host?: string } | null {
  const params = new URLSearchParams(window.location.search);
  const code = params.get('room');
  if (!code) return null;
  const host = params.get('host') ?? undefined;
  window.history.replaceState(null, '', window.location.pathname);
  return { code, host };
}

export default function App() {
  const clientId = useRef(crypto.randomUUID());
  const [initialInvite] = useState(readInviteFromUrl);
  const [step, setStep] = useState<Step>('name');
  const [username, setUsername] = useState('');
  const [status, setStatus] = useState<ConnStatus>('connecting');
  const [lobbyUsers, setLobbyUsers] = useState<ActiveChatUser[]>([]);
  const [room, setRoom] = useState<RoomInfo | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [notes, setNotes] = useState<SystemNote[]>([]);
  const [peerTyping, setPeerTyping] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const socketRef = useRef<BriefSocket | null>(null);
  const usernameRef = useRef('');
  const roomRef = useRef<RoomInfo | null>(null);
  const rejoiningRef = useRef(false);
  usernameRef.current = username;
  roomRef.current = room;

  const send = useCallback((event: ClientWsEvent) => {
    const ok = socketRef.current?.send(event) ?? false;
    if (!ok) setError('Not connected yet — reconnecting to BriefRoom…');
    return ok;
  }, []);

  const addNote = useCallback((text: string) => {
    const note = { id: crypto.randomUUID(), text };
    setNotes((n) => [...n.slice(-2), note]);
    setTimeout(() => setNotes((n) => n.filter((x) => x.id !== note.id)), 4000);
  }, []);

  const wipeLocal = useCallback(() => {
    setMessages([]);
    setPeerTyping(null);
  }, []);

  const handleEvent = useCallback(
    (event: ServerWsEvent) => {
      switch (event.type) {
        case 'lobby:update':
          setLobbyUsers(event.users);
          break;
        case 'room:joined':
          rejoiningRef.current = false;
          setBusy(false);
          setRoom({ code: event.code, peers: event.peers });
          setStep('room');
          setError(null);
          break;
        case 'room:peer_joined':
          setRoom((r) => (r ? { ...r, peers: [...r.peers.filter((p) => p.clientId !== event.peer.clientId), event.peer] } : r));
          addNote(`${event.peer.username} joined the room`);
          break;
        case 'room:peer_left':
          setRoom((r) => (r ? { ...r, peers: r.peers.filter((p) => p.clientId !== event.clientId) } : r));
          setPeerTyping(null);
          addNote(`${event.username} left the room`);
          break;
        case 'chat:message':
          setMessages((m) =>
            m.some((x) => x.id === event.id) ? m : [...m, { ...event, receivedAt: Date.now(), reactions: {} }],
          );
          break;
        case 'chat:peer_typing':
          setPeerTyping(event.isTyping ? event.username : null);
          break;
        case 'chat:reaction':
          setMessages((m) =>
            m.map((msg) => {
              if (msg.id !== event.messageId) return msg;
              const users = msg.reactions[event.emoji] ?? [];
              const next = users.includes(event.byUsername)
                ? users.filter((u) => u !== event.byUsername)
                : [...users, event.byUsername];
              const reactions = { ...msg.reactions, [event.emoji]: next };
              if (next.length === 0) delete reactions[event.emoji];
              return { ...msg, reactions };
            }),
          );
          break;
        case 'chat:room_wiped':
          wipeLocal();
          addNote(`${event.byUsername} wiped the room`);
          break;
        case 'error': {
          setBusy(false);
          const current = roomRef.current;
          // After a reconnect the room may be gone (we were alone in it) — recreate it with the same code.
          if (rejoiningRef.current && current && event.message.startsWith('No active')) {
            rejoiningRef.current = false;
            socketRef.current?.send({
              type: 'room:create',
              code: current.code,
              username: usernameRef.current,
              clientId: clientId.current,
            });
            return;
          }
          if (rejoiningRef.current) {
            rejoiningRef.current = false;
            setRoom(null);
            setStep('lobby');
            wipeLocal();
          }
          setError(event.message);
          break;
        }
        default:
          break;
      }
    },
    [addNote, wipeLocal],
  );

  const handleEventRef = useRef(handleEvent);
  handleEventRef.current = handleEvent;

  useEffect(() => {
    const socket = new BriefSocket({
      onEvent: (e) => handleEventRef.current(e),
      onStatus: setStatus,
      onOpen: () => {
        socket.send({ type: 'lobby:subscribe' });
        const current = roomRef.current;
        if (current && usernameRef.current) {
          rejoiningRef.current = true;
          socket.send({
            type: 'room:join',
            code: current.code,
            username: usernameRef.current,
            clientId: clientId.current,
          });
        }
      },
    });
    socketRef.current = socket;
    socket.connect();
    return () => socket.close();
  }, []);

  // Screen-off / lock / tab hidden: wipe everything held in memory.
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') wipeLocal();
    };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', wipeLocal);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', wipeLocal);
    };
  }, [wipeLocal]);

  // Time-frame auto-delete.
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (messages.length === 0) return;
    const timer = setInterval(() => {
      const t = Date.now();
      setNow(t);
      setMessages((m) => {
        const kept = m.filter((msg) => msg.receivedAt + msg.ttlSeconds * 1000 > t);
        return kept.length === m.length ? m : kept;
      });
    }, 250);
    return () => clearInterval(timer);
  }, [messages.length]);

  const createRoom = useCallback(
    (name = usernameRef.current) => {
      setBusy(true);
      if (!send({ type: 'room:create', code: generateSecretCode(), username: name, clientId: clientId.current })) {
        setBusy(false);
      }
    },
    [send],
  );

  const joinRoom = useCallback(
    (code: string, targetUsername?: string) => {
      setBusy(true);
      if (
        !send({
          type: 'room:join',
          code,
          username: usernameRef.current,
          targetUsername: targetUsername || undefined,
          clientId: clientId.current,
        })
      ) {
        setBusy(false);
      }
    },
    [send],
  );

  const leaveRoom = useCallback(() => {
    send({ type: 'room:leave' });
    setRoom(null);
    wipeLocal();
    setStep('lobby');
  }, [send, wipeLocal]);

  const changeUsername = useCallback(
    (raw: string) => {
      const next = normalizeUsername(raw);
      if (!next || next === usernameRef.current) return;
      wipeLocal();
      send({ type: 'room:leave' });
      setRoom(null);
      setUsername(next);
      usernameRef.current = next;
      createRoom(next);
      addNote('Username changed — share your new secret code');
    },
    [addNote, createRoom, send, wipeLocal],
  );

  return (
    <div className="grain flex min-h-full flex-col">
      {step === 'name' && (
        <NameScreen
          status={status}
          inviteHost={initialInvite?.host}
          onSubmit={(name) => {
            setUsername(name);
            setStep('lobby');
          }}
        />
      )}
      {step === 'lobby' && (
        <Lobby
          username={username}
          status={status}
          users={lobbyUsers}
          busy={busy}
          initialInvite={initialInvite}
          onCreate={() => createRoom()}
          onJoin={joinRoom}
          onRename={() => setStep('name')}
        />
      )}
      {step === 'room' && room && (
        <ChatRoom
          username={username}
          clientId={clientId.current}
          code={room.code}
          peers={room.peers}
          messages={messages}
          notes={notes}
          now={now}
          status={status}
          peerTyping={peerTyping}
          send={send}
          onLeave={leaveRoom}
          onChangeUsername={changeUsername}
          onEvictOldest={() => setMessages((m) => m.slice(1))}
          onWipe={() => {
            wipeLocal();
            send({ type: 'chat:wipe_room' });
          }}
          onError={setError}
        />
      )}

      <GuideBot />

      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            className="fixed inset-x-0 top-4 z-50 mx-auto flex w-[min(92vw,30rem)] items-start gap-3 rounded-2xl border border-rose-200 bg-white px-4 py-3 text-sm text-rose-700 shadow-lg shadow-rose-100"
            role="alert"
          >
            <AlertCircle className="mt-0.5 size-4 shrink-0" />
            <p className="flex-1">{error}</p>
            <button onClick={() => setError(null)} className="text-rose-400 hover:text-rose-600" aria-label="Dismiss">
              <X className="size-4" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
