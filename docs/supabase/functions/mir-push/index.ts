/*
 * mir-push · notificaciones push para «MIR 2027 · Temporizador de estudio».
 *
 * Función de Supabase (Edge Function, Deno). Sin dependencias: el cifrado de
 * Web Push (RFC 8291, aes128gcm) y la firma VAPID (RFC 8292) se hacen con
 * WebCrypto, que el runtime trae de serie.
 *
 * Qué hace:
 *   - Genera la primera vez sus claves VAPID y las guarda en `push_config`.
 *     Nadie tiene que crearlas ni copiarlas a mano.
 *   - Guarda la suscripción push de cada dispositivo (`push_subscriptions`).
 *   - Envía un aviso a los dispositivos de la OTRA persona de la sala, solo si
 *     quien lo pide está en esa sala. Las suscripciones caducadas se borran.
 *
 * Variables que Supabase pone solas: SUPABASE_URL, SUPABASE_ANON_KEY y
 * SUPABASE_SERVICE_ROLE_KEY. Opcional: VAPID_SUBJECT (un mailto: o https:).
 *
 * Acciones (POST con JSON; la sesión del usuario en «Authorization»):
 *   { action: "key" }                                  → { publicKey }
 *   { action: "subscribe", room, subscription }        → { ok }
 *   { action: "unsubscribe", endpoint }                → { ok }
 *   { action: "send", room, payload }                  → { sent, removed, failed }
 *   { action: "test" }                                 → lo mismo, a tus propios dispositivos
 */

const env = (k: string) => (globalThis as any).Deno?.env.get(k) ?? '';

const CORS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

// Solo se envía a los servicios push de los navegadores: la función no debe
// servir para hacer peticiones a direcciones arbitrarias.
const PUSH_HOSTS = [
  'fcm.googleapis.com', 'android.googleapis.com', 'push.services.mozilla.com',
  'push.apple.com', 'notify.windows.com',
];

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

/* ── Base64url ─────────────────────────────────────────────── */
export function b64u(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function unb64u(text: string): Uint8Array {
  const pad = '='.repeat((4 - (text.length % 4)) % 4);
  const bin = atob((text + pad).replace(/-/g, '+').replace(/_/g, '/'));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((a, p) => a + p.length, 0));
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}

const enc = new TextEncoder();

/** Copia como ArrayBuffer: WebCrypto y fetch lo aceptan en cualquier versión de TypeScript. */
function buf(u: Uint8Array): ArrayBuffer {
  return u.slice().buffer as ArrayBuffer;
}

/* ── VAPID (RFC 8292) ──────────────────────────────────────── */
export type Vapid = { publicKey: string; privateKey: CryptoKey };

export async function generateVapid(): Promise<{ publicKey: string; privateJwk: JsonWebKey }> {
  const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']) as CryptoKeyPair;
  const raw = new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey));
  return { publicKey: b64u(raw), privateJwk: await crypto.subtle.exportKey('jwk', pair.privateKey) };
}

export async function importVapid(publicKey: string, privateJwk: JsonWebKey): Promise<Vapid> {
  const privateKey = await crypto.subtle.importKey('jwk', privateJwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  return { publicKey, privateKey };
}

/** Cabecera Authorization firmada para el servicio push del endpoint. */
export async function vapidHeader(endpoint: string, v: Vapid, subject: string): Promise<string> {
  const aud = new URL(endpoint).origin;
  const header = b64u(enc.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const claims = b64u(enc.encode(JSON.stringify({ aud, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: subject })));
  const input = header + '.' + claims;
  // WebCrypto devuelve la firma ya en formato r||s, que es el que pide JWT.
  const sig = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, v.privateKey, buf(enc.encode(input))));
  return 'vapid t=' + input + '.' + b64u(sig) + ', k=' + v.publicKey;
}

/* ── Cifrado del mensaje (RFC 8291 + RFC 8188, aes128gcm) ──── */
async function hkdf(salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, bytes: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', buf(ikm), 'HKDF', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt: buf(salt), info: buf(info) }, key, bytes * 8));
}

