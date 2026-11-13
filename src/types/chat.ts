export type MessageKind = 'text' | 'image' | 'link';

export interface PeerInfo {
  clientId: string;
  username: string;
}

/** A user currently hosting (or sitting in) an active 1-to-1 room, shown in the lobby. */
export interface ActiveChatUser {
  id: string;
  username: string;
  isFull: boolean;
}

export type ClientWsEvent =
  | { type: 'ping' }
  | { type: 'lobby:subscribe' }
  | { type: 'room:create'; code: string; username: string; clientId: string }
  | { type: 'room:join'; code: string; username: string; targetUsername?: string; clientId: string }
  | { type: 'room:leave' }
  | {
      type: 'chat:send';
      id: string;
      kind: MessageKind;
      text?: string;
      mediaDataUrl?: string;
      mediaName?: string;
      linkUrl?: string;
      linkLabel?: string;
      ttlSeconds: number;
    }
  | { type: 'chat:typing'; isTyping: boolean }
  | { type: 'chat:react'; messageId: string; emoji: string }
  | { type: 'chat:wipe_room' };

export interface ChatMessageEvent {
  type: 'chat:message';
  id: string;
  senderId: string;
  senderUsername: string;
  kind: MessageKind;
  text: string;
  mediaDataUrl?: string;
  mediaName?: string;
  linkUrl?: string;
  linkLabel?: string;
  sentAt: number;
  ttlSeconds: number;
}

export type ServerWsEvent =
  | { type: 'pong' }
  | { type: 'error'; message: string }
  | { type: 'lobby:update'; users: ActiveChatUser[] }
  | { type: 'room:joined'; code: string; username: string; peers: PeerInfo[] }
  | { type: 'room:peer_joined'; peer: PeerInfo }
  | { type: 'room:peer_left'; clientId: string; username: string }
  | ChatMessageEvent
  | { type: 'chat:peer_typing'; username: string; isTyping: boolean }
  | { type: 'chat:reaction'; messageId: string; emoji: string; byUsername: string }
  | { type: 'chat:room_wiped'; byUsername: string };
