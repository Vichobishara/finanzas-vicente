-- Presupuesto por persona: si el mes no tiene fila en `presupuestos`, usa perfil.ppto (bienvenida),
-- luego el último mes guardado y recién ahí $1.000.000. Antes todas las cuentas caían a 1M en meses nuevos.
create or replace function privado.ppto_de(per text) returns int language sql stable set search_path = public as $$
  select coalesce((select monto from presupuestos where periodo = per),
    (select (valor->>'ppto')::int from ajustes where clave = 'perfil' and valor ? 'ppto'),
    (select monto from presupuestos where periodo < per order by periodo desc limit 1), 1000000) $$;
grant execute on function privado.ppto_de(text) to finanzas_calc;
-- estado_mes, avisos_programados y aviso_sueldo se reemplazaron para usar privado.ppto_de(...) en vez de
-- coalesce((select monto from presupuestos where periodo = ...), 1000000). Siguen con owner finanzas_calc (respetan RLS).
