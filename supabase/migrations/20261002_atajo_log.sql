-- ✅ Aplicado en finanzas-vicho el 30-09-2026 (migración `atajo_log`).
-- Cada llamada del atajo de iOS queda registrada (lo que mandó el iPhone y qué respondimos), para diagnosticar
-- compras con Apple Pay que no se anotan. RLS sin políticas: solo se lee desde el panel / service role.
create table public.atajo_log (
  id bigint generated always as identity primary key,
  creado timestamptz not null default now(),
  monto_txt text, comercio text, con_token boolean, resultado text
);
alter table public.atajo_log enable row level security;
-- anotar_atajo(monto_txt, comercio, token): misma lógica que en 20261002_fase2_multiusuario.sql, más:
--   * el error de monto dice "Anótalo en la app."
--   * al final: INSERT INTO atajo_log (monto_txt, comercio, con_token, resultado) VALUES (...)
