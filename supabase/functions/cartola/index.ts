// "Subir cartola": lee el estado de cuenta de una tarjeta de crédito (PDF o foto) y devuelve las compras en cuotas
// que siguen vivas (o, con modo 'compras', todas las compras del período para cuadrar con lo anotado). La app muestra la lista para que la persona revise antes de guardar en `cuotas`; esto no guarda nada.
// Misma seguridad que `consejo`: exige la x-app-key de una cuenta. La API key de Anthropic es el secreto ANTHROPIC_API_KEY de finanzas-vicho.
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

const TIPOS = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const MAX_B64 = 14_000_000; // ~10 MB de archivo

const INSTRUCCIONES = `Te paso el estado de cuenta (cartola) de una tarjeta de crédito chilena.
Extrae SOLO las compras en cuotas que todavía tienen cuotas por pagar (la cuota que se cobra en este estado de cuenta cuenta como vigente).
Para cada una:
- nombre: el comercio o producto, corto y legible (ej: "Falabella iPhone", "Paris", "Mercado Libre"). Sin códigos ni números de operación.
- monto_cuota: lo que se cobra por cuota en este estado de cuenta, en pesos chilenos, entero sin puntos (incluye intereses si la cartola los suma a la cuota).
- cuota_actual: el número de la cuota que se cobra en este estado de cuenta (ej: en "03/12" es 3).
- total_cuotas: el total de cuotas (ej: en "03/12" es 12).
- banco: el banco o emisor de la tarjeta si aparece (ej: "Scotiabank", "BCI", "Santander", "Falabella"), si no, "".
No incluyas compras al contado, pagos, abonos, comisiones, seguros ni avances en una cuota.
Si una cuota ya es la última (cuota_actual = total_cuotas) inclúyela igual.
En "fecha_cartola" pon la fecha de facturación o de cierre del estado de cuenta en formato YYYY-MM-DD si aparece, si no "".
Si el archivo no es una cartola de tarjeta o no se lee, devuelve cuotas vacío y explica en "nota" en una línea, en español chileno simple.`;

const ESQUEMA = {
  type: 'object',
  properties: {
    fecha_cartola: { type: 'string' },
    cuotas: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          nombre: { type: 'string' },
          monto_cuota: { type: 'integer' },
          cuota_actual: { type: 'integer' },
          total_cuotas: { type: 'integer' },
          banco: { type: 'string' },
        },
        required: ['nombre', 'monto_cuota', 'cuota_actual', 'total_cuotas', 'banco'],
        additionalProperties: false,
      },
    },
    nota: { type: 'string' },
  },
  required: ['fecha_cartola', 'cuotas', 'nota'],
  additionalProperties: false,
};

// Modo "compras": todas las compras del estado de cuenta, para cuadrar con lo anotado en la app (lo que falta se agrega).
const INSTR_COMPRAS = `Te paso el estado de cuenta (cartola) de una tarjeta de crédito chilena.
Extrae TODAS las compras y cargos del período (una fila por cada una):
- fecha: fecha de la compra en formato YYYY-MM-DD (si no aparece el año, usa el del estado de cuenta).
- comercio: nombre corto y legible del comercio (ej: "Jumbo", "Uber", "Colombo Cafe"). Sin códigos ni números de operación.
- monto: lo que se cobra en pesos chilenos en ESTE estado de cuenta, entero sin puntos. Si es en dólares y aparece el equivalente en pesos, usa los pesos; si no aparece, pon 0.
- en_cuotas: true si es una compra en cuotas (ej: "03/12"), false si es al contado.
NO incluyas pagos a la tarjeta, abonos, reversas, intereses, comisiones, impuestos ni seguros.
En "banco" pon el banco o emisor (ej: "Scotiabank", "BCI"), si no aparece "". En "desde" y "hasta" las fechas del período (YYYY-MM-DD) si aparecen, si no "".
Si el archivo no es una cartola o no se lee, devuelve compras vacío y explica en "nota" en una línea, en español chileno simple.`;
const ESQ_COMPRAS = {
  type: 'object',
  properties: {
    banco: { type: 'string' }, desde: { type: 'string' }, hasta: { type: 'string' },
    compras: { type: 'array', items: { type: 'object', properties: {
      fecha: { type: 'string' }, comercio: { type: 'string' }, monto: { type: 'integer' }, en_cuotas: { type: 'boolean' },
    }, required: ['fecha', 'comercio', 'monto', 'en_cuotas'], additionalProperties: false } },
    nota: { type: 'string' },
  },
  required: ['banco', 'desde', 'hasta', 'compras', 'nota'],
  additionalProperties: false,
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    if (!(await cuentaDe(req))) return json({ error: 'clave' }, 401);
    const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
    if (!apiKey) return json({ error: 'sin_api' }, 503);

    const { tipo, datos, modo } = await req.json();
    const compras = modo === 'compras';
    if (!TIPOS.includes(tipo) || typeof datos !== 'string' || !datos) return json({ error: 'archivo' }, 400);
    if (datos.length > MAX_B64) return json({ error: 'grande' }, 413);

    const archivo = tipo === 'application/pdf'
      ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: datos } }
      : { type: 'image', source: { type: 'base64', media_type: tipo, data: datos } };

    const client = new Anthropic({ apiKey });
    // deno-lint-ignore no-explicit-any
    const r: any = await client.beta.messages.create({
      model: 'claude-opus-5-5',
      max_tokens: compras ? 16000 : 8000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'low', format: { type: 'json_schema', schema: compras ? ESQ_COMPRAS : ESQUEMA } },
      messages: [{ role: 'user', content: [archivo, { type: 'text', text: compras ? INSTR_COMPRAS : INSTRUCCIONES }] }],
    // deno-lint-ignore no-explicit-any
    } as any);
    if (r.stop_reason === 'refusal') return json({ cuotas: [], compras: [], nota: 'No pude leer ese archivo. Prueba con otra foto o el PDF.' });
    if (r.stop_reason === 'max_tokens') return json({ error: 'larga' }, 422);
    const texto = (r.content || []).filter((b: { type: string }) => b.type === 'text').map((b: { text: string }) => b.text).join('');
    const out = JSON.parse(texto);
    if (compras) {
      out.compras = (out.compras || []).filter((c: { fecha: string; monto: number }) => /^\d{4}-\d{2}-\d{2}$/.test(c.fecha) && c.monto > 0);
      return json(out);
    }
    // Solo lo que tiene sentido: la app igual deja revisar cada una antes de guardar.
    out.cuotas = (out.cuotas || []).filter((c: { monto_cuota: number; cuota_actual: number; total_cuotas: number }) =>
      c.monto_cuota > 0 && c.total_cuotas > 1 && c.cuota_actual >= 1 && c.cuota_actual <= c.total_cuotas);
    return json(out);
  } catch (e) {
    console.error(e);
    if (e instanceof Anthropic.AuthenticationError) return json({ error: 'api_mala' }, 502);
    if (e instanceof Anthropic.RateLimitError) return json({ error: 'limite' }, 429);
    if (e instanceof SyntaxError) return json({ error: 'lectura' }, 502);
    return json({ error: String((e as Error)?.message || e) }, 500);
  }
});
