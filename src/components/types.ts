import type { ChatMessageEvent } from '../types/chat';

export interface ChatMessage extends Omit<ChatMessageEvent, 'type'> {
  type: 'chat:message';
  /** Local receive time — expiry is measured from here to avoid clock skew. */
  receivedAt: number;
  reactions: Record<string, string[]>;
}

export interface SystemNote {
  id: string;
  text: string;
}
