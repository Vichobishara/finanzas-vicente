/**
 * Finanzas Vicho — Importador automático de correos del banco
 * - Compras con tarjeta BCI ("Notificación de uso de tu tarjeta de crédito")
 * - Transferencias hechas desde BCI (transferencias@bci.cl) y Scotiabank (avisos.info@scotiabank.cl)
 * - Sueldos de Toku (abonos de TOKU SPA) → tabla ingresos
 * Todo se guarda en Supabase (finanzas-vicho). La base categoriza sola.
 *
 * Transferencias:
 * - Las que te haces a ti mismo (entre tus cuentas) y las que recibes no se guardan.
 * - Las demás llegan "por revisar": no descuentan hasta que en la app tocas "Es gasto" o "No cuenta".
 *   Si la app ya recuerda al destinatario (tabla destinatarios), se clasifica sola.
 *
 * Instalar (un solo paso): pega todo esto en script.google.com reemplazando el código anterior,
 * elige la función `instalar` arriba y toca ▶︎ Ejecutar (acepta los permisos si los pide).
 * APP_KEY es opcional: sin clave igual entran compras y transferencias; con clave, también los sueldos de Toku.
 * Listo: corre solo cada 15 minutos.
 */

const SUPA_URL = 'https://caaewoxfvmdizzziyvfz.supabase.co';
const SUPA_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNhYWV3b3hmdm1kaXp6eml5dmZ6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA2ODk0ODUsImV4cCI6MjEwNjI2NTQ4NX0.mUu3EZuLUe_jpSLFpU5lkUaoDIQFZdXZqZkwac03EXY';
// Clave de la app (header x-app-key). Opcional: solo hace falta para importar los sueldos de Toku. No la subas al repo.
const APP_KEY = '';

// Tus cuentas: transferencias hacia ellas no son gasto.
const CUENTAS_PROPIAS = ['79828064', '983722199', '993057207'];
// Correos puntuales que no son gasto (id del mensaje de Gmail → motivo).
const IGNORAR = {
  '1a0d3c6639adf989': 'dólares' // Eduardo Manuel, $1.455.000, 24/09/2026
};

function instalar() {
  ScriptApp.getProjectTriggers().forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('importarTodo').timeBased().everyMinutes(15).create();
  importarTodo(14); // primera corrida: trae las últimas 2 semanas
}

// Nombre antiguo: si quedó un disparador viejo apuntando aquí, sigue funcionando.
function importarBCI() { importarTodo(); }

function importarTodo(dias) {
  const d = dias || 5;
  const filas = []
    .concat(comprasBCI(d))
    .concat(transferenciasBCI(d))
    .concat(transferenciasScotia(d));
  if (filas.length) guardar('gastos', filas);
  if (APP_KEY) importarSueldosToku(Math.max(d, 10));
  else Logger.log('Sueldos Toku: sin APP_KEY, se saltan');
}

function headers() {
  const h = { apikey: SUPA_KEY, Authorization: 'Bearer ' + SUPA_KEY };
  if (APP_KEY) h['x-app-key'] = APP_KEY;
  return h;
}

function guardar(tabla, filas) {
  const h = headers();
  h.Prefer = 'resolution=ignore-duplicates';
  const res = UrlFetchApp.fetch(SUPA_URL + '/rest/v1/' + tabla + '?on_conflict=ref_externa', {
    method: 'post',
    contentType: 'application/json',
    headers: h,
    payload: JSON.stringify(filas),
    muteHttpExceptions: true
  });
  Logger.log(`${tabla}: ${filas.length} revisados · HTTP ${res.getResponseCode()} ${res.getContentText().slice(0, 200)}`);
}

// Todas las filas llevan las mismas columnas (Supabase lo exige al insertar varias juntas).
function fila(m, fecha, monto, descripcion, tarjeta, fuente, destinatario) {
  return {
    fecha, monto,
    descripcion: descripcion.substring(0, 120),
    tarjeta, fuente,
    destinatario: destinatario || null,
    estado: IGNORAR[m.getId()] ? 'ignorado' : 'ok',
    ref_externa: m.getId()
  };
}

function mensajes(query) {
  const out = [];
  GmailApp.search(query).forEach(t => t.getMessages().forEach(m => out.push(m)));
  return out;
}

const cuerpo = m => m.getPlainBody().replace(/\s+/g, ' ');
const pesos = s => parseInt(String(s).replace(/\D/g, ''), 10) || 0;
const fechaDe = (f, m) => f ? `${f[3]}-${f[2]}-${f[1]}`
  : Utilities.formatDate(m.getDate(), 'America/Santiago', 'yyyy-MM-dd');

function comprasBCI(dias) {
  const dolar = getDolar();
  const filas = [];
  mensajes(`from:contacto@bci.cl subject:"uso de tu tarjeta" newer_than:${dias}d`).forEach(m => {
    const body = cuerpo(m);
    const montoMatch = body.match(/Monto\s*\|?\s*(USD)?\s*\$?\s*([\d\.,]+)/i);
    if (!montoMatch) return;

    const esUSD = !!montoMatch[1];
    let monto = esUSD
      ? Math.round(parseFloat(montoMatch[2].replace(/\./g, '').replace(',', '.')) * dolar)
      : parseInt(montoMatch[2].replace(/\./g, ''), 10);
    if (!monto) return;

    const fecha = fechaDe(body.match(/Fecha\s*\|?\s*(\d{2})\/(\d{2})\/(\d{4})/), m);

    // Con mayúscula: "compra en comercio internacional" (minúscula) no es el nombre del comercio.
    const c = body.match(/Comercio[\s|*]*([^|*]+?)\s*(\||\*|Si no quieres|$)/);
    let desc = c ? c[1].replace(/\+\d{6,}.*$/, '').trim() : 'Compra BCI';
    if (esUSD) desc += ` (USD ${montoMatch[2]})`;

    if (/anulaci[oó]n/i.test(body)) { monto = -monto; desc = 'Anulación ' + desc; }

    filas.push(fila(m, fecha, monto, desc, 'bci', 'bci_auto'));
  });
  return filas;
}

