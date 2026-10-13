-- Resumen en Markdown para el vault "cerebro-vicho" (Obsidian): 03 Áreas/Finanzas - cómo voy.md
-- Lo llama una rutina de Claude a las 8:00 y 18:00 (Santiago) con execute_sql y sube el texto tal cual al repo.
-- Solo la cuenta legado (Vicho). Esquema privado: no expuesto por la API; sin grants a anon/authenticated.

create or replace function privado.finanzas_md(p_ahora timestamptz default now())
returns text language plpgsql stable set search_path to 'public' as $$
declare
  u uuid := (select id from cuentas where legado limit 1);
  ahora timestamp := p_ahora at time zone 'America/Santiago';
  hoy date := ahora::date;
  d date; per text; cierre date; ini date; dias int;
  ppto int; cuo int; gast int; ghoy int; queda int; cupo numeric; basico int;
  r record; md text; t text; n int; tot bigint; p jsonb;
  mes text[] := array['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
begin
  d := case when extract(day from hoy) > 22 then (hoy + interval '1 month')::date else hoy end;
  per := to_char(d, 'YYYY-MM');
  cierre := make_date(extract(year from d)::int, extract(month from d)::int, 22);
  ini := (cierre - interval '1 month')::date + 1;
  dias := greatest(1, cierre - hoy + 1);
  ppto := coalesce((select monto from presupuestos where user_id = u and periodo = per),
                   (select (valor->>'ppto')::int from ajustes where user_id = u and clave = 'perfil' and valor ? 'ppto'),
                   (select monto from presupuestos where user_id = u and periodo < per order by periodo desc limit 1), 1000000);
  cuo := (select coalesce(sum(monto_cuota), 0)::int from cuotas where user_id = u and activa and (recurrente or (primer_periodo is not null and
          ((left(per,4)::int - left(primer_periodo,4)::int) * 12 + right(per,2)::int - right(primer_periodo,2)::int + 1) between 1 and total_cuotas)));
  select coalesce(sum(monto), 0), coalesce(sum(monto) filter (where fecha = hoy), 0) into gast, ghoy
    from gastos where user_id = u and periodo = per and not coalesce(pulldex, false) and coalesce(estado, 'ok') = 'ok';
  queda := ppto - cuo - gast;
  cupo := (queda + ghoy)::numeric / dias;
  basico := round(((select coalesce(sum(techo), 280000) from categorias where user_id = u and clave in ('comida','transporte'))::numeric / 30 / 500)) * 500;

  md := format(E'---\ntags: [plata, finanzas, auto]\nactualizado: %s\n---\n# Finanzas: cómo voy\n\n', to_char(ahora, 'YYYY-MM-DD HH24:MI'))
     || E'Lo escribe solo una rutina de Claude a las 8:00 y 18:00, desde la app [[Finanzas Vicho]] (Supabase `finanzas-vicho`). **No editar a mano**: se sobrescribe. ⚠️ Sensible, igual que [[Plata]].\n\n'
     || format(E'## Este mes (%s %s – 22 %s · quedan %s días)\n\n', extract(day from ini), left(mes[extract(month from ini)::int], 3), left(mes[extract(month from cierre)::int], 3), dias)
     || E'| | |\n|---|---|\n'
     || format(E'| Presupuesto del mes | %s |\n', privado.clp(ppto))
     || format(E'| Cuotas y fijos | %s (%s%% del presupuesto) |\n', privado.clp(cuo), round(cuo * 100.0 / greatest(ppto, 1)))
     || format(E'| Gastado día a día | %s |\n', privado.clp(gast))
     || format(E'| %s | **%s** %s |\n', case when queda >= 0 then 'Te queda hasta el 22' else 'Te pasaste del mes' end, privado.clp(abs(queda)), case when queda >= 0 then '🟢' else '🔴' end)
     || format(E'| Hoy puede gastar | %s |\n', case when queda < 0 then 'Solo lo básico: ' || privado.clp(basico) || ' al día (súper y metro)'
                                                 when cupo - ghoy < 0 then 'Nada más hoy (se pasó por ' || privado.clp(round(ghoy - cupo)::int) || ')'
                                                 else privado.clp(round(cupo - ghoy)::int) end)
     || format(E'| Gastado hoy | %s |\n\n', privado.clp(ghoy));

  -- Categorías
  md := md || E'## Por categoría\n\n| Categoría | Gastado | Tope | |\n|---|---:|---:|---|\n';
  for r in select coalesce(c.nombre, g.categoria_clave) nom, sum(g.monto)::int s, coalesce(c.techo, 0) techo
             from gastos g left join categorias c on c.user_id = u and c.clave = g.categoria_clave
            where g.user_id = u and g.periodo = per and not coalesce(g.pulldex, false) and coalesce(g.estado, 'ok') = 'ok' and g.monto > 0
            group by 1, 3 order by 2 desc loop
    md := md || format(E'| %s | %s | %s | %s |\n', r.nom, privado.clp(r.s), case when r.techo > 0 then privado.clp(r.techo) else '—' end,
            case when r.techo = 0 then '' when r.s > r.techo then '🔴 +' || privado.clp(r.s - r.techo) when r.s > r.techo * .8 then '🟡' else '🟢' end);
  end loop;

  -- Cuotas
  md := md || E'\n## Cuotas y fijos de este mes\n\n| Qué | Al mes | Cuota | Termina |\n|---|---:|---|---|\n';
  tot := 0;
  for r in select nombre, monto_cuota, recurrente, total_cuotas, primer_periodo,
                  case when recurrente then null else (left(per,4)::int - left(primer_periodo,4)::int) * 12 + right(per,2)::int - right(primer_periodo,2)::int + 1 end k
             from cuotas where user_id = u and activa and (recurrente or (primer_periodo is not null and
                  ((left(per,4)::int - left(primer_periodo,4)::int) * 12 + right(per,2)::int - right(primer_periodo,2)::int + 1) between 1 and total_cuotas))
            order by recurrente, monto_cuota desc loop
    t := case when r.recurrente then 'todos los meses' else to_char((r.primer_periodo || '-01')::date + make_interval(months => r.total_cuotas - 1), 'MM-YYYY') end;
    md := md || format(E'| %s | %s | %s | %s |\n', replace(r.nombre, '|', '/'), privado.clp(r.monto_cuota),
            case when r.recurrente then 'fijo' else r.k || ' de ' || r.total_cuotas end, t);
    if not r.recurrente then tot := tot + r.monto_cuota::bigint * (r.total_cuotas - r.k); end if;
  end loop;
  md := md || format(E'\nFalta pagar en cuotas después de este mes: **%s**.\n', privado.clp(tot::int));

  -- Deudas y por cobrar
  select valor into p from ajustes where user_id = u and clave = 'deudas';
  if p is not null and jsonb_typeof(p) = 'array' and jsonb_array_length(p) > 0 then
    md := md || E'\n## Por pagar (no son cuotas)\n\n';
    for r in select x->>'que' que, (x->>'monto')::int monto from jsonb_array_elements(p) x loop
      md := md || format(E'- %s: %s\n', r.que, privado.clp(r.monto));
    end loop;
  end if;
  select valor into p from ajustes where user_id = u and clave = 'cobrar';
  if p is not null and jsonb_typeof(p) = 'array' and jsonb_array_length(p) > 0 then
    md := md || E'\n## Por cobrar\n\n';
    for r in select x->>'que' que, (x->>'monto')::int monto from jsonb_array_elements(p) x loop
      md := md || format(E'- %s: %s\n', r.que, privado.clp(r.monto));
    end loop;
  end if;

  -- Patrimonio
  select valor into p from ajustes where user_id = u and clave = 'patrimonio';
  if p is not null then
    md := md || format(E'\n## Patrimonio (al %s)\n\n| | |\n|---|---:|\n| Fintual | %s |\n| Colchón (dentro de Fintual) | %s |\n| Cartas | %s |\n| ETH | %s |\n| **Total** | **%s** |\n',
      coalesce(p->>'fecha', '?'), privado.clp(coalesce((p->>'fintual')::numeric, 0)::int), privado.clp(coalesce((p->>'colchon')::numeric, 0)::int),
      privado.clp(coalesce((p->>'cartas')::numeric, 0)::int), privado.clp(coalesce((p->>'eth')::numeric, 0)::int),
      privado.clp((coalesce((p->>'fintual')::numeric, 0) + coalesce((p->>'cartas')::numeric, 0) + coalesce((p->>'eth')::numeric, 0))::int));
  end if;
  select valor into p from ajustes where user_id = u and clave = 'fintual_pausa';
  if p is not null and (p->>'hasta')::date >= hoy then
    md := md || format(E'\n💳 Fintual en pausa hasta el %s: primero pagar tarjetas.\n', to_char((p->>'hasta')::date, 'DD-MM'));
  end if;

  -- Últimos gastos
  md := md || E'\n## Últimos 10 gastos\n\n| Fecha | Qué | Monto | Categoría | Con |\n|---|---|---:|---|---|\n';
  for r in select g.fecha, g.descripcion, g.monto, coalesce(c.nombre, g.categoria_clave) cat, g.tarjeta, g.pulldex
             from gastos g left join categorias c on c.user_id = u and c.clave = g.categoria_clave
            where g.user_id = u and coalesce(g.estado, 'ok') = 'ok' order by g.fecha desc, g.id desc limit 10 loop
    md := md || format(E'| %s | %s | %s | %s | %s |\n', to_char(r.fecha, 'DD-MM'), replace(coalesce(r.descripcion, ''), '|', '/'),
            privado.clp(r.monto), r.cat || case when r.pulldex then ' (negocio)' else '' end, coalesce(r.tarjeta, ''));
  end loop;

  return md || E'\n---\n↑ Parte de [[Plata]] · App: https://finanzas-vicente.vercel.app\n';
end $$;

create or replace function privado.clp(x int) returns text language sql immutable as $$
  select case when x < 0 then '-' else '' end || '$' || replace(to_char(abs(x), 'FM999,999,999,999'), ',', '.')
$$;

revoke all on function privado.finanzas_md(timestamptz) from public, anon, authenticated;
revoke all on function privado.clp(int) from public, anon, authenticated;

-- La GitHub Action de cerebro-vicho (.github/workflows/finanzas.yml) lo pide por REST con el código personal
-- (cuentas.token_atajo de la cuenta legado, guardado como secreto FINANZAS_TOKEN en GitHub).
create or replace function public.cerebro_md(token text)
returns text language plpgsql stable security definer set search_path to '' as $$
begin
  if token is null or length(token) < 10 or not exists (select 1 from public.cuentas c where c.legado and c.token_atajo = token) then
    return null;
  end if;
  return privado.finanzas_md();
end $$;
revoke all on function public.cerebro_md(text) from public;
grant execute on function public.cerebro_md(text) to anon;
