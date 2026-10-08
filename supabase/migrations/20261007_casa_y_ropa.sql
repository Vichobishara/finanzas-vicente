-- Categorías nuevas: Casa (lo de independizarse: electrodomésticos, muebles, cosas del hogar) y Ropa.
-- Antes todo eso caía en "Compras y tech" y el semáforo de tech se veía rojo por un lavavajillas.
-- crear_cuenta copia las categorías de la cuenta legado, así que las cuentas nuevas también las reciben.

insert into public.categorias (user_id, clave, nombre, techo, color)
select c.id, k.clave, k.nombre, k.techo, k.color
from public.cuentas c
cross join (values ('casa', 'Casa', 100000, '#0E9384'), ('ropa', 'Ropa', 50000, '#DD2590')) as k(clave, nombre, techo, color)
where not exists (select 1 from public.categorias x where x.user_id = c.id and x.clave = k.clave);

-- Reglas comunes (user_id null = para todos). El trigger gastos_auto usa la palabra más larga que calce.
insert into public.reglas_categoria (palabra, categoria_clave, negocio, user_id)
select p, cat, false, null
from (values
  ('lavavajilla','casa'),('lavadora','casa'),('secadora','casa'),('refrigerador','casa'),('microondas','casa'),
  ('tendedero','casa'),('plancha a vapor','casa'),('aspiradora','casa'),('colchon','casa'),('colchón','casa'),
  ('sodimac','casa'),('homecenter','casa'),('easy ','casa'),('ikea','casa'),('casa ideas','casa'),('casaideas','casa'),
  ('muebles','casa'),('rosen','casa'),('cic ','casa'),
  ('froens','ropa'),('zara','ropa'),('h&m','ropa'),('uniqlo','ropa'),('cinturon','ropa'),('cinturón','ropa'),
  ('camisa','ropa'),('polera','ropa'),('pantalon','ropa'),('pantalón','ropa'),('zapatilla','ropa'),('chaqueta','ropa'),
  ('sweater','ropa'),('poleron','ropa'),('polerón','ropa')
) as r(p, cat)
where not exists (select 1 from public.reglas_categoria x where x.user_id is null and lower(x.palabra) = lower(r.p));

-- Reglas personales que la app aprendió a la mala (no existía Ropa, así que se eligió tech).
update public.reglas_categoria set categoria_clave = 'ropa'
where user_id is not null and lower(palabra) in ('camisas','cinturón','cinturon','froens') and categoria_clave = 'tech';
