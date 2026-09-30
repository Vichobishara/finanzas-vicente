-- ✅ Aplicado en finanzas-vicho el 30-09-2026 (migraciones `atajo_url_e_invitaciones` + `invitados_fix`).
-- rpc/atajo_url: link de iCloud del atajo para amigos (secretos.atajo_url), solo con clave válida.
-- rpc/es_admin, rpc/invitados, rpc/invitar(p_email, p_quitar): solo la cuenta legado (Vicho) maneja secretos.google_emails.
create or replace function public.atajo_url() returns text
language sql stable security definer set search_path = public as $$
  select valor from secretos where clave = 'atajo_url' and privado.uid() is not null $$;
create or replace function public.es_admin() returns boolean
language sql stable security definer set search_path = public as $$ select privado.uid() is not null and privado.uid() = privado.legado() $$;
create or replace function public.invitados() returns table (email text, entro boolean)
language plpgsql stable security definer set search_path = public as $$
BEGIN
  IF NOT public.es_admin() THEN RAISE EXCEPTION 'solo_admin'; END IF;
  RETURN QUERY
    SELECT q.e, EXISTS (SELECT 1 FROM cuentas c WHERE lower(c.email) = q.e)
    FROM (SELECT DISTINCT lower(trim(x)) e FROM secretos s, unnest(string_to_array(s.valor, ',')) x
          WHERE s.clave = 'google_emails' AND trim(x) <> '') q
    WHERE q.e <> (SELECT lower(c2.email) FROM cuentas c2 WHERE c2.legado)
    ORDER BY 1;
END $$;
create or replace function public.invitar(p_email text, p_quitar boolean default false) returns boolean
language plpgsql security definer set search_path = public as $$
DECLARE e text := lower(trim(p_email)); lista text[];
BEGIN
  IF NOT public.es_admin() THEN RAISE EXCEPTION 'solo_admin'; END IF;
  IF e !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN RAISE EXCEPTION 'correo'; END IF;
  SELECT coalesce(array_agg(DISTINCT lower(trim(x))) FILTER (WHERE trim(x) <> ''), '{}') INTO lista
    FROM secretos, unnest(string_to_array(valor, ',')) x WHERE clave = 'google_emails';
  IF p_quitar THEN lista := array_remove(lista, e); ELSIF NOT e = ANY(lista) THEN lista := lista || e; END IF;
  INSERT INTO secretos (clave, valor) VALUES ('google_emails', array_to_string(lista, ','))
    ON CONFLICT (clave) DO UPDATE SET valor = excluded.valor;
  RETURN true;
END $$;
revoke execute on function public.atajo_url(), public.es_admin(), public.invitados(), public.invitar(text, boolean) from public;
grant execute on function public.atajo_url(), public.es_admin(), public.invitados(), public.invitar(text, boolean) to anon, authenticated;
