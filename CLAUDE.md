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
- `supabase/functions/consejo`: edge function "Pregúntale a Claude" (chat que se abre desde la píldora negra "Claude" del encabezado, animación tipo Dynamic Island, a casi pantalla completa; recuerda la conversación en `localStorage['chat-h']`; en ¿Me alcanza? da una "segunda opinión" dentro de la misma hoja: recibe `veredicto_app` y no lo contradice, y se puede seguir la conversación en Coach). Exige x-app-key; usa el secreto
  `ANTHROPIC_API_KEY` de finanzas-vicho (workspace Anthropic aparte de TCG). La app le manda los números ya calculados
  (`ctxIA()`); las reglas de CFO van en el prompt de la función. Guía: `docs/preguntale_a_claude.md`.
- `supabase/functions/cartola`: lee una cartola de tarjeta (PDF o foto) con Claude y devuelve las compras en cuotas vigentes
  (JSON con esquema fijo). No guarda nada: la app muestra la lista, la persona revisa y la app inserta en `cuotas`. Exige x-app-key.
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
- `categorias` (clave, nombre, techo, color): comida 250k, fijo 200k, tech 100k, casa 100k, ropa 50k, transporte 30k,
  salud 60k, ocio 70k, coleccionables 0 (bloqueado), viajes, otros. **Casa** = lo de independizarse (electrodomésticos,
  muebles, IKEA/Sodimac): todo lo comprado en Casa (`S.casaComp`, todos los meses) se descuenta de "amoblar" en la meta
  Independizarme. **Ropa** existe para que la ropa no caiga en tech. Orden en la app: `KS` en index.html.
- `reglas_categoria` (palabra, categoria_clave, negocio): la app agrega reglas cuando el usuario corrige una categoría.
- `cuotas` (nombre, monto_cuota, total_cuotas, tarjeta, activa, primer_periodo, recurrente)
  - La cuota N de un periodo se calcula con `primer_periodo`; `recurrente = true` = fijo mensual (Santander, Crossfit).
- `presupuestos` (periodo, monto): presupuesto total del mes, **incluye cuotas y fijos**. Default $1.000.000.
- `ingresos` (fecha, monto, tipo, descripcion, base_tributable, impuesto): liquidaciones Toku.
- `ajustes` (clave, valor jsonb): `patrimonio` {fintual, colchon, cartas, eth, fecha} (colchon = parte de Fintual en
  Moderate Pitt), `perfil` {nacimiento, meta, sueldo}, `apv` {abierto, fecha}, `evitado` {periodo: monto},
  `deseos` [{id, que, monto, desde, estado espera|aguantado|comprado}] (lista de deseos, regla de 72 horas: aguantarse suma a
  `evitado`), `fondo` {que, meta, ahorrado, mensual} (fondo gadgets: lo comprado con el fondo queda como gasto `ignorado`).
  `deudas` [{id, que, monto, desde, nota}] (tarjeta "Por pagar" en Plata: deudas que no son cuotas, ej. PSA; no cuentan en el
  presupuesto, "La pagué" las quita). `cobrar` [{id, que, monto, desde, nota}] (tarjeta "Por cobrar" en Plata: plata que le
  deben, ej. el IVA del iPhone; no cuenta hasta que llega; "Llegó" la quita y pregunta adónde va: casa, Fintual, fondo o tarjeta). Ingresos inciertos (comisiones que quizás llegan) **no** se anotan: Vicho no quiere contar con ellos.
- `ingresos` también tiene `ref_externa` (único, id del correo) y `fuente` (manual | app | toku_auto). El script importa
  los abonos de TOKU SPA y no duplica si ya hay uno manual con el mismo monto (±5 días).
- `ahorros` (fecha, monto, destino fintual|apv|colchon, periodo): lo que Vicho **de verdad** transfirió. `periodo` = mes del sueldo.
  Al guardar desde la app se suma a `ajustes.patrimonio`.
- Ventas del negocio = filas en `gastos` con `pulldex = true` y `monto` negativo (P&L en la sheet Negocio).

