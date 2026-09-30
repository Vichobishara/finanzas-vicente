-- ⚠️⚠️⚠️  BORRADOR — NO ESTÁ APLICADO EN SUPABASE. NO CORRER TAL CUAL.  ⚠️⚠️⚠️
-- Proyecto amigos, fase 2: datos privados por persona (ver docs/proyecto_amigos.md → Diagnóstico).
-- Solo Supabase `finanzas-vicho` (caaewoxfvmdizzziyvfz). Nada de TCG Logs.
--
-- Antes de aplicar (en este orden):
--   1. Fase 1 lista: Vicho entra con Google y existe en auth.users (hoy auth.users tiene 0 filas).
--   2. Reemplazar <UUID-DE-VICHO> abajo por su id de auth.users.
--   3. La app ya manda el JWT del usuario (Authorization: Bearer <access_token>) en vez de x-app-key.
--   4. Probar en una rama de Supabase (create_branch), no en producción.
--   5. Mismo día: actualizar el atajo de iOS (nuevo parámetro `token`) y el Apps Script (RPC nuevas).
--      Si no, las compras Apple Pay y los correos dejan de entrar.
-- Queda pendiente (TODO marcados abajo): reescribir privado.avisos_programados / aviso_sueldo con filtro por
-- usuario, edge functions `push`, `consejo` y `acceso`.

begin;

-- ─────────────────────────────────────────────────────────────────────────────
-- 0. Guardia: no seguir si falta el usuario de Vicho
-- ─────────────────────────────────────────────────────────────────────────────
select set_config('fase2.vicho', '<UUID-DE-VICHO>', true);
do $$
begin
  if current_setting('fase2.vicho') !~ '^[0-9a-f-]{36}$'
     or not exists (select 1 from auth.users where id = current_setting('fase2.vicho')::uuid) then
    raise exception 'Falta el user_id de Vicho (fase 1). No se aplicó nada.';
  end if;
end $$;

-- Quién es "el usuario" dentro de funciones SECURITY DEFINER:
--   desde la app → auth.uid() (JWT); desde atajo/scripts/cron → lo fija la función con set_config('app.user_id').
create or replace function privado.uid() returns uuid language sql stable set search_path = '' as
$$ select coalesce(auth.uid(), nullif(current_setting('app.user_id', true), '')::uuid) $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Columna user_id + backfill con Vicho
-- ─────────────────────────────────────────────────────────────────────────────
do $$
declare t text; vicho uuid := current_setting('fase2.vicho')::uuid;
begin
  foreach t in array array['gastos','cuotas','presupuestos','ingresos','ajustes','ahorros','destinatarios',
                           'categorias','push_subs','avisos_log','reglas_categoria'] loop
    execute format('alter table public.%I add column if not exists user_id uuid references auth.users(id) on delete cascade', t);
    execute format('update public.%I set user_id = $1 where user_id is null', t) using vicho;
    execute format('alter table public.%I alter column user_id set default auth.uid()', t);  -- scripts/atajo/cron pasan user_id explícito
    execute format('create index if not exists %I on public.%I (user_id)', t || '_user_id_idx', t);
    if t <> 'reglas_categoria' then  -- reglas: user_id null = regla común para todos
      execute format('alter table public.%I alter column user_id set not null', t);
    end if;
  end loop;
end $$;

-- Reglas comunes (Jumbo → comida, Uber → transporte…): las que no son de negocio pasan a ser de todos.
-- ⚠️ Revisar a mano antes: algunas pueden ser personales de Vicho (nombres de personas, PULLDEX, cartas).
update public.reglas_categoria set user_id = null where not negocio;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Llaves únicas por persona (hoy son globales)
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.gastos           drop constraint gastos_categoria_clave_fkey;
alter table public.reglas_categoria drop constraint reglas_categoria_categoria_clave_fkey;

alter table public.categorias drop constraint categorias_clave_key;
alter table public.categorias add constraint categorias_user_clave_key unique (user_id, clave);

