import crypto from 'node:crypto';

export const DRIVER_SESSION_COOKIE = 'treelot_driver_session';

// 12h covers a full shift with margin. Combined with a session cookie
// (no Max-Age) the token also dies when the driver closes the browser.
const TOKEN_TTL_SECONDS = 12 * 60 * 60;

export type DriverSession = {
  driverId:   string;
  locationId: string;
  orgId:      string;
};

type Payload = DriverSession & { iat: number; exp: number };

function getSecret(): Buffer {
  const s = process.env.DRIVER_SESSION_SECRET;
  if (!s || s.length < 32) {
    throw new Error('DRIVER_SESSION_SECRET must be set (>=32 chars)');
  }
  return Buffer.from(s, 'utf8');
}

const b64url       = (buf: Buffer) => buf.toString('base64url');
const b64urlDecode = (s: string)   => Buffer.from(s, 'base64url');

export function signDriverSession(s: DriverSession): string {
  const now = Math.floor(Date.now() / 1000);
  const payload: Payload = { ...s, iat: now, exp: now + TOKEN_TTL_SECONDS };
  const body = b64url(Buffer.from(JSON.stringify(payload), 'utf8'));
  const mac  = crypto.createHmac('sha256', getSecret()).update(body).digest();
  return `${body}.${b64url(mac)}`;
}

export function verifyDriverSession(token: string): DriverSession | null {
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [body, sig] = parts;

  let provided: Buffer;
  try {
    provided = b64urlDecode(sig);
  } catch {
    return null;
  }

  const expected = crypto.createHmac('sha256', getSecret()).update(body).digest();
  if (expected.length !== provided.length) return null;
  if (!crypto.timingSafeEqual(expected, provided)) return null;

  let payload: Payload;
  try {
    payload = JSON.parse(b64urlDecode(body).toString('utf8'));
  } catch {
    return null;
  }

  const now = Math.floor(Date.now() / 1000);
  if (typeof payload.exp !== 'number' || payload.exp < now) return null;

  return {
    driverId:   payload.driverId,
    locationId: payload.locationId,
    orgId:      payload.orgId,
  };
}
