-- Alertas en la notificación del atajo Apple Pay: además de "✅ $12.990 · Comida", dice cuánto te queda hoy
-- o te avisa si te pasaste (del día, del mes o del tope de la categoría). Misma lógica que el hero de la app:
-- cupo del día = lo que quedaba al empezar el día / días hasta el 22 (incluye hoy).

create or replace function public.resumen_hoy(p_cat text default null)
 returns text
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
DECLARE hoy date := (now() AT TIME ZONE 'America/Santiago')::date; d date; per text; cierre date; dias int;
  ppto int; cuo int; gast int; ghoy int; queda int; cupo numeric; rest numeric; techo int; gcat int; ncat text;
  f text := 'FM999G999G999'; msg text;
BEGIN
  d := CASE WHEN extract(day FROM hoy) > 22 THEN (hoy + interval '1 month')::date ELSE hoy END;
  per := to_char(d, 'YYYY-MM');
  cierre := make_date(extract(year FROM d)::int, extract(month FROM d)::int, 22);
  dias := greatest(1, cierre - hoy + 1);
  SELECT coalesce((SELECT monto FROM presupuestos WHERE periodo = per), 1000000) INTO ppto;
  SELECT coalesce(sum(monto_cuota), 0) INTO cuo FROM cuotas c WHERE activa AND (recurrente OR (primer_periodo IS NOT NULL AND
    ((left(per,4)::int - left(primer_periodo,4)::int) * 12 + right(per,2)::int - right(primer_periodo,2)::int + 1) BETWEEN 1 AND total_cuotas));
  SELECT coalesce(sum(monto), 0), coalesce(sum(monto) FILTER (WHERE fecha = hoy), 0) INTO gast, ghoy
    FROM gastos WHERE periodo = per AND NOT coalesce(pulldex, false) AND coalesce(estado, 'ok') = 'ok';
  queda := ppto - cuo - gast;
  cupo := (queda + ghoy)::numeric / dias;
  rest := cupo - ghoy;
  IF queda < 0 THEN
    msg := '🔴 Te pasaste del mes por $' || replace(to_char(-queda, f), ',', '.') || '. Freno total hasta el 22.';
  ELSIF rest < 0 THEN
    msg := '🟠 Hoy te pasaste por $' || replace(to_char(round(-rest), f), ',', '.') ||
      CASE WHEN dias > 1 THEN '. Desde mañana: $' || replace(to_char(round(queda::numeric / (dias - 1)), f), ',', '.') || ' al día.' ELSE '.' END;
  ELSE
    msg := '👍 Hoy te quedan $' || replace(to_char(round(rest), f), ',', '.');
  END IF;
  IF p_cat IS NOT NULL AND p_cat <> 'otros' THEN
    SELECT c.techo, c.nombre INTO techo, ncat FROM categorias c WHERE c.clave = p_cat;
    SELECT coalesce(sum(monto), 0) INTO gcat FROM gastos
      WHERE periodo = per AND categoria_clave = p_cat AND NOT coalesce(pulldex, false) AND coalesce(estado, 'ok') = 'ok';
    IF p_cat = 'coleccionables' AND coalesce(techo, 0) = 0 THEN
      msg := msg || E'\n🃏 Cartas estaban bloqueadas este mes. Si era para PULLDEX, márcalo como negocio en la app.';
    ELSIF techo > 0 AND gcat > techo THEN
      msg := msg || E'\n⚠️ ' || ncat || ': te pasaste del tope ($' || replace(to_char(gcat, f), ',', '.') || ' de $' || replace(to_char(techo, f), ',', '.') || ').';
    ELSIF techo > 0 AND gcat > techo * 0.8 THEN
      msg := msg || E'\n⚠️ ' || ncat || ' va al ' || round(gcat * 100.0 / techo) || '% del mes.';
    END IF;
  END IF;
  RETURN msg;
END $function$;
revoke execute on function public.resumen_hoy(text) from public, anon, authenticated;

create or replace function public.anotar_atajo(monto_txt text, comercio text default null)
 returns text
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
DECLARE s text; m int; g gastos; cat text; extra text;
BEGIN
  s := regexp_replace(coalesce(monto_txt,''), '[^0-9.,]', '', 'g');
  IF s ~ '[.,][0-9]{2}$' THEN s := left(s, length(s) - 3); END IF;
  m := nullif(regexp_replace(s, '[^0-9]', '', 'g'), '')::int;
  IF m IS NULL OR m <= 0 THEN RETURN '❌ No entendí el monto: ' || coalesce(monto_txt, '(vacío)'); END IF;
  INSERT INTO gastos (fecha, descripcion, monto, tarjeta, fuente)
    VALUES ((now() AT TIME ZONE 'America/Santiago')::date,
            left(coalesce(nullif(trim(comercio), ''), 'Compra Apple Pay'), 120), m, 'scotiabank', 'atajo')
    RETURNING * INTO g;
  SELECT nombre INTO cat FROM categorias WHERE clave = g.categoria_clave;
  -- Si el resumen falla por cualquier cosa, el gasto igual queda anotado.
  BEGIN
    IF NOT coalesce(g.pulldex, false) THEN extra := public.resumen_hoy(g.categoria_clave); END IF;
  EXCEPTION WHEN others THEN extra := NULL;
  END;
  RETURN '✅ $' || replace(to_char(m, 'FM999G999G999'), ',', '.') || ' · ' || coalesce(cat, 'Sin categoría')
    || coalesce(E'\n' || extra, '');
END $function$;
grant execute on function public.anotar_atajo(text, text) to anon;
