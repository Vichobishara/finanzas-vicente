# Finanzas Vicho — contexto para Claude Code

App personal de finanzas de Vicho (26 años, Santiago). Su objetivo: gastar con control, ahorrar
todos los meses en Fintual/APV y llegar a millonario. Vicho se describe como procrastinador,
desordenado y gastador: **toda decisión de UX se evalúa pensando en esa persona.**

## 🚨 Regla #1
**NUNCA tocar nada de TCG Logs**: ni el proyecto Supabase `os-tcg` ni el proyecto Vercel `tcg-logs`.
Esta app usa SOLO Supabase `finanzas-vicho` y Vercel `finanzas-vicente`.

## Stack
- `index.html`: app completa en un solo archivo (HTML + CSS + JS vanilla, sin build).
- Datos: Supabase REST (`https://caaewoxfvmdizzziyvfz.supabase.co/rest/v1/`) con la anon key (está en index.html).
- Hosting: Vercel, proyecto `finanzas-vicente` (team `vicente-bisharas-projects`), sitio estático.
  Push a `main` = deploy a producción → https://finanzas-vicente.vercel.app
- `scripts/importar_correos.gs`: Google Apps Script que cada 15 min lee correos (compras tarjeta BCI, transferencias
  hechas desde BCI y Scotia, sueldos Toku) y los inserta en Supabase.
- `supabase/migrations/`: SQL aplicado a mano en Supabase (registro de cambios de esquema).
- `supabase/functions/consejo`: edge function "Pregúntale a Claude" (en ¿Me alcanza?). Exige x-app-key; usa el secreto
  `ANTHROPIC_API_KEY` de finanzas-vicho (workspace Anthropic aparte de TCG). La app le manda los números ya calculados
  (`ctxIA()`); las reglas de CFO van en el prompt de la función. Guía: `docs/preguntale_a_claude.md`.
- `docs/atajo_apple_pay.md`: cómo armar el atajo de iOS que anota solo las compras Apple Pay con Scotia.
- `tests/smoke.test.js`: prueba con jsdom y datos falsos. Correr antes de cada push: `npm i jsdom && node tests/smoke.test.js`

## Base de datos (Supabase `finanzas-vicho`, id `caaewoxfvmdizzziyvfz`)
- `gastos` (fecha, descripcion, monto, categoria_clave, tarjeta, fuente, pulldex, periodo, ref_externa, estado, destinatario)
  - `pulldex = true` significa **negocio** (TCG Logs / PULLDEX): no cuenta en el presupuesto personal.
  - Trigger `gastos_auto` (BEFORE INSERT): si `categoria_clave` es null la asigna con `reglas_categoria`
    (match más largo por ILIKE, si no → `otros`), y calcula `periodo` (YYYY-MM) según el cierre de la
    tarjeta: BCI día 20, todo lo demás (Scotia, efectivo, transferencias) día 22 (después del cierre → mes siguiente).
    Si trae `destinatario` (transferencia), busca en `destinatarios`: ignorar → `estado='ignorado'`, gasto → su
    categoría; si no lo conoce → `estado='revisar'`.
  - `ref_externa` único = id del correo Gmail (evita duplicados del script). Por eso los gastos que vienen de un
    correo no se borran: se marcan `estado='ignorado'` (si se borran, el script los vuelve a traer).
  - `estado`: ok (cuenta) | revisar (transferencia esperando confirmación, no cuenta) | ignorado (no cuenta).
  - `fuente`: manual | bci_auto | atajo | app | transferencia. `tarjeta`: scotiabank | bci | santander | efectivo | otro.
- `destinatarios` (nombre, accion gasto|ignorar, categoria_clave): lo que la app recuerda por destinatario de
  transferencia (match ILIKE más largo). Transferencias a cuentas propias no se importan (filtro en el script).
- Función `anotar_atajo(monto_txt, comercio)`: la llama el atajo de iOS vía `/rest/v1/rpc/anotar_atajo`; limpia el
  monto ("$12.990", "CLP 12.990") e inserta el gasto Scotia con fuente `atajo`.
- `categorias` (clave, nombre, techo, color): comida 250k, fijo 200k, tech 100k, transporte 30k,
  salud 60k, ocio 70k, coleccionables 0 (bloqueado), viajes, otros.
- `reglas_categoria` (palabra, categoria_clave, negocio): la app agrega reglas cuando el usuario corrige una categoría.
- `cuotas` (nombre, monto_cuota, total_cuotas, tarjeta, activa, primer_periodo, recurrente)
  - La cuota N de un periodo se calcula con `primer_periodo`; `recurrente = true` = fijo mensual (Santander, Crossfit).
- `presupuestos` (periodo, monto): presupuesto total del mes, **incluye cuotas y fijos**. Default $1.000.000.
- `ingresos` (fecha, monto, tipo, descripcion, base_tributable, impuesto): liquidaciones Toku.
- `ajustes` (clave, valor jsonb): `patrimonio` {fintual, colchon, cartas, eth, fecha} (colchon = parte de Fintual en
  Moderate Pitt), `perfil` {nacimiento, meta, sueldo}, `apv` {abierto, fecha}, `evitado` {periodo: monto}.
