-- Avisos push al celular (Web Push). La base decide QUÉ avisar y CUÁNDO; la edge function `push` solo envía.
-- Llaves VAPID y token en `secretos` (vapid_public, vapid_private, avisos_token), cargados a mano, nunca en el repo.
--   * Al insertar un gasto (BCI por correo, transferencias): compra + cuánto te queda, suscripciones, delivery
--     repetido, compra de noche, transferencias por revisar. (Apple Pay ya avisa con la notificación del atajo.)
--   * Al insertar un sueldo: qué hacer con él.
--   * Cada hora (pg_cron → privado.avisos_programados): lunes, viernes, cierre del 22, cuotas, Fintual, racha,
--     pendientes e hitos de patrimonio. Cada aviso tiene una clave en `avisos_log` y se manda una sola vez.
--   * `ajustes.fintual_pausa` {hasta: fecha}: mientras esté vigente no se pide mandar plata a Fintual.

create extension if not exists pg_net;
create extension if not exists pg_cron;

create table if not exists public.push_subs (
  id bigint generated always as identity primary key,
  endpoint text unique not null, p256dh text not null, auth text not null, ua text,
  created_at timestamptz default now());
alter table public.push_subs enable row level security;
drop policy if exists con_clave on public.push_subs;
create policy con_clave on public.push_subs for all using (privado.autorizado()) with check (privado.autorizado());

create table if not exists public.avisos_log (clave text primary key, titulo text, cuerpo text, enviado timestamptz default now());
alter table public.avisos_log enable row level security;
drop policy if exists con_clave_leer on public.avisos_log;
create policy con_clave_leer on public.avisos_log for select using (privado.autorizado());

-- $12.345
create or replace function privado.clp(n numeric) returns text language sql immutable as
$$ select '$' || replace(to_char(round(coalesce(n,0)), 'FM999G999G999'), ',', '.') $$;

create or replace function privado.hoy() returns date language sql stable as
$$ select (now() at time zone 'America/Santiago')::date $$;

create or replace function privado.pausa_fintual() returns boolean language sql stable security definer set search_path to 'public' as
$$ select coalesce((select (valor->>'hasta')::date >= privado.hoy() from ajustes where clave = 'fintual_pausa'), false) $$;

-- Cuotas y fijos que se cobran en un mes (misma regla que cuotasDe() en la app).
create or replace function privado.cuotas_de(per text) returns integer language sql stable security definer set search_path to 'public' as $$
  select coalesce(sum(monto_cuota), 0)::int from cuotas where activa and (recurrente or (primer_periodo is not null and
    ((left(per,4)::int - left(primer_periodo,4)::int) * 12 + right(per,2)::int - right(primer_periodo,2)::int + 1) between 1 and total_cuotas))
$$;

-- Los mismos números del hero de la app, para el día p_hoy.
create or replace function privado.estado_mes(p_hoy date default null) returns jsonb
 language plpgsql stable security definer set search_path to 'public' as $function$
DECLARE hoy date := coalesce(p_hoy, privado.hoy()); d date; per text; cierre date; ini date; dias int;
  ppto int; cuo int; gast int; ghoy int; queda int; cupo numeric; lun date; w0 date; w1 date; gsem int; semana numeric;
