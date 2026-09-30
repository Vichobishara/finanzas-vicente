-- ✅ Aplicado en finanzas-vicho (caaewoxfvmdizzziyvfz) el 30-09-2026 (migración `arreglos_domingo_deseos`). Nada de TCG Logs.
-- Arreglos chicos + avisos nuevos:
--   1. anotar_atajo: si el monto llega vacío, la notificación dice "(vacío)" en vez de quedar en blanco.
--   2. Seguridad (advisors): gastos_auto es un trigger, no una RPC → nadie la puede llamar por /rpc.
--      privado.clp y privado.hoy con search_path fijo.
--   3. Aviso del domingo 20:00: cómo te fue en la semana, cuánto te aguantaste y tu racha.
--   4. Aviso de la lista de deseos: cuando se cumplen las 72 horas, "¿todavía quieres X?".
--   (3 y 4 van en una función aparte con su propio cron, para no reescribir avisos_programados.)

-- 1 ─────────────────────────────────────────────────────────────────────────
create or replace function public.anotar_atajo(monto_txt text, comercio text default null)
returns text language plpgsql security definer set search_path = public as $$
DECLARE s text; m int; g gastos; cat text; extra text;
BEGIN
  s := regexp_replace(coalesce(monto_txt,''), '[^0-9.,]', '', 'g');
  IF s ~ '[.,][0-9]{2}$' THEN s := left(s, length(s) - 3); END IF;
  m := nullif(regexp_replace(s, '[^0-9]', '', 'g'), '')::int;
  IF m IS NULL OR m <= 0 THEN RETURN '❌ No entendí el monto: ' || coalesce(nullif(trim(monto_txt), ''), '(vacío)'); END IF;
  INSERT INTO gastos (fecha, descripcion, monto, tarjeta, fuente)
    VALUES ((now() AT TIME ZONE 'America/Santiago')::date,
            left(coalesce(nullif(trim(comercio), ''), 'Compra Apple Pay'), 120), m, 'scotiabank', 'atajo')
    RETURNING * INTO g;
  SELECT nombre INTO cat FROM categorias WHERE clave = g.categoria_clave;
  BEGIN
    IF NOT coalesce(g.pulldex, false) THEN extra := public.resumen_hoy(g.categoria_clave) || coalesce(privado.extras_gasto(g), ''); END IF;
  EXCEPTION WHEN others THEN extra := NULL;
  END;
  RETURN '✅ ' || privado.clp(m) || ' · ' || coalesce(cat, 'Sin categoría') || coalesce(E'\n' || extra, '');
END $$;

-- 2 ─────────────────────────────────────────────────────────────────────────
-- Un trigger no necesita EXECUTE para dispararse: esto solo cierra /rest/v1/rpc/gastos_auto.
revoke execute on function public.gastos_auto() from public, anon, authenticated;
alter function privado.clp(numeric) set search_path = '';
alter function privado.hoy() set search_path = '';

-- 3 y 4 ─────────────────────────────────────────────────────────────────────
create or replace function privado.avisos_extra(p_ahora timestamp default null) returns void
language plpgsql security definer set search_path = public as $$
DECLARE ahora timestamp := coalesce(p_ahora, now() AT TIME ZONE 'America/Santiago'); h int := extract(hour FROM ahora)::int;
  dow int := extract(isodow FROM ahora)::int; hoy date := ahora::date; E jsonb; v int; ev int; n int; d jsonb;
BEGIN
  -- Domingo 20:00: resumen de la semana (lunes a hoy)
  IF dow = 7 AND h = 20 THEN BEGIN
    E := privado.estado_mes(hoy);
    SELECT coalesce(sum(monto), 0) INTO v FROM gastos
      WHERE fecha BETWEEN hoy - 6 AND hoy AND NOT coalesce(pulldex, false) AND coalesce(estado, 'ok') = 'ok';
    ev := coalesce((SELECT (valor->>(E->>'per'))::int FROM ajustes WHERE clave = 'evitado'), 0);
    n := privado.racha();
    PERFORM privado.push('📊 Tu semana: gastaste ' || privado.clp(v),
      concat_ws(' · ',
        CASE WHEN ev > 0 THEN '💪 Este mes te aguantaste ' || privado.clp(ev) END,
        CASE WHEN n >= 2 THEN '🔥 ' || n || ' días seguidos sin pasarte' END,
        CASE WHEN (E->>'queda')::int >= 0 THEN 'Te quedan ' || privado.clp((E->>'queda')::int) || ' hasta el 22'
             ELSE 'Vas ' || privado.clp(-(E->>'queda')::int) || ' pasado del mes' END)
      || E'\nMañana te digo cuánto tienes para la semana.',
      'domingo-' || hoy);
  EXCEPTION WHEN others THEN RAISE WARNING 'domingo: %', SQLERRM; END; END IF;

  -- Lista de deseos: a las 72 horas, una sola vez por deseo (la clave del aviso lo asegura)
  BEGIN
    FOR d IN SELECT x FROM ajustes, jsonb_array_elements(CASE WHEN jsonb_typeof(valor) = 'array' THEN valor ELSE '[]'::jsonb END) x
        WHERE clave = 'deseos' AND x->>'estado' = 'espera'
          AND ((x->>'desde')::timestamptz AT TIME ZONE 'America/Santiago') + interval '72 hours' BETWEEN ahora - interval '2 days' AND ahora LOOP
      PERFORM privado.push('⏳ ¿Todavía quieres ' || (d->>'que') || '?',
        'Pasaron 72 horas. Son ' || privado.clp((d->>'monto')::numeric) || ': invertidos serían ' || privado.clp((d->>'monto')::numeric * 1.79)
        || ' en 10 años. Toca para decidir.', 'deseo-' || (d->>'id'));
    END LOOP;
  EXCEPTION WHEN others THEN RAISE WARNING 'deseos: %', SQLERRM; END;
END $$;

-- Cada hora, igual que `avisos` (la función decide si toca mandar algo).
select cron.schedule('avisos_extra', '0 * * * *', 'select privado.avisos_extra()');
