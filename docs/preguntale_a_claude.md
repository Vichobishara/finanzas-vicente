# Pregúntale a Claude (dentro de ¿Me alcanza?)

La app le manda tu pregunta y los números del mes a la edge function `consejo` del proyecto Supabase
**finanzas-vicho**. La función llama a Claude con tu API key, que queda guardada como secreto en Supabase
(nunca en el repo ni en el teléfono). Nada de esto toca TCG Logs.

## Paso a paso (una sola vez, ~3 minutos)

1. **Crea un workspace aparte en Anthropic** (así no se mezcla con TCG Logs)
   - Entra a https://console.anthropic.com → Settings → Workspaces → **Create workspace** → nombre `Finanzas Vicho`.
   - En ese workspace, ve a **Limits** y pon un tope de gasto mensual (ej. US$5). Si se pasa, Claude deja de responder, no te cobra más.
2. **Crea una API key nueva dentro de ese workspace**
   - Settings → API keys → **Create key** → workspace `Finanzas Vicho`, nombre `finanzas-vicente`.
   - Copia la key (`sk-ant-...`). No la pegues en ningún chat ni en el repo.
3. **Guárdala en Supabase finanzas-vicho**
   - Abre https://supabase.com/dashboard/project/caaewoxfvmdizzziyvfz/functions/secrets
     (revisa que arriba diga **finanzas-vicho**, no `os-tcg`).
   - **Add new secret** → Name: `ANTHROPIC_API_KEY` → Value: la key → **Save**.
4. **Prueba**: en la app toca **¿Me alcanza?** → pestaña **Coach** → "Pregúntale a Claude" → escribe algo y **Preguntar**.
   Si dice "Falta conectar tu API", el secreto no quedó guardado con ese nombre exacto.

## Costo
Modelo `claude-opus-5-5` con esfuerzo bajo: ~US$0,02 por pregunta (unos $20). 100 preguntas al mes ≈ $2.000.
Lo ves en console.anthropic.com → Usage, filtrado por el workspace `Finanzas Vicho`.

## Para cambiar o cortar
- Cambiar la key: repite los pasos 2 y 3 (el secreto se sobrescribe) y borra la vieja en Anthropic.
- Apagarlo: borra el secreto `ANTHROPIC_API_KEY` en Supabase. La app sigue funcionando; solo esa parte avisa que falta la API.
