-- ✅ Aplicado en finanzas-vicho el 30-09-2026 (migración `widget`).
-- Vicho también tiene código personal (cuentas.token_atajo); su atajo actual sigue sin código.
-- rpc/widget(token): lo que muestra el hero de Hoy (hoy, cupo, semana, queda, días, racha, color) para el widget de
-- Scriptable. Solo lectura; con código inválido devuelve {"error":"codigo"}.
update cuentas set token_atajo = replace(gen_random_uuid()::text, '-', '') where legado and token_atajo is null;
create or replace function public.widget(token text) returns jsonb
language plpgsql security definer set search_path = public as $$
DECLARE u uuid; E jsonb; n text;
BEGIN
  SELECT id, nombre INTO u, n FROM cuentas WHERE token_atajo = nullif(trim(token), '');
  IF u IS NULL THEN RETURN jsonb_build_object('error', 'codigo'); END IF;
  PERFORM set_config('app.user_id', u::text, true);
  E := privado.estado_mes();
  RETURN jsonb_build_object('nombre', n, 'hoy', (E->>'rest')::int, 'cupo', (E->>'cupo')::int, 'semana', (E->>'semana')::int,
    'queda', (E->>'queda')::int, 'dias', (E->>'dias')::int, 'racha', privado.racha(),
    'color', CASE WHEN (E->>'queda')::int < 0 OR (E->>'rest')::int < 0 THEN 'rojo'
                  WHEN (E->>'rest')::int < (E->>'cupo')::int * 0.3 THEN 'amarillo' ELSE 'verde' END);
END $$;
revoke execute on function public.widget(text) from public;
grant execute on function public.widget(text) to anon, authenticated;
