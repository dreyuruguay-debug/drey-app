-- 012 · Qué pasa cuando vence el plan
--
-- Regla (la misma que muestra la app, ver src/data/vencimiento.js):
--   · Hasta el día del vencimiento: acceso normal. Los últimos días la
--     app le avisa al cliente que se le vence.
--   · Después del vencimiento hay DÍAS DE GRACIA (3): puede seguir
--     entrenando, con un aviso de que tiene que pagar.
--   · Pasados los días de gracia, la base de datos deja de mostrarle sus
--     rutinas hasta que pague (el profe confirma el pago o paga con
--     Mercado Pago). Su historial y sus datos NO se borran.
--
-- Para cambiar los días de gracia: cambiar el 3 de dias_de_gracia() acá
-- abajo y DIAS_DE_GRACIA en src/data/vencimiento.js.
--
-- Se puede correr más de una vez sin romper nada.

-- Fecha de hoy en Uruguay (el servidor de Supabase usa hora UTC).
create or replace function public.hoy_uy()
returns date
language sql
stable
as $$
  select (now() at time zone 'America/Montevideo')::date;
$$;

create or replace function public.dias_de_gracia()
returns int
language sql
immutable
as $$
  select 3;
$$;

-- true si esa persona puede ver sus rutinas hoy.
create or replace function public.acceso_vigente(p_usuario uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (
      select p.es_profe
        or (
          p.estado = 'activo'
          and (p.vencimiento is null or p.vencimiento + public.dias_de_gracia() >= public.hoy_uy())
        )
      from public.perfiles p
      where p.id = p_usuario
    ),
    false
  );
$$;

revoke all on function public.acceso_vigente(uuid) from public;
grant execute on function public.acceso_vigente(uuid) to authenticated;

-- Estado del acceso del usuario actual, para que la app muestre el
-- aviso que corresponde (lo usa el Inicio del cliente).
create or replace function public.mi_acceso()
returns json
language sql
stable
security definer
set search_path = public
as $$
  select json_build_object(
    'estado', p.estado,
    'vencimiento', p.vencimiento,
    'dias_de_gracia', public.dias_de_gracia(),
    'dias_para_vencer', case when p.vencimiento is null then null else p.vencimiento - public.hoy_uy() end,
    'acceso', public.acceso_vigente(p.id)
  )
  from public.perfiles p
  where p.id = auth.uid();
$$;

revoke all on function public.mi_acceso() from public;
grant execute on function public.mi_acceso() to authenticated;
