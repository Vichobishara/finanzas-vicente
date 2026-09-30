// Conexión con Fintual (API pública fintual.cl/api). La persona entrega correo y contraseña UNA vez: se los pasamos a
// Fintual para pedir un token y guardamos SOLO el token en `fintual_conexion` (RLS sin políticas: solo service role).
// Con el token leemos las metas: el saldo va a ajustes.patrimonio y los aportes nuevos (sube `deposited`) a `ahorros`.
// La llama la app con su x-app-key (conectar, sync, destinos, desconectar) o el cron con x-avisos-token (todos).
import { createClient } from 'npm:@supabase/supabase-js@2';

const ORIGIN = 'https://finanzas-vicente.vercel.app';
const cors = { 'Access-Control-Allow-Origin': ORIGIN, 'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-app-key, x-client-info', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } });
const API = 'https://fintual.cl/api';

async function cuentaDe(req: Request) {
  const k = req.headers.get('x-app-key') || '';
  if (!k) return null;
  const h = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(k)))).map((b) => b.toString(16).padStart(2, '0')).join('');
  const { data } = await db.from('cuentas').select('id').eq('clave_hash', h).maybeSingle();
  return (data as { id: string } | null)?.id || null;
}

type Meta = { id: string; nombre: string; nav: number; depositado: number; destino: string };
type Con = { user_id: string; email: string; token: string; destinos: Record<string, string>; ultimo: Record<string, number> | null };

// Destino por nombre la primera vez; la persona lo puede cambiar en la app.
const destinoDe = (n: string) => /apv|jubila/i.test(n) ? 'apv' : /colch|emergen|moderate|imprevist/i.test(n) ? 'colchon' : 'fintual';

// Fecha de Santiago y "mes del sueldo" como la app: el mes va del 23 al 22; los aportes son del mes anterior al actual.
function hoySantiago() {
  const f = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  const [y, m, d] = f.split('-').map(Number);
  const act = d > 22 ? (m === 12 ? [y + 1, 1] : [y, m + 1]) : [y, m];
  const per = act[1] === 1 ? [act[0] - 1, 12] : [act[0], act[1] - 1];
  return { fecha: f, periodo: `${per[0]}-${String(per[1]).padStart(2, '0')}` };
}

async function avisar(uid: string, titulo: string, cuerpo: string) {
  const { data } = await db.from('secretos').select('valor').eq('clave', 'avisos_token').maybeSingle();
  if (!data?.valor) return;
  await fetch(Deno.env.get('SUPABASE_URL') + '/functions/v1/push', { method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-avisos-token': data.valor },
    body: JSON.stringify({ titulo, cuerpo, url: '/', tag: 'fintual-' + Date.now(), user_id: uid }) }).catch(() => {});
}

async function estadoApp(uid: string, v: Record<string, unknown>) {
  await db.from('ajustes').upsert({ user_id: uid, clave: 'fintual', valor: v }, { onConflict: 'user_id,clave' });
}

