# Proyecto: la app para amigos (login con Google, datos privados, onboarding)

Objetivo: que Vicho pueda prestarle la app a amigos. Cada persona entra con Google, pasa por un
onboarding de puros toques (referencia: [Clicky](https://www.heyclicky.com)) y **solo ve sus propios datos**.
Las automatizaciones (atajo Apple Pay y correos del banco) se instalan en minutos, no en una tarde.

Regla #1 sigue vigente: nada de esto toca TCG Logs (`os-tcg` / `tcg-logs`).

## Estado

| Fase | Qué | Estado |
|---|---|---|
| 0 | Preparación (pasos de Vicho) | ⏳ pendiente |
| 1 | Login con Google para Vicho, sin romper nada | ⏳ |
| 2 | Datos privados por persona (RLS por usuario) | 🔍 diagnóstico y borrador listos |
| 3 | Onboarding tipo Clicky | ⏳ |
| 4 | Automatizaciones instalables (atajo + correos) | ⏳ |
| 5 | Invitar amigos (lista de invitados, límites) | ⏳ |

Cada fase es uno o más PRs chicos. Ninguna fase deja la app rota para Vicho.

## Fase 0: preparación (la hace Vicho, ~20 min)
1. **Reconectar el conector de Supabase** en claude.ai (Configuración → Conectores), para que Claude pueda
   aplicar migraciones.
2. **Crear el cliente OAuth de Google** (Google Cloud Console → APIs y servicios → Credenciales →
   "ID de cliente OAuth" → Aplicación web). URI de redirección: la que muestra Supabase en
   Authentication → Providers → Google. Pegar el Client ID y el Secret en ese mismo panel de Supabase.
3. **Capturas de Clicky**: 5 a 8 pantallas de su registro/onboarding, para copiar el ritmo y el tono.

## Fase 1: login con Google (solo Vicho)
- Supabase Auth con Google. Pantalla de entrada nueva: botón "Continuar con Google".
- Tabla `perfiles` (user_id, nombre, sueldo, día de pago, bancos, meta, onboarding_ok).
- Mientras dure la migración conviven Google, Face ID (passkey) y la clave `x-app-key`, para no quedar afuera.

## Fase 2: datos privados por persona
- Columna `user_id uuid default auth.uid()` en `gastos`, `cuotas`, `presupuestos`, `ingresos`, `ajustes`,
  `ahorros`, `destinatarios`, `reglas_categoria`, `categorias`. Backfill: todo lo actual → user_id de Vicho.
- RLS: `user_id = auth.uid()` en select/insert/update/delete. Se borran las políticas por `x-app-key`.
- `categorias`: cada persona parte con las 9 de siempre y techos sugeridos según su sueldo.
  `reglas_categoria`: reglas comunes (Jumbo → comida, Uber → transporte…) + las propias.
- Scripts y atajo ya no pueden insertar "sin clave": cada persona tiene un **código personal**
  (tabla `tokens`: hash → user_id). `anotar_atajo(monto_txt, comercio, token)` y el importador de correos lo usan.
- Edge function `consejo` (Pregúntale a Claude): usa el JWT del usuario y tiene un límite de preguntas por día
  por persona (la API key de Anthropic la paga Vicho).
- Test de fuego: con dos usuarios de prueba, ninguno ve una fila del otro (por REST directo, no solo en la UI).

## Fase 3: onboarding tipo Clicky
Pantallas grandes, una pregunta por pantalla, respuestas con chips (cero teclado salvo el nombre):
1. ¿Cómo te llamo?
2. ¿Cuánto te llega al mes? (chips por rango, ajustable)
3. ¿Qué día te pagan?
4. ¿Qué tarjetas usas y cuándo cierran? (chips de bancos)
5. Tu presupuesto sugerido (con cuotas y fijos) → aceptar o ajustar
6. Tu meta (ahorro / millón / viaje)
7. Conectar el atajo de Apple Pay (fase 4)
8. Conectar los correos del banco (fase 4)
Barra de progreso, se puede saltar y retomar. Las cosas específicas de Vicho (Toku, PULLDEX, cartas, APV)
se muestran solo si la persona las activa.

## Fase 4: automatizaciones instalables
**Atajo Apple Pay.** iOS no deja compartir *automatizaciones*, pero sí *atajos* con un link de iCloud.
- Se publica un atajo "Finanzas: anotar compra" que ya trae la URL, los encabezados y el cuerpo armados.
  Al instalarlo, iOS pregunta **"Pega tu código"** (pregunta de importación) y lo guarda.
- En la app: botón "Instalar atajo" + "Copiar mi código".
- La persona solo crea la automatización: Automatización → Transacción → su tarjeta → Ejecutar
  inmediatamente → **Ejecutar atajo "Finanzas: anotar compra"** con la entrada del atajo. ~5 toques, con una
  guía de capturas dentro de la app.

**Correos del banco.** Opciones:
- A) *Copia del Apps Script*: link "Hacer una copia", pegar el código personal y tocar "Instalar" una vez
  (desde el computador; Google muestra el aviso de "app no verificada"). Rápido de hacer, pero engorroso para amigos.
- B) *Reenvío* (recomendada si son más de 3 amigos): cada persona tiene una dirección única y crea un filtro de
  Gmail que reenvía los correos del banco. Requiere un dominio + Cloudflare Email Routing → edge function.
