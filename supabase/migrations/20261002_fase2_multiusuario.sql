-- Fase 2 del proyecto amigos: cada persona ve SOLO sus datos. Solo Supabase finanzas-vicho (caaewoxfvmdizzziyvfz).
--
-- Idea: se mantiene el header x-app-key, pero ahora cada persona tiene SU clave (tabla `cuentas`).
--   privado.uid() = la cuenta dueña de la clave del request (o `app.user_id` cuando la base trabaja sola: cron, atajo).
--   Todas las tablas tienen user_id (default privado.uid()) y RLS `user_id = privado.uid()`.
--   La clave de Vicho sigue siendo la misma: su app, Face ID, el atajo y el Apps Script siguen funcionando sin cambios
--   (lo que llega sin clave —atajo sin token, script de correos— es de la cuenta `legado`, o sea Vicho).
--   Las funciones de avisos (estado_mes, racha, resumen_hoy…) pasan a ser del rol finanzas_calc, que NO se salta RLS:
--   así cada cálculo ve solo los datos de la persona sin reescribir cada consulta. El cron recorre las cuentas.

-- 1 ── Cuentas ─────────────────────────────────────────────────────────────────────────────────
create table public.cuentas (
  id uuid primary key default gen_random_uuid(),
  email text unique,
  nombre text,
  clave text not null,                 -- la devuelven acceso / acceso_google (service role). Nunca sale por REST.
  clave_hash text not null unique,     -- sha256 hex de la clave, para privado.uid()
  token_atajo text unique,             -- para el atajo de iOS de cada persona (anotar_atajo(..., token))
  legado boolean not null default false, -- Vicho: lo que llega sin clave (script, atajo viejo) es suyo
  creado timestamptz not null default now()
);
alter table public.cuentas enable row level security;  -- sin políticas: solo service role / funciones
create unique index cuentas_un_legado on public.cuentas (legado) where legado;

insert into public.cuentas (id, email, nombre, clave, clave_hash, legado)
select '413a7c54-70cd-4126-8827-9418b2cc268d', 'vicente.bishara@gmail.com', 'Vicho', valor,
       encode(sha256(convert_to(valor, 'UTF8')), 'hex'), true
from public.secretos where clave = 'app_key';

create or replace function privado.uid() returns uuid
language sql stable security definer set search_path = '' as $$
  select coalesce(
    (select c.id from public.cuentas c
      where c.clave_hash = encode(pg_catalog.sha256(convert_to(coalesce(current_setting('request.headers', true)::json->>'x-app-key', ''), 'UTF8')), 'hex')),
    nullif(current_setting('app.user_id', true), '')::uuid)
$$;
create or replace function privado.legado() returns uuid
language sql stable security definer set search_path = '' as $$ select id from public.cuentas where legado $$;

create or replace function privado.autorizado() returns boolean
language sql stable security definer set search_path = '' as $$ select privado.uid() is not null $$;
grant execute on function privado.uid(), privado.autorizado() to anon, authenticated, service_role;

-- 2 ── user_id en todas las tablas (lo existente es de Vicho) ─────────────────────────────────────
do $$ declare t text; begin
  foreach t in array array['gastos','cuotas','ingresos','ahorros','presupuestos','ajustes','categorias','destinatarios',
                           'push_subs','avisos_log','passkeys'] loop
    execute format('alter table public.%I add column user_id uuid references public.cuentas(id) on delete cascade', t);
    execute format('update public.%I set user_id = %L', t, '413a7c54-70cd-4126-8827-9418b2cc268d');
    execute format('alter table public.%I alter column user_id set not null', t);
    execute format('create index on public.%I (user_id)', t);
    if t <> 'passkeys' then execute format('alter table public.%I alter column user_id set default privado.uid()', t); end if;
  end loop;
end $$;
-- Reglas: las de Vicho quedan suyas; se agregan reglas comunes (user_id null) para cualquiera.
alter table public.reglas_categoria add column user_id uuid references public.cuentas(id) on delete cascade default privado.uid();
update public.reglas_categoria set user_id = '413a7c54-70cd-4126-8827-9418b2cc268d';
create index on public.reglas_categoria (user_id);
insert into public.reglas_categoria (palabra, categoria_clave, negocio, user_id)
select palabra, categoria_clave, false, null from public.reglas_categoria
where not negocio and palabra in ('jumbo','lider','tottus','unimarc','santa isabel','super','uber eats','rappi','pedidosya','starbucks',
  'mcdonald','burger king','subway','oxxo','domino','cafe','café','delivery','almuerzo','sushi','spotify','netflix','youtube','icloud',
  'apple.com','cinemark','cine','farmacia','cruz verde','salcobrand','ahumada','integramedica','clinica','barber','copec','shell','bencina',
  'estacionamiento','parking','uber','cabify','didi','metro','bipqr','red movilidad','airbnb','booking','latam','sky airline');