BEGIN
  d := CASE WHEN extract(day FROM hoy) > 22 THEN (hoy + interval '1 month')::date ELSE hoy END;
  per := to_char(d, 'YYYY-MM');
  cierre := make_date(extract(year FROM d)::int, extract(month FROM d)::int, 22);
  ini := (cierre - interval '1 month')::date + 1;
  dias := greatest(1, cierre - hoy + 1);
  ppto := coalesce((SELECT monto FROM presupuestos WHERE periodo = per), 1000000);
  cuo := privado.cuotas_de(per);
  SELECT coalesce(sum(monto), 0), coalesce(sum(monto) FILTER (WHERE fecha = hoy), 0) INTO gast, ghoy
    FROM gastos WHERE periodo = per AND NOT coalesce(pulldex, false) AND coalesce(estado, 'ok') = 'ok';
  queda := ppto - cuo - gast;
  cupo := (queda + ghoy)::numeric / dias;
  lun := hoy - (extract(isodow FROM hoy)::int - 1);
  w0 := greatest(lun, ini); w1 := least(lun + 6, cierre);
  SELECT coalesce(sum(monto), 0) INTO gsem FROM gastos
    WHERE periodo = per AND fecha >= w0 AND NOT coalesce(pulldex, false) AND coalesce(estado, 'ok') = 'ok';
  semana := (queda + gsem)::numeric * (w1 - w0 + 1) / greatest(1, cierre - w0 + 1) - gsem;
  RETURN jsonb_build_object('hoy', hoy, 'per', per, 'ini', ini, 'cierre', cierre, 'dias', dias, 'ppto', ppto, 'cuo', cuo,
    'gast', gast, 'ghoy', ghoy, 'queda', queda, 'cupo', round(cupo), 'rest', round(cupo - ghoy),
    'manana', CASE WHEN dias > 1 THEN round(queda::numeric / (dias - 1)) ELSE queda END,
    'semana', round(semana), 'dias_sem', w1 - hoy + 1);
END $function$;

-- Envía un aviso. Con p_clave se manda una sola vez (queda en avisos_log aunque no haya celulares suscritos).
create or replace function privado.push(p_titulo text, p_cuerpo text, p_clave text default null, p_url text default '/')
 returns boolean language plpgsql security definer set search_path to 'public' as $function$