alter table public.presupuestos drop constraint presupuestos_pkey;
alter table public.presupuestos add primary key (user_id, periodo);

alter table public.ajustes drop constraint ajustes_pkey;
alter table public.ajustes add primary key (user_id, clave);

alter table public.destinatarios drop constraint destinatarios_nombre_key;
alter table public.destinatarios add constraint destinatarios_user_nombre_key unique (user_id, nombre);

-- ref_externa = id del correo: único por persona. El script pasa a on_conflict=user_id,ref_externa (vía RPC, abajo).
alter table public.gastos   drop constraint gastos_ref_externa_key;
alter table public.gastos   add constraint gastos_user_ref_key unique (user_id, ref_externa);
alter table public.ingresos drop constraint ingresos_ref_externa_key;
alter table public.ingresos add constraint ingresos_user_ref_key unique (user_id, ref_externa);

alter table public.avisos_log drop constraint avisos_log_pkey;
alter table public.avisos_log add primary key (user_id, clave);

-- Categoría del gasto = una categoría de ESA persona.
alter table public.gastos add constraint gastos_categoria_fkey
  foreign key (user_id, categoria_clave) references public.categorias (user_id, clave);
-- reglas_categoria: con user_id null no se puede validar por FK; se valida contra las 9 claves estándar.
alter table public.reglas_categoria add constraint reglas_categoria_clave_check
  check (categoria_clave in ('comida','fijo','tech','transporte','salud','ocio','coleccionables','viajes','otros'));

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. RLS: fuera x-app-key y el insert "sin clave"; entra user_id = auth.uid()
-- ─────────────────────────────────────────────────────────────────────────────
drop policy if exists con_clave      on public.gastos;
drop policy if exists scripts_insert on public.gastos;
drop policy if exists scripts_upsert on public.gastos;
drop policy if exists con_clave_leer on public.avisos_log;

do $$
declare t text;
begin
  foreach t in array array['gastos','cuotas','presupuestos','ingresos','ajustes','ahorros','destinatarios',
                           'categorias','push_subs'] loop
    execute format('drop policy if exists con_clave on public.%I', t);
    execute format('create policy propio on public.%I for all to authenticated
                      using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))', t);
  end loop;
end $$;

drop policy if exists con_clave on public.reglas_categoria;
create policy leer on public.reglas_categoria for select to authenticated
  using (user_id is null or user_id = (select auth.uid()));
create policy propias on public.reglas_categoria for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy propio_leer on public.avisos_log for select to authenticated using (user_id = (select auth.uid()));

-- anon ya no toca tablas (todo lo que viene sin login entra por RPC con token). TRUNCATE salta RLS: fuera para todos.
revoke all on public.gastos, public.cuotas, public.presupuestos, public.ingresos, public.ajustes, public.ahorros,
  public.destinatarios, public.categorias, public.push_subs, public.avisos_log, public.reglas_categoria,
  public.passkeys, public.passkey_retos, public.secretos from anon;
revoke truncate, references, trigger on all tables in schema public from authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Tokens personales (atajo de iOS y scripts de correo)
-- ─────────────────────────────────────────────────────────────────────────────
create table public.tokens (
  id         bigint generated always as identity primary key,
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  tipo       text not null check (tipo in ('atajo', 'correos')),
  hash       text not null unique,          -- sha256 hex del token; el token en claro no se guarda
  pista      text,                          -- últimos 4 caracteres, para reconocerlo en la app
  created_at timestamptz not null default now(),
  usado_at   timestamptz,
  revocado_at timestamptz
);
alter table public.tokens enable row level security;
create policy propio_leer on public.tokens for select to authenticated using (user_id = (select auth.uid()));
create policy propio_revocar on public.tokens for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
revoke all on public.tokens from anon;
revoke insert, delete on public.tokens from authenticated;  -- se crean solo con crear_token()
grant update (revocado_at) on public.tokens to authenticated;

