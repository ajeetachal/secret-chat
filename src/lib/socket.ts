import type { ClientWsEvent, ServerWsEvent } from '../types/chat';

type Status = 'connecting' | 'open' | 'closed';

interface Handlers {
  onEvent: (event: ServerWsEvent) => void;
  onOpen: () => void;
  onStatus: (status: Status) => void;
}

/**
 * WebSocket client with automatic reconnection and exponential backoff.
 * The caller re-establishes lobby/room state in `onOpen`.
 */
export class BriefSocket {
  private ws: WebSocket | null = null;
  private attempt = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private stopped = false;

  constructor(private handlers: Handlers) {}

  connect(): void {
    this.stopped = false;
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${proto}//${window.location.host}/ws`);
    this.ws = ws;
    this.handlers.onStatus('connecting');

    ws.onopen = () => {
      this.attempt = 0;
      this.handlers.onStatus('open');
      this.pingTimer = setInterval(() => this.send({ type: 'ping' }), 25000);
      this.handlers.onOpen();
    };
    ws.onmessage = (msg) => {
      try {
        this.handlers.onEvent(JSON.parse(String(msg.data)) as ServerWsEvent);
      } catch {
        /* ignore malformed frames */
      }
    };
    ws.onclose = () => {
      this.cleanupTimers();
      if (this.ws === ws) this.ws = null;
      this.handlers.onStatus('closed');
      if (!this.stopped) this.scheduleReconnect();
    };
    ws.onerror = () => ws.close();
  }

  send(event: ClientWsEvent): boolean {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(event));
      return true;
    }
    return false;
  }

  close(): void {
    this.stopped = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.cleanupTimers();
    this.ws?.close();
    this.ws = null;
  }

  private scheduleReconnect(): void {
    const delay = Math.min(15000, 500 * 2 ** this.attempt) + Math.random() * 400;
    this.attempt++;
    this.reconnectTimer = setTimeout(() => this.connect(), delay);
  }

  private cleanupTimers(): void {
    if (this.pingTimer) clearInterval(this.pingTimer);
    this.pingTimer = null;
  }
}