-- 3 ── Llaves únicas por persona ───────────────────────────────────────────────────────────────
alter table public.gastos drop constraint if exists gastos_categoria_clave_fkey;
alter table public.reglas_categoria drop constraint if exists reglas_categoria_categoria_clave_fkey;
alter table public.categorias drop constraint categorias_clave_key, add constraint categorias_user_clave_key unique (user_id, clave);
alter table public.ajustes drop constraint ajustes_pkey, add primary key (user_id, clave);
alter table public.presupuestos drop constraint presupuestos_pkey, add primary key (user_id, periodo);
alter table public.destinatarios drop constraint destinatarios_nombre_key, add constraint destinatarios_user_nombre_key unique (user_id, nombre);
alter table public.avisos_log drop constraint avisos_log_pkey, add primary key (user_id, clave);
-- ref_externa (id del correo de Gmail) y push_subs.endpoint siguen únicos globales: son únicos de verdad.

-- 4 ── RLS por persona ────────────────────────────────────────────────────────────────────────
do $$ declare t text; begin
  foreach t in array array['gastos','cuotas','ingresos','ahorros','presupuestos','ajustes','categorias','destinatarios','push_subs'] loop
    execute format('drop policy if exists con_clave on public.%I', t);
    execute format('create policy propio on public.%I using (user_id = (select privado.uid())) with check (user_id = (select privado.uid()))', t);
  end loop;
end $$;
drop policy con_clave on public.reglas_categoria;
create policy propio_o_comun on public.reglas_categoria for select using (user_id = (select privado.uid()) or user_id is null);
create policy propio_ins on public.reglas_categoria for insert with check (user_id = (select privado.uid()));
create policy propio_upd on public.reglas_categoria for update using (user_id = (select privado.uid())) with check (user_id = (select privado.uid()));
create policy propio_del on public.reglas_categoria for delete using (user_id = (select privado.uid()));
drop policy con_clave_leer on public.avisos_log;
create policy propio_leer on public.avisos_log for select using (user_id = (select privado.uid()));
-- scripts_insert / scripts_upsert (anon, fuente bci_auto|transferencia|atajo) se quedan: gastos_auto les pone la cuenta legado.

-- 5 ── Rol para los cálculos y avisos: respeta RLS ─────────────────────────────────────────────
create role finanzas_calc nologin nobypassrls;
grant finanzas_calc to postgres;
grant usage, create on schema public, privado to finanzas_calc;  -- create: requisito para pasarle funciones (se quita abajo)
grant select, insert, update, delete on all tables in schema public to finanzas_calc;
grant execute on all functions in schema privado to finanzas_calc;
grant execute on function public.resumen_hoy(text) to finanzas_calc;
alter function privado.estado_mes(date) owner to finanzas_calc;
alter function privado.cuotas_de(text) owner to finanzas_calc;
alter function privado.racha() owner to finanzas_calc;
alter function privado.extras_gasto(public.gastos) owner to finanzas_calc;
alter function privado.pausa_fintual() owner to finanzas_calc;
alter function public.resumen_hoy(text) owner to finanzas_calc;
alter function privado.avisos_programados(timestamp) owner to finanzas_calc;
alter function privado.avisos_extra(timestamp) owner to finanzas_calc;
alter function privado.aviso_gasto() owner to finanzas_calc;
alter function privado.aviso_sueldo() owner to finanzas_calc;
revoke execute on function public.resumen_hoy(text) from public, anon, authenticated;
revoke create on schema public, privado from finanzas_calc;

-- aviso_gasto / aviso_sueldo: la cuenta es la del registro (sirve también para lo que entra sin clave)
create or replace function privado.fijar_uid(u uuid) returns void
language sql volatile set search_path = '' as $$ select set_config('app.user_id', u::text, true) $$;
grant execute on function privado.fijar_uid(uuid) to finanzas_calc;
do $$ declare f text; src text; begin
  foreach f in array array['aviso_gasto','aviso_sueldo'] loop
    select pg_get_functiondef(('privado.'||f||'()')::regprocedure) into src;
    src := regexp_replace(src, E'\nBEGIN\n', E'\nBEGIN\n  PERFORM privado.fijar_uid(NEW.user_id);\n');
    execute src;
  end loop;
