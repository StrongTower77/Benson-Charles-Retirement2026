import { createHmac, timingSafeEqual } from 'node:crypto';

export const COOKIE_NAME = 'bc_private_access';
export const SESSION_SECONDS = 60 * 60 * 24; // 24 hours, then reenter personal code

function key() {
  const value = process.env.RSVP_SESSION_SECRET;
  if (!value || value.length < 32) return null;
  return value;
}
function mac(part, secret) {
  return createHmac('sha256', secret).update(part).digest('base64url');
}
export function createSession(invitation) {
  const secret = key();
  if (!secret) throw new Error('Missing RSVP_SESSION_SECRET (at least 32 characters).');
  const payload = {
    v: 1,
    hash: invitation.codeHash,
    maxGuests: invitation.maxGuests,
    exp: Math.floor(Date.now() / 1000) + SESSION_SECONDS,
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const part = `v1.${encoded}`;
  return `${part}.${mac(part, secret)}`;
}
export function verifySession(token) {
  const secret = key();
  if (!secret || typeof token !== 'string' || token.length > 512) return null;
  const pieces = token.split('.');
  if (pieces.length !== 3 || pieces[0] !== 'v1' || !/^[\w-]+$/.test(pieces[1]) || !/^[\w-]+$/.test(pieces[2])) return null;
  const part = `${pieces[0]}.${pieces[1]}`;
  const expected = mac(part, secret);
  const actualBuf = Buffer.from(pieces[2]);
  const expectedBuf = Buffer.from(expected);
  if (actualBuf.length !== expectedBuf.length || !timingSafeEqual(actualBuf, expectedBuf)) return null;
  try {
    const payload = JSON.parse(Buffer.from(pieces[1], 'base64url').toString('utf8'));
    if (payload.v !== 1 || !/^[0-9a-f]{64}$/.test(payload.hash) ||
      !Number.isInteger(payload.maxGuests) || payload.maxGuests < 1 || payload.maxGuests > 12 ||
      !Number.isInteger(payload.exp) || payload.exp <= Math.floor(Date.now() / 1000) ||
      payload.exp > Math.floor(Date.now() / 1000) + SESSION_SECONDS + 60) return null;
    return payload;
  } catch { return null; }
}
export function tokenFromCookie(cookieHeader) {
  const item = String(cookieHeader || '').split(';').map(s => s.trim()).find(s => s.startsWith(`${COOKIE_NAME}=`));
  if (!item) return null;
  try { return decodeURIComponent(item.slice(COOKIE_NAME.length + 1)); } catch { return null; }
}
export function readSession(req) {
  return verifySession(tokenFromCookie(req.headers.cookie || req.headers.get?.('cookie')));
}
export function sameOrigin(req) {
  const origin = req.headers.origin;
  const host = req.headers.host;
  if (!origin || !host) return false;
  try { const url = new URL(origin); return url.host === host && url.protocol === 'https:' || (url.host === host && url.hostname === 'localhost'); }
  catch { return false; }
}
