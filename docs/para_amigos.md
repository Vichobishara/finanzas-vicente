# Pasarle la app a alguien (Marina, amigos, familia)

Cada persona tiene su propia cuenta: **no ve nada de Vicho y Vicho no ve nada suyo**.

## 1. Lo que hace Vicho (1 minuto)
1. En su app: **Coach → Invitar a alguien** → escribe el **Gmail** de la persona → **Invitar**.
   (Sin esto, al entrar ve "Pídele acceso a Vicho".)
2. Le manda el mensaje de abajo por WhatsApp.

## 2. Mensaje para copiar y mandar
> Te invité a mi app de finanzas 💸 Te dice cuánto puedes gastar cada semana y anota solas tus compras con Apple Pay. Tus datos son solo tuyos.
>
> 1. Abre este link **en Safari**: https://finanzas-vicente.vercel.app
> 2. Toca **Continuar con Google** con tu Gmail (el que te invité).
> 3. Responde las 6 preguntas (sueldo, gastos fijos, cuotas, cuánto tienes hoy). Son 2 minutos; si no sabes algo, pon un aproximado.
> 4. Después la app te guía en **Arma tu app**: Face ID, ponerla en tu pantalla de inicio (no está en la App Store, se agrega desde Safari: Compartir → Agregar a inicio) y conectar Apple Pay.
>
> Si algo no te funciona, me avisas.

## 3. Lo que ve la persona
1. **Entrada:** Continuar con Google (en un aparato nuevo va primero; Face ID queda primero cuando ya entró antes).
2. **Bienvenida, 6 pasos:** nombre y edad → sueldo y día de pago → fijos → cuotas (monto aproximado o foto de la cartola) →
   cómo está hoy (ahorrado, cuenta, deuda en tarjetas, gastado desde el 23) → resumen con presupuesto sugerido.
   Al guardar, los topes de categorías y el plan de la semana (bolsillos súper/oficina/delivery/gustos) quedan a su escala.
3. **Arma tu app:** 1) Face ID en Safari, 2) ponerla en inicio y entrar desde el ícono con Face ID (el ícono no comparte
   sesión con Safari: hay que volver a entrar una vez), 3) Conecta Apple Pay (solo iPhone).

## 4. Apple Pay (atajo de iPhone)
- **Con el atajo maestro** (lo ideal): Vicho lo arma una vez (`docs/atajo_amigos.md`) y comparte el link de iCloud. El link va en
  `secretos.atajo_url` o, si no hay acceso a la base, en `const ATAJO_ICLOUD` de `index.html`. La persona toca
  "Copiar mi código y abrir", pega su código y después crea la automatización (la guía la lleva paso a paso).
- **Sin el atajo maestro:** la guía abre "Arma el atajo (5 min)": se arma dentro de la automatización Transacción, con botones
  para copiar la URL, la llave, el "Bearer…" y su código. Mismo atajo que `docs/atajo_apple_pay.md` más el campo `token`.
- Solo anota compras **con Apple Pay** (acercando el iPhone o el reloj, o Apple Pay en la web). La tarjeta física y las compras
  online con el número de tarjeta se anotan a mano.
- Para revisar si funcionó: Coach → Conecta Apple Pay → último paso → **Ya pagué: revisar** (lee `rpc/mi_ultimo_atajo`).

## 5. Lo que hay que saber
- El mes de la app va **del 23 al 22** (cierre de la Scotia de Vicho) para todos.
- El plan de la semana (súper el domingo, oficina martes y jueves, 1 delivery) es el de Vicho a otra escala: se ajusta tocando
  el número de Hoy → **Tu plan**.
- En Android funciona todo menos Apple Pay.