- `ingresos` también tiene `ref_externa` (único, id del correo) y `fuente` (manual | app | toku_auto). El script importa
  los abonos de TOKU SPA y no duplica si ya hay uno manual con el mismo monto (±5 días).
- `ahorros` (fecha, monto, destino fintual|apv|colchon, periodo): lo que Vicho **de verdad** transfirió. `periodo` = mes del sueldo.
  Al guardar desde la app se suma a `ajustes.patrimonio`.
- Ventas del negocio = filas en `gastos` con `pulldex = true` y `monto` negativo (P&L en la sheet Negocio).

## Seguridad (clave x-app-key)
- Todas las tablas exigen el header `x-app-key`. La función `privado.autorizado()` compara su sha256 con el hash guardado
  (el esquema `privado` no está expuesto). `rpc/clave_ok` devuelve true/false para la pantalla de candado.
- **Entrar = Face ID (passkey).** Edge function `acceso` (WebAuthn, rpID finanzas-vicente.vercel.app): si la passkey es
  válida devuelve la clave, que la app guarda en localStorage. Tablas `passkeys`, `passkey_retos` y `secretos` (app_key)
  tienen RLS sin políticas: solo las lee la edge function con service role. El primer registro queda abierto hasta el
  13-10-2026; después, registrar otra passkey exige la clave (`accion:'nuevo'` + x-app-key).
- Respaldo: "Usar una clave" en el candado, o el link `#k=CLAVE`. **La clave nunca va en el repo.**
- Los scripts sin clave (el Apps Script BCI ya instalado) pueden insertar en `gastos` si fuente es bci_auto | transferencia | atajo.
  `importar_correos.gs` funciona sin clave para compras y transferencias; `APP_KEY` solo hace falta para los sueldos Toku (`ingresos`).
  La política `scripts_upsert` deja pasar SELECT solo durante POST (para el upsert `on_conflict`): un GET sin clave nunca ve filas.
  `gastos_auto` y `anotar_atajo` son SECURITY DEFINER.
- Para cambiar la clave: recalcular el hash en `privado.autorizado()` y actualizar `secretos.app_key`.

## Lógica de negocio clave
- "Hoy puedes gastar" = cupo del día − lo gastado hoy. Cupo del día = lo que quedaba al empezar el día
  (presupuesto − cuotas − gastos de días anteriores) / días hasta el 22. Es fijo durante el día: si te pasas, el hero
  dice "Hoy te pasaste por $X" y cuánto queda por día desde mañana. Debajo va "Esta semana te quedan" (lun–dom, sin
  pasar del 22) para las compras que no caben en un día.
- Sueldo base esperado: $2.000.000. Lo que no se gasta del presupuesto se reparte 50% Fintual / 50% colchón.
- APV régimen A: 40 UTM/año ($239k/mes) → bono 15%, tope 6 UTM. UTM hardcodeada en 71.649: **actualizar cada año**.
- Reliquidación anual del impuesto único (art. 47, un empleador): se estima con base_tributable e impuesto de `ingresos`.
- Mes con bono (> $2M): 70% del extra a invertir (APV hasta 40 UTM, luego Fintual), 30% libre.
- Proyección a millonario: 6% real anual sobre Fintual + ETH; las cartas no crecen en el modelo.

## Principios de UX (no negociables)
1. Una pantalla y dos botones: **Anotar gasto** y **¿Me alcanza?**. Todo lo demás, en el menú o en sheets.
2. El número principal es "hoy puedes gastar", y su color (verde, amarillo, rojo) ES el semáforo.
3. Lenguaje chileno simple. Nada de jerga ("periodo", "cierre" → "hasta el 22").
4. Anotar un gasto debe tomar menos de 3 segundos. La categoría es automática.
5. Premiar el autocontrol ("te aguantaste $X") y mostrar el costo en 10 años de cada compra.
6. No es asesoría financiera: mantener los avisos "no soy asesor" en las secciones de impuestos e inversión.

## Pendientes / ideas
- [x] Seguridad: RLS con clave `x-app-key` (ver arriba). Si algún día hay más usuarios: Supabase Auth + RLS por usuario.
- [x] Atajo de iOS con disparador "Transacción" (Apple Pay Scotia) → `rpc/anotar_atajo` (ver docs/atajo_apple_pay.md).
- [ ] Cuadratura mensual Scotia: comparar el total del estado de cuenta con lo anotado y crear el ajuste "sin anotar".
- [ ] Revisar si Scotiabank permite alertas por correo o SMS, para sumarlas al script.
- [ ] Alertas por correo desde Apps Script (categoría > 80%, resumen semanal).
- [ ] Actualización automática del saldo de Fintual (hoy es manual, desde la app).
- [x] Aportes reales: tabla `ahorros` (nudge "¿Ya mandaste a Fintual?" del 27 al 10).
- [ ] Regla de CFO: cero cuotas nuevas mientras cuotas y fijos sean ≥ 30% del presupuesto (¿Me alcanza? ya la aplica).
