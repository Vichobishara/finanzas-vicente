// Manda notificaciones push (Web Push) a los celulares suscritos en `push_subs`.
// La llama la base (privado.push, vía pg_net) con el header x-avisos-token, o la app con x-app-key para "Probar aviso".
// Las llaves VAPID y el token viven en la tabla `secretos` (solo la lee esta función con service role).
import { createClient } from 'npm:@supabase/supabase-js@2';
import webpush from 'npm:web-push@3.6.7';

const ORIGIN = 'https://finanzas-vicente.vercel.app';
const cors = { 'Access-Control-Allow-Origin': ORIGIN, 'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-app-key, x-client-info', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const { data: sec } = await db.from('secretos').select('clave, valor').in('clave', ['app_key', 'avisos_token', 'vapid_public', 'vapid_private']);
    const S = Object.fromEntries((sec || []).map((r) => [r.clave, r.valor]));
    const desdeBase = !!S.avisos_token && req.headers.get('x-avisos-token') === S.avisos_token;
    const desdeApp = !!S.app_key && req.headers.get('x-app-key') === S.app_key;
    if (!desdeBase && !desdeApp) return json({ error: 'clave' }, 401);

    const body = await req.json().catch(() => ({}));
    const aviso = desdeBase && body.titulo
      ? { title: String(body.titulo).slice(0, 120), body: String(body.cuerpo || '').slice(0, 400), url: body.url || '/', tag: body.tag || undefined }
      : { title: '🔔 Avisos activados', body: 'Así te van a llegar los avisos de tu plata.', url: '/', tag: 'prueba' };

    webpush.setVapidDetails('mailto:avisos@finanzas-vicente.vercel.app', S.vapid_public, S.vapid_private);
    const { data: subs } = await db.from('push_subs').select('id, endpoint, p256dh, auth');
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
