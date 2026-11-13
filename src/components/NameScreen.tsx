import { useState } from 'react';
import { motion } from 'motion/react';
import { ArrowRight, EyeOff, Lock, Timer, Users } from 'lucide-react';
import Brand from './Brand';
import StatusDot from './StatusDot';
import { normalizeUsername } from '../lib/utils';

interface Props {
  status: 'connecting' | 'open' | 'closed';
  inviteHost?: string;
  onSubmit: (username: string) => void;
}

const FACTS = [
  { icon: Users, title: 'Strictly 1-to-1', body: 'Two people per room. Never a group.' },
  { icon: Timer, title: '60 seconds, max', body: 'Every message self-destructs in 15, 30 or 60s.' },
  { icon: EyeOff, title: 'Lock = wipe', body: 'Hide the tab or lock the screen and it’s gone.' },
  { icon: Lock, title: 'Zero storage', body: 'No accounts, no history, no logs.' },
];

export default function NameScreen({ status, inviteHost, onSubmit }: Props) {
  const [value, setValue] = useState('');
  const name = normalizeUsername(value);

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col px-5 py-6 sm:px-8">
      <header className="flex items-center justify-between">
        <Brand />
        <StatusDot status={status} />
      </header>

      <div className="grid flex-1 items-center gap-12 py-12 lg:grid-cols-[1.1fr_1fr]">
        <motion.section initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
          <p className="mb-4 font-mono text-xs uppercase tracking-[0.2em] text-sky-700">Step 1 of 2 · No sign-up</p>
          <h1 className="font-display text-4xl font-bold leading-[1.05] tracking-tight text-slate-900 sm:text-6xl">
            Say it.
            <br />
            <span className="text-slate-400">Then it’s gone.</span>
          </h1>
          <p className="mt-5 max-w-md text-lg text-slate-600">
            Private, one-to-one rooms opened with a secret code. Messages live for a minute at most and never touch a
            disk.
          </p>

          <form
            className="mt-9 max-w-md"
            onSubmit={(e) => {
              e.preventDefault();
              if (name) onSubmit(name);
            }}
          >
            {inviteHost && (
              <p className="mb-3 rounded-xl border border-sky-200 bg-sky-50 px-3.5 py-2.5 text-sm text-sky-800">
                <strong>{inviteHost}</strong> invited you. Pick a username to join.
              </p>
            )}
            <label htmlFor="username" className="mb-2 block text-sm font-medium text-slate-700">
              Choose a username
            </label>
            <div className="flex gap-2 rounded-2xl border border-slate-200 bg-white p-1.5 shadow-sm focus-within:border-sky-400 focus-within:ring-4 focus-within:ring-sky-100">
              <input
                id="username"
                autoFocus
                autoComplete="off"
                maxLength={24}
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder="e.g. nightowl"
                className="min-w-0 flex-1 bg-transparent px-3 text-base outline-none placeholder:text-slate-400"
              />
              <button
                type="submit"
                disabled={!name}
                className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:bg-slate-300"
              >
                Continue <ArrowRight className="size-4" />
              </button>
            </div>
            <p className="mt-2 text-xs text-slate-500">Held in this tab’s memory only. Refreshing forgets it.</p>
          </form>
        </motion.section>

        <motion.ul
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.15, duration: 0.5 }}
          className="grid gap-3 sm:grid-cols-2"
        >
          {FACTS.map(({ icon: Icon, title, body }) => (
            <li key={title} className="rounded-2xl border border-slate-200/80 bg-white/70 p-5 backdrop-blur">
              <Icon className="mb-3 size-5 text-sky-600" />
              <p className="font-display font-semibold text-slate-900">{title}</p>
              <p className="mt-1 text-sm text-slate-600">{body}</p>
            </li>
          ))}
        </motion.ul>
      </div>
    </main>
  );
}
