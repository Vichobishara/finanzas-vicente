-- ✅ Aplicado en finanzas-vicho el 30-09-2026 (migraciones `domingo_abre_revision` + `domingo_texto_revision`).
-- El aviso del domingo 20:00 (privado.avisos_extra) abre la revisión de la semana en la app: privado.push(..., '/?revision').
-- Cuerpo: "... Toca para cerrar la semana en 2 minutos." (antes: "Mañana te digo cuánto tienes para la semana.").
do $$ declare src text; begin
  select pg_get_functiondef('privado.avisos_extra(timestamp)'::regprocedure) into src;
  src := replace(src, 'Mañana te digo cuánto tienes para la semana.', 'Toca para cerrar la semana en 2 minutos.');
  src := replace(src, '''domingo-'' || hoy);', '''domingo-'' || hoy, ''/?revision'');');
  execute src;
end $$;
