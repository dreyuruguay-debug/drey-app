-- 044 · El dueño del gimnasio pasa alumnos de un profe a otro, y el
--       tablero con las últimas 8 semanas (noviembre 2026)
--
-- 1) El problema: el dueño de un gimnasio no podía pasar alumnos a los
--    profes que se sumaron al gimnasio con el código (membresías, SQL
--    033). La base solo dejaba pasarlos a los profes anotados de la forma
--    vieja (perfiles.gimnasio_id). Al intentarlo, el alumno quedaba con
--    el profe de antes y la app avisaba "no se pudo pasar".
--    Qué cambia: también puede pasarlo a cualquier profe con membresía
--    activa en el espacio del alumno, si el que lo pasa es el dueño de
--    ese espacio. Todo lo demás de la protección queda igual.
--
-- 2) Nuevo: tablero_semanas. Para la gráfica del tablero del dueño: por
--    cada una de las últimas N semanas (8 por defecto), cuántos alumnos
--    distintos del gimnasio entrenaron y cuántos entrenamientos hubo. Solo
--    lo ve el dueño del espacio (o el Admin), igual que el tablero.
--
-- Se puede correr antes o después de subir la app (si la app nueva no lo
-- encuentra, no muestra la gráfica y nada más).
-- Se puede correr más de una vez sin romper nada.

-- 1) ¿El profe trabaja en el espacio del alumno y yo soy el dueño? ------------------
create or replace function public.profe_de_mi_espacio(p_espacio uuid, p_profe uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_espacio is not null
    and exists (
      select 1 from public.membresias yo
      where yo.espacio_id = p_espacio
        and yo.perfil_id = auth.uid()
        and yo.rol = 'dueno'
        and yo.estado = 'activa'
    )
    and exists (
      select 1 from public.membresias m
      join public.perfiles p on p.id = m.perfil_id
      where m.espacio_id = p_espacio
        and m.perfil_id = p_profe
        and m.estado = 'activa'
        and coalesce(p.es_profe, false)
    );
$$;

revoke all on function public.profe_de_mi_espacio(uuid, uuid) from public, anon;
grant execute on function public.profe_de_mi_espacio(uuid, uuid) to authenticated;

-- La protección de los perfiles, igual que antes salvo la línea del
-- profe de mi espacio (ver arriba).
create or replace function public.proteger_campos_de_perfil()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profe boolean := false;
  v_admin boolean := false;
begin
  if auth.uid() is null or coalesce(current_setting('drey.sistema', true), '') = 'on' then
    return new;
  end if;

  select coalesce(es_profe, false), coalesce(es_admin, false)
  into v_profe, v_admin
  from public.perfiles
  where id = auth.uid();

  if not v_admin then
    new.es_profe := old.es_profe;
    new.es_admin := old.es_admin;
  end if;

  new.terminos_version := old.terminos_version;
  new.terminos_aceptados_en := old.terminos_aceptados_en;
  new.consentimiento_salud_en := old.consentimiento_salud_en;
  new.baja_solicitada_en := old.baja_solicitada_en;

  -- El Admin le quita el permiso de profe a alguien.
  if coalesce(old.es_profe, false) and not coalesce(new.es_profe, false) then
    if exists (select 1 from public.perfiles c where c.profe_id = old.id) then
      raise exception 'Primero pasá sus clientes a otro profe';
    end if;
    update public.gimnasios set dueno_id = null where dueno_id = old.id;
  end if;

  -- El profe asignado tiene que ser una cuenta de profe.
  if new.profe_id is distinct from old.profe_id
     and new.profe_id is not null
     and not exists (select 1 from public.perfiles p where p.id = new.profe_id and p.es_profe) then
    raise exception 'Esa cuenta no es de un profe';
  end if;

  if old.id = auth.uid() then
    if not v_admin then
      new.estado := old.estado;
      new.vencimiento := old.vencimiento;
      new.plan := old.plan;
      new.profe_id := old.profe_id;
      if not v_profe then
        new.gimnasio_id := old.gimnasio_id;
      end if;
    end if;
    return new;
  end if;

  if v_profe and not v_admin then
    if new.profe_id is distinct from old.profe_id
       and new.profe_id is distinct from auth.uid()
       and not public.profe_de_mis_gimnasios(new.profe_id)
       and not public.profe_de_mi_espacio(new.espacio_id, new.profe_id) then
      new.profe_id := old.profe_id;
    end if;
    if coalesce(old.es_profe, false) then
      new.gimnasio_id := old.gimnasio_id;
    end if;
  end if;

  -- Un cliente sin profe queda con el profe que lo atendió (el Admin no
  -- se asigna clientes: no es profe).
  if v_profe and new.profe_id is null
     and not coalesce(new.es_profe, false) and not coalesce(new.es_admin, false) then
    new.profe_id := auth.uid();
  end if;

  return new;
end;
$$;

-- 2) Las últimas semanas del gimnasio ------------------------------------------------
create or replace function public.tablero_semanas(p_espacio uuid, p_semanas int default 8)
returns json
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_semanas int := least(greatest(coalesce(p_semanas, 8), 1), 26);
  v_lunes date := date_trunc('week', public.hoy_uy())::date;
  v_desde date := v_lunes - (v_semanas - 1) * 7;
begin
  if not public.puede_cobrar(p_espacio) then
    raise exception 'Solo el dueño del espacio ve su tablero';
  end if;

  return coalesce((
    select json_agg(json_build_object(
      'semana', semanas.lunes,
      'alumnos', coalesce(datos.alumnos, 0),
      'entrenamientos', coalesce(datos.entrenamientos, 0)
    ) order by semanas.lunes)
    from (
      select (v_desde + n * 7) as lunes from generate_series(0, v_semanas - 1) as n
    ) semanas
    left join (
      select date_trunc('week', s.fecha)::date as lunes,
        count(distinct s.cliente_id) as alumnos,
        count(*) as entrenamientos
      from public.sesiones s
      join public.perfiles p on p.id = s.cliente_id
      where p.espacio_id = p_espacio
        and s.fecha >= v_desde
      group by 1
    ) datos on datos.lunes = semanas.lunes
  ), '[]'::json);
end;
$$;

revoke all on function public.tablero_semanas(uuid, int) from public, anon;
grant execute on function public.tablero_semanas(uuid, int) to authenticated;
