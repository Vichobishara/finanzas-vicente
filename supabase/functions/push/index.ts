// Manda notificaciones push (Web Push) a los celulares suscritos en `push_subs`.
// La llama la base (privado.push, vía pg_net) con el header x-avisos-token y el user_id, o la app con su x-app-key para "Probar aviso".
// Las llaves VAPID y el token viven en la tabla `secretos` (solo la lee esta función con service role).
import { createClient } from 'npm:@supabase/supabase-js@2';
import webpush from 'npm:web-push@3.6.7';

const ORIGIN = 'https://finanzas-vicente.vercel.app';
const cors = { 'Access-Control-Allow-Origin': ORIGIN, 'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-app-key, x-client-info', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } });

// Fase 2: cada persona tiene su clave. La cuenta sale del hash de x-app-key (tabla `cuentas`, solo service role).
async function cuentaDe(req: Request) {
  const k = req.headers.get('x-app-key') || '';
  if (!k) return null;
  const h = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(k)))).map((b) => b.toString(16).padStart(2, '0')).join('');
  const { data } = await db.from('cuentas').select('id, nombre, email, legado').eq('clave_hash', h).maybeSingle();
  return data as { id: string; nombre: string | null; email: string | null; legado: boolean } | null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const { data: sec } = await db.from('secretos').select('clave, valor').in('clave', ['avisos_token', 'vapid_public', 'vapid_private']);
    const S = Object.fromEntries((sec || []).map((r) => [r.clave, r.valor]));
    const body = await req.json().catch(() => ({}));
    const desdeBase = !!S.avisos_token && req.headers.get('x-avisos-token') === S.avisos_token;
    // Cada aviso va SOLO a los celulares de su dueño: la base manda user_id; la app ("Probar aviso") manda su clave.
    const uid = desdeBase ? (typeof body.user_id === 'string' ? body.user_id : null) : (await cuentaDe(req))?.id;
    if (!uid) return json({ error: 'clave' }, 401);

    const aviso = desdeBase && body.titulo
      ? { title: String(body.titulo).slice(0, 120), body: String(body.cuerpo || '').slice(0, 400), url: body.url || '/', tag: body.tag || undefined }
      : { title: '🔔 Avisos activados', body: 'Así te van a llegar los avisos de tu plata.', url: '/', tag: 'prueba' };

    webpush.setVapidDetails('mailto:avisos@finanzas-vicente.vercel.app', S.vapid_public, S.vapid_private);
    const { data: subs } = await db.from('push_subs').select('id, endpoint, p256dh, auth').eq('user_id', uid);
    let enviados = 0, fallidos = 0;
    await Promise.all((subs || []).map(async (s) => {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(aviso), { TTL: 60 * 60 * 12, urgency: 'high' });
        enviados++;
      } catch (e) {
        fallidos++;
        // 404/410 = el celular se dio de baja: se borra la suscripción.
        // deno-lint-ignore no-explicit-any
        const code = (e as any)?.statusCode;
        if (code === 404 || code === 410) await db.from('push_subs').delete().eq('id', s.id);
        else console.error('push', code, String(e));
      }
    }));
    return json({ enviados, fallidos, subs: (subs || []).length });
  } catch (e) {
    console.error(e);
    return json({ error: String(e) }, 500);
  }
});