-- Crea un token nuevo (revoca el anterior del mismo tipo) y lo devuelve UNA vez.
create or replace function public.crear_token(p_tipo text) returns text
language plpgsql security definer set search_path = '' as $$
declare u uuid := auth.uid(); t text;
begin
  if u is null then raise exception 'Necesitas entrar con Google'; end if;
  t := encode(extensions.gen_random_bytes(24), 'hex');
  update public.tokens set revocado_at = now() where user_id = u and tipo = p_tipo and revocado_at is null;
  insert into public.tokens (user_id, tipo, hash, pista)
    values (u, p_tipo, encode(extensions.digest(t, 'sha256'), 'hex'), right(t, 4));
  return t;
end $$;
revoke execute on function public.crear_token(text) from public, anon;
grant execute on function public.crear_token(text) to authenticated;

-- Token → user_id (null si no existe o está revocado). También fija app.user_id para privado.uid().
create or replace function privado.usuario_de_token(p_token text, p_tipo text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare u uuid;
begin
  update public.tokens set usado_at = now()
    where hash = encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex') and tipo = p_tipo and revocado_at is null
    returning user_id into u;
  if u is not null then perform set_config('app.user_id', u::text, true); end if;
  return u;
end $$;
revoke execute on function privado.usuario_de_token(text, text) from public, anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Trigger gastos_auto: reglas y destinatarios DE ESA persona (+ reglas comunes)
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function public.gastos_auto() returns trigger
language plpgsql security definer set search_path = public as $$
declare r record; dst record; corte int; d date;
begin
  new.user_id := coalesce(new.user_id, privado.uid());
  if new.user_id is null then raise exception 'gasto sin dueño'; end if;
  if new.destinatario is not null and new.estado = 'ok' then
    select * into dst from destinatarios
      where user_id = new.user_id and new.destinatario ilike '%' || nombre || '%'
      order by length(nombre) desc limit 1;
    if not found then new.estado := 'revisar';
    elsif dst.accion = 'ignorar' then new.estado := 'ignorado';
    else new.categoria_clave := coalesce(new.categoria_clave, dst.categoria_clave);
    end if;
  end if;
  if new.categoria_clave is null then
    select * into r from reglas_categoria
      where (user_id = new.user_id or user_id is null) and new.descripcion ilike '%' || palabra || '%'
      order by (user_id is not null) desc, length(palabra) desc limit 1;   -- las propias ganan a las comunes
    if found then
      new.categoria_clave := r.categoria_clave;
      new.pulldex := coalesce(new.pulldex, false) or r.negocio;
    else
      new.categoria_clave := 'otros';
    end if;
  end if;
  if new.periodo is null then
    -- TODO fase 3: el día de cierre por tarjeta sale del perfil de cada persona (hoy BCI 20, resto 22).
    corte := case new.tarjeta when 'bci' then 20 else 22 end;
    d := new.fecha;
    if extract(day from d) > corte then d := (d + interval '1 month')::date; end if;
    new.periodo := to_char(d, 'YYYY-MM');
  end if;
  return new;
end $$;
revoke execute on function public.gastos_auto() from public, anon, authenticated;  -- es trigger, no RPC

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. Funciones internas que leían TODO: ahora filtran por privado.uid()
-- ─────────────────────────────────────────────────────────────────────────────
create or replace function privado.cuotas_de(per text) returns integer
language sql stable security definer set search_path = public as $$
  select coalesce(sum(monto_cuota), 0)::int from cuotas where user_id = privado.uid() and activa and (recurrente or (primer_periodo is not null and
    ((left(per,4)::int - left(primer_periodo,4)::int) * 12 + right(per,2)::int - right(primer_periodo,2)::int + 1) between 1 and total_cuotas))
$$;

create or replace function privado.pausa_fintual() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select (valor->>'hasta')::date >= privado.hoy() from ajustes where user_id = privado.uid() and clave = 'fintual_pausa'), false)
$$;

