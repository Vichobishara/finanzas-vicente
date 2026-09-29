-- Transferencias automáticas (BCI y Scotia) + función para el atajo de Apple Pay.
-- Aplicada en Supabase finanzas-vicho el 2026-09-29.

-- 1) Estado del gasto: 'ok' cuenta en el presupuesto, 'revisar' espera tu confirmación, 'ignorado' no cuenta.
alter table gastos add column if not exists estado text not null default 'ok'
  check (estado in ('ok','revisar','ignorado'));
alter table gastos add column if not exists destinatario text;
-- Transferencias: fuente 'transferencia', tarjeta 'otro' (la app la muestra como "Transferencia").
alter table gastos drop constraint gastos_fuente_check;
alter table gastos add constraint gastos_fuente_check check (fuente = any (array['manual','bci_auto','atajo','app','transferencia']));
alter table gastos drop constraint gastos_tarjeta_check;
alter table gastos add constraint gastos_tarjeta_check check (tarjeta = any (array['scotiabank','bci','santander','efectivo','otro']));

-- 2) Lo que la app recuerda por destinatario de transferencia.
create table if not exists destinatarios (
  id serial primary key,
  nombre text not null unique,
  accion text not null check (accion in ('gasto','ignorar')),
  categoria_clave text,
  created_at timestamptz default now()
);
alter table destinatarios enable row level security;
drop policy if exists acceso_total on destinatarios;
create policy acceso_total on destinatarios using (true) with check (true);
insert into destinatarios (nombre, accion) values ('fintual', 'ignorar') on conflict (nombre) do nothing;

-- 3) Trigger: transferencias según destinatarios; efectivo/transferencias cierran el 22 como la app.
create or replace function public.gastos_auto()
 returns trigger
 language plpgsql
as $function$
DECLARE r RECORD; dst RECORD; corte INT; d DATE;
BEGIN
  IF NEW.destinatario IS NOT NULL AND NEW.estado = 'ok' THEN
    SELECT * INTO dst FROM destinatarios
      WHERE NEW.destinatario ILIKE '%' || nombre || '%'
      ORDER BY length(nombre) DESC LIMIT 1;
    IF NOT FOUND THEN
      NEW.estado := 'revisar';
    ELSIF dst.accion = 'ignorar' THEN
      NEW.estado := 'ignorado';
    ELSE
      NEW.categoria_clave := COALESCE(NEW.categoria_clave, dst.categoria_clave);
    END IF;
  END IF;
  IF NEW.categoria_clave IS NULL THEN
    SELECT * INTO r FROM reglas_categoria
      WHERE NEW.descripcion ILIKE '%' || palabra || '%'
      ORDER BY length(palabra) DESC LIMIT 1;
    IF FOUND THEN
      NEW.categoria_clave := r.categoria_clave;
      NEW.pulldex := COALESCE(NEW.pulldex,false) OR r.negocio;
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
END $function$;

-- 4) Atajo de iOS (Apple Pay Scotia): recibe el monto como texto ("$12.990", "CLP 12.990", "12990")
--    y devuelve un mensaje corto para la notificación.
create or replace function public.anotar_atajo(monto_txt text, comercio text default null)
 returns text
 language plpgsql
as $function$
DECLARE s text; m int; g gastos; cat text;
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
  RETURN '✅ $' || replace(to_char(m, 'FM999G999G999'), ',', '.') || ' · ' || coalesce(cat, 'Sin categoría');
END $function$;
grant execute on function public.anotar_atajo(text, text) to anon;

-- 5) Santander: son 12 cuotas desde enero 2026, no un fijo eterno.
update cuotas set recurrente = false, primer_periodo = '2026-01'
  where nombre like 'Santander%' and recurrente = true and primer_periodo is null;
