import { useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { KeyRound, Link2, Loader2, Pencil, Plus, UserRound, Users } from 'lucide-react';
import Brand from './Brand';
import StatusDot from './StatusDot';
import type { ActiveChatUser } from '../types/chat';
import { normalizeCode, normalizeUsername, parseInvite } from '../lib/utils';

interface Props {
  username: string;
  status: 'connecting' | 'open' | 'closed';
  users: ActiveChatUser[];
  busy: boolean;
  initialInvite: { code: string; host?: string } | null;
  onCreate: () => void;
  onJoin: (code: string, targetUsername?: string) => void;
  onRename: () => void;
}

export default function Lobby({ username, status, users, busy, initialInvite, onCreate, onJoin, onRename }: Props) {
  const [target, setTarget] = useState(initialInvite?.host ?? '');
  const [code, setCode] = useState(initialInvite?.code ?? '');
  const [invite, setInvite] = useState('');
  const codeInput = useRef<HTMLInputElement>(null);
  const autoJoined = useRef(false);

  // Opening an invite link joins automatically once connected.
  useEffect(() => {
    if (initialInvite && status === 'open' && !autoJoined.current) {
      autoJoined.current = true;
      onJoin(normalizeCode(initialInvite.code), initialInvite.host);
    }
  }, [initialInvite, status, onJoin]);

  const others = users.filter((u) => u.username.toLowerCase() !== username.toLowerCase());
  const canJoin = normalizeCode(code).length >= 4 && !busy && status === 'open';

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col px-5 py-6 sm:px-8">
      <header className="flex items-center justify-between gap-3">
        <Brand />
        <div className="flex items-center gap-2">
          <button
            onClick={onRename}
            className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1 text-sm text-slate-700 hover:border-slate-300"
          >
            <UserRound className="size-3.5 text-slate-400" />
            <span className="max-w-[9rem] truncate font-medium">{username}</span>
            <Pencil className="size-3 text-slate-400" />
          </button>
          <StatusDot status={status} />
        </div>
      </header>

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="grid flex-1 content-start gap-5 py-10 lg:grid-cols-[1fr_1.15fr]"
      >
        <section className="flex flex-col gap-5">
          <div className="rounded-3xl bg-slate-900 p-6 text-white shadow-xl shadow-slate-900/10">
            <p className="font-mono text-xs uppercase tracking-[0.2em] text-sky-300">Start your own</p>
            <h2 className="mt-2 font-display text-2xl font-bold">Open a 1-to-1 room</h2>
            <p className="mt-1.5 text-sm text-slate-300">
              You get a fresh secret code and invite link to share with one person.
            </p>
            <button
              onClick={onCreate}
              disabled={busy || status !== 'open'}
              className="mt-5 inline-flex items-center gap-2 rounded-xl bg-sky-400 px-4 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-sky-300 disabled:opacity-50"
            >
              {busy ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
              Create room
            </button>
          </div>

          <form
            className="rounded-3xl border border-slate-200 bg-white p-6"
            onSubmit={(e) => {
              e.preventDefault();
              if (canJoin) onJoin(normalizeCode(code), normalizeUsername(target) || undefined);
            }}
          >
            <h2 className="flex items-center gap-2 font-display text-lg font-bold text-slate-900">
              <KeyRound className="size-[18px] text-sky-600" /> Join with a secret code
            </h2>
            <div className="mt-4 grid gap-3">
              <input
                value={target}
                onChange={(e) => setTarget(e.target.value)}
                placeholder="Their username (optional)"
                maxLength={24}
                className="rounded-xl border border-slate-200 px-3.5 py-2.5 text-sm outline-none focus:border-sky-400 focus:ring-4 focus:ring-sky-100"
              />
              <input
                ref={codeInput}
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder="SECRET-CODE"
                maxLength={24}
                className="rounded-xl border border-slate-200 px-3.5 py-2.5 font-mono text-sm tracking-widest outline-none focus:border-sky-400 focus:ring-4 focus:ring-sky-100"
              />
              <button
                disabled={!canJoin}
                className="rounded-xl bg-slate-900 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:bg-slate-300"
              >
                Join room
              </button>
            </div>

            <div className="mt-5 border-t border-dashed border-slate-200 pt-4">
              <label className="mb-2 flex items-center gap-1.5 text-xs font-medium text-slate-500">
                <Link2 className="size-3.5" /> Or paste an invite link
              </label>
              <div className="flex gap-2">
                <input
                  value={invite}
                  onChange={(e) => setInvite(e.target.value)}
                  placeholder="https://…?room=…"
                  className="min-w-0 flex-1 rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-sky-400"
                />
                <button
                  type="button"
                  disabled={!parseInvite(invite) || busy || status !== 'open'}
                  onClick={() => {
                    const parsed = parseInvite(invite);
                    if (!parsed) return;
                    setCode(parsed.code);
                    if (parsed.host) setTarget(parsed.host);
                    onJoin(parsed.code, parsed.host);
                  }}
                  className="rounded-xl border border-slate-300 px-3 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40"
                >
                  Open
                </button>
              </div>
            </div>
          </form>
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white/80 p-6 backdrop-blur">
          <div className="flex items-center justify-between">
            <h2 className="flex items-center gap-2 font-display text-lg font-bold text-slate-900">
              <Users className="size-[18px] text-sky-600" /> Active right now
            </h2>
            <span className="font-mono text-xs text-slate-400">{others.length} online</span>
          </div>
          <p className="mt-1 text-sm text-slate-500">Pick someone, then enter the secret code they shared with you.</p>

          {others.length === 0 ? (
            <div className="mt-8 grid place-items-center rounded-2xl border border-dashed border-slate-200 py-14 text-center">
              <Users className="size-8 text-slate-300" />
              <p className="mt-3 text-sm font-medium text-slate-600">No open rooms yet</p>
              <p className="text-xs text-slate-400">Create one and share the code.</p>
            </div>
          ) : (
            <ul className="mt-5 grid gap-2">
              {others.map((u) => (
                <li key={u.id}>
                  <button
                    disabled={u.isFull}
                    onClick={() => {
                      setTarget(u.username);
                      codeInput.current?.focus();
                    }}
                    className={`flex w-full items-center gap-3 rounded-2xl border px-4 py-3 text-left transition ${
                      target.toLowerCase() === u.username.toLowerCase()
                        ? 'border-sky-300 bg-sky-50'
                        : 'border-slate-200 bg-white hover:border-slate-300'
                    } disabled:cursor-not-allowed disabled:opacity-60`}
                  >
                    <span className="grid size-9 place-items-center rounded-full bg-slate-100 font-display text-sm font-bold uppercase text-slate-600">
                      {u.username.slice(0, 2)}
                    </span>
                    <span className="flex-1 truncate font-medium text-slate-800">{u.username}</span>
                    <span
                      className={`rounded-full px-2 py-0.5 font-mono text-[11px] ${
                        u.isFull ? 'bg-slate-100 text-slate-500' : 'bg-emerald-50 text-emerald-700'
                      }`}
                    >
                      {u.isFull ? '2/2 full' : '1/2 open'}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </motion.div>
    </main>
  );
}
