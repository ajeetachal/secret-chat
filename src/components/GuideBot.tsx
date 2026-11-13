import { useState } from 'react';
import { HelpCircle, Loader2, Send, X } from 'lucide-react';

interface Turn {
  role: 'user' | 'assistant';
  text: string;
}

export default function GuideBot() {
  const [open, setOpen] = useState(false);
  const [question, setQuestion] = useState('');
  const [turns, setTurns] = useState<Turn[]>([]);
  const [loading, setLoading] = useState(false);

  const ask = async () => {
    const q = question.trim();
    if (!q || loading) return;
    setQuestion('');
    setTurns((t) => [...t, { role: 'user', text: q }]);
    setLoading(true);
    try {
      const res = await fetch('/api/guide', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: q, history: turns }),
      });
      const data = (await res.json().catch(() => ({}))) as { answer?: string; error?: string };
      setTurns((t) => [...t, { role: 'assistant', text: data.answer ?? data.error ?? 'Something went wrong.' }]);
    } catch {
      setTurns((t) => [...t, { role: 'assistant', text: 'Could not reach the guide right now.' }]);
    } finally {
      setLoading(false);
    }
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-24 right-4 z-30 inline-flex items-center gap-1.5 rounded-full bg-sky-500 px-3.5 py-2 text-sm font-semibold text-white shadow-lg hover:bg-sky-600"
      >
        <HelpCircle className="size-4" /> Guide
      </button>
    );
  }

  return (
    <div className="fixed bottom-4 right-4 z-40 flex h-[26rem] w-[min(92vw,22rem)] flex-col rounded-3xl border border-slate-200 bg-white shadow-2xl">
      <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
        <p className="font-display font-bold text-slate-900">BriefRoom Guide</p>
        <button onClick={() => setOpen(false)} className="text-slate-400 hover:text-slate-600" aria-label="Close">
          <X className="size-4" />
        </button>
      </div>
      <div className="flex-1 space-y-2 overflow-y-auto p-3 text-sm">
        {turns.length === 0 && <p className="text-slate-500">Ask anything about how BriefRoom works.</p>}
        {turns.map((t, i) => (
          <p
            key={i}
            className={`whitespace-pre-wrap rounded-2xl px-3 py-2 ${
              t.role === 'user' ? 'ml-6 bg-slate-900 text-white' : 'mr-6 bg-slate-100 text-slate-800'
            }`}
          >
            {t.text}
          </p>
        ))}
        {loading && <Loader2 className="size-4 animate-spin text-slate-400" />}
      </div>
      <form
        className="flex gap-2 border-t border-slate-100 p-2"
        onSubmit={(e) => {
          e.preventDefault();
          ask();
        }}
      >
        <input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="How do timers work?"
          className="min-w-0 flex-1 rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-sky-400"
        />
        <button className="grid size-9 place-items-center rounded-xl bg-slate-900 text-white disabled:bg-slate-300" disabled={!question.trim()}>
          <Send className="size-4" />
        </button>
      </form>
    </div>
  );
}
