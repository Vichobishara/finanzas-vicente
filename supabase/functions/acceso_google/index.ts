// "Continuar con Google" (fase 1 del proyecto amigos): la app vuelve de Google con el access_token de Supabase Auth,
// esta función revisa que ese usuario sea uno permitido y le devuelve la clave x-app-key (igual que `acceso` con Face ID).
// Permitidos: secretos.google_emails (correos separados por coma). Cualquiera puede iniciar sesión con Google, pero si su
// correo no está en la lista no recibe nada. En la fase 2 esto se reemplaza por RLS por usuario (user_id = auth.uid()).
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
    const { data: S } = await db.from('secretos').select('clave, valor').in('clave', ['google_emails', 'app_key']);
    const v = (k: string) => (S || []).find((s) => s.clave === k)?.valor || '';
    const permitidos = v('google_emails').split(',').map((e) => e.trim().toLowerCase()).filter(Boolean);
    if (!permitidos.includes(user.email.toLowerCase())) return json({ error: 'no_invitado', email: user.email }, 403);
    return json({ clave: v('app_key'), nombre: user.user_metadata?.full_name || '' });
  } catch (e) {
    console.error(e);
    return json({ error: 'error' }, 500);
  }
});
