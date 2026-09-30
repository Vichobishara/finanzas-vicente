// Entrar con Face ID (passkey). Si la passkey es válida, devuelve la clave x-app-key DE SU DUEÑO (fase 2: cada
// passkey es de una cuenta). Registrar una passkey nueva exige estar dentro (la x-app-key de la cuenta): se ofrece
// después de entrar con Google o con la clave.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { generateRegistrationOptions, verifyRegistrationResponse, generateAuthenticationOptions, verifyAuthenticationResponse } from 'npm:@simplewebauthn/server@13';
import { isoBase64URL } from 'npm:@simplewebauthn/server@13/helpers';

const RP_ID = 'finanzas-vicente.vercel.app';
const ORIGIN = 'https://finanzas-vicente.vercel.app';
const cors = { 'Access-Control-Allow-Origin': ORIGIN, 'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-app-key, x-client-info', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } });

async function cuentaDe(req: Request) {
  const k = req.headers.get('x-app-key') || '';
  if (!k) return null;
  const h = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(k)))).map((b) => b.toString(16).padStart(2, '0')).join('');
  const { data } = await db.from('cuentas').select('id, nombre, email').eq('clave_hash', h).maybeSingle();
  return data as { id: string; nombre: string | null; email: string | null } | null;
}
async function reto(tipo: string, challenge: string) {
  await db.from('passkey_retos').delete().lt('created_at', new Date(Date.now() - 60 * 60e3).toISOString());
  const { data, error } = await db.from('passkey_retos').insert({ tipo, challenge }).select('id').single();
  if (error) throw error;
  return data.id;
}
async function tomarReto(id: string, tipo: string) {
  const { data } = await db.from('passkey_retos').delete().eq('id', id).eq('tipo', tipo).gte('created_at', new Date(Date.now() - 5 * 60e3).toISOString()).select('challenge');
  return data?.[0]?.challenge as string | undefined;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const { accion, id, respuesta } = await req.json();
    const cta = await cuentaDe(req);

    if (accion === 'inicio' || accion === 'nuevo') {
      if (accion === 'inicio') {
        // Login: el celular usa la passkey que tenga de esta lista (solo ids; la cuenta sale de la passkey usada).
        const { data: todas } = await db.from('passkeys').select('id, transports');
        if (todas?.length) {
          const o = await generateAuthenticationOptions({ rpID: RP_ID, userVerification: 'required', allowCredentials: todas.map((c) => ({ id: c.id, transports: c.transports || undefined })) });
          return json({ modo: 'login', id: await reto('login', o.challenge), opciones: o });
        }
      }
      if (!cta) return json({ error: 'cerrado' }, 403);
      const { data: mias } = await db.from('passkeys').select('id').eq('user_id', cta.id);
      const nombre = cta.nombre || 'Yo';
      const o = await generateRegistrationOptions({ rpName: 'Finanzas', rpID: RP_ID, userName: cta.email || nombre, userDisplayName: nombre,
        attestationType: 'none', authenticatorSelection: { residentKey: 'required', userVerification: 'required' }, excludeCredentials: (mias || []).map((c) => ({ id: c.id })) });
      return json({ modo: 'registro', id: await reto('registro', o.challenge), opciones: o });
    }
    if (accion === 'registro') {
      if (!cta) return json({ error: 'cerrado' }, 403);
      const ch = await tomarReto(id, 'registro');
      if (!ch) return json({ error: 'reto vencido' }, 400);
      const v = await verifyRegistrationResponse({ response: respuesta, expectedChallenge: ch, expectedOrigin: ORIGIN, expectedRPID: RP_ID, requireUserVerification: true });
      if (!v.verified || !v.registrationInfo) return json({ error: 'no verificado' }, 401);
      const c = v.registrationInfo.credential;
      const { error } = await db.from('passkeys').insert({ id: c.id, user_id: cta.id, public_key: isoBase64URL.fromBuffer(c.publicKey), counter: c.counter, transports: c.transports || respuesta?.response?.transports || null });
      if (error) throw error;
      return json({ ok: true, clave: req.headers.get('x-app-key') });
    }
    if (accion === 'login') {
      const ch = await tomarReto(id, 'login');
      if (!ch) return json({ error: 'reto vencido' }, 400);
      const { data: c } = await db.from('passkeys').select('*').eq('id', String(respuesta?.id || '')).maybeSingle();
      if (!c) return json({ error: 'passkey desconocida' }, 401);
      const v = await verifyAuthenticationResponse({ response: respuesta, expectedChallenge: ch, expectedOrigin: ORIGIN, expectedRPID: RP_ID, requireUserVerification: true, credential: { id: c.id, publicKey: isoBase64URL.toBuffer(c.public_key), counter: Number(c.counter), transports: c.transports || undefined } });
      if (!v.verified) return json({ error: 'no verificado' }, 401);
      await db.from('passkeys').update({ counter: v.authenticationInfo.newCounter, usado_at: new Date().toISOString() }).eq('id', c.id);
      const { data: dueño } = await db.from('cuentas').select('clave, nombre').eq('id', c.user_id).single();
      return json({ clave: dueño!.clave, nombre: dueño!.nombre || '' });
    }
    return json({ error: 'accion' }, 400);
  } catch (e) {
    console.error(e);
    return json({ error: String((e as Error)?.message || e) }, 500);
  }
});
