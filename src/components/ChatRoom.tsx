import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  Check,
  Copy,
  ImagePlus,
  Link2,
  LogOut,
  Pencil,
  Send,
  Smile,
  Trash2,
  X,
} from 'lucide-react';
import Brand from './Brand';
import StatusDot from './StatusDot';
import MessageBubble from './MessageBubble';
import type { ChatMessage, SystemNote } from './types';
import type { ClientWsEvent, PeerInfo } from '../types/chat';
import { buildInviteLink, copyText, looksLikeUrl, prepareImage } from '../lib/utils';

const TTL_OPTIONS = [15, 30, 60] as const;
const QUICK_EMOJI = ['😀', '😂', '😍', '👍', '🙏', '🔥', '🎉', '😢', '😮', '👀', '✅', '❤️'];

interface Props {
  username: string;
  clientId: string;
  code: string;
  peers: PeerInfo[];
  messages: ChatMessage[];
  notes: SystemNote[];
  now: number;
  status: 'connecting' | 'open' | 'closed';
  peerTyping: string | null;
  send: (event: ClientWsEvent) => boolean;
  onLeave: () => void;
  onChangeUsername: (name: string) => void;
  onEvictOldest: () => void;
  onWipe: () => void;
  onError: (message: string) => void;
}

export default function ChatRoom(props: Props) {
  const { username, clientId, code, peers, messages, notes, now, status, peerTyping, send } = props;
  const [draft, setDraft] = useState('');
  const [ttl, setTtl] = useState<number>(30);
  const [linkMode, setLinkMode] = useState(false);
  const [linkLabel, setLinkLabel] = useState('');
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [newName, setNewName] = useState('');
  const [copied, setCopied] = useState<'code' | 'link' | null>(null);
  const [sendingImage, setSendingImage] = useState(false);
  const listRef = useRef<HTMLUListElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isTyping = useRef(false);

  const peer = peers.find((p) => p.clientId !== clientId);

  // Screen-full auto-delete: drop the oldest messages until everything fits without scrolling.
  const enforceFit = useCallback(() => {
    const el = listRef.current;
    if (!el || messages.length <= 1) return;
    if (el.scrollHeight > el.clientHeight + 1) props.onEvictOldest();
  }, [messages.length, props]);

  useLayoutEffect(() => {
    enforceFit();
  });

  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    const observer = new ResizeObserver(() => enforceFit());
    observer.observe(el);
    return () => observer.disconnect();
  }, [enforceFit]);

  // Drafts are wiped too when the screen locks or the tab is hidden.
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        setDraft('');
        setLinkLabel('');
        setNewName('');
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);

  const stopTyping = useCallback(() => {
    if (typingTimer.current) clearTimeout(typingTimer.current);
    if (isTyping.current) {
      isTyping.current = false;
      send({ type: 'chat:typing', isTyping: false });
    }
  }, [send]);

  useEffect(() => stopTyping, [stopTyping]);

  const onDraftChange = (value: string) => {
    setDraft(value);
    if (!isTyping.current && value) {
      isTyping.current = true;
      send({ type: 'chat:typing', isTyping: true });
    }
    if (typingTimer.current) clearTimeout(typingTimer.current);
    typingTimer.current = setTimeout(stopTyping, 2000);
  };

  const submit = () => {
    const text = draft.trim();
    if (!text) return;
    const id = crypto.randomUUID();
    const asLink = linkMode || looksLikeUrl(text);
    const ok = asLink
      ? send({ type: 'chat:send', id, kind: 'link', linkUrl: text, linkLabel: linkLabel.trim() || undefined, ttlSeconds: ttl })
      : send({ type: 'chat:send', id, kind: 'text', text, ttlSeconds: ttl });
    if (ok) {
      setDraft('');
      setLinkLabel('');
      setLinkMode(false);
      setEmojiOpen(false);
      stopTyping();
    }
  };

  const onPickImage = async (file: File | undefined) => {
    if (!file) return;
    setSendingImage(true);
    try {
      const dataUrl = await prepareImage(file);
      send({
        type: 'chat:send',
        id: crypto.randomUUID(),
        kind: 'image',
        mediaDataUrl: dataUrl,
        mediaName: file.name,
        text: draft.trim() || undefined,
        ttlSeconds: ttl,
      });
      setDraft('');
    } catch (err) {
      props.onError(err instanceof Error ? err.message : 'Could not attach that image.');
    } finally {
      setSendingImage(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const doCopy = async (kind: 'code' | 'link') => {
    const ok = await copyText(kind === 'code' ? code : buildInviteLink(code, username));
    if (ok) {
      setCopied(kind);
      setTimeout(() => setCopied(null), 1600);
    }
  };

  return (
    <main className="mx-auto flex h-dvh w-full max-w-3xl flex-col px-3 py-3 sm:px-5 sm:py-5">
      <header className="flex items-center justify-between gap-2 rounded-2xl border border-slate-200 bg-white/90 px-3 py-2.5 backdrop-blur sm:px-4">
        <div className="flex min-w-0 items-center gap-3">
          <Brand compact />
          <div className="min-w-0">
            <p className="truncate font-display text-[15px] font-bold text-slate-900">
              {peer ? peer.username : 'Waiting for someone…'}
            </p>
            <p className="truncate text-xs text-slate-500">
              {peerTyping ? (
                <span className="text-sky-600">{peerTyping} is typing…</span>
              ) : (
                <>You are <span className="font-medium text-slate-700">{username}</span> · {peers.length}/2</>
              )}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <span className="hidden sm:inline-flex"><StatusDot status={status} /></span>
          <IconButton label="Change username" onClick={() => { setRenaming(true); setNewName(username); }}>
            <Pencil className="size-4" />
          </IconButton>
          <IconButton label="Wipe room for both" onClick={props.onWipe}>
            <Trash2 className="size-4" />
          </IconButton>
          <IconButton label="Leave room" onClick={props.onLeave}>
            <LogOut className="size-4" />
          </IconButton>
        </div>
      </header>

      <div className="mt-2 flex flex-wrap items-center gap-2 rounded-2xl border border-dashed border-slate-300 bg-slate-50/80 px-3 py-2">
        <span className="font-mono text-[11px] uppercase tracking-wider text-slate-500">Secret code</span>
        <code className="rounded-lg bg-white px-2 py-0.5 font-mono text-sm font-semibold tracking-widest text-slate-900 ring-1 ring-slate-200">
          {code}
        </code>
        <div className="ml-auto flex gap-1.5">
          <SmallButton onClick={() => doCopy('code')}>
            {copied === 'code' ? <Check className="size-3.5" /> : <Copy className="size-3.5" />} Code
          </SmallButton>
          <SmallButton onClick={() => doCopy('link')}>
            {copied === 'link' ? <Check className="size-3.5" /> : <Link2 className="size-3.5" />} Invite link
          </SmallButton>
        </div>
      </div>

      <section className="relative mt-2 min-h-0 flex-1 overflow-hidden rounded-3xl border border-slate-200 bg-white/60">
        <ul ref={listRef} className="flex h-full flex-col justify-end gap-2.5 overflow-hidden p-3 sm:p-4">
          <AnimatePresence initial={false}>
            {messages.map((m) => (
              <MessageBubble
                key={m.id}
                message={m}
                mine={m.senderId === clientId}
                now={now}
                onReact={(emoji) => send({ type: 'chat:react', messageId: m.id, emoji })}
              />
            ))}
          </AnimatePresence>
        </ul>

        {messages.length === 0 && (
          <div className="pointer-events-none absolute inset-0 grid place-items-center p-6 text-center">
            <div>
              <p className="font-display text-lg font-semibold text-slate-700">
                {peer ? 'Nothing here — by design.' : 'Share your code to begin.'}
              </p>
              <p className="mt-1 text-sm text-slate-500">
                Messages vanish after their timer, when the screen fills, or when either screen locks.
              </p>
            </div>
          </div>
        )}

        <div className="pointer-events-none absolute inset-x-0 top-3 flex flex-col items-center gap-1.5">
          <AnimatePresence>
            {notes.map((n) => (
              <motion.span
                key={n.id}
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="rounded-full bg-slate-900/85 px-3 py-1 text-xs text-white shadow"
              >
                {n.text}
              </motion.span>
            ))}
          </AnimatePresence>
        </div>
      </section>

      <form
        className="mt-2 rounded-3xl border border-slate-200 bg-white p-2 shadow-sm"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        {emojiOpen && (
          <div className="mb-2 flex flex-wrap gap-1 border-b border-slate-100 px-1 pb-2">
            {QUICK_EMOJI.map((emoji) => (
              <button
                key={emoji}
                type="button"
                onClick={() => onDraftChange(draft + emoji)}
                className="rounded-lg px-1.5 py-1 text-xl transition hover:bg-slate-100"
              >
                {emoji}
              </button>
            ))}
          </div>
        )}
        {linkMode && (
          <input
            value={linkLabel}
            onChange={(e) => setLinkLabel(e.target.value)}
            placeholder="Link label (optional)"
            maxLength={120}
            className="mb-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-sky-400"
          />
        )}
        <div className="flex items-end gap-1.5">
          <div className="flex shrink-0 gap-0.5">
            <IconButton label="Quick emoji" active={emojiOpen} onClick={() => setEmojiOpen((v) => !v)}>
              <Smile className="size-[18px]" />
            </IconButton>
            <IconButton label="Attach image" onClick={() => fileRef.current?.click()} disabled={sendingImage}>
              <ImagePlus className="size-[18px]" />
            </IconButton>
            <IconButton label="Share link" active={linkMode} onClick={() => setLinkMode((v) => !v)}>
              <Link2 className="size-[18px]" />
            </IconButton>
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            hidden
            onChange={(e) => onPickImage(e.target.files?.[0])}
          />
          <textarea
            value={draft}
            onChange={(e) => onDraftChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                submit();
              }
            }}
            rows={1}
            maxLength={1000}
            placeholder={linkMode ? 'https://…' : sendingImage ? 'Preparing image…' : 'Write something brief…'}
            className="max-h-28 min-h-10 min-w-0 flex-1 resize-none bg-transparent px-2 py-2 text-[15px] outline-none placeholder:text-slate-400"
          />
          <div className="flex shrink-0 items-center gap-1.5">
            <div className="flex rounded-xl bg-slate-100 p-0.5" role="radiogroup" aria-label="Message timer">
              {TTL_OPTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  role="radio"
                  aria-checked={ttl === s}
                  onClick={() => setTtl(s)}
                  className={`rounded-lg px-1.5 py-1 font-mono text-[11px] font-semibold transition sm:px-2 ${
                    ttl === s ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  {s}s
                </button>
              ))}
            </div>
            <button
              type="submit"
              disabled={!draft.trim() || status !== 'open'}
              className="grid size-10 place-items-center rounded-xl bg-slate-900 text-white transition hover:bg-slate-700 disabled:bg-slate-300"
              aria-label="Send"
            >
              <Send className="size-4" />
            </button>
          </div>
        </div>
      </form>

      <AnimatePresence>
        {renaming && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-40 grid place-items-center bg-slate-900/40 p-4 backdrop-blur-sm"
            onClick={() => setRenaming(false)}
          >
            <motion.form
              initial={{ scale: 0.96, y: 8 }}
              animate={{ scale: 1, y: 0 }}
              onClick={(e) => e.stopPropagation()}
              onSubmit={(e) => {
                e.preventDefault();
                props.onChangeUsername(newName);
                setRenaming(false);
              }}
              className="w-full max-w-sm rounded-3xl bg-white p-6 shadow-2xl"
            >
              <div className="flex items-start justify-between">
                <h3 className="font-display text-lg font-bold text-slate-900">Change username</h3>
                <button type="button" onClick={() => setRenaming(false)} className="text-slate-400 hover:text-slate-600">
                  <X className="size-4" />
                </button>
              </div>
              <p className="mt-1.5 text-sm text-slate-600">
                This deletes every message on your screen, leaves this room, and gives you a{' '}
                <strong>new secret code</strong> to share again.
              </p>
              <input
                autoFocus
                value={newName}
                maxLength={24}
                onChange={(e) => setNewName(e.target.value)}
                className="mt-4 w-full rounded-xl border border-slate-200 px-3.5 py-2.5 outline-none focus:border-sky-400 focus:ring-4 focus:ring-sky-100"
              />
              <button
                disabled={!newName.trim() || newName.trim() === username}
                className="mt-3 w-full rounded-xl bg-slate-900 py-2.5 text-sm font-semibold text-white disabled:bg-slate-300"
              >
                Change &amp; get new code
              </button>
            </motion.form>
          </motion.div>
        )}
      </AnimatePresence>
    </main>
  );
}

function IconButton({
  children,
  label,
  onClick,
  active = false,
  disabled = false,
}: {
  children: React.ReactNode;
  label: string;
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      className={`grid size-9 place-items-center rounded-xl transition disabled:opacity-40 ${
        active ? 'bg-sky-100 text-sky-700' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-800'
      }`}
    >
      {children}
    </button>
  );
}

function SmallButton({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-700 hover:border-slate-300"
    >
      {children}
    </button>
  );
}
