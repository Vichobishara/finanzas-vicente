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
- `scripts/importar_bci.gs`: Google Apps Script que lee correos de BCI y los inserta en Supabase cada 15 min.
- `tests/smoke.test.js`: prueba con jsdom y datos falsos. Correr antes de cada push: `npm i jsdom && node tests/smoke.test.js`

## Base de datos (Supabase `finanzas-vicho`, id `caaewoxfvmdizzziyvfz`)
- `gastos` (fecha, descripcion, monto, categoria_clave, tarjeta, fuente, pulldex, periodo, ref_externa)
  - `pulldex = true` significa **negocio** (TCG Logs / PULLDEX): no cuenta en el presupuesto personal.
  - Trigger `gastos_auto` (BEFORE INSERT): si `categoria_clave` es null la asigna con `reglas_categoria`
    (match más largo por ILIKE, si no → `otros`), y calcula `periodo` (YYYY-MM) según el cierre de la
    tarjeta: Scotiabank día 22, BCI día 20 (compras después del cierre → mes siguiente).
  - `ref_externa` único = id del correo Gmail (evita duplicados del script BCI).
  - `fuente`: manual | bci_auto | atajo | app
- `categorias` (clave, nombre, techo, color): comida 250k, fijo 200k, tech 100k, transporte 30k,
  salud 60k, ocio 70k, coleccionables 0 (bloqueado), viajes, otros.
- `reglas_categoria` (palabra, categoria_clave, negocio): la app agrega reglas cuando el usuario corrige una categoría.
- `cuotas` (nombre, monto_cuota, total_cuotas, tarjeta, activa, primer_periodo, recurrente)
  - La cuota N de un periodo se calcula con `primer_periodo`; `recurrente = true` = fijo mensual (Santander, Crossfit).
- `presupuestos` (periodo, monto): presupuesto total del mes, **incluye cuotas y fijos**. Default $1.000.000.
- `ingresos` (fecha, monto, tipo, descripcion, base_tributable, impuesto): liquidaciones Toku.
- `ajustes` (clave, valor jsonb): `patrimonio` {fintual, cartas, eth, fecha}, `perfil` {nacimiento, meta}.
- RLS habilitado con política abierta (`USING true`). Ver "Pendientes".

## Lógica de negocio clave
- "Hoy puedes gastar" = (presupuesto − gastos personales − cuotas del periodo) / días hasta el cierre del 22.
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
- [ ] **Seguridad:** la anon key está en el cliente y RLS está abierto. Mantener el repo PRIVADO.
      Siguiente paso: Supabase Auth (magic link) + políticas RLS por usuario.
- [ ] Atajo de iOS con disparador "Transacción" (Apple Pay Scotia) → POST a /gastos con fuente `atajo`.
- [ ] Revisar si Scotiabank permite alertas por correo o SMS, para sumarlas al script.
- [ ] Alertas por correo desde Apps Script (categoría > 80%, resumen semanal).
- [ ] Actualización automática del saldo de Fintual (hoy es manual, desde la app).
- [ ] Aportes al APV reales (AFP Uno, régimen por confirmar) en lugar de supuestos.