## Varias personas (fase 2, aplicada el 30-09-2026)
- Tabla `cuentas` (email, nombre, clave, clave_hash, token_atajo, legado): **cada persona tiene su propia x-app-key**.
  `privado.uid()` = cuenta dueña de la clave del request, o `app.user_id` cuando trabaja la base sola (cron, atajo).
  Todas las tablas tienen `user_id` (default `privado.uid()`) y RLS `user_id = privado.uid()`. `reglas_categoria` con
  `user_id` null = reglas comunes para todos. Vicho es la cuenta `legado`: lo que llega sin clave (Apps Script, atajo sin
  token) es suyo, así que su atajo y su script siguen igual.
- Funciones de cálculo y avisos (estado_mes, racha, resumen_hoy, avisos_*…) son del rol `finanzas_calc`, que respeta RLS.
  El cron llama `privado.avisos_todos()` que recorre las cuentas. `privado.push` manda `user_id` y la edge function `push`
  solo manda a los celulares de esa cuenta.
- Alta: `acceso_google` deja entrar a los correos de `secretos.google_emails` (o a quien ya tiene cuenta) y llama
  `crear_cuenta(email, nombre)` → cuenta vacía con sus categorías. En la app, sin `ajustes.perfil` se abre la **bienvenida
  de 6 pasos** (`bienvenida()` … `bvGuardar()`): 1) nombre y edad, 2) sueldo y día de pago, 3) fijos (arriendo, cuentas,
  celular, gym, apps, estudios → cuotas `recurrente`), 4) cuotas (total aprox. o subir cartola), 5) cómo está hoy (ahorrado →
  `patrimonio.fintual`, cuenta → `perfil.caja`, deuda tarjetas → `ajustes.deudas`, gastado desde el 23 → se descuenta del
  presupuesto de este mes), 6) resumen (sueldo − fijos − cuotas − día a día = ahorro; presupuesto sugerido). Guarda
  `perfil` {nombre, sueldo, nacimiento, meta, ppto, dia_pago, caja} y escala los topes de categorías. Después, "Arma tu app".
- Presupuesto de un mes sin fila en `presupuestos`: `perfil.ppto` → último mes guardado → $1.000.000 (JS `S.ppto` y
  `privado.ppto_de(per)` en la base, usada por estado_mes y los avisos).
- Para invitar a alguien: Coach → **Invitar a alguien** (solo la cuenta de Vicho: `rpc/es_admin`, `rpc/invitados`,
  `rpc/invitar(p_email, p_quitar)`), que maneja `secretos.google_emails`.
- Coach → **Conecta Apple Pay**: guía que copia el código de la persona (`rpc/mi_token_atajo`) y abre el atajo de iCloud
  (`secretos.atajo_url`, `rpc/atajo_url`). Cómo se arma el atajo maestro: `docs/atajo_amigos.md`.
- `anotar_atajo(monto_txt, comercio, token)`: con token (`cuentas.token_atajo`, `rpc/mi_token_atajo`) anota en esa cuenta.
  Cada llamada queda en `atajo_log` (con `user_id`; la persona ve la última con `rpc/mi_ultimo_atajo`). La automatización de iOS
  debe estar en **Ejecutar inmediatamente** y `monto_txt`/`comercio` deben salir de **Entrada del atajo** (si no, llegan vacíos).
- **Arma tu app** (`armaApp()`, después de la bienvenida y como aviso en Hoy): 1) Face ID en Safari, 2) ponerla en inicio y entrar
  desde el ícono con Face ID (el ícono no comparte sesión con Safari), 3) Conecta Apple Pay (solo iPhone).

## Metas, hábitos y extras (30-09-2026)
- `ajustes.casa` {arriendo, muebles, ahorrado, mensual}: meta **Independizarme** (Plata). Necesitas = arriendo × 2,5
  (garantía + primer mes + corretaje) + muebles. ¿Me alcanza? dice cuántas semanas atrasa la mudanza.
- Racha (🔥 en el hero de Hoy) = `racha()` en JS, misma regla que `privado.racha()`. Mejor racha en `localStorage['racha-max']`.
  Logros en Coach (`renderLogros`).
