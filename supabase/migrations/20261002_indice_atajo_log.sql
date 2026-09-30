-- ✅ Aplicado el 30-09-2026 (migración `indice_atajo_log`).
create index if not exists atajo_log_user_id_idx on public.atajo_log (user_id);
