export default function StatusDot({ status }: { status: 'connecting' | 'open' | 'closed' }) {
  const label = status === 'open' ? 'Live' : status === 'connecting' ? 'Connecting' : 'Reconnecting';
  const color = status === 'open' ? 'bg-emerald-500' : 'bg-amber-400';
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white/80 px-2.5 py-1 font-mono text-[11px] uppercase tracking-wider text-slate-500">
      <span className="relative flex size-2">
        {status === 'open' && <span className={`absolute inline-flex size-full animate-ping rounded-full ${color} opacity-60`} />}
        <span className={`relative inline-flex size-2 rounded-full ${color}`} />
      </span>
      {label}
    </span>
  );
}