- Gastos → **Suscripciones**: gastos `fijo` de 3 meses agrupados + fijos recurrentes; "La di de baja" → `ajustes.bajas`.
- ¿Me alcanza? → **¿Cuál me compro?** compara 2 opciones (costo real con reventa, atraso de metas, 10 años).
- ¿Me alcanza? en cuotas (3, 6, 12, 24): `planCuotas()` dibuja la carga de cuotas de los próximos meses con la compra
  (primera cuota = boleta siguiente según el cierre de la tarjeta) y avisa si comprando después del cierre se corre un mes.
  Regla del 30%: "No" salvo compra ≥ $500.000 cuyas cuotas bajan del 30% en ≤ 3 meses → "Se puede, con una condición"
  (ninguna otra cuota hasta ese mes; solo si son sin interés).
- Cuota → **La adelanté**: la cuota de este mes se queda (`total_cuotas` = la cuota actual) y lo que faltaba se anota hoy
  como gasto "Adelanto cuotas · X". Las compras en cuotas aparecen en el detalle de Scotia dos veces: el total (solo registro)
  y "NOMBRE 01/12" (lo que se cobra cada mes). Si cuota × N = precio, son sin interés.
- Gasto → **Devolví algo**: baja el monto (deja "· devolución $X" en la descripción); si devolvió todo queda `ignorado`.
- Anotar gasto muestra en qué categoría cae mientras escribes (`aCat`) y se puede cambiar; si la cambias, se aprende la regla.
- Gastos: barra de colores por categoría, gráfico **Día a día** (cada día vs. lo que podías gastar por día), listas agrupadas
  por día con su total (tocar el gráfico o el encabezado de un día abre `openDia`: sus gastos vs. la plata del día), y "Ver todos" con buscador y filtro por categoría.
- **Decidir compras** (¿Me alcanza?): 3 preguntas (¿lo necesitas o lo quieres?, ¿tienes algo parecido?, ¿cuántas veces al mes?)
  → consejo: comprar / esperar 72 horas / no, con costo por uso a 2 años. Las respuestas se guardan en el deseo (`por`).
  A las 72 horas aparece en Hoy "Pasaron 3 días" → `openDeseo`: lo que dijiste ese día, si hoy te alcanza (o lo cubre el
  fondo) y "Ya no lo quiero" / "Sí, lo compro" / "Espérame 3 días más".
- Coach → **Widget en tu inicio**: script de Scriptable (`widgetJS`) con el código personal → `rpc/widget(token)`.

- Plata → **Tu caja** (`openCaja()`): `perfil.caja` (lo que hay en la cuenta, a mano), `caja_fecha`, `caja_min` (default $300.000).
  Muestra la próxima factura estimada = compras con tarjeta del mes (scotiabank/bci/santander) + cuotas no recurrentes del mes,
  y las cuotas que quedan después. **La caja no suma al presupuesto**: paga efectivo/transferencias hasta el sueldo; lo que pase
  del mínimo el día antes del sueldo va al plan o al fondo. `ctxIA()` manda `caja` al chat.

## Fintual conectado (30-09-2026)
- Plata → **Conectar Fintual**: la persona pone correo y contraseña de Fintual UNA vez. La edge function `fintual` llama
  `POST fintual.cl/api/access_tokens` y guarda **solo el token** en `fintual_conexion` (RLS sin políticas; la contraseña
  nunca se guarda ni se registra). Con `GET /api/goals?user_email&user_token` actualiza `ajustes.patrimonio` (fintual = todas
  las metas que cuentan, colchon aparte; cartas y ETH no se tocan) y detecta aportes: si sube `deposited` de una meta desde
  la última foto (`fintual_conexion.ultimo`), inserta en `ahorros` (nota "Detectado en Fintual", salvo que ya haya uno manual
  ±2% en 10 días) y manda un push. Destino de cada meta (fintual | colchon | apv | fuera) se elige en la app.
- Acciones: `conectar`, `sync`, `destinos`, `desconectar` (con x-app-key) y `todos` (cron `fintual` 00:00 UTC ≈ 21:00
  Santiago, con x-avisos-token). La app lee el estado en `ajustes.fintual` (sin token) y sincroniza al abrir si pasaron > 6 h.
  Si Fintual responde 401 (cambió la contraseña) queda `error:'token'` y la app pide volver a conectar.

## Seguridad (clave x-app-key)
- Todas las tablas exigen el header `x-app-key`. La función `privado.autorizado()` compara su sha256 con el hash guardado
  (el esquema `privado` no está expuesto). `rpc/clave_ok` devuelve true/false para la pantalla de candado.
