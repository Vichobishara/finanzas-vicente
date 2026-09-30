-- Conexión con Fintual: la persona pone su correo y contraseña UNA vez en la app; la edge function `fintual` le pide a
-- Fintual un token (POST /api/access_tokens) y guarda SOLO el token acá. La contraseña nunca se guarda ni se registra.
-- Con el token lee las metas (GET /api/goals): actualiza ajustes.patrimonio y detecta aportes nuevos (sube `deposited`) → `ahorros`.
-- La app ve el estado en ajustes.fintual {conectado, email, sync_at, error, metas:[{id,nombre,nav,depositado,destino}]} (sin token).
create table if not exists fintual_conexion (
  user_id uuid primary key references cuentas(id) on delete cascade,
  email text not null,
  token text not null,
  destinos jsonb not null default '{}'::jsonb,   -- id de meta → fintual | colchon | apv | fuera
  ultimo jsonb,                                   -- última foto {id: depositado} para detectar aportes
  sync_at timestamptz,
  error text,
  created_at timestamptz not null default now()
);
alter table fintual_conexion enable row level security;  -- sin políticas: solo la edge function (service role)
revoke all on fintual_conexion from anon, authenticated;

-- Todos los días ~21:00 Santiago (00:00 UTC) sincroniza a todas las cuentas conectadas.
select cron.schedule('fintual', '0 0 * * *', $$
  select net.http_post(url := 'https://caaewoxfvmdizzziyvfz.supabase.co/functions/v1/fintual',
    body := '{"accion":"todos"}'::jsonb,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-avisos-token', (select valor from secretos where clave = 'avisos_token')))
$$);
