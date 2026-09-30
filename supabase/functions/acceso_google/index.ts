// "Continuar con Google": la app vuelve de Google con el access_token de Supabase Auth y esta función le devuelve
// la clave x-app-key DE ESA PERSONA (fase 2: cada cuenta ve solo sus datos). La primera vez crea la cuenta vacía.
// Solo entran invitados: secretos.google_emails (correos separados por coma) o quien ya tiene cuenta.
import { createClient } from 'npm:@supabase/supabase-js@2';

const ORIGIN = 'https://finanzas-vicente.vercel.app';
const cors = { 'Access-Control-Allow-Origin': ORIGIN, 'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
    const { data: { user }, error } = await db.auth.getUser(token);
    if (error || !user?.email) return json({ error: 'sesion' }, 401);
    // Solo cuentas de Google con correo verificado
    if (user.app_metadata?.provider !== 'google' && !(user.identities || []).some((i) => i.provider === 'google')) return json({ error: 'sesion' }, 401);
    const email = user.email.toLowerCase(), nombre = String(user.user_metadata?.full_name || '').trim();
    const { data: S } = await db.from('secretos').select('valor').eq('clave', 'google_emails').maybeSingle();
    const permitidos = String(S?.valor || '').split(',').map((e) => e.trim().toLowerCase()).filter(Boolean);
    const { data: ya } = await db.from('cuentas').select('id').eq('email', email).maybeSingle();
    // Invitados (secretos.google_emails) o cuentas que ya existen. Primera vez = cuenta nueva y vacía (con sus categorías).
    if (!ya && !permitidos.includes(email)) return json({ error: 'no_invitado', email: user.email }, 403);
    const { data: clave, error: e2 } = await db.rpc('crear_cuenta', { p_email: email, p_nombre: nombre.split(' ')[0] || null });
    if (e2 || !clave) throw e2 || new Error('sin clave');
    return json({ clave, nombre, nuevo: !ya });
  } catch (e) {
    console.error(e);
    return json({ error: 'error' }, 500);
  }
});
