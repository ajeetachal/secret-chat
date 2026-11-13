import 'dotenv/config';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { WebSocketServer, WebSocket } from 'ws';
import { GoogleGenAI, ThinkingLevel } from '@google/genai';
import type { ActiveChatUser, ClientWsEvent, MessageKind, PeerInfo, ServerWsEvent } from './src/types/chat.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PORT = Number(process.env.PORT) || 3000;
const IS_PROD = process.env.NODE_ENV === 'production';

const MAX_ROOM_PARTICIPANTS = 2; // Strictly 1-to-1 chat (no group chats)
const MAX_IMAGE_DATA_URL_LEN = 1_200_000; // ~900KB binary max

interface RoomMember {
  socket: WebSocket;
  clientId: string;
  username: string;
  code: string;
  isAlive: boolean;
}

interface RoomState {
  publicId: string;
  hostUsername: string;
  members: Set<RoomMember>;
}

/**
 * Purely volatile in-memory map of currently active 1-to-1 rooms keyed by secret code.
 * Zero messages, media, links, or history are ever stored on the server.
 */
const rooms = new Map<string, RoomState>();
const memberBySocket = new Map<WebSocket, RoomMember>();
const lobbySubscribers = new Set<WebSocket>();

function normalizeCode(raw: string): string {
  return raw.trim().toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 24);
}

function normalizeUsername(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ').slice(0, 24);
}

function isSafeHttpUrl(raw: string): string | null {
  const trimmed = raw.trim().slice(0, 500);
  if (!trimmed) return null;
  try {
    const parsed = new URL(trimmed.startsWith('http://') || trimmed.startsWith('https://') ? trimmed : `https://${trimmed}`);
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
      return parsed.toString();
    }
    return null;
  } catch {
    return null;
  }
}

function isSafeImageDataUrl(raw: string): boolean {
  if (raw.length > MAX_IMAGE_DATA_URL_LEN) return false;
  return /^data:image\/(png|jpeg|jpg|webp|gif);base64,[A-Za-z0-9+/=]+$/i.test(raw);
}

function sendEvent(socket: WebSocket, payload: ServerWsEvent): void {
  if (socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(payload));
  }
}

function broadcastRoom(code: string, payload: ServerWsEvent, excludeSocket?: WebSocket): void {
  const room = rooms.get(code);
  if (!room) return;
  const raw = JSON.stringify(payload);
  for (const member of room.members) {
    if (member.socket !== excludeSocket && member.socket.readyState === WebSocket.OPEN) {
      member.socket.send(raw);
    }
  }
}

function getRoomPeers(code: string): PeerInfo[] {
  const room = rooms.get(code);
  if (!room) return [];
  const peers: PeerInfo[] = [];
  for (const member of room.members) {
    peers.push({ clientId: member.clientId, username: member.username });
  }
  return peers;
}

function getLobbyUsers(): ActiveChatUser[] {
  const users: ActiveChatUser[] = [];
  for (const room of rooms.values()) {
    if (room.members.size === 0) continue;
    users.push({
      id: room.publicId,
      username: room.hostUsername,
      isFull: room.members.size >= MAX_ROOM_PARTICIPANTS,
    });
  }
  return users;
}

function broadcastLobbyUpdate(): void {
  if (lobbySubscribers.size === 0) return;
  const payload = JSON.stringify({
    type: 'lobby:update',
    users: getLobbyUsers(),
  } satisfies ServerWsEvent);

  for (const subscriber of lobbySubscribers) {
    if (subscriber.readyState === WebSocket.OPEN) {
      subscriber.send(payload);
    } else {
      lobbySubscribers.delete(subscriber);
    }
  }
}

function leaveCurrentRoom(socket: WebSocket): void {
  const existing = memberBySocket.get(socket);
  if (!existing) return;

  const room = rooms.get(existing.code);
  if (room) {
    room.members.delete(existing);
    if (room.members.size === 0) {
      rooms.delete(existing.code);
    } else {
      const remaining = Array.from(room.members)[0];
      if (remaining) {
        room.hostUsername = remaining.username;
      }
      broadcastRoom(existing.code, {
        type: 'room:peer_left',
        clientId: existing.clientId,
        username: existing.username,
      });
    }
  }
  memberBySocket.delete(socket);
  broadcastLobbyUpdate();
}

