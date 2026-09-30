// "Pregúntale a Claude": responde preguntas de plata con los números del mes que manda la app.
// Exige la misma clave x-app-key de la app. La API key de Anthropic va en el secreto ANTHROPIC_API_KEY
// de este proyecto (finanzas-vicho), nunca en el repo ni en el navegador.
import { createClient } from 'npm:@supabase/supabase-js@2';
import Anthropic from 'npm:@anthropic-ai/sdk';

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

const SISTEMA = `Eres el CFO personal de Vicho: 26 años, Santiago, sueldo base ~$2.000.000 líquido. Se describe como procrastinador, desordenado y gastador. Su meta: gastar con control, ahorrar todos los meses en Fintual/APV y llegar a millonario.

Cómo funciona su plata (la app ya hizo las cuentas, vienen en DATOS):
- El mes va del 23 al 22. "presupuesto" es toda la plata del mes e INCLUYE cuotas y fijos.
- "te_quedan" = presupuesto − cuotas y fijos − lo gastado. "diario" = te_quedan / días hasta el 22.
- Lo que no gasta del presupuesto se reparte 50% Fintual / 50% colchón.
- Montos en pesos chilenos (CLP). Gastos del negocio (PULLDEX / TCG Logs) no cuentan en lo personal.

Reglas que no se negocian:
- Cero cuotas nuevas mientras cuotas y fijos sean ≥ 30% del presupuesto. Si no le alcanza al contado, no le alcanza.
- Coleccionables (cartas) personales con tope $0: bloqueados, salvo que sea para el negocio.
- Si una compra lo hace pasarse del mes, la respuesta es no: eso sale de su ahorro.
- Muestra el costo en 10 años de las compras grandes (6% real anual: monto × 1,79).
- Premia el autocontrol cuando decide no comprar.

Cómo responder:
- Español chileno simple y directo, como un amigo que sabe de plata. Nada de jerga ("periodo", "cierre" → "hasta el 22").
- Empieza con el veredicto en una línea (✅ Sí / ⚠️ Sí, pero... / 🔴 No) cuando te pregunten si puede comprar algo. Luego 2 a 4 líneas con los números que lo justifican.
- Corto: se lee en el celular. Usa **negritas** solo para los números clave. Sin tablas ni títulos.
- Usa solo los números de DATOS; si falta algo, dilo en vez de inventar.
- Si pregunta de inversiones, impuestos o APV, responde con sentido común y cierra con "(no soy asesor financiero)".

Acciones (la app le pide confirmar a la persona antes de hacerlas):
- Si te pide ANOTAR un gasto ("anota 5 lucas en almuerzo", "gasté 4.500 en uber", "almuerzo 6990"): accion.tipo = "anotar_gasto", monto en pesos (1 luca = $1.000), descripcion corta ("Almuerzo", "Uber"). En respuesta confirma en una línea lo que vas a anotar y cómo queda su día si los DATOS lo permiten.
- Si te pide AGREGAR algo a su lista de deseos ("quiero un iPad de 600 lucas, anótalo en mi lista"): accion.tipo = "agregar_deseo", monto y descripcion.
- En cualquier otro caso accion.tipo = "ninguna", monto 0, descripcion "". No inventes montos: si falta el monto, pregúntalo y usa "ninguna".`;

const SALIDA = {
  type: 'object',
  properties: {
    respuesta: { type: 'string' },
    accion: { type: 'object', properties: {
      tipo: { type: 'string', enum: ['ninguna', 'anotar_gasto', 'agregar_deseo'] }, monto: { type: 'integer' }, descripcion: { type: 'string' },
    }, required: ['tipo', 'monto', 'descripcion'], additionalProperties: false },
  },
  required: ['respuesta', 'accion'],
  additionalProperties: false,
};

// Para las demás cuentas: mismas reglas de CFO, sin los datos personales de Vicho (sueldo, cartas, PULLDEX).
const sistemaPara = (nombre: string) => SISTEMA
  .replace(/^Eres el CFO personal de Vicho:[^\n]*/, `Eres el CFO personal de ${nombre}. Su meta: gastar con control, ahorrar todos los meses y llegar a su meta de ahorro.`)
  .split('\n').filter((l) => !/PULLDEX|Coleccionables \(cartas\)/.test(l)).join('\n')
  .replaceAll('Vicho', nombre);

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const cta = await cuentaDe(req);
    if (!cta) return json({ error: 'clave' }, 401);
    const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
    if (!apiKey) return json({ error: 'sin_api' }, 503);

    const { pregunta, datos, historial } = await req.json();
    const q = String(pregunta || '').trim().slice(0, 600);
    if (!q) return json({ error: 'pregunta' }, 400);
    const previos = (Array.isArray(historial) ? historial : []).slice(-6)
      .filter((m) => (m?.role === 'user' || m?.role === 'assistant') && typeof m.content === 'string')
      .map((m) => ({ role: m.role, content: m.content.slice(0, 2000) }));
    if (previos[0]?.role === 'assistant') previos.shift();

    const client = new Anthropic({ apiKey });
    // deno-lint-ignore no-explicit-any
    const r: any = await client.beta.messages.create({
      model: 'claude-opus-5-5',
      max_tokens: 2000,
      output_config: { effort: 'low', format: { type: 'json_schema', schema: SALIDA } },
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      system: [
        { type: 'text', text: cta.legado ? SISTEMA : sistemaPara(cta.nombre || 'la persona') },
        { type: 'text', text: 'DATOS (JSON):\n' + JSON.stringify(datos ?? {}).slice(0, 20000) },
      ],
      messages: [...previos, { role: 'user', content: q }],
    // deno-lint-ignore no-explicit-any
    } as any);
    if (r.stop_reason === 'refusal') return json({ respuesta: 'No puedo responder eso. Prueba preguntándolo de otra forma.' });
    const texto = (r.content || []).filter((b: { type: string }) => b.type === 'text').map((b: { text: string }) => b.text).join('').trim();
    let out: { respuesta?: string; accion?: { tipo: string; monto: number; descripcion: string } } = {};
    try { out = JSON.parse(texto); } catch { out = { respuesta: texto }; }
    const a = out.accion && out.accion.tipo !== 'ninguna' && out.accion.monto > 0 ? out.accion : null;
    return json({ respuesta: out.respuesta || 'No tengo respuesta, intenta de nuevo.', accion: a });
  } catch (e) {
    console.error(e);
    if (e instanceof Anthropic.AuthenticationError) return json({ error: 'api_mala' }, 502);
    if (e instanceof Anthropic.RateLimitError) return json({ error: 'limite' }, 429);
    return json({ error: String((e as Error)?.message || e) }, 500);
  }
});
