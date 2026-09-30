# Atajo de iOS: cada compra Apple Pay con Scotia se anota sola

Scotia no manda correo por compra, pero iOS sí avisa a Atajos cada vez que pagas con Apple Pay.
El atajo llama a la función `anotar_atajo` de Supabase, que limpia el monto, categoriza con las
reglas de siempre y te devuelve un mensaje tipo "✅ $12.990 · Comida", con una segunda línea que te dice
cuánto te queda hoy o te avisa si te pasaste (del día, del mes o del tope de la categoría).

**Solo funciona con Apple Pay** (pagar con el iPhone o el reloj, o comprar en apps con Apple Pay).
Si pasas la tarjeta física o escribes el número en una web, eso lo anotas tú.

## Paso a paso (iOS 17 o superior)

1. Abre **Atajos** → pestaña **Automatización** → **+** (o "Nueva automatización").
2. Elige **Transacción**.
3. En **Tarjeta** marca **solo la Visa Scotiabank**. BCI no, porque ya entra por correo y quedaría duplicada.
   En Categoría y Comercio deja "Cualquiera".
4. Marca **Ejecutar inmediatamente** (no "Ejecutar tras confirmación"). Toca **Siguiente** → **Nuevo atajo en blanco**.
5. Agrega la acción **Obtener contenido de URL** y configúrala así:
   - **URL:** `https://caaewoxfvmdizzziyvfz.supabase.co/rest/v1/rpc/anotar_atajo`
   - Toca la flecha (›) para ver más opciones:
   - **Método:** `POST`
   - **Encabezados** (3):
     - `apikey` → la anon key (la misma de `const KEY` en index.html)
     - `Authorization` → `Bearer ` + la anon key (con un espacio después de Bearer)
     - `Content-Type` → `application/json`
   - **Cuerpo de la solicitud:** `JSON`, con 2 campos de tipo **Texto**:
     - `monto_txt` → toca el campo, elige la variable **Entrada del atajo** y luego tócala otra vez para elegir **Monto**
     - `comercio` → **Entrada del atajo** → **Comercio**
6. Agrega la acción **Mostrar notificación** y pon como texto la variable **Contenido de la URL**.
7. Listo. Opcional: en la automatización desactiva "Notificar al ejecutar" para que solo veas tu notificación.

## Probarlo sin gastar

En el paso 5, cambia temporalmente el valor de `monto_txt` por el texto `prueba` y toca ▶︎ en el atajo.
Debería aparecer **"❌ No entendí el monto: prueba"**. Eso confirma que llega a Supabase y no guarda nada.
Después vuelve a poner la variable **Monto**.

## Detalles

- Queda con `tarjeta = scotiabank`, `fuente = atajo`, fecha de hoy (hora de Chile). El periodo se calcula con el cierre del 22.
- Si el comercio no tiene regla, cae en "Sin categoría" y la app te pide ordenarlo (y aprende).
- Compras en dólares con Apple Pay (viajes) no se convierten: anótalas a mano.
- No necesita la clave de la app (`x-app-key`): `anotar_atajo` corre con permisos propios. Basta la anon key.
