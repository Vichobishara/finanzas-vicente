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
| 2 | Datos privados por persona (RLS por usuario) | ⏳ |
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
