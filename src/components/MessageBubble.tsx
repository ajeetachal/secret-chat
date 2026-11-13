import { ExternalLink, SmilePlus } from 'lucide-react';
import { useState } from 'react';
import { motion } from 'motion/react';
import type { ChatMessage } from './types';

const REACTIONS = ['👍', '❤️', '😂', '😮', '🔥'];

interface Props {
  message: ChatMessage;
  mine: boolean;
  now: number;
  onReact: (emoji: string) => void;
}

export default function MessageBubble({ message, mine, now, onReact }: Props) {
  const [picker, setPicker] = useState(false);
  const totalMs = message.ttlSeconds * 1000;
  const leftMs = Math.max(0, message.receivedAt + totalMs - now);
  const secondsLeft = Math.ceil(leftMs / 1000);
  const urgent = secondsLeft <= 5;

  return (
    <motion.li
      layout
      initial={{ opacity: 0, y: 8, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.96, filter: 'blur(4px)', transition: { duration: 0.25 } }}
      className={`group flex flex-col ${mine ? 'items-end' : 'items-start'}`}
    >
      <div className={`flex max-w-[85%] items-end gap-1.5 sm:max-w-[70%] ${mine ? 'flex-row-reverse' : ''}`}>
        <div
          className={`relative overflow-hidden rounded-2xl px-3.5 pb-3 pt-2 shadow-sm ${
            mine ? 'rounded-br-md bg-slate-900 text-white' : 'rounded-bl-md border border-slate-200 bg-white text-slate-800'
          }`}
        >
          {!mine && <p className="mb-0.5 text-[11px] font-semibold text-sky-700">{message.senderUsername}</p>}

          {message.kind === 'image' && message.mediaDataUrl && (
            <img
              src={message.mediaDataUrl}
              alt={message.mediaName || 'Shared image'}
              className="mb-1 mt-1 max-h-56 w-auto rounded-xl object-contain"
              draggable={false}
            />
          )}

          {message.kind === 'link' && message.linkUrl && (
            <a
              href={message.linkUrl}
              target="_blank"
              rel="noopener noreferrer nofollow"
              className={`mt-0.5 flex items-center gap-1.5 break-all text-sm font-medium underline underline-offset-2 ${
                mine ? 'text-sky-300' : 'text-sky-700'
              }`}
            >
              <ExternalLink className="size-3.5 shrink-0" />
              {message.linkLabel || message.linkUrl}
            </a>
          )}

          {message.text && message.kind !== 'link' && (
            <p className="whitespace-pre-wrap break-words text-[15px] leading-snug">{message.text}</p>
          )}

          <span
            className={`mt-1 block text-right font-mono text-[10px] ${
              urgent ? 'text-rose-400' : mine ? 'text-slate-400' : 'text-slate-400'
            }`}
          >
            {secondsLeft}s
          </span>
          <span
            className={`absolute inset-x-0 bottom-0 h-[3px] origin-left ${urgent ? 'bg-rose-400' : 'bg-sky-400'}`}
            style={{ animation: `ttl-drain ${leftMs}ms linear forwards` }}
          />
        </div>

        <div className="relative">
          <button
            onClick={() => setPicker((p) => !p)}
            className="rounded-full p-1 text-slate-400 opacity-0 transition hover:bg-slate-100 hover:text-slate-600 focus:opacity-100 group-hover:opacity-100"
            aria-label="React"
          >
            <SmilePlus className="size-4" />
          </button>
          {picker && (
            <div
              className={`absolute bottom-8 z-10 flex gap-0.5 rounded-full border border-slate-200 bg-white p-1 shadow-lg ${
                mine ? 'right-0' : 'left-0'
              }`}
            >
              {REACTIONS.map((emoji) => (
                <button
                  key={emoji}
                  onClick={() => {
                    onReact(emoji);
                    setPicker(false);
                  }}
                  className="rounded-full px-1.5 py-0.5 text-lg transition hover:scale-125"
                >
                  {emoji}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {Object.keys(message.reactions).length > 0 && (
        <div className={`mt-1 flex flex-wrap gap-1 ${mine ? 'justify-end' : ''}`}>
          {Object.entries(message.reactions).map(([emoji, users]) => (
            <button
              key={emoji}
              onClick={() => onReact(emoji)}
              title={users.join(', ')}
              className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-xs shadow-sm"
            >
              {emoji} <span className="font-mono text-slate-500">{users.length}</span>
            </button>
          ))}
        </div>
      )}
    </motion.li>
  );
}