const GUIDE_SYSTEM_INSTRUCTION = `You are the BriefRoom Guide Bot — a clear, friendly, concise assistant built into BriefRoom to explain how the app works.

BriefRoom core facts (never contradict these):
1. Simple 2-Step Start (No Account or Login):
   - Opening Page: Just create your username (no email, password, or sign-up).
   - Second Page: View available active usernames, join someone by entering their username & secret code, paste/punch an invitation link, or start your own 1-to-1 room and copy your secret code or invite link.
2. Strictly 1-to-1 Chat Only (No Group Chats): Every room allows at most 2 participants. A third person cannot join a full room.
3. Ephemeral Media, Links & Reactions:
   - Users can send text, attach photos/images, share clickable links, use quick emojis, react to messages, and see live typing status.
   - Everything (text, photos, links, reactions) is relayed in live memory only and follows the exact same auto-delete rules — nothing is ever stored.
4. Zero Storage & Zero History: No databases, no disk logs, no browser localStorage or sessionStorage.
5. Username Change Requires Sharing a New Code: Changing your username inside a chat immediately deletes all messages on your screen, leaves the old room, and creates a new Secret Code (and new invite link) to share again.
6. Screen-Off / Lock Wipe: Turning off or locking the screen or hiding the browser tab immediately deletes all messages and unsent drafts in memory.
7. Time-Frame Auto-Delete (Max 1 Minute): Senders pick 15s, 30s, or 60s (1 minute max) per message.
8. Screen-Full Auto-Delete: When messages fill the visible chat viewport, the oldest messages automatically delete right away so there is never a scrollable backlog.

Keep answers brief (2–4 sentences or short bullet points), direct, and easy to understand.`;

let geminiClient: GoogleGenAI | null = null;
function getGeminiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    return null;
  }
  if (!geminiClient) {
    geminiClient = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
  }
  return geminiClient;
}