create or replace function privado.estado_mes(p_hoy date default null) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare u uuid := privado.uid(); hoy date := coalesce(p_hoy, privado.hoy()); d date; per text; cierre date; ini date; dias int;
  ppto int; cuo int; gast int; ghoy int; queda int; cupo numeric; lun date; w0 date; w1 date; gsem int; semana numeric;
begin
  if u is null then raise exception 'estado_mes sin usuario'; end if;
  d := case when extract(day from hoy) > 22 then (hoy + interval '1 month')::date else hoy end;
  per := to_char(d, 'YYYY-MM');
  cierre := make_date(extract(year from d)::int, extract(month from d)::int, 22);
  ini := (cierre - interval '1 month')::date + 1;
  dias := greatest(1, cierre - hoy + 1);
  ppto := coalesce((select monto from presupuestos where user_id = u and periodo = per), 1000000);
  cuo := privado.cuotas_de(per);
  select coalesce(sum(monto), 0), coalesce(sum(monto) filter (where fecha = hoy), 0) into gast, ghoy
    from gastos where user_id = u and periodo = per and not coalesce(pulldex, false) and coalesce(estado, 'ok') = 'ok';
  queda := ppto - cuo - gast;
  cupo := (queda + ghoy)::numeric / dias;
  lun := hoy - (extract(isodow from hoy)::int - 1);
  w0 := greatest(lun, ini); w1 := least(lun + 6, cierre);
  select coalesce(sum(monto), 0) into gsem from gastos
    where user_id = u and periodo = per and fecha >= w0 and not coalesce(pulldex, false) and coalesce(estado, 'ok') = 'ok';
  semana := (queda + gsem)::numeric * (w1 - w0 + 1) / greatest(1, cierre - w0 + 1) - gsem;
  return jsonb_build_object('hoy', hoy, 'per', per, 'ini', ini, 'cierre', cierre, 'dias', dias, 'ppto', ppto, 'cuo', cuo,
    'gast', gast, 'ghoy', ghoy, 'queda', queda, 'cupo', round(cupo), 'rest', round(cupo - ghoy),
    'manana', case when dias > 1 then round(queda::numeric / (dias - 1)) else queda end,
    'semana', round(semana), 'dias_sem', w1 - hoy + 1);
end $$;

create or replace function public.resumen_hoy(p_cat text default null) returns text
language plpgsql security definer set search_path = public as $$
declare u uuid := privado.uid(); e jsonb := privado.estado_mes(); techo int; gcat int; ncat text; msg text;
begin
  if (e->>'queda')::int < 0 then
    msg := '🔴 Te pasaste del mes por ' || privado.clp(-(e->>'queda')::int) || '. Freno total hasta el 22.';
  elsif (e->>'rest')::int < 0 then
    msg := '🟠 Hoy te pasaste por ' || privado.clp(-(e->>'rest')::int) ||
      case when (e->>'dias')::int > 1 then '. Desde mañana: ' || privado.clp((e->>'manana')::int) || ' al día.' else '.' end;
  else
    msg := '👍 Hoy te quedan ' || privado.clp((e->>'rest')::int);
  end if;
  if p_cat is not null and p_cat <> 'otros' then
    select c.techo, c.nombre into techo, ncat from categorias c where c.user_id = u and c.clave = p_cat;
    select coalesce(sum(monto), 0) into gcat from gastos
      where user_id = u and periodo = e->>'per' and categoria_clave = p_cat and not coalesce(pulldex, false) and coalesce(estado, 'ok') = 'ok';
    if p_cat = 'coleccionables' and coalesce(techo, 0) = 0 then
      msg := msg || E'\n🃏 Cartas estaban bloqueadas este mes. Si era para PULLDEX, márcalo como negocio en la app.';
    elsif techo > 0 and gcat > techo then
      msg := msg || E'\n⚠️ ' || ncat || ': te pasaste del tope (' || privado.clp(gcat) || ' de ' || privado.clp(techo) || ').';
    elsif techo > 0 and gcat > techo * 0.8 then
      msg := msg || E'\n⚠️ ' || ncat || ' va al ' || round(gcat * 100.0 / techo) || '% del mes.';
    end if;
  end if;
  return msg;