DECLARE tok text; k text := coalesce(p_clave, 'x-' || gen_random_uuid());
BEGIN
  INSERT INTO avisos_log (clave, titulo, cuerpo) VALUES (k, p_titulo, p_cuerpo) ON CONFLICT DO NOTHING;
  IF NOT FOUND THEN RETURN false; END IF;
  IF NOT EXISTS (SELECT 1 FROM push_subs) THEN RETURN false; END IF;
  SELECT valor INTO tok FROM secretos WHERE clave = 'avisos_token';
  PERFORM net.http_post(url := 'https://caaewoxfvmdizzziyvfz.supabase.co/functions/v1/push',
    body := jsonb_build_object('titulo', p_titulo, 'cuerpo', p_cuerpo, 'url', p_url, 'tag', k),
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-avisos-token', tok));
  RETURN true;
END $function$;

-- Una línea: cuánto te queda hoy, o si te pasaste (del día o del mes), y cómo va la categoría.
create or replace function public.resumen_hoy(p_cat text default null)
 returns text language plpgsql security definer set search_path to 'public' as $function$
DECLARE E jsonb := privado.estado_mes(); techo int; gcat int; ncat text; msg text;
BEGIN
  IF (E->>'queda')::int < 0 THEN
    msg := '🔴 Te pasaste del mes por ' || privado.clp(-(E->>'queda')::int) || '. Freno total hasta el 22.';
  ELSIF (E->>'rest')::int < 0 THEN
    msg := '🟠 Hoy te pasaste por ' || privado.clp(-(E->>'rest')::int) ||
      CASE WHEN (E->>'dias')::int > 1 THEN '. Desde mañana: ' || privado.clp((E->>'manana')::int) || ' al día.' ELSE '.' END;
  ELSE
    msg := '👍 Hoy te quedan ' || privado.clp((E->>'rest')::int);
  END IF;
  IF p_cat IS NOT NULL AND p_cat <> 'otros' THEN
    SELECT c.techo, c.nombre INTO techo, ncat FROM categorias c WHERE c.clave = p_cat;
    SELECT coalesce(sum(monto), 0) INTO gcat FROM gastos
      WHERE periodo = E->>'per' AND categoria_clave = p_cat AND NOT coalesce(pulldex, false) AND coalesce(estado, 'ok') = 'ok';
    IF p_cat = 'coleccionables' AND coalesce(techo, 0) = 0 THEN
      msg := msg || E'\n🃏 Cartas estaban bloqueadas este mes. Si era para PULLDEX, márcalo como negocio en la app.';
    ELSIF techo > 0 AND gcat > techo THEN
      msg := msg || E'\n⚠️ ' || ncat || ': te pasaste del tope (' || privado.clp(gcat) || ' de ' || privado.clp(techo) || ').';
    ELSIF techo > 0 AND gcat > techo * 0.8 THEN
      msg := msg || E'\n⚠️ ' || ncat || ' va al ' || round(gcat * 100.0 / techo) || '% del mes.';
    END IF;
  END IF;
  RETURN msg;
END $function$;
revoke execute on function public.resumen_hoy(text) from public, anon, authenticated;

-- Líneas extra para un gasto recién anotado: compra de noche, delivery repetido, mismo local 3 veces en la semana.
create or replace function privado.extras_gasto(g gastos) returns text
 language plpgsql stable security definer set search_path to 'public' as $function$
DECLARE ahora timestamp := now() AT TIME ZONE 'America/Santiago'; h int := extract(hour FROM ahora)::int;
  hoy date := ahora::date; n int; tot int; r text := ''; delivery text := '(uber ?eats|rappi|pedidos ?ya|didi ?food|justo)';
BEGIN
  IF (h >= 23 OR h < 4) AND g.fuente IN ('atajo', 'bci_auto') AND g.fecha >= hoy - 1 THEN
    r := r || E'\n🌙 Compra a las ' || to_char(ahora, 'HH24:MI') || '. ¿Era necesaria o fue impulso?';
  END IF;
  IF g.descripcion ~* delivery THEN
    SELECT count(*), coalesce(sum(monto), 0) INTO n, tot FROM gastos WHERE descripcion ~* delivery AND fecha > hoy - 7 AND id <= g.id
      AND NOT coalesce(pulldex, false) AND coalesce(estado, 'ok') = 'ok';
    IF n >= 3 THEN
      r := r || E'\n🍔 ' || CASE n WHEN 3 THEN 'Tercer' WHEN 4 THEN 'Cuarto' WHEN 5 THEN 'Quinto' ELSE n || 'º' END ||
        ' delivery de la semana (' || privado.clp(tot) || ' en total).';
    END IF;
  ELSIF coalesce(g.categoria_clave, 'otros') NOT IN ('transporte', 'fijo') THEN
    SELECT count(*), coalesce(sum(monto), 0) INTO n, tot FROM gastos WHERE lower(descripcion) = lower(g.descripcion) AND fecha > hoy - 7 AND id <= g.id
      AND NOT coalesce(pulldex, false) AND coalesce(estado, 'ok') = 'ok';
    IF n >= 3 THEN r := r || E'\n🔁 ' || n || 'ª vez en ' || g.descripcion || ' esta semana (' || privado.clp(tot) || ').'; END IF;
  END IF;
  RETURN nullif(r, '');
END $function$;

-- Atajo Apple Pay: la notificación del atajo trae el resumen y los extras.
create or replace function public.anotar_atajo(monto_txt text, comercio text default null)
 returns text language plpgsql security definer set search_path to 'public' as $function$
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
    IF NOT coalesce(g.pulldex, false) THEN extra := public.resumen_hoy(g.categoria_clave) || coalesce(privado.extras_gasto(g), ''); END IF;
  EXCEPTION WHEN others THEN extra := NULL;
  END;
  RETURN '✅ ' || privado.clp(m) || ' · ' || coalesce(cat, 'Sin categoría') || coalesce(E'\n' || extra, '');
END $function$;
grant execute on function public.anotar_atajo(text, text) to anon;

-- Push al entrar un gasto que no anotaste tú (correo BCI, transferencias). Nunca bloquea el insert.
create or replace function privado.aviso_gasto() returns trigger
 language plpgsql security definer set search_path to 'public' as $function$
DECLARE cat text; tj text;
BEGIN
  IF coalesce(NEW.pulldex, false) OR NEW.fuente NOT IN ('bci_auto', 'transferencia') OR NEW.fecha < privado.hoy() - 3 THEN RETURN NEW; END IF;
  BEGIN
    IF NEW.estado = 'revisar' THEN
      PERFORM privado.push('🔁 Transferencia a ' || coalesce(NEW.destinatario, NEW.descripcion) || ' · ' || privado.clp(NEW.monto),
        'No cuenta hasta que me digas si es gasto. Toca para revisarla.', 'gasto-' || NEW.id);
    ELSIF coalesce(NEW.estado, 'ok') = 'ok' THEN
      SELECT nombre INTO cat FROM categorias WHERE clave = NEW.categoria_clave;
      tj := CASE NEW.tarjeta WHEN 'bci' THEN 'BCI' WHEN 'scotiabank' THEN 'Scotia' WHEN 'otro' THEN 'transferencia' ELSE NEW.tarjeta END;
      PERFORM privado.push(
        CASE WHEN NEW.categoria_clave = 'fijo' THEN '🔁 Se cobró ' || NEW.descripcion || ' · ' || privado.clp(NEW.monto)
             ELSE '💳 ' || privado.clp(NEW.monto) || ' · ' || coalesce(cat, 'Sin categoría') || ' (' || tj || ')' END,
        NEW.descripcion || E'\n' || public.resumen_hoy(NEW.categoria_clave) || coalesce(privado.extras_gasto(NEW), ''),
        'gasto-' || NEW.id);
    END IF;
  EXCEPTION WHEN others THEN RAISE WARNING 'aviso_gasto: %', SQLERRM;
  END;
  RETURN NEW;
END $function$;
drop trigger if exists trg_aviso_gasto on public.gastos;
create trigger trg_aviso_gasto after insert on public.gastos for each row execute function privado.aviso_gasto();

-- Push al llegar el sueldo.
create or replace function privado.aviso_sueldo() returns trigger
 language plpgsql security definer set search_path to 'public' as $function$
DECLARE ppto int; apv boolean; apv_mes int := round(40 * 71649 / 12.0); sueldo int; cuerpo text;
BEGIN
  IF NEW.tipo NOT IN ('sueldo', 'bono') OR NEW.monto < 500000 OR NEW.fecha < privado.hoy() - 5 THEN RETURN NEW; END IF;
  BEGIN
    ppto := coalesce((SELECT monto FROM presupuestos WHERE periodo = (privado.estado_mes()->>'per')), 1000000);
    apv := coalesce((SELECT (valor->>'abierto')::boolean FROM ajustes WHERE clave = 'apv'), false);
    sueldo := coalesce((SELECT (valor->>'sueldo')::int FROM ajustes WHERE clave = 'perfil'), 2000000);
    IF privado.pausa_fintual() THEN
      cuerpo := 'Este mes primero pagas TODAS las tarjetas. Después dime cuánto te quedó libre.';
    ELSIF NEW.monto > sueldo * 1.2 THEN
      cuerpo := 'Viene con bono: el 70% del extra (' || privado.clp((NEW.monto - sueldo) * 0.7) || ') va a invertir hoy, APV primero. El 30% es tuyo sin culpa.';
    ELSE
      cuerpo := 'Hoy, antes de gastar: ' || CASE WHEN apv THEN privado.clp(apv_mes) || ' al APV y ' ELSE '' END ||
        privado.clp(greatest(0, (NEW.monto - ppto) / 2)) || ' a Fintual. Lo demás es tu mes.';
    END IF;
    PERFORM privado.push('💰 Llegó tu sueldo: ' || privado.clp(NEW.monto), cuerpo, 'sueldo-' || NEW.id);
  EXCEPTION WHEN others THEN RAISE WARNING 'aviso_sueldo: %', SQLERRM;
  END;
  RETURN NEW;
END $function$;
drop trigger if exists trg_aviso_sueldo on public.ingresos;
create trigger trg_aviso_sueldo after insert on public.ingresos for each row execute function privado.aviso_sueldo();

-- Días seguidos (hasta hoy) sin pasarse del cupo del día, dentro del mes actual.
create or replace function privado.racha() returns int
 language plpgsql stable security definer set search_path to 'public' as $function$
DECLARE E jsonb := privado.estado_mes(); d date; ini date := (E->>'ini')::date; cierre date := (E->>'cierre')::date;
  base int := (E->>'ppto')::int - (E->>'cuo')::int; antes int; ese int; n int := 0;
BEGIN
  d := (E->>'hoy')::date;
  WHILE d >= ini LOOP
    SELECT coalesce(sum(monto) FILTER (WHERE fecha < d), 0), coalesce(sum(monto) FILTER (WHERE fecha = d), 0) INTO antes, ese
      FROM gastos WHERE periodo = E->>'per' AND NOT coalesce(pulldex, false) AND coalesce(estado, 'ok') = 'ok';
    EXIT WHEN ese > (base - antes)::numeric / (cierre - d + 1);
    n := n + 1; d := d - 1;
  END LOOP;
  RETURN n;
END $function$;

-- Corre cada hora. Cada bloque va aparte: si uno falla, los otros igual salen.
-- p_ahora sirve para probarla con otra fecha/hora (dentro de una transacción que se revierte).
create or replace function privado.avisos_programados(p_ahora timestamp default null) returns void
 language plpgsql security definer set search_path to 'public' as $function$
DECLARE ahora timestamp := coalesce(p_ahora, now() AT TIME ZONE 'America/Santiago'); h int := extract(hour FROM ahora)::int;
  dow int := extract(isodow FROM ahora)::int; dd int := extract(day FROM ahora)::int; hoy date := ahora::date;
  E jsonb := privado.estado_mes(ahora::date); pausa boolean := privado.pausa_fintual(); x record; n int; v int; t text; per_c text;
BEGIN
  -- Lunes 9:00: la semana
  IF dow = 1 AND h = 9 THEN BEGIN
    SELECT coalesce(sum(monto), 0) INTO v FROM gastos WHERE fecha BETWEEN hoy - 7 AND hoy - 1 AND NOT coalesce(pulldex, false) AND coalesce(estado, 'ok') = 'ok';
    PERFORM privado.push(CASE WHEN (E->>'semana')::int >= 0 THEN '📅 Esta semana tienes ' || privado.clp((E->>'semana')::int) ELSE '📅 Esta semana parte en rojo' END,
      'Son ' || privado.clp((E->>'cupo')::int) || ' por día. La semana pasada gastaste ' || privado.clp(v) || '.', 'lunes-' || hoy);
  EXCEPTION WHEN others THEN RAISE WARNING 'lunes: %', SQLERRM; END; END IF;

  -- Viernes 18:00: el finde
  IF dow = 5 AND h = 18 THEN BEGIN
    IF (E->>'semana')::int >= 0 THEN
      PERFORM privado.push('🍻 Para el finde te quedan ' || privado.clp((E->>'semana')::int), 'Eso es todo hasta el domingo. Si sobra, se suma a la próxima semana.', 'finde-' || hoy);
    ELSE
      PERFORM privado.push('🛋️ Esta semana ya te pasaste por ' || privado.clp(-(E->>'semana')::int), 'Finde barato: panorama en casa y cero delivery.', 'finde-' || hoy);
    END IF;
  EXCEPTION WHEN others THEN RAISE WARNING 'finde: %', SQLERRM; END; END IF;

  -- Día 23, 10:00: cierre del mes que terminó, cuotas que terminaron, cuotas del mes nuevo y suscripciones
  IF dd = 23 AND h = 10 THEN
    per_c := to_char(hoy, 'YYYY-MM');
    BEGIN
      SELECT coalesce(sum(monto), 0) INTO v FROM gastos WHERE periodo = per_c AND NOT coalesce(pulldex, false) AND coalesce(estado, 'ok') = 'ok';
      v := coalesce((SELECT monto FROM presupuestos WHERE periodo = per_c), 1000000) - privado.cuotas_de(per_c) - v;
      n := coalesce((SELECT (valor->>per_c)::int FROM ajustes WHERE clave = 'evitado'), 0);
      PERFORM privado.push(CASE WHEN v >= 0 THEN '🏁 Cerraste el mes con ' || privado.clp(v) || ' de sobra' ELSE '🏁 Cerraste el mes pasado por ' || privado.clp(-v) END,
        CASE WHEN v >= 0 AND NOT pausa THEN 'Mándalos a Fintual antes de que se te pierdan en el mes nuevo.'
             WHEN v >= 0 THEN 'Guárdalos para pagar las tarjetas.'
             ELSE 'Salió de tu ahorro. Este mes, más cuidado desde el día 1.' END
        || CASE WHEN n > 0 THEN E'\n💪 Te aguantaste ' || privado.clp(n) || ' en compras: serían ' || privado.clp(n * 1.79) || ' en 10 años.' ELSE '' END,
        'cierre-' || per_c);
    EXCEPTION WHEN others THEN RAISE WARNING 'cierre: %', SQLERRM; END;
    BEGIN
      FOR x IN SELECT * FROM cuotas WHERE activa AND NOT recurrente AND primer_periodo IS NOT NULL
          AND (left(per_c,4)::int - left(primer_periodo,4)::int) * 12 + right(per_c,2)::int - right(primer_periodo,2)::int + 1 = total_cuotas LOOP
        PERFORM privado.push('🎉 Terminaste de pagar ' || x.nombre,
          'Desde este mes tienes ' || privado.clp(x.monto_cuota) || ' más al mes.' || CASE WHEN pausa THEN '' ELSE ' ¿Los mandas a Fintual en vez de gastarlos?' END,
          'fin-cuota-' || x.id);
      END LOOP;
    EXCEPTION WHEN others THEN RAISE WARNING 'fin cuotas: %', SQLERRM; END;
    BEGIN
      SELECT string_agg(nombre || ' ' || privado.clp(monto_cuota), ' · ' ORDER BY monto_cuota DESC) INTO t FROM (
        SELECT nombre, monto_cuota FROM cuotas WHERE activa AND (recurrente OR (primer_periodo IS NOT NULL AND
          ((left(E->>'per',4)::int - left(primer_periodo,4)::int) * 12 + right(E->>'per',2)::int - right(primer_periodo,2)::int + 1) BETWEEN 1 AND total_cuotas))
        ORDER BY monto_cuota DESC LIMIT 4) q;
      PERFORM privado.push('💳 Mes nuevo: ' || privado.clp((E->>'cuo')::int) || ' ya están comprometidos', coalesce(t, 'Sin cuotas este mes 🎉'), 'cuotas-' || (E->>'per'));
    EXCEPTION WHEN others THEN RAISE WARNING 'cuotas: %', SQLERRM; END;
    BEGIN
      FOR x IN SELECT lower(descripcion) d, max(descripcion) nombre, round(avg(monto)) m FROM gastos
          WHERE categoria_clave = 'fijo' AND coalesce(estado, 'ok') = 'ok' AND NOT coalesce(pulldex, false)
            AND periodo IN (per_c, to_char((hoy - interval '1 month'), 'YYYY-MM'), to_char((hoy - interval '2 month'), 'YYYY-MM'))
          GROUP BY 1 HAVING count(DISTINCT periodo) = 3 LOOP
        PERFORM privado.push('🔁 Llevas 3 meses pagando ' || x.nombre,
          privado.clp(x.m) || ' al mes son ' || privado.clp(x.m * 12) || ' al año. ¿La usas? Si no, date de baja hoy.', 'subs-' || x.d);
      END LOOP;
    EXCEPTION WHEN others THEN RAISE WARNING 'subs: %', SQLERRM; END;
  END IF;

  -- 10:00: si llegó el sueldo hace 5, 8 u 11 días y no has anotado nada en Fintual
  IF h = 10 AND NOT pausa THEN BEGIN
    n := hoy - (SELECT max(fecha) FROM ingresos WHERE tipo IN ('sueldo', 'bono') AND monto >= 500000);
    IF n IN (5, 8, 11) AND NOT EXISTS (SELECT 1 FROM ahorros WHERE fecha >= hoy - n) THEN
      PERFORM privado.push('💰 Van ' || n || ' días desde el sueldo', 'Y no has anotado nada para Fintual. Si ya mandaste, anótalo en la app; si no, hazlo hoy.', 'fintual-' || hoy);
    END IF;
  EXCEPTION WHEN others THEN RAISE WARNING 'fintual: %', SQLERRM; END; END IF;

  -- 21:00: racha y pendientes
  IF h = 21 THEN
    BEGIN
      n := privado.racha();
      IF n IN (3, 5, 7, 10, 14, 21, 30) THEN
        PERFORM privado.push('🔥 ' || n || ' días seguidos sin pasarte', CASE WHEN n >= 7 THEN 'Esto ya es hábito. Sigue así.' ELSE 'Mañana va por ' || (n + 1) || '.' END, 'racha-' || hoy);
      END IF;
    EXCEPTION WHEN others THEN RAISE WARNING 'racha: %', SQLERRM; END;
    BEGIN
      SELECT count(*) FILTER (WHERE estado = 'revisar'), count(*) FILTER (WHERE coalesce(estado, 'ok') = 'ok' AND categoria_clave = 'otros' AND periodo = E->>'per')
        INTO n, v FROM gastos WHERE NOT coalesce(pulldex, false) AND fecha <= hoy - 2;
      IF (n > 0 OR v > 0) AND NOT EXISTS (SELECT 1 FROM avisos_log WHERE clave LIKE 'pend-%' AND enviado > now() - interval '47 hours') THEN
        PERFORM privado.push('🧹 Tienes cosas por ordenar',
          concat_ws(' y ', CASE WHEN n > 0 THEN n || ' transferencia' || CASE WHEN n > 1 THEN 's' ELSE '' END || ' por revisar' END,
                           CASE WHEN v > 0 THEN v || ' gasto' || CASE WHEN v > 1 THEN 's' ELSE '' END || ' sin categoría' END) || '. Son 30 segundos.',
          'pend-' || hoy);
      END IF;
    EXCEPTION WHEN others THEN RAISE WARNING 'pendientes: %', SQLERRM; END;
  END IF;

  -- Cada hora: hitos de patrimonio (cada $5 millones)
  BEGIN
    SELECT floor((coalesce((valor->>'fintual')::numeric, 0) + coalesce((valor->>'cartas')::numeric, 0) + coalesce((valor->>'eth')::numeric, 0)) / 5000000)::int
      INTO n FROM ajustes WHERE clave = 'patrimonio';
    IF n > 0 THEN
      PERFORM privado.push('🚀 Pasaste los ' || privado.clp(n * 5000000), 'Tu patrimonio sigue subiendo. Vas camino a millonario.', 'hito-' || n * 5000000);
    END IF;
  EXCEPTION WHEN others THEN RAISE WARNING 'hito: %', SQLERRM; END;
END $function$;

-- El hito actual no es noticia: se marca como visto para que no llegue apenas actives los avisos.
insert into avisos_log (clave, titulo, cuerpo)
select 'hito-' || n * 5000000, 'hito inicial', '' from (
  select floor((coalesce((valor->>'fintual')::numeric, 0) + coalesce((valor->>'cartas')::numeric, 0) + coalesce((valor->>'eth')::numeric, 0)) / 5000000)::int n
  from ajustes where clave = 'patrimonio') q where n > 0
on conflict do nothing;

-- Nadie de afuera ejecuta estas funciones (el esquema privado no está expuesto, pero por si acaso).
revoke execute on function privado.clp(numeric), privado.hoy(), privado.pausa_fintual(), privado.cuotas_de(text), privado.estado_mes(date),
  privado.push(text, text, text, text), privado.extras_gasto(gastos), privado.aviso_gasto(), privado.aviso_sueldo(), privado.racha(),
  privado.avisos_programados(timestamp) from public, anon, authenticated;

select cron.unschedule('avisos') where exists (select 1 from cron.job where jobname = 'avisos');
select cron.schedule('avisos', '0 * * * *', 'select privado.avisos_programados()');

-- Octubre 2026: Vicho paga primero las tarjetas del mes pasado; no se le pide Fintual hasta el próximo sueldo.
insert into ajustes (clave, valor) values ('fintual_pausa', '{"hasta":"2026-10-26","motivo":"Pagar todas las tarjetas del mes pasado primero"}')
on conflict (clave) do update set valor = excluded.valor;