export async function encryptPayload(p256dh: string, auth: string, plaintext: Uint8Array): Promise<Uint8Array> {
  const uaPublic = unb64u(p256dh);
  const authSecret = unb64u(auth);

  // Clave efímera del servidor y secreto compartido con el navegador.
  const eph = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']) as CryptoKeyPair;
  const asPublic = new Uint8Array(await crypto.subtle.exportKey('raw', eph.publicKey));
  const uaKey = await crypto.subtle.importKey('raw', buf(uaPublic), { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: uaKey }, eph.privateKey, 256));

  const keyInfo = concat(enc.encode('WebPush: info'), new Uint8Array([0]), uaPublic, asPublic);
  const ikm = await hkdf(authSecret, shared, keyInfo, 32);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(salt, ikm, concat(enc.encode('Content-Encoding: aes128gcm'), new Uint8Array([0])), 16);
  const nonce = await hkdf(salt, ikm, concat(enc.encode('Content-Encoding: nonce'), new Uint8Array([0])), 12);

  // Un único registro: el mensaje y el delimitador 0x02 de «último registro».
  const padded = concat(plaintext, new Uint8Array([2]));
  const aes = await crypto.subtle.importKey('raw', buf(cek), 'AES-GCM', false, ['encrypt']);
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: buf(nonce) }, aes, buf(padded)));

  const rs = new Uint8Array([0, 0, 0x10, 0]);   // 4096
  return concat(salt, rs, new Uint8Array([asPublic.length]), asPublic, cipher);
}

export type Sub = { endpoint: string; p256dh: string; auth: string };

/** Envía un mensaje a una suscripción. Devuelve el código HTTP del servicio push. */
export async function sendPush(sub: Sub, payload: unknown, v: Vapid, subject: string, ttl = 43200): Promise<number> {
  const body = await encryptPayload(sub.p256dh, sub.auth, enc.encode(JSON.stringify(payload)));
  const res = await fetch(sub.endpoint, {
    method: 'POST',
    headers: {
      'Authorization': await vapidHeader(sub.endpoint, v, subject),
      'Content-Encoding': 'aes128gcm',
      'Content-Type': 'application/octet-stream',
      'TTL': String(ttl),
      'Urgency': 'high',
    },
    body: buf(body),
  });
  await res.body?.cancel();
  return res.status;
}

export function allowedEndpoint(endpoint: string): boolean {
  try {
    const u = new URL(endpoint);
    if (env('PUSH_ALLOW_ANY_HOST') === '1') return u.protocol === 'https:' || u.protocol === 'http:';   // solo pruebas locales
    if (u.protocol !== 'https:') return false;
    return PUSH_HOSTS.some((h) => u.hostname === h || u.hostname.endsWith('.' + h));
  } catch {
    return false;
  }
}