- Descartado: leer Gmail con OAuth. El permiso de Gmail es "restringido" y exige una auditoría de seguridad pagada.

## Fase 5: invitar amigos
- Lista de invitados (correos permitidos). Quien no está invitado ve "Pídele acceso a Vicho".
- Borrar cuenta = borra todas sus filas.
- Aviso claro de privacidad: Vicho es el dueño del proyecto de Supabase.

## Riesgos
- **Privacidad**: un error de RLS expone gastos de otros. Por eso la fase 2 tiene su propio test con dos usuarios.
- **Costo de Claude**: límite diario por persona.
- **Supabase plan gratis**: sobra para decenas de usuarios; ojo con la pausa por inactividad.

## Diagnóstico (30-09-2026, solo lectura, para la fase 2)

Revisado con el conector de Supabase sobre `finanzas-vicho` (sa-east-1, sano). No se aplicó nada ni se cambiaron datos.
Borrador de la migración: `supabase/migrations/borrador_fase2_multiusuario.sql` (**no aplicado**).

### Lo que hay hoy
- **Datos**: gastos 42 · ingresos 25 · reglas 96 · categorías 9 · cuotas 6 · presupuestos 2 · ajustes 3
  (`perfil`, `patrimonio`, `fintual_pausa`) · destinatarios 1 · ahorros 0 · push_subs 1 · passkeys 1.
- **auth.users: 0.** Vicho todavía no existe como usuario de Supabase Auth → la fase 2 no se puede aplicar
  antes de la fase 1 (el backfill necesita su `user_id`).
- **RLS**: activo en las 14 tablas. Todas usan `con_clave` = `privado.autorizado()` (x-app-key). `gastos` además
  tiene `scripts_insert` y `scripts_upsert` para anon (fuente bci_auto | transferencia | atajo).
  `passkeys`, `passkey_retos` y `secretos` sin políticas (solo service role). Ninguna tabla tiene `user_id`.
- **Llaves globales que chocan con varios usuarios**: `categorias.clave` único (y `gastos`/`reglas_categoria` tienen
  FK a él), `presupuestos` PK `periodo`, `ajustes` PK `clave`, `destinatarios.nombre` único, `gastos.ref_externa` e
  `ingresos.ref_externa` únicos, `avisos_log` PK `clave`.
- **Funciones SECURITY DEFINER** (se saltan RLS, así que hoy leen TODO): `anotar_atajo`, `gastos_auto`,
  `resumen_hoy`, `privado.estado_mes`, `cuotas_de`, `racha`, `pausa_fintual`, `extras_gasto`, `push`,
  `aviso_gasto`, `aviso_sueldo`, `avisos_programados`, `autorizado`. Ninguna filtra por persona.
- **Triggers**: `trg_gastos_auto` (BEFORE INSERT gastos), `trg_aviso_gasto` (AFTER INSERT gastos),
  `trg_aviso_sueldo` (AFTER INSERT ingresos).
- **Cron**: job `avisos`, `0 * * * *` → `privado.avisos_programados()`.
- **Edge functions**: `acceso` (passkey, verify_jwt on), `consejo` (verify_jwt on, valida x-app-key contra
  `secretos`), `push` (verify_jwt off, token `x-avisos-token`; manda a **todas** las suscripciones).