- **Entrar = Face ID (passkey).** Edge function `acceso` (WebAuthn, rpID finanzas-vicente.vercel.app): si la passkey es
  válida devuelve la clave **de su dueño** (`passkeys.user_id` → `cuentas.clave`), que la app guarda en localStorage.
  Tablas `passkeys`, `passkey_retos`, `secretos`, `cuentas` y `atajo_log` tienen RLS sin políticas: solo las leen las edge
  functions con service role o funciones SECURITY DEFINER. Registrar una passkey siempre exige estar dentro
  (`accion:'nuevo'` + x-app-key); ya no hay registro abierto.
- Las RPC SECURITY DEFINER expuestas a anon (`anotar_atajo`, `widget`, `atajo_url`, `es_admin`, `invitados`, `invitar`,
  `mi_token_atajo`, `mi_ultimo_atajo`) son a propósito: cada una valida la clave (`privado.uid()`) o el código personal adentro.
- **Continuar con Google** (fase 1 del proyecto amigos): Supabase Auth con Google (cliente OAuth en el proyecto Google Cloud
  `finanzas-vicho`). La app va a `/auth/v1/authorize?provider=google`, vuelve con `#access_token` y la edge function
  `acceso_google` revisa que el correo esté en `secretos.google_emails` (separados por coma) y devuelve la clave.
  Quien no está en la lista ve "Pídele acceso a Vicho". En la fase 2 esto pasa a RLS por usuario.
- Respaldo: "Usar una clave" en el candado, o el link `#k=CLAVE`. **La clave nunca va en el repo.**
- Los scripts sin clave (el Apps Script BCI ya instalado) pueden insertar en `gastos` si fuente es bci_auto | transferencia | atajo.
  `importar_correos.gs` funciona sin clave para compras y transferencias; `APP_KEY` solo hace falta para los sueldos Toku (`ingresos`).
  La política `scripts_upsert` deja pasar SELECT solo durante POST (para el upsert `on_conflict`): un GET sin clave nunca ve filas.
  `gastos_auto` y `anotar_atajo` son SECURITY DEFINER.
- Para cambiar la clave: recalcular el hash en `privado.autorizado()` y actualizar `secretos.app_key`.

## Lógica de negocio clave
- "Hoy puedes gastar" = cupo del día − lo gastado hoy. Cupo del día = lo que quedaba al empezar el día
  (presupuesto − cuotas − gastos de días anteriores) / días hasta el 22. Es fijo durante el día. **El número grande siempre es lo que puedes
  gastar, nunca lo que te pasaste**: si te pasas hoy, dice "Desde mañana puedes gastar $X al día" y debajo, chico,
  "Hoy te pasaste por $Y"; si te pasas del mes, "Hasta el 22 puedes gastar $0". Debajo va "Esta semana te quedan" (lun–dom, sin
  pasar del 22) para las compras que no caben en un día.
- Alertas (pop-up "Ojo, Vicho" al abrir la app o al anotar): te pasaste hoy / de la semana / del mes, categoría > 80% o
  sobre el tope, cartas bloqueadas y "vas gastando muy rápido" (% gastado > % del mes + 15). Cada una se muestra una vez
  (por día, semana o mes) con `localStorage['alertas-vistas']`. La notificación del atajo Apple Pay trae la misma alerta:
  `anotar_atajo` le agrega `resumen_hoy(categoria)` (función interna, sin grant a anon).
- **Avisos push** (Web Push, app instalada en inicio): `sw.js` los muestra; la app guarda la suscripción en `push_subs`
  (con x-app-key). La base decide qué mandar: trigger `trg_aviso_gasto` (BCI/transferencias), `trg_aviso_sueldo`, y pg_cron
  `avisos` cada hora → `privado.avisos_programados(p_ahora)` (lunes 9, viernes 18, día 23 10:00, 10:00 Fintual, 21:00 racha
  y pendientes, hitos de $5M). Cron `avisos_extra` cada hora → `privado.avisos_extra(p_ahora)`: domingo 20:00 resumen de la
  semana (abre `/?revision`: hoja "Tu semana en 2 minutos" con resumen, pendientes y meta; también en Coach y como aviso en
  Hoy domingo/lunes, hecha = `localStorage['revision-<lunes>']`) y lista de deseos a las 72 horas (`ajustes.deseos`). `privado.push()` deja cada aviso en `avisos_log` (clave única = se manda una vez) y llama a la
  edge function `push` vía pg_net con `x-avisos-token`. VAPID y token en `secretos`. Probar lógica: llamar
  `privado.avisos_programados('2026-10-23 10:00')` dentro de un DO que termina en RAISE (se revierte) y leer `avisos_log`.
