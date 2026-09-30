# Atajo "Finanzas: anotar compra" para amigos (se arma una sola vez)

Cada persona que usa la app instala **el mismo atajo** desde un link de iCloud. Al instalarlo, iOS le pregunta
"Pega tu código" y la app ya se lo copió (su `cuentas.token_atajo`, vía `rpc/mi_token_atajo`). Con ese código,
`anotar_atajo(monto_txt, comercio, token)` anota la compra en **su** cuenta.

Vicho lo arma una vez en su iPhone y comparte el link. El link se guarda en `secretos.atajo_url` (la app lo lee con
`rpc/atajo_url`), así que se puede cambiar sin publicar la app.

## 1. Crear el atajo (en Atajos → pestaña Atajos → +)
Nombre: **Finanzas: anotar compra**. Ícono ⚡ morado.

1. En los detalles del atajo (ⓘ abajo): activa **"Recibir: Transacciones"** si aparece (así la automatización le pasa la compra).
2. Acción **Texto** → escribe `PEGA-TU-CODIGO`. (Esta es la que va a preguntar al instalar.)
3. Acción **Obtener contenido de URL**:
   - URL: `https://caaewoxfvmdizzziyvfz.supabase.co/rest/v1/rpc/anotar_atajo`
   - Método: **POST**
   - Encabezados: `apikey` = la anon key de la app (la misma de index.html), `Authorization` = `Bearer ` + anon key,
     `Content-Type` = `application/json`
   - Cuerpo: **JSON** con 3 campos de texto:
     - `monto_txt` → variable **Entrada del atajo** → toca y elige **Cantidad**
     - `comercio` → **Entrada del atajo** → **Comercio**
     - `token` → la variable **Texto** del paso 2
4. Acción **Mostrar notificación** → **Contenido de URL**, título "Finanzas".

Importante: `monto_txt` y `comercio` tienen que salir de **Entrada del atajo** (no de variables sueltas). Si salen
sueltas, llegan vacías y la base responde "No entendí el monto: (vacío)" (queda en `atajo_log`).

## 2. Pregunta al instalar
ⓘ → **Configurar este atajo** (o "Preguntas de importación") → **Agregar pregunta** → elige el campo del paso 2
(el Texto `PEGA-TU-CODIGO`) → pregunta: **"Pega tu código"**.

## 3. Compartir
Compartir → **Copiar enlace de iCloud**. Mándale ese link a Claude Code para guardarlo en `secretos.atajo_url`:

```sql
insert into secretos (clave, valor) values ('atajo_url', 'https://www.icloud.com/shortcuts/…')
on conflict (clave) do update set valor = excluded.valor;
```

## 4. Lo que hace cada persona (la app la guía: Coach → "Conecta Apple Pay")
1. Toca "Copiar mi código y abrir" → se abre el link → pega el código → **Añadir atajo**.
2. Atajos → Automatización → + → **Transacción** → marca sus tarjetas → **Ejecutar inmediatamente** → elige
   **Finanzas: anotar compra**.

La cuenta de Vicho no necesita código: si el token va vacío, la compra es de la cuenta `legado`.