end $$;

-- 6 ── push: el aviso queda en el log de la persona y solo va a SUS celulares ────────────────────
create or replace function privado.push(p_titulo text, p_cuerpo text, p_clave text default null, p_url text default '/')
returns boolean language plpgsql security definer set search_path = public as $$
DECLARE tok text; k text := coalesce(p_clave, 'x-' || gen_random_uuid()); u uuid := privado.uid();
BEGIN
  IF u IS NULL THEN RETURN false; END IF;
  INSERT INTO avisos_log (user_id, clave, titulo, cuerpo) VALUES (u, k, p_titulo, p_cuerpo) ON CONFLICT DO NOTHING;
  IF NOT FOUND THEN RETURN false; END IF;
  IF NOT EXISTS (SELECT 1 FROM push_subs WHERE user_id = u) THEN RETURN false; END IF;
  SELECT valor INTO tok FROM secretos WHERE clave = 'avisos_token';
  PERFORM net.http_post(url := 'https://caaewoxfvmdizzziyvfz.supabase.co/functions/v1/push',
    body := jsonb_build_object('titulo', p_titulo, 'cuerpo', p_cuerpo, 'url', p_url, 'tag', k, 'user_id', u),
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-avisos-token', tok));
  RETURN true;
END $$;

-- 7 ── Cron: los avisos programados corren una vez por cuenta ───────────────────────────────────
create or replace function privado.avisos_todos(p_ahora timestamp default null, p_extra boolean default false) returns void
language plpgsql security definer set search_path = public as $$
DECLARE c record;
BEGIN
  FOR c IN SELECT id FROM cuentas LOOP
    BEGIN
      PERFORM privado.fijar_uid(c.id);
      IF p_extra THEN PERFORM privado.avisos_extra(p_ahora); ELSE PERFORM privado.avisos_programados(p_ahora); END IF;
    EXCEPTION WHEN others THEN RAISE WARNING 'avisos %: %', c.id, SQLERRM;
    END;
  END LOOP;
  PERFORM set_config('app.user_id', '', true);
END $$;
select cron.unschedule('avisos');
select cron.unschedule('avisos_extra');
select cron.schedule('avisos', '0 * * * *', 'select privado.avisos_todos()');
select cron.schedule('avisos_extra', '0 * * * *', 'select privado.avisos_todos(null, true)');

-- 8 ── gastos_auto: reglas, destinatarios y cuenta de ESA persona ──────────────────────────────
create or replace function public.gastos_auto() returns trigger
language plpgsql security definer set search_path = public as $$
DECLARE r RECORD; dst RECORD; corte INT; d DATE;
BEGIN
  -- Con clave: la cuenta de la clave (el default ya la puso). Sin clave (script de correos, atajo viejo): la cuenta legado.
  NEW.user_id := coalesce(privado.uid(), privado.legado());
  PERFORM set_config('app.user_id', NEW.user_id::text, true);
  IF NEW.destinatario IS NOT NULL AND NEW.estado = 'ok' THEN
    SELECT * INTO dst FROM destinatarios
      WHERE user_id = NEW.user_id AND NEW.destinatario ILIKE '%' || nombre || '%'
      ORDER BY length(nombre) DESC LIMIT 1;
    IF NOT FOUND THEN NEW.estado := 'revisar';
    ELSIF dst.accion = 'ignorar' THEN NEW.estado := 'ignorado';
    ELSE NEW.categoria_clave := COALESCE(NEW.categoria_clave, dst.categoria_clave);
    END IF;
  END IF;
  IF NEW.categoria_clave IS NULL THEN
    SELECT * INTO r FROM reglas_categoria
      WHERE (user_id = NEW.user_id OR user_id IS NULL) AND NEW.descripcion ILIKE '%' || palabra || '%'
      ORDER BY length(palabra) DESC, (user_id IS NOT NULL) DESC LIMIT 1;
    IF FOUND THEN
      NEW.categoria_clave := r.categoria_clave;
      NEW.pulldex := COALESCE(NEW.pulldex, false) OR r.negocio;
    ELSE
      NEW.categoria_clave := 'otros';
    END IF;
  END IF;
  IF NEW.periodo IS NULL THEN
    corte := CASE NEW.tarjeta WHEN 'bci' THEN 20 ELSE 22 END;
    d := NEW.fecha;
    IF EXTRACT(DAY FROM d) > corte THEN d := (d + INTERVAL '1 month')::date; END IF;
    NEW.periodo := to_char(d, 'YYYY-MM');
  END IF;
  RETURN NEW;
END $$;
revoke execute on function public.gastos_auto() from public, anon, authenticated;

-- 9 ── Atajo de iOS: sin token = Vicho (su atajo actual sigue igual); con token = esa persona ────
drop function public.anotar_atajo(text, text);
create function public.anotar_atajo(monto_txt text, comercio text default null, token text default null)
returns text language plpgsql security definer set search_path = public as $$
DECLARE s text; m int; g gastos; cat text; extra text; u uuid;
BEGIN
  IF nullif(trim(token), '') IS NULL THEN u := privado.legado();
  ELSE SELECT id INTO u FROM cuentas WHERE token_atajo = trim(token); END IF;
  IF u IS NULL THEN RETURN '❌ Este atajo no está conectado. Vuelve a instalarlo desde la app.'; END IF;
  PERFORM set_config('app.user_id', u::text, true);
  s := regexp_replace(coalesce(monto_txt,''), '[^0-9.,]', '', 'g');
  IF s ~ '[.,][0-9]{2}$' THEN s := left(s, length(s) - 3); END IF;
  m := nullif(regexp_replace(s, '[^0-9]', '', 'g'), '')::int;
  IF m IS NULL OR m <= 0 THEN RETURN '❌ No entendí el monto: ' || coalesce(nullif(trim(monto_txt), ''), '(vacío)'); END IF;
  INSERT INTO gastos (user_id, fecha, descripcion, monto, tarjeta, fuente)
    VALUES (u, (now() AT TIME ZONE 'America/Santiago')::date,
            left(coalesce(nullif(trim(comercio), ''), 'Compra Apple Pay'), 120), m,
            CASE WHEN nullif(trim(token), '') IS NULL THEN 'scotiabank' ELSE 'otro' END, 'atajo')
    RETURNING * INTO g;
  SELECT nombre INTO cat FROM categorias WHERE user_id = u AND clave = g.categoria_clave;
  BEGIN
    IF NOT coalesce(g.pulldex, false) THEN extra := public.resumen_hoy(g.categoria_clave) || coalesce(privado.extras_gasto(g), ''); END IF;
  EXCEPTION WHEN others THEN extra := NULL;
  END;
  RETURN '✅ ' || privado.clp(m) || ' · ' || coalesce(cat, 'Sin categoría') || coalesce(E'\n' || extra, '');
END $$;
grant execute on function public.anotar_atajo(text, text, text) to anon, authenticated;

-- 10 ── Alta de una cuenta nueva (solo la llama acceso_google con service role) ───────────────────
create or replace function public.crear_cuenta(p_email text, p_nombre text default null)
returns text language plpgsql security definer set search_path = public as $$
DECLARE k text; u uuid;
BEGIN
  SELECT clave INTO k FROM cuentas WHERE lower(email) = lower(p_email);
  IF FOUND THEN RETURN k; END IF;
  k := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
  INSERT INTO cuentas (email, nombre, clave, clave_hash, token_atajo)
    VALUES (lower(p_email), p_nombre, k, encode(sha256(convert_to(k, 'UTF8')), 'hex'), replace(gen_random_uuid()::text, '-', ''))
    RETURNING id INTO u;
  -- Mismas categorías que Vicho, pero sin cartas bloqueadas (la bienvenida ajusta los topes a su presupuesto)
  INSERT INTO categorias (user_id, clave, nombre, techo, color)
    SELECT u, clave, nombre, CASE clave WHEN 'coleccionables' THEN 30000 ELSE techo END, color
    FROM categorias WHERE user_id = privado.legado();
  RETURN k;
END $$;
revoke execute on function public.crear_cuenta(text, text) from public, anon, authenticated;
grant execute on function public.crear_cuenta(text, text) to service_role;

-- Token del atajo propio (para la guía "Conecta Apple Pay"): la persona lo pide con su clave.
create or replace function public.mi_token_atajo() returns text
language sql security definer set search_path = public as $$ select token_atajo from cuentas where id = privado.uid() $$;
grant execute on function public.mi_token_atajo() to anon, authenticated;
