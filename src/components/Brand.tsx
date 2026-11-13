import { Timer } from 'lucide-react';

export default function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="grid size-9 place-items-center rounded-xl bg-slate-900 text-sky-300 shadow-sm">
        <Timer className="size-[18px]" strokeWidth={2.4} />
      </span>
      {!compact && (
        <span className="font-display text-lg font-bold tracking-tight text-slate-900">
          Brief<span className="text-sky-600">Room</span>
        </span>
      )}
    </div>
  );
}