- `ajustes.fintual_pausa` {hasta}: mientras esté vigente, ni la app ni los avisos piden mandar plata a Fintual.
- Sueldo base esperado: $2.000.000. Lo que no se gasta del presupuesto se reparte 50% Fintual / 50% colchón.
- APV régimen A: 40 UTM/año ($239k/mes) → bono 15%, tope 6 UTM. UTM hardcodeada en 71.649: **actualizar cada año**.
- Reliquidación anual del impuesto único (art. 47, un empleador): se estima con base_tributable e impuesto de `ingresos`.
- Mes con bono (> $2M): 70% del extra a invertir (APV hasta 40 UTM, luego Fintual), 30% libre.
- Proyección a millonario: 6% real anual sobre Fintual + ETH; las cartas no crecen en el modelo.

## Principios de UX (no negociables)
1. La pestaña **Hoy** es una pantalla y dos botones: **Anotar gasto** y **¿Me alcanza?** (más los avisos y la tarjeta "Hoy anotaste" con los gastos del día, o "Nada anotado hoy"). Lo demás vive
   en la barra de abajo (5 pestañas con ícono y nombre, y el + al centro): **Cuotas** (cuánto se va al mes en cuotas y fijos,
   la regla del 30% con la fecha en que bajas, "¿Puedo comprar algo en cuotas?" y cada cuota con cuántas quedan), **Gastos** (cómo vas vs. donde deberías ir hoy, pendientes, categorías, últimos gastos, cuotas,
   negocio, meses, presupuesto), **Plata** (camino a la meta, próximo movimiento, plan de ahorro del mes; fondo gadgets, por pagar, APV e
   impuestos como filas cortas que abren su detalle en una hoja; bono, sueldos y patrimonio en hojas) y **Coach** (hábitos del mes con puntaje y botón para
   resolver cada uno, Pregúntale a Claude, consejos con acción, avisos). Nada importante bajo el scroll de Hoy.
2. El número principal es "hoy puedes gastar", y su color (verde, amarillo, rojo) ES el semáforo.
3. Lenguaje chileno simple. Nada de jerga ("periodo", "cierre" → "hasta el 22").
4. Anotar un gasto debe tomar menos de 3 segundos. La categoría es automática.
5. Premiar el autocontrol ("te aguantaste $X") y mostrar el costo en 10 años de cada compra.
6. No es asesoría financiera: mantener los avisos "no soy asesor" en las secciones de impuestos e inversión.

## Pendientes / ideas
- [x] Seguridad: RLS con clave `x-app-key` (ver arriba). Si algún día hay más usuarios: Supabase Auth + RLS por usuario.
- [x] Atajo de iOS con disparador "Transacción" (Apple Pay Scotia) → `rpc/anotar_atajo` (ver docs/atajo_apple_pay.md).
- [x] Cuadrar con la cartola (Gastos → "Cuadrar con la cartola"): `cartola` con `modo:'compras'` lee todas las compras,
  la app las compara con lo anotado (monto ±$1, fecha ±3 días) y ofrece agregar las que faltan (salta las en cuotas).
- [ ] Revisar si Scotiabank permite alertas por correo o SMS, para sumarlas al script.
- [ ] Alertas por correo desde Apps Script (categoría > 80%, resumen semanal).
- [x] Actualización automática del saldo de Fintual (ver "Fintual conectado").
- [x] Aportes reales: tabla `ahorros` (nudge "¿Ya mandaste a Fintual?" del 27 al 10).
- [ ] Regla de CFO: cero cuotas nuevas mientras cuotas y fijos sean ≥ 30% del presupuesto (¿Me alcanza? ya la aplica).