/* ── Base de datos (con la clave de servicio: RLS no deja a nadie más) ── */
async function db(path: string, init: RequestInit = {}): Promise<any> {
  const key = env('SUPABASE_SERVICE_ROLE_KEY');
  const res = await fetch(env('SUPABASE_URL') + '/rest/v1/' + path, {
    ...init,
    headers: {
      apikey: key,
      Authorization: 'Bearer ' + key,
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
  });
  const text = await res.text();
  if (!res.ok) throw new Error('db ' + res.status + ': ' + text);
  return text ? JSON.parse(text) : null;
}

let vapidCache: Vapid | null = null;

async function vapid(): Promise<Vapid> {
  if (vapidCache) return vapidCache;
  let rows = await db('push_config?id=eq.1&select=public_key,private_jwk');
  if (!rows.length) {
    // Primera vez: se crean y se guardan. Si dos llamadas coinciden, gana una
    // y la otra lee la que quedó guardada.
    const k = await generateVapid();
    await db('push_config', {
      method: 'POST',
      headers: { Prefer: 'resolution=ignore-duplicates,return=minimal' },
      body: JSON.stringify([{ id: 1, public_key: k.publicKey, private_jwk: k.privateJwk }]),
    });
    rows = await db('push_config?id=eq.1&select=public_key,private_jwk');
  }
  vapidCache = await importVapid(rows[0].public_key, rows[0].private_jwk);
  return vapidCache;
}

async function userId(req: Request): Promise<string | null> {
  const auth = req.headers.get('Authorization') || '';
  if (!auth.startsWith('Bearer ')) return null;
  const res = await fetch(env('SUPABASE_URL') + '/auth/v1/user', {
    headers: { apikey: env('SUPABASE_ANON_KEY') || env('SUPABASE_SERVICE_ROLE_KEY'), Authorization: auth },
  });
  if (!res.ok) { await res.body?.cancel(); return null; }
  const user = await res.json();
  return user && user.id ? String(user.id) : null;
}

/** Recorta lo que se manda: el servicio push admite unos 4 KB. */
function cleanPayload(p: any): Record<string, unknown> {
  const s = (v: unknown, n: number) => String(v ?? '').slice(0, n);
  return {
    title: s(p?.title, 80) || 'MIR 2027',
    body: s(p?.body, 200),
    tag: s(p?.tag, 80) || 'mir2027',
    kind: s(p?.kind, 20),
    id: s(p?.id, 60),
    vibrate: Array.isArray(p?.vibrate) ? p.vibrate.slice(0, 8).map((n: unknown) => Math.max(0, Math.min(1000, Number(n) || 0))) : undefined,
    at: Date.now(),
  };
}

const lastSend = new Map<string, number>();

async function deliver(rows: any[], payload: Record<string, unknown>) {
  const v = await vapid();
  const subject = env('VAPID_SUBJECT') || 'mailto:mir2027-timer@users.noreply.github.com';
  let sent = 0, removed = 0, failed = 0;
  await Promise.all(rows.map(async (r) => {
    try {
      const status = await sendPush({ endpoint: r.endpoint, p256dh: r.p256dh, auth: r.auth }, payload, v, subject);
      if (status >= 200 && status < 300) sent++;
      else if (status === 404 || status === 410) {
        // El navegador dio de baja esa suscripción: fuera.
        await db('push_subscriptions?endpoint=eq.' + encodeURIComponent(r.endpoint), { method: 'DELETE' });
        removed++;
      } else failed++;
    } catch {
      failed++;
    }
  }));
  return { sent, removed, failed };
}

export async function handler(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (req.method !== 'POST') return json(405, { error: 'Usa POST' });

  try {
    const uid = await userId(req);
    if (!uid) return json(401, { error: 'Sesión no válida' });
    const body = await req.json().catch(() => ({}));
    const action = String(body.action || '');

    if (action === 'key') {
      return json(200, { publicKey: (await vapid()).publicKey });
    }

    if (action === 'subscribe') {
      const sub = body.subscription || {};
      const room = String(body.room || '').slice(0, 24);
      if (!allowedEndpoint(sub.endpoint) || !sub.keys?.p256dh || !sub.keys?.auth) {
        return json(400, { error: 'Suscripción no válida' });
      }
      await db('push_subscriptions', {
        method: 'POST',
        headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify([{
          endpoint: sub.endpoint, user_id: uid, room,
          p256dh: String(sub.keys.p256dh), auth: String(sub.keys.auth),
          updated_at: new Date().toISOString(),
        }]),
      });
      return json(200, { ok: true });
    }

    if (action === 'unsubscribe') {
      await db('push_subscriptions?endpoint=eq.' + encodeURIComponent(String(body.endpoint || '')) +
        '&user_id=eq.' + uid, { method: 'DELETE' });
      return json(200, { ok: true });
    }

    if (action === 'send' || action === 'test') {
      const now = Date.now();
      if (now - (lastSend.get(uid) || 0) < 1500) return json(429, { error: 'Demasiado seguido' });
      lastSend.set(uid, now);

      let rows: any[];
      if (action === 'test') {
        rows = await db('push_subscriptions?user_id=eq.' + uid + '&select=endpoint,p256dh,auth');
      } else {
        const room = String(body.room || '').slice(0, 24);
        // Solo quien está en la sala puede avisar a los demás de esa sala.
        const member = await db('room_presence?room=eq.' + encodeURIComponent(room) + '&user_id=eq.' + uid + '&select=user_id');
        if (!member.length) return json(403, { error: 'No estás en esa sala' });
        rows = await db('push_subscriptions?room=eq.' + encodeURIComponent(room) + '&user_id=neq.' + uid +
          '&select=endpoint,p256dh,auth');
      }
      const payload = action === 'test'
        ? cleanPayload({ title: '🔔 Notificaciones listas', body: 'Así te llegarán los ánimos y los descansos, aunque la app esté cerrada.', tag: 'mir2027-test', kind: 'test' })
        : cleanPayload(body.payload);
      return json(200, { targets: rows.length, ...(await deliver(rows, payload)) });
    }

    return json(400, { error: 'Acción desconocida' });
  } catch (e) {
    return json(500, { error: String((e as Error)?.message || e) });
  }
}

const D = (globalThis as any).Deno;
if (D && typeof D.serve === 'function' && !env('MIR_PUSH_NO_SERVE')) D.serve(handler);