async function startServer(): Promise<void> {
  const app = express();
  app.use(express.json({ limit: '64kb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, activeRooms: rooms.size });
  });

  app.get('/api/active-users', (_req, res) => {
    res.json({ users: getLobbyUsers() });
  });

  app.post('/api/guide', async (req, res) => {
    const body = req.body as {
      question?: unknown;
      history?: Array<{ role?: string; text?: string }>;
    };

    const question = typeof body?.question === 'string' ? body.question.trim() : '';
    if (!question) {
      res.status(400).json({ error: 'Please enter a question about how BriefRoom works.' });
      return;
    }

    const ai = getGeminiClient();
    if (!ai) {
      res.status(503).json({
        error: 'The AI guide service is not configured in this environment. Check Settings > Secrets for GEMINI_API_KEY.',
      });
      return;
    }

    try {
      const historyLines = Array.isArray(body.history)
        ? body.history
            .slice(-6)
            .filter((item) => typeof item?.text === 'string' && item.text.trim().length > 0)
            .map((item) => `${item.role === 'assistant' ? 'Guide' : 'User'}: ${item.text?.trim()}`)
            .join('\n')
        : '';

      const prompt = historyLines
        ? `Previous questions in this help session:\n${historyLines}\n\nUser's new question: ${question}`
        : question;

      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: prompt,
        config: {
          systemInstruction: GUIDE_SYSTEM_INSTRUCTION,
          thinkingConfig: {
            thinkingLevel: ThinkingLevel.LOW,
          },
        },
      });

      const answer = response.text?.trim();
      if (!answer) {
        res.status(502).json({ error: 'Guide Bot returned an empty response. Please try again.' });
        return;
      }

      res.json({ answer });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to reach Guide Bot right now.';
      console.error('Guide Bot error:', message);
      if (message.includes('403') || message.includes('PERMISSION_DENIED') || message.includes('API_KEY_INVALID')) {
        res.status(403).json({
          error: 'API key permission error. Please check your GEMINI_API_KEY in Settings > Secrets.',
        });
        return;
      }
      if (message.includes('429') || message.includes('RESOURCE_EXHAUSTED')) {
        res.status(429).json({
          error: 'Guide Bot is temporarily rate-limited. Please wait a few seconds and try again.',
        });
        return;
      }
      res.status(500).json({ error: 'Could not get an answer right now. Please try again.' });
    }
  });

  if (!IS_PROD) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  const server = http.createServer(app);
  const wss = new WebSocketServer({
    server,
    path: '/ws',
    maxPayload: 2 * 1024 * 1024,
  });

  wss.on('connection', (socket) => {
    socket.on('pong', () => {
      const member = memberBySocket.get(socket);
      if (member) member.isAlive = true;
    });

    socket.on('message', (rawData) => {
      const existingMember = memberBySocket.get(socket);
      if (existingMember) existingMember.isAlive = true;

      let event: ClientWsEvent;
      try {
        event = JSON.parse(rawData.toString()) as ClientWsEvent;
      } catch {
        sendEvent(socket, { type: 'error', message: 'Invalid message format.' });
        return;
      }

      if (event.type === 'ping') {
        if (existingMember) existingMember.isAlive = true;
        sendEvent(socket, { type: 'pong' });
        return;
      }

      if (event.type === 'lobby:subscribe') {
        lobbySubscribers.add(socket);
        sendEvent(socket, { type: 'lobby:update', users: getLobbyUsers() });
        return;
      }

      if (event.type === 'room:create') {
        const code = normalizeCode(event.code);
        const username = normalizeUsername(event.username);
        const clientId = typeof event.clientId === 'string' ? event.clientId.slice(0, 64) : '';

        if (code.length < 4) {
          sendEvent(socket, { type: 'error', message: 'Secret code must be at least 4 characters.' });
          return;
        }
        if (username.length < 1) {
          sendEvent(socket, { type: 'error', message: 'Username is required.' });
          return;
        }
        if (!clientId) {
          sendEvent(socket, { type: 'error', message: 'Missing session identifier.' });
          return;
        }

        leaveCurrentRoom(socket);

        if (rooms.has(code)) {
          sendEvent(socket, {
            type: 'error',
            message: 'That secret code is already in use. Generate a new code or join the existing chat.',
          });
          return;
        }

        const member: RoomMember = {
          socket,
          clientId,
          username,
          code,
          isAlive: true,
        };
        const room: RoomState = {
          publicId: crypto.randomUUID(),
          hostUsername: username,
          members: new Set<RoomMember>([member]),
        };
        rooms.set(code, room);
        memberBySocket.set(socket, member);

        sendEvent(socket, {
          type: 'room:joined',
          code,
          username,
          peers: getRoomPeers(code),
        });
        broadcastLobbyUpdate();
        return;
      }

      if (event.type === 'room:join') {
        const code = normalizeCode(event.code);
        const username = normalizeUsername(event.username);
        const targetUsername =
          typeof event.targetUsername === 'string' ? normalizeUsername(event.targetUsername) : '';
        const clientId = typeof event.clientId === 'string' ? event.clientId.slice(0, 64) : '';

        if (code.length < 4) {
          sendEvent(socket, { type: 'error', message: 'Secret code must be at least 4 characters.' });
          return;
        }
        if (username.length < 1) {
          sendEvent(socket, { type: 'error', message: 'Your username is required.' });
          return;
        }
        if (!clientId) {
          sendEvent(socket, { type: 'error', message: 'Missing session identifier.' });
          return;
        }

        const room = rooms.get(code);
        if (!room || room.members.size === 0) {
          sendEvent(socket, {
            type: 'error',
            message: 'No active 1-to-1 room found for that secret code.',
          });
          return;
        }

        const alreadyInRoom = Array.from(room.members).some((m) => m.clientId === clientId);
        if (!alreadyInRoom && room.members.size >= MAX_ROOM_PARTICIPANTS) {
          sendEvent(socket, {
            type: 'error',
            message: 'This 1-to-1 chat is already full (2/2). Group chats are not allowed.',
          });
          return;
        }

        if (targetUsername) {
          const matchesTarget = Array.from(room.members).some(
            (m) => m.username.toLowerCase() === targetUsername.toLowerCase(),
          );
          if (!matchesTarget) {
            sendEvent(socket, {
              type: 'error',
              message: `Secret code does not match username "${targetUsername}".`,
            });
            return;
          }
        }

        const duplicateName = Array.from(room.members).some(
          (m) => m.clientId !== clientId && m.username.toLowerCase() === username.toLowerCase(),
        );
        if (duplicateName) {
          sendEvent(socket, {
            type: 'error',
            message: `Username "${username}" is already taken in this chat. Pick a different username for yourself.`,
          });
          return;
        }

        leaveCurrentRoom(socket);

        const member: RoomMember = {
          socket,
          clientId,
          username,
          code,
          isAlive: true,
        };
        room.members.add(member);
        memberBySocket.set(socket, member);

        sendEvent(socket, {
          type: 'room:joined',
          code,
          username,
          peers: getRoomPeers(code),
        });

        broadcastRoom(
          code,
          {
            type: 'room:peer_joined',
            peer: { clientId, username },
          },
          socket,
        );
        broadcastLobbyUpdate();
        return;
      }

      if (event.type === 'room:leave') {
        leaveCurrentRoom(socket);
        return;
      }

      if (event.type === 'chat:send') {
        const member = memberBySocket.get(socket);
        if (!member) {
          sendEvent(socket, { type: 'error', message: 'Join a secret code room before sending messages.' });
          return;
        }

        const kind: MessageKind =
          event.kind === 'image' || event.kind === 'link' ? event.kind : 'text';
        const text = typeof event.text === 'string' ? event.text.trim().slice(0, 1000) : '';
        const id = typeof event.id === 'string' && event.id.length > 0 ? event.id.slice(0, 64) : crypto.randomUUID();
        const ttlSeconds = Math.min(60, Math.max(5, Math.round(Number(event.ttlSeconds) || 60)));
        const sentAt = Date.now();

        let mediaDataUrl: string | undefined;
        let mediaName: string | undefined;
        let linkUrl: string | undefined;
        let linkLabel: string | undefined;

        if (kind === 'image') {
          if (typeof event.mediaDataUrl !== 'string' || !isSafeImageDataUrl(event.mediaDataUrl)) {
            sendEvent(socket, { type: 'error', message: 'Image is too large or unsupported format.' });
            return;
          }
          mediaDataUrl = event.mediaDataUrl;
          mediaName = typeof event.mediaName === 'string' ? event.mediaName.slice(0, 80) : 'image';
        } else if (kind === 'link') {
          const validUrl = typeof event.linkUrl === 'string' ? isSafeHttpUrl(event.linkUrl) : null;
          if (!validUrl) {
            sendEvent(socket, { type: 'error', message: 'Please enter a valid http or https URL.' });
            return;
          }
          linkUrl = validUrl;
          linkLabel = typeof event.linkLabel === 'string' ? event.linkLabel.trim().slice(0, 120) : undefined;
        } else if (!text) {
          return;
        }

        // Relay directly to connected 1-to-1 peers without storing anything.
        broadcastRoom(member.code, {
          type: 'chat:message',
          id,
          senderId: member.clientId,
          senderUsername: member.username,
          kind,
          text,
          mediaDataUrl,
          mediaName,
          linkUrl,
          linkLabel,
          sentAt,
          ttlSeconds,
        });
        return;
      }

      if (event.type === 'chat:typing') {
        const member = memberBySocket.get(socket);
        if (!member) return;
        broadcastRoom(
          member.code,
          {
            type: 'chat:peer_typing',
            username: member.username,
            isTyping: Boolean(event.isTyping),
          },
          socket,
        );
        return;
      }

      if (event.type === 'chat:react') {
        const member = memberBySocket.get(socket);
        if (!member) return;
        const messageId = typeof event.messageId === 'string' ? event.messageId.slice(0, 64) : '';
        const emoji = typeof event.emoji === 'string' ? event.emoji.trim().slice(0, 8) : '';
        if (!messageId || !emoji) return;
        broadcastRoom(member.code, {
          type: 'chat:reaction',
          messageId,
          emoji,
          byUsername: member.username,
        });
        return;
      }

      if (event.type === 'chat:wipe_room') {
        const member = memberBySocket.get(socket);
        if (!member) return;
        broadcastRoom(member.code, {
          type: 'chat:room_wiped',
          byUsername: member.username,
        });
      }
    });

    socket.on('close', () => {
      lobbySubscribers.delete(socket);
      leaveCurrentRoom(socket);
    });

    socket.on('error', () => {
      lobbySubscribers.delete(socket);
      leaveCurrentRoom(socket);
    });
  });

  const heartbeatInterval = setInterval(() => {
    for (const [socket, member] of memberBySocket.entries()) {
      if (socket.readyState !== WebSocket.OPEN) {
        leaveCurrentRoom(socket);
        continue;
      }
      if (!member.isAlive) {
        socket.terminate();
        leaveCurrentRoom(socket);
        continue;
      }
      member.isAlive = false;
      socket.ping();
    }
  }, 30000);

  wss.on('close', () => {
    clearInterval(heartbeatInterval);
  });

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`BriefRoom server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start BriefRoom server:', err);
  process.exit(1);
});