end $$;
revoke execute on function public.resumen_hoy(text) from public, anon, authenticated;

-- extras_gasto: los dos SELECT sobre gastos agregan `and user_id = g.user_id`.
create or replace function privado.extras_gasto(g gastos) returns text
language plpgsql security definer set search_path = public as $$
declare ahora timestamp := now() at time zone 'America/Santiago'; h int := extract(hour from ahora)::int;
  hoy date := ahora::date; n int; tot int; r text := ''; delivery text := '(uber ?eats|rappi|pedidos ?ya|didi ?food|justo)';
begin
  if (h >= 23 or h < 4) and g.fuente in ('atajo', 'bci_auto') and g.fecha >= hoy - 1 then
    r := r || E'\n🌙 Compra a las ' || to_char(ahora, 'HH24:MI') || '. ¿Era necesaria o fue impulso?';
  end if;
  if g.descripcion ~* delivery then
    select count(*), coalesce(sum(monto), 0) into n, tot from gastos where user_id = g.user_id and descripcion ~* delivery
      and fecha > hoy - 7 and id <= g.id and not coalesce(pulldex, false) and coalesce(estado, 'ok') = 'ok';
    if n >= 3 then
      r := r || E'\n🍔 ' || case n when 3 then 'Tercer' when 4 then 'Cuarto' when 5 then 'Quinto' else n || 'º' end ||
        ' delivery de la semana (' || privado.clp(tot) || ' en total).';
    end if;
  elsif coalesce(g.categoria_clave, 'otros') not in ('transporte', 'fijo') then
    select count(*), coalesce(sum(monto), 0) into n, tot from gastos where user_id = g.user_id and lower(descripcion) = lower(g.descripcion)
      and fecha > hoy - 7 and id <= g.id and not coalesce(pulldex, false) and coalesce(estado, 'ok') = 'ok';
    if n >= 3 then r := r || E'\n🔁 ' || n || 'ª vez en ' || g.descripcion || ' esta semana (' || privado.clp(tot) || ').'; end if;
  end if;
  return nullif(r, '');
end $$;

-- racha: su único SELECT sobre gastos agrega `and user_id = privado.uid()`.
create or replace function privado.racha() returns integer
language plpgsql security definer set search_path = public as $$
declare e jsonb := privado.estado_mes(); d date; ini date := (e->>'ini')::date; cierre date := (e->>'cierre')::date;
  base int := (e->>'ppto')::int - (e->>'cuo')::int; antes int; ese int; n int := 0;
begin
  d := (e->>'hoy')::date;
  while d >= ini loop
    select coalesce(sum(monto) filter (where fecha < d), 0), coalesce(sum(monto) filter (where fecha = d), 0) into antes, ese
      from gastos where user_id = privado.uid() and periodo = e->>'per' and not coalesce(pulldex, false) and coalesce(estado, 'ok') = 'ok';
    exit when ese > (base - antes)::numeric / (cierre - d + 1);
    n := n + 1; d := d - 1;
  end loop;
  return n;
end $$;

