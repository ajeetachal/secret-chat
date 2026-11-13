const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/** Random secret code like "K7QX-M2PA". Nothing is persisted. */
export function generateSecretCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  const chars = Array.from(bytes, (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]);
  return `${chars.slice(0, 4).join('')}-${chars.slice(4).join('')}`;
}

export function normalizeCode(raw: string): string {
  return raw.trim().toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 24);
}

export function normalizeUsername(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ').slice(0, 24);
}

export function buildInviteLink(code: string, host: string): string {
  const url = new URL(window.location.origin);
  url.searchParams.set('room', code);
  url.searchParams.set('host', host);
  return url.toString();
}

/** Accepts a full invite link, a bare query string, or a raw code. */
export function parseInvite(raw: string): { code: string; host?: string } | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  try {
    const url = new URL(trimmed.includes('://') ? trimmed : `https://x.local/${trimmed.startsWith('?') ? trimmed : ''}`);
    const code = url.searchParams.get('room');
    if (code) {
      const host = url.searchParams.get('host') ?? undefined;
      return { code: normalizeCode(code), host: host ? normalizeUsername(host) : undefined };
    }
  } catch {
    /* fall through to raw code */
  }
  const code = normalizeCode(trimmed);
  return code.length >= 4 ? { code } : null;
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

const MAX_DATA_URL_LEN = 1_100_000;

/** Downscales an image in-browser so it fits the relay's size limit. */
export async function prepareImage(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error('Only image files can be attached.');
  const bitmap = await createImageBitmap(file);
  let maxSide = 1280;
  let quality = 0.82;
  for (let attempt = 0; attempt < 6; attempt++) {
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const ctx = canvas.getContext('2d');
    if (!ctx) break;
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL('image/jpeg', quality);
    if (dataUrl.length <= MAX_DATA_URL_LEN) {
      bitmap.close();
      return dataUrl;
    }
    maxSide = Math.round(maxSide * 0.75);
    quality = Math.max(0.5, quality - 0.08);
  }
  bitmap.close();
  throw new Error('That image is too large to send.');
}

export function looksLikeUrl(text: string): boolean {
  return /^(https?:\/\/)?[\w-]+(\.[\w-]+)+(\/\S*)?$/i.test(text.trim());
}
