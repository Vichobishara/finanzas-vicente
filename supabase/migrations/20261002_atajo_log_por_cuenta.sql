-- ✅ Aplicado en finanzas-vicho el 30-09-2026 (migración `atajo_log_por_cuenta`).
-- atajo_log.user_id + anotar_atajo guarda la cuenta; rpc/mi_ultimo_atajo() devuelve la última llamada de quien pregunta.
alter table public.atajo_log add column if not exists user_id uuid references public.cuentas(id) on delete cascade;
update public.atajo_log set user_id = privado.legado() where user_id is null and not coalesce(con_token, false);
do $$ declare src text; begin
  select pg_get_functiondef('public.anotar_atajo(text,text,text)'::regprocedure) into src;
  src := replace(src, 'INSERT INTO atajo_log (monto_txt, comercio, con_token, resultado) VALUES (',
                      'INSERT INTO atajo_log (user_id, monto_txt, comercio, con_token, resultado) VALUES (u, ');
  execute src;
end $$;
create or replace function public.mi_ultimo_atajo() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('creado', creado, 'monto_txt', monto_txt, 'comercio', comercio, 'resultado', resultado)
  from atajo_log where user_id = privado.uid() and privado.uid() is not null order by id desc limit 1 $$;
revoke execute on function public.mi_ultimo_atajo() from public;
grant execute on function public.mi_ultimo_atajo() to anon, authenticated;