-- push: el aviso queda a nombre de la persona y la edge function manda solo a SUS dispositivos.
create or replace function privado.push(p_titulo text, p_cuerpo text, p_clave text default null, p_url text default '/')
returns boolean language plpgsql security definer set search_path = public as $$
declare tok text; u uuid := privado.uid(); k text := coalesce(p_clave, 'x-' || gen_random_uuid());
begin
  if u is null then return false; end if;
  insert into avisos_log (user_id, clave, titulo, cuerpo) values (u, k, p_titulo, p_cuerpo) on conflict do nothing;
  if not found then return false; end if;
  if not exists (select 1 from push_subs where user_id = u) then return false; end if;
  select valor into tok from secretos where clave = 'avisos_token';
  perform net.http_post(url := 'https://caaewoxfvmdizzziyvfz.supabase.co/functions/v1/push',
    body := jsonb_build_object('titulo', p_titulo, 'cuerpo', p_cuerpo, 'url', p_url, 'tag', k, 'user_id', u),
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-avisos-token', tok));
  return true;
end $$;
-- TODO edge function `push`: filtrar push_subs por body.user_id (hoy manda a TODAS las suscripciones).

-- privado.aviso_gasto / aviso_sueldo (triggers): fijan el usuario de la fila antes de calcular nada.
--   Agregar al inicio de cada una:  perform set_config('app.user_id', new.user_id::text, true);
--   aviso_sueldo además: `from presupuestos/ajustes where user_id = new.user_id and ...`.
-- TODO: reescribir ambas con ese cambio (cuerpo actual en la migración 20260930_avisos_push.sql).

-- privado.avisos_programados (cron cada hora): envolver en un loop por persona.
--   TODO: renombrar la actual a privado.avisos_de_usuario(p_ahora) y agregar `user_id = privado.uid()` a sus
--   SELECT directos (gastos ×3, presupuestos, ajustes ×2, cuotas ×2, ingresos, ahorros, avisos_log 'pend-%').
create or replace function privado.avisos_programados(p_ahora timestamp default null) returns void
language plpgsql security definer set search_path = public as $$
declare u uuid;
begin
  for u in select distinct user_id from push_subs loop       -- solo quien tiene avisos activados
    perform set_config('app.user_id', u::text, true);
    begin
      perform privado.avisos_de_usuario(p_ahora);
    exception when others then raise warning 'avisos %: %', u, sqlerrm;
    end;
  end loop;
  perform set_config('app.user_id', '', true);
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. Entradas sin login: atajo de iOS y script de correos, con token personal
-- ─────────────────────────────────────────────────────────────────────────────
drop function if exists public.anotar_atajo(text, text);   -- ⚠️ el atajo actual deja de funcionar: actualizarlo el mismo día

create or replace function public.anotar_atajo(monto_txt text, comercio text default null, token text default null)
returns text language plpgsql security definer set search_path = public as $$
declare u uuid; s text; m int; g gastos; cat text; extra text;
begin
  u := privado.usuario_de_token(token, 'atajo');
  if u is null then return '❌ Código inválido. Cópialo de nuevo desde la app (Ajustes → Atajo).'; end if;
  s := regexp_replace(coalesce(monto_txt, ''), '[^0-9.,]', '', 'g');
  if s ~ '[.,][0-9]{2}$' then s := left(s, length(s) - 3); end if;
  m := nullif(regexp_replace(s, '[^0-9]', '', 'g'), '')::int;
  if m is null or m <= 0 then return '❌ No entendí el monto: ' || coalesce(monto_txt, '(vacío)'); end if;
  -- TODO fase 4: la tarjeta sale del perfil (hoy 'scotiabank' fijo, como en el atajo de Vicho).
  insert into gastos (user_id, fecha, descripcion, monto, tarjeta, fuente)
    values (u, privado.hoy(), left(coalesce(nullif(trim(comercio), ''), 'Compra Apple Pay'), 120), m, 'scotiabank', 'atajo')
    returning * into g;
  select nombre into cat from categorias where user_id = u and clave = g.categoria_clave;
  begin
    if not coalesce(g.pulldex, false) then extra := public.resumen_hoy(g.categoria_clave) || coalesce(privado.extras_gasto(g), ''); end if;
  exception when others then extra := null;
  end;
  return '✅ ' || privado.clp(m) || ' · ' || coalesce(cat, 'Sin categoría') || coalesce(E'\n' || extra, '');
end $$;
revoke execute on function public.anotar_atajo(text, text, text) from public;
grant execute on function public.anotar_atajo(text, text, text) to anon, authenticated;

-- Script de correos: reemplaza los POST directos a /rest/v1/gastos e /ingresos (upsert on_conflict=ref_externa).
-- Recibe una lista de filas; ignora columnas que no sean las permitidas; nunca deja elegir user_id.
create or replace function public.importar_movimientos(p_token text, p_gastos jsonb default '[]', p_ingresos jsonb default '[]')
returns jsonb language plpgsql security definer set search_path = public as $$
declare u uuid; ng int := 0; ni int := 0; x jsonb;
begin
  u := privado.usuario_de_token(p_token, 'correos');
  if u is null then raise exception 'token inválido' using errcode = '28000'; end if;
  for x in select * from jsonb_array_elements(coalesce(p_gastos, '[]')) loop
    insert into gastos (user_id, fecha, descripcion, monto, tarjeta, fuente, ref_externa, destinatario, estado)
      values (u, (x->>'fecha')::date, left(x->>'descripcion', 200), (x->>'monto')::int, x->>'tarjeta',
              case when x->>'fuente' in ('bci_auto', 'transferencia') then x->>'fuente' else 'bci_auto' end,
              x->>'ref_externa', x->>'destinatario', 'ok')
      on conflict (user_id, ref_externa) do nothing;
    if found then ng := ng + 1; end if;
  end loop;
  for x in select * from jsonb_array_elements(coalesce(p_ingresos, '[]')) loop
    -- mismo criterio que hoy: no duplicar si ya hay uno manual con el mismo monto (±5 días)
    continue when exists (select 1 from ingresos where user_id = u and monto = (x->>'monto')::int
                          and fecha between (x->>'fecha')::date - 5 and (x->>'fecha')::date + 5);
    insert into ingresos (user_id, fecha, monto, tipo, descripcion, base_tributable, impuesto, ref_externa, fuente)
      values (u, (x->>'fecha')::date, (x->>'monto')::int, coalesce(x->>'tipo', 'sueldo'), left(x->>'descripcion', 200),
              (x->>'base_tributable')::int, (x->>'impuesto')::int, x->>'ref_externa', 'toku_auto')
      on conflict (user_id, ref_externa) do nothing;
    if found then ni := ni + 1; end if;
  end loop;
  return jsonb_build_object('gastos', ng, 'ingresos', ni);
end $$;
revoke execute on function public.importar_movimientos(text, jsonb, jsonb) from public;
grant execute on function public.importar_movimientos(text, jsonb, jsonb) to anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 8. Lo que ya no sirve con Google login
-- ─────────────────────────────────────────────────────────────────────────────
-- privado.autorizado() y rpc/clave_ok quedan sin uso cuando la app deje la clave. Se borran en una migración
-- aparte, DESPUÉS de comprobar que Vicho entra con Google en el celular (para no quedar afuera).
-- TODO edge functions: `consejo` valida el JWT del usuario (no x-app-key) y lleva un límite de preguntas por día;
-- `acceso` (passkey) se retira o pasa a iniciar sesión de Supabase Auth.

-- Hardening de paso (advisors): search_path fijo en funciones que no lo tenían.
alter function privado.clp(numeric) set search_path = '';
alter function privado.hoy() set search_path = '';

commit;

-- ─────────────────────────────────────────────────────────────────────────────
-- Test de fuego (correr en la rama, NO en producción): dos usuarios, ninguno ve lo del otro.
-- ─────────────────────────────────────────────────────────────────────────────
-- set local role authenticated;
-- select set_config('request.jwt.claims', json_build_object('sub', '<UUID-AMIGO>', 'role', 'authenticated')::text, true);
-- select count(*) from gastos;          -- debe ser 0 (el amigo no ve nada de Vicho)
-- insert into gastos (fecha, descripcion, monto, tarjeta) values (current_date, 'test', 1000, 'efectivo');  -- falla si
--                                        -- el amigo no tiene sus 9 categorías (FK): el onboarding debe crearlas primero
-- Y por REST directo con el access_token de cada uno: GET /rest/v1/gastos, /cuotas, /ajustes… → solo filas propias.
