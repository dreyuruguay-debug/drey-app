-- 042 · Tablero del gimnasio (noviembre 2026)
--
-- Qué agrega (no cambia nada de lo que ya existe):
--   tablero_espacio(espacio): los números del tablero del dueño
--      (pages/ProfeTablero.jsx). Lo ve solo el dueño del espacio (o el
--      Admin), igual que resumen_espacio():
--        · cupos usados y libres;
--        · alumnos activos, cuántos entrenaron esta semana y cuántos se
--          sumaron este mes;
--        · los alumnos que DEJARON DE VENIR: activos que no entrenan hace
--          14 días o más (con su profe, su celular para escribirles y
--          cuántos días van);
--        · cada profe del espacio con sus alumnos activos, cuántos
--          entrenaron esta semana y cuántos dejaron de venir.
--
-- Se puede correr antes o después de subir la app.
-- Se puede correr más de una vez sin romper nada.

-- 1) Tablero del dueño --------------------------------------------------------------
create or replace function public.tablero_espacio(p_espacio uuid, p_dias_sin_venir int default 14)
returns json
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_hoy date := public.hoy_uy();
  v_dias int := greatest(coalesce(p_dias_sin_venir, 14), 1);
  v_lunes date := date_trunc('week', public.hoy_uy())::date;
  v_mes date := date_trunc('month', public.hoy_uy())::date;
begin
  if not public.puede_cobrar(p_espacio) then
    raise exception 'Solo el dueño del espacio ve su tablero';
  end if;

  return (
    with alumnos as (
      select p.id, p.nombre, p.apellido, p.celular, p.profe_id, p.creado_en,
        (select max(s.fecha) from public.sesiones s where s.cliente_id = p.id) as ultima,
        exists (
          select 1 from public.sesiones s where s.cliente_id = p.id and s.fecha >= v_lunes
        ) as entreno_semana
      from public.perfiles p
      where p.espacio_id = p_espacio
        and not coalesce(p.es_profe, false) and not coalesce(p.es_admin, false)
        and p.estado = 'activo'
        and (p.vencimiento is null or p.vencimiento + public.dias_de_gracia() >= v_hoy)
    ),
    marcados as (
      select a.*,
        (v_hoy - coalesce(a.ultima, a.creado_en::date)) as dias_sin_venir,
        coalesce(a.ultima, a.creado_en::date) <= v_hoy - v_dias as dejo_de_venir
      from alumnos a
    ),
    profes as (
      select m.perfil_id as id, m.rol, pr.nombre, pr.apellido
      from public.membresias m
      join public.perfiles pr on pr.id = m.perfil_id
      where m.espacio_id = p_espacio and m.estado = 'activa'
    )
    select json_build_object(
      'cupos_total', public.cupos_totales(p_espacio),
      'cupos_usados', public.cupos_usados(p_espacio),
      'activos', (select count(*) from marcados),
      'entrenaron_semana', (select count(*) from marcados where entreno_semana),
      'nuevos_mes', (select count(*) from marcados where creado_en::date >= v_mes),
      'dias_sin_venir', v_dias,
      'dejaron_de_venir', coalesce((
        select json_agg(json_build_object(
          'id', m.id,
          'nombre', m.nombre,
          'apellido', m.apellido,
          'celular', m.celular,
          'profe', trim(coalesce(pr.nombre, '') || ' ' || coalesce(pr.apellido, '')),
          'ultima', m.ultima,
          'dias', m.dias_sin_venir
        ) order by m.dias_sin_venir desc, m.nombre)
        from marcados m
        left join public.perfiles pr on pr.id = m.profe_id
        where m.dejo_de_venir
      ), '[]'::json),
      'profes', coalesce((
        select json_agg(fila order by (fila ->> 'activos')::int desc, fila ->> 'nombre')
        from (
          select json_build_object(
            'id', p.id,
            'nombre', trim(coalesce(p.nombre, '') || ' ' || coalesce(p.apellido, '')),
            'rol', p.rol,
            'activos', (select count(*) from marcados m where m.profe_id = p.id),
            'entrenaron_semana',
              (select count(*) from marcados m where m.profe_id = p.id and m.entreno_semana),
            'dejaron_de_venir',
              (select count(*) from marcados m where m.profe_id = p.id and m.dejo_de_venir)
          ) as fila
          from profes p
        ) filas
      ), '[]'::json),
      'sin_profe', (select count(*) from marcados where profe_id is null)
    )
  );
end;
$$;

revoke all on function public.tablero_espacio(uuid, int) from public, anon;
grant execute on function public.tablero_espacio(uuid, int) to authenticated;