- **Grants**: anon y authenticated tienen todos los privilegios de tabla (incluido TRUNCATE); lo que protege es RLS.

### Advisors de seguridad
- WARN: `anotar_atajo` y `gastos_auto` (SECURITY DEFINER) ejecutables por anon/authenticated vía `/rpc`.
  `anotar_atajo` es a propósito (atajo); `gastos_auto` es un trigger y no debería estar expuesto.
- WARN: `privado.clp` y `privado.hoy` sin `search_path` fijo.
- WARN: extensión `pg_net` en el esquema `public`.
- INFO: `passkeys`, `passkey_retos`, `secretos` con RLS y sin políticas (intencional).

### Diferencias con CLAUDE.md
- En el repo hay 3 migraciones; en Supabase hay **17** aplicadas (esquema inicial, RLS con clave, passkeys, ahorros,
  resumen_hoy…). El repo no alcanza para reconstruir la base: falta bajar el esquema completo antes de la fase 2.
- La edge function `acceso` está desplegada pero **no está en `supabase/functions/`**.
- Columnas no documentadas: `categorias.activa`, `cuotas.cuotas_pagadas`, `cuotas.sin_interes`, `cuotas.fecha_inicio`,
  `ahorros.nota`, `push_subs.ua`.
- `ajustes` no tiene hoy `apv` ni `evitado` (CLAUDE.md los nombra; la app los crea cuando se usan).
- `ahorros` está vacía: todavía no hay aportes reales anotados.
- `resumen_hoy` está en `public` (CLAUDE.md la llama "función interna"); no tiene grant a anon, así que está bien.
- Además de `anotar_atajo` y `gastos_auto`, casi todo `privado.*` también es SECURITY DEFINER.

### Qué hace el borrador
1. Guardia: no corre si falta el `user_id` de Vicho.
2. `user_id` (default `auth.uid()`) en gastos, cuotas, presupuestos, ingresos, ajustes, ahorros, destinatarios,
   categorías, push_subs, avisos_log y reglas_categoria; backfill con Vicho. Reglas no-negocio → comunes (`user_id` null).
3. Llaves únicas por persona (`(user_id, clave)`, `(user_id, periodo)`, `(user_id, ref_externa)`…).
4. RLS `user_id = auth.uid()`; fuera `con_clave`, `scripts_insert`, `scripts_upsert`; anon sin acceso a tablas.
5. Tabla `tokens` (hash sha256 → user_id, tipo atajo | correos) + `crear_token()` (lo muestra una vez).
6. `anotar_atajo(monto_txt, comercio, token)` y `importar_movimientos(token, gastos, ingresos)` para el Apps Script.
7. `gastos_auto`, `estado_mes`, `resumen_hoy`, `cuotas_de`, `racha`, `extras_gasto`, `push` filtran por persona.

### Riesgos
- **Fugas por SECURITY DEFINER**: RLS no protege dentro de esas funciones. Cada SELECT tiene que filtrar por
  `user_id` a mano; uno que se olvide = el amigo ve números de Vicho en una notificación. El test de fuego debe
  incluir el atajo y los avisos, no solo el REST.
- **Cortes el día del cambio**: el atajo actual (2 parámetros) y el Apps Script (POST sin clave) dejan de entrar
  en cuanto se aplique. Hay que actualizar ambos el mismo día.
- **Quedar afuera**: si se borra la clave antes de que el login con Google funcione en el celular, Vicho no entra.
  Por eso `privado.autorizado` se borra en una migración aparte, después.
- **Avisos push a todos**: la edge function `push` hoy manda a todas las suscripciones; hay que filtrarla por
  `user_id` antes de que exista un segundo usuario.
- **Categorías por persona**: con la FK nueva, un amigo no puede anotar hasta tener sus 9 categorías (el
  onboarding tiene que crearlas).

### Pendiente en el borrador (TODO)
- Reescribir `privado.avisos_programados` (→ `avisos_de_usuario` + loop por persona), `aviso_gasto` y `aviso_sueldo`.
- Edge functions: `push` (filtrar por user_id), `consejo` (JWT + límite diario), `acceso` (retirar o adaptar).
- Cierre de tarjeta por persona (hoy BCI 20 / resto 22 fijo) y tarjeta del atajo (hoy Scotia fijo).
- Bajar el esquema completo de Supabase al repo (las 14 migraciones que faltan).
