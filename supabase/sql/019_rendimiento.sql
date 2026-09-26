-- 019 · Rendimiento: que la app siga rápida con muchos clientes
-- ----------------------------------------------------------------------
-- Se puede correr las veces que haga falta (no borra ni cambia datos).
--
-- 1) Índices: son como el índice de un libro. Sin ellos, para encontrar
--    los entrenamientos de un cliente la base lee la tabla entera; con
--    ellos va directo. Con pocos datos no se nota; con miles de
--    entrenamientos, sí.
-- 2) Función "actividad_clientes": en vez de mandarle a la app TODOS los
--    entrenamientos de todos los clientes para saber cuándo entrenó cada
--    uno por última vez, la base hace la cuenta y manda una fila por
--    cliente. La usan el Inicio del profe, Clientes y los resúmenes de
--    4 semanas. Respeta las mismas reglas de acceso (cada profe ve solo
--    a sus clientes).

-- 1) Índices -------------------------------------------------------------
create index if not exists sesiones_cliente_fecha_idx
  on public.sesiones (cliente_id, fecha);
create index if not exists sesiones_cliente_creado_idx
  on public.sesiones (cliente_id, creado_en);
create index if not exists rutinas_cliente_idx
  on public.rutinas (cliente_id, orden);
create index if not exists rutina_ejercicios_rutina_idx
  on public.rutina_ejercicios (rutina_id, orden);
create index if not exists rutina_ejercicios_ejercicio_idx
  on public.rutina_ejercicios (ejercicio_id);
create index if not exists calendario_cliente_rutina_idx
  on public.calendario_cliente (rutina_id);
create index if not exists resumenes_progreso_estado_idx
  on public.resumenes_progreso (estado, cliente_id);
create index if not exists perfiles_estado_idx
  on public.perfiles (es_profe, estado);

-- 2) Actividad de cada cliente -------------------------------------------
-- Por cliente: fecha del primer y del último entrenamiento, y en qué
-- ciclos de 4 semanas (contados desde el primero) entrenó al menos una
-- vez. "security invoker": corre con los permisos de quien la llama, así
-- que solo cuenta los entrenamientos que esa persona ya puede ver.
create or replace function public.actividad_clientes()
returns table (cliente_id uuid, primera date, ultima date, ciclos int[])
language sql
stable
security invoker
set search_path = public
as $$
  with base as (
    select s.cliente_id,
           s.fecha,
           min(s.fecha) over (partition by s.cliente_id) as primera
    from public.sesiones s
  )
  select base.cliente_id,
         min(base.primera) as primera,
         max(base.fecha) as ultima,
         array_agg(distinct ((base.fecha - base.primera) / 28 + 1)::int) as ciclos
  from base
  group by base.cliente_id;
$$;

revoke all on function public.actividad_clientes() from public;
grant execute on function public.actividad_clientes() to authenticated;
