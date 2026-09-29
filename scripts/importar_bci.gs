/**
 * Finanzas Vicho — Importador automático BCI
 * Lee los correos "Notificación de uso de tu tarjeta de crédito" de BCI
 * y los guarda en Supabase (finanzas-vicho). La base categoriza sola.
 *
 * 1) Pega todo esto en script.google.com (proyecto nuevo)
 * 2) Ejecuta la función `instalar` una vez y acepta los permisos
 * Listo: corre solo cada 15 minutos.
 */

const SUPA_URL = 'https://caaewoxfvmdizzziyvfz.supabase.co';
const SUPA_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNhYWV3b3hmdm1kaXp6eml5dmZ6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA2ODk0ODUsImV4cCI6MjEwNjI2NTQ4NX0.mUu3EZuLUe_jpSLFpU5lkUaoDIQFZdXZqZkwac03EXY';

function instalar() {
  ScriptApp.getProjectTriggers().forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('importarBCI').timeBased().everyMinutes(15).create();
  importarBCI(); // primera corrida inmediata
}

function importarBCI() {
  const dolar = getDolar();
  const threads = GmailApp.search('from:contacto@bci.cl subject:"uso de tu tarjeta" newer_than:5d');
  const filas = [];

  threads.forEach(t => t.getMessages().forEach(m => {
    const body = m.getPlainBody().replace(/\s+/g, ' ');
    const montoMatch = body.match(/Monto\s*\|?\s*(USD)?\s*\$?\s*([\d\.,]+)/i);
    if (!montoMatch) return;

    const esUSD = !!montoMatch[1];
    let monto = esUSD
      ? Math.round(parseFloat(montoMatch[2].replace(/\./g, '').replace(',', '.')) * dolar)
      : parseInt(montoMatch[2].replace(/\./g, ''), 10);
    if (!monto) return;

    const f = body.match(/Fecha\s*\|?\s*(\d{2})\/(\d{2})\/(\d{4})/);
    const fecha = f ? `${f[3]}-${f[2]}-${f[1]}`
                    : Utilities.formatDate(m.getDate(), 'America/Santiago', 'yyyy-MM-dd');

    const c = body.match(/Comercio\s*\|?\s*([^|]+?)\s*(\||Si no quieres|$)/i);
    let desc = c ? c[1].replace(/\+\d{6,}.*$/, '').trim() : 'Compra BCI';
    if (esUSD) desc += ` (USD ${montoMatch[2]})`;

    if (/anulaci[oó]n/i.test(body)) { monto = -monto; desc = 'Anulación ' + desc; }

    filas.push({
      fecha, monto,
      descripcion: desc.substring(0, 120),
      tarjeta: 'bci',
      fuente: 'bci_auto',
      ref_externa: m.getId()
    });
  }));

  if (!filas.length) return;

  const res = UrlFetchApp.fetch(SUPA_URL + '/rest/v1/gastos?on_conflict=ref_externa', {
    method: 'post',
    contentType: 'application/json',
    headers: {
      apikey: SUPA_KEY,
      Authorization: 'Bearer ' + SUPA_KEY,
      Prefer: 'resolution=ignore-duplicates'
    },
    payload: JSON.stringify(filas),
    muteHttpExceptions: true
  });
  Logger.log(`${filas.length} revisados · HTTP ${res.getResponseCode()} ${res.getContentText().slice(0, 200)}`);
}

function getDolar() {
  try {
    const r = JSON.parse(UrlFetchApp.fetch('https://mindicador.cl/api/dolar').getContentText());
    return r.serie[0].valor;
  } catch (e) {
    return 950; // respaldo si la API no responde
  }
}