async function sync(c: Con, silencioso = false) {
  const r = await fetch(`${API}/goals?user_email=${encodeURIComponent(c.email)}&user_token=${encodeURIComponent(c.token)}`);
  const ahora = new Date().toISOString();
  if (r.status === 401) {
    await db.from('fintual_conexion').update({ error: 'token', sync_at: ahora }).eq('user_id', c.user_id);
    await estadoApp(c.user_id, { conectado: false, email: c.email, error: 'token', sync_at: ahora });
    return { error: 'token' };
  }
  if (!r.ok) throw new Error('fintual ' + r.status);
  const j = await r.json();
  const metas: Meta[] = (j.data || []).map((g: { id: string; attributes: { name: string; nav: number; deposited: number } }) => ({
    id: String(g.id), nombre: g.attributes.name, nav: Math.round(g.attributes.nav || 0), depositado: Math.round(g.attributes.deposited || 0),
    destino: c.destinos[String(g.id)] || destinoDe(g.attributes.name || ''),
  }));

  // Patrimonio: Fintual = todas las metas que cuentan (incluye colchón y APV, como la app); colchón aparte. Cartas y ETH no se tocan.
  const cuenta = metas.filter((m) => m.destino !== 'fuera');
  const { data: pa } = await db.from('ajustes').select('valor').eq('user_id', c.user_id).eq('clave', 'patrimonio').maybeSingle();
  const { fecha, periodo } = hoySantiago();
  const pat = { cartas: 0, eth: 0, ...(pa?.valor || {}), fintual: cuenta.reduce((s, m) => s + m.nav, 0),
    colchon: cuenta.filter((m) => m.destino === 'colchon').reduce((s, m) => s + m.nav, 0), fecha, fuente: 'fintual' };
  await db.from('ajustes').upsert({ user_id: c.user_id, clave: 'patrimonio', valor: pat }, { onConflict: 'user_id,clave' });

  // Aportes: cuánto subió lo depositado en cada meta desde la última vez (la primera vez solo se toma la foto).
  const nuevos: { destino: string; monto: number }[] = [];
  if (c.ultimo) for (const m of cuenta) {
    const d = m.depositado - (c.ultimo[m.id] ?? m.depositado);
    if (d >= 1000) nuevos.push({ destino: m.destino, monto: d });
  }
  let anotados = 0;
  if (nuevos.length) {
    // Si la persona ya lo anotó a mano (mismo destino, ±2%, últimos 10 días), no se duplica.
    const desde = new Date(Date.now() - 10 * 864e5).toISOString().slice(0, 10);
    const { data: ya } = await db.from('ahorros').select('monto, destino').eq('user_id', c.user_id).gte('fecha', desde);
    const filas = nuevos.filter((n) => !(ya || []).some((a) => a.destino === n.destino && Math.abs(a.monto - n.monto) <= n.monto * 0.02))
      .map((n) => ({ user_id: c.user_id, fecha, periodo, destino: n.destino, monto: n.monto, nota: 'Detectado en Fintual' }));
    if (filas.length) {
      await db.from('ahorros').insert(filas);
      anotados = filas.reduce((s, f) => s + f.monto, 0);
      await avisar(c.user_id, '💪 Llegó tu aporte a Fintual', `Detecté $${anotados.toLocaleString('es-CL')} nuevos. Ya quedó anotado en tu ahorro del mes.`);
    }
  }
  const ultimo = Object.fromEntries(metas.map((m) => [m.id, m.depositado]));
  await db.from('fintual_conexion').update({ ultimo, sync_at: ahora, error: null }).eq('user_id', c.user_id);
  await estadoApp(c.user_id, { conectado: true, email: c.email, sync_at: ahora, metas });
  if (!silencioso) return { ok: true, metas, patrimonio: pat, anotados };
  return { ok: true };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const body = await req.json().catch(() => ({}));
    const accion = String(body.accion || '');

    if (accion === 'todos') {
      const { data: s } = await db.from('secretos').select('valor').eq('clave', 'avisos_token').maybeSingle();
      if (!s?.valor || req.headers.get('x-avisos-token') !== s.valor) return json({ error: 'clave' }, 401);
      const { data: cs } = await db.from('fintual_conexion').select('user_id, email, token, destinos, ultimo').is('error', null);
      let ok = 0;
      for (const c of (cs || []) as Con[]) { try { await sync(c, true); ok++; } catch (e) { console.error(c.user_id, e); } }
      return json({ ok, total: (cs || []).length });
    }

    const uid = await cuentaDe(req);
    if (!uid) return json({ error: 'clave' }, 401);

    if (accion === 'conectar') {
      const email = String(body.email || '').trim().toLowerCase(), password = String(body.password || '');
      if (!email || !password) return json({ error: 'datos' }, 400);
      const r = await fetch(`${API}/access_tokens`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user: { email, password } }) });
      if (r.status === 401 || r.status === 422) return json({ error: 'credenciales' }, 401);
      if (!r.ok) return json({ error: 'fintual', status: r.status }, 502);
      const token = (await r.json())?.data?.attributes?.token;
      if (!token) return json({ error: 'fintual' }, 502);
      const { data: prev } = await db.from('fintual_conexion').select('destinos').eq('user_id', uid).maybeSingle();
      const c: Con = { user_id: uid, email, token, destinos: prev?.destinos || {}, ultimo: null };
      await db.from('fintual_conexion').upsert({ ...c, error: null }, { onConflict: 'user_id' });
      return json(await sync(c));
    }

    const { data: c } = await db.from('fintual_conexion').select('user_id, email, token, destinos, ultimo').eq('user_id', uid).maybeSingle();
    if (accion === 'desconectar') {
      await db.from('fintual_conexion').delete().eq('user_id', uid);
      await db.from('ajustes').delete().eq('user_id', uid).eq('clave', 'fintual');
      return json({ ok: true });
    }
    if (!c) return json({ error: 'sin_conexion' }, 404);
    if (accion === 'destinos') {
      const ok = ['fintual', 'colchon', 'apv', 'fuera'];
      const d = Object.fromEntries(Object.entries(body.destinos || {}).filter(([, v]) => ok.includes(String(v))).map(([k, v]) => [String(k), String(v)]));
      c.destinos = { ...c.destinos, ...d };
      await db.from('fintual_conexion').update({ destinos: c.destinos }).eq('user_id', uid);
      return json(await sync(c as Con));
    }
    if (accion === 'sync') return json(await sync(c as Con));
    return json({ error: 'accion' }, 400);
  } catch (e) {
    console.error(e);
    return json({ error: 'error' }, 500);
  }
});