function transferenciasBCI(dias) {
  const filas = [];
  mensajes(`from:transferencias@bci.cl newer_than:${dias}d`).forEach(m => {
    const body = cuerpo(m);
    if (!/Realizaste una transferencia/i.test(body)) return; // "Has recibido" = plata que entra
    const monto = pesos((body.match(/Monto transferido[\s|:]*\$\s*([\d.]+)/i) || [])[1]);
    const nombre = ((body.match(/Nombre del destinatario[\s|:]*(.+?)[\s|:]*Banco de destino/i) || [])[1] || '').trim();
    const cuenta = (body.match(/Cuenta de destino[\s|:]*(\d+)/i) || [])[1];
    const msj = (body.match(/Mensaje[\s|:]*(.*?)[\s|:]*N[úu]mero de comprobante/i) || [])[1];
    const fecha = fechaDe(body.match(/Fecha de abono[\s|:]*(\d{2})\/(\d{2})\/(\d{4})/i), m);
    const f = transferencia(m, fecha, monto, nombre, cuenta, msj);
    if (f) filas.push(f);
  });
  return filas;
}

function transferenciasScotia(dias) {
  const filas = [];
  mensajes(`from:avisos.info@scotiabank.cl subject:"Aviso de Transferencia" newer_than:${dias}d`).forEach(m => {
    const body = cuerpo(m);
    if (!/Transferencia de fondos realizada/i.test(body)) return; // "recibida" = plata que entra
    const monto = pesos((body.match(/Monto[\s|:]*\$\s*([\d.]+)/i) || [])[1]);
    const nombre = ((body.match(/Nombre Destinatario[\s|:]*(.+?)[\s|:]*N[úu]mero de Cuenta/i) || [])[1] || '').trim();
    const cuenta = (body.match(/N[úu]mero de Cuenta[\s|:]*(\d+)/i) || [])[1];
    const msj = (body.match(/Mensaje[\s|:]*(.*?)[\s|:]*Cordialmente/i) || [])[1];
    const fecha = fechaDe(body.match(/Con fecha de hoy\s*(\d{2})\/(\d{2})\/(\d{4})/i), m);
    const f = transferencia(m, fecha, monto, nombre, cuenta, msj);
    if (f) filas.push(f);
  });
  return filas;
}

function transferencia(m, fecha, monto, nombre, cuenta, msj) {
  if (!monto || !nombre || esPropia(nombre, cuenta)) return null;
  const extra = (msj || '').trim();
  const desc = 'Transferencia a ' + nombre + (extra && !/^sin mensaje$/i.test(extra) ? ' · ' + extra : '');
  return fila(m, fecha, monto, desc, 'otro', 'transferencia', nombre);
}

// Sueldos: correos de BCI "TOKU SPA" (abono a tu cuenta Scotia). Si ya anotaste ese sueldo a mano
// (mismo monto, ±5 días) no se duplica.
function importarSueldosToku(dias) {
  const filas = [];
  mensajes(`from:transferencias@bci.cl "TOKU SPA" newer_than:${dias}d`).forEach(m => {
    const body = cuerpo(m);
    const monto = pesos((body.match(/Monto transferido\s*:?\s*\$?\s*([\d.]+)/i) || [])[1]);
    if (!monto) return;
    const fecha = fechaDe(body.match(/Fecha de (?:pago|abono)\s*:?\s*(\d{2})\/(\d{2})\/(\d{4})/i), m);
    const com = (body.match(/Comentario para el destinatario\s*:?\s*(.+?)\s*(?:N[úu]mero de operaci|Mesa Central|Atentamente|$)/i) || [])[1];
    filas.push({ fecha, monto, tipo: 'sueldo', descripcion: (com || 'Sueldo Toku').trim().substring(0, 120),
                 fuente: 'toku_auto', ref_externa: m.getId() });
  });
  if (!filas.length) return;

  const desde = Utilities.formatDate(new Date(Date.now() - (dias + 10) * 864e5), 'America/Santiago', 'yyyy-MM-dd');
  const res = UrlFetchApp.fetch(`${SUPA_URL}/rest/v1/ingresos?select=fecha,monto,ref_externa&fecha=gte.${desde}`,
    { headers: headers(), muteHttpExceptions: true });
  if (res.getResponseCode() !== 200) { Logger.log('ingresos: no pude leer (' + res.getResponseCode() + '), ¿APP_KEY correcta?'); return; }
  const ya = JSON.parse(res.getContentText());
  const nuevas = filas.filter(f => !ya.some(i => i.ref_externa === f.ref_externa ||
    (!i.ref_externa && i.monto === f.monto && Math.abs(new Date(i.fecha) - new Date(f.fecha)) <= 5 * 864e5)));
  if (nuevas.length) guardar('ingresos', nuevas);
}

function esPropia(nombre, cuenta) {
  const c = String(cuenta || '').replace(/^0+/, '');
  if (c && CUENTAS_PROPIAS.some(p => p.replace(/^0+/, '') === c)) return true;
  return /vicho/i.test(nombre) || (/vicente/i.test(nombre) && /bishara/i.test(nombre));
}

function getDolar() {
  try {
    const r = JSON.parse(UrlFetchApp.fetch('https://mindicador.cl/api/dolar').getContentText());
    return r.serie[0].valor;
  } catch (e) {
    return 950; // respaldo si la API no responde
  }
}
