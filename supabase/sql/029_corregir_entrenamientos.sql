-- 029 · Corregir un entrenamiento ya guardado
-- ----------------------------------------------------------------------
-- Hasta ahora un entrenamiento guardado no se podía tocar: si el alumno
-- se equivocaba en un peso o en las repeticiones, quedaba mal para
-- siempre (y con él los récords y las gráficas).
--
-- Desde ahora el alumno puede corregir los suyos y el profe (o el Admin)
-- los de sus alumnos. Solo se corrige el peso y las repeticiones de las
-- series (la columna "detalle"): la fecha, la rutina, el esfuerzo y el
-- comentario no se pueden cambiar.
--
-- Qué hace este SQL:
--   1. Agrega a "sesiones" cuándo y quién corrigió (editado_en,
--      editado_por). Vacías = nunca se corrigió.
--   2. Da permiso para corregir: el alumno las suyas y su profe (los
--      mismos que ya las podían ver).
--   3. Cuida que solo cambie el detalle y anota la corrección.
--   4. Si el entrenamiento corregido es de un resumen de 4 semanas que
--      el profe todavía no publicó (borrador), borra ese borrador: la
--      app lo vuelve a armar sola con los números corregidos. Los
--      resúmenes ya publicados no se tocan.
--
-- Se puede correr más de una vez sin romper nada.

-- 1) Cuándo y quién corrigió --------------------------------------------------
alter table public.sesiones add column if not exists editado_en timestamptz;
alter table public.sesiones
  add column if not exists editado_por uuid references public.perfiles(id) on delete set null;

-- 2) Permiso para corregir ----------------------------------------------------
drop policy if exists "sesiones: el cliente o su profe las corrigen" on public.sesiones;
create policy "sesiones: el cliente o su profe las corrigen"
  on public.sesiones for update to authenticated
  using (cliente_id = auth.uid() or public.puede_ver_cliente(cliente_id))
  with check (cliente_id = auth.uid() or public.puede_ver_cliente(cliente_id));

grant update on public.sesiones to authenticated;

-- 3) Solo se corrige el detalle -----------------------------------------------
-- Desde la app solo cambia "detalle"; lo demás vuelve a como estaba.
-- No se frenan los cambios que hace la propia base (cuando se borra una
-- rutina o una cuenta, vacía sola rutina_id o editado_por) ni los que se
-- hacen desde el SQL Editor de Supabase (sin usuario).
create or replace function public.proteger_sesion_corregida()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if auth.uid() is not null and pg_trigger_depth() = 1 then
    new.id := old.id;
    new.cliente_id := old.cliente_id;
    new.rutina_id := old.rutina_id;
    new.fecha := old.fecha;
    new.esfuerzo := old.esfuerzo;
    new.comentario := old.comentario;
    new.creado_en := old.creado_en;
    new.editado_en := old.editado_en;
    new.editado_por := old.editado_por;
  end if;

  if new.detalle is distinct from old.detalle then
    new.editado_en := now();
    new.editado_por := auth.uid();
  end if;
  return new;
end;
$$;

drop trigger if exists sesiones_proteger_correccion on public.sesiones;
create trigger sesiones_proteger_correccion
  before update on public.sesiones
  for each row execute function public.proteger_sesion_corregida();

-- 4) El borrador del resumen se vuelve a armar --------------------------------
-- (El alumno no puede borrar resúmenes: por eso esta función corre con
-- los permisos de la base. Solo borra borradores de ese mismo alumno.)
create or replace function public.rehacer_resumen_al_corregir()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.detalle is distinct from old.detalle
     and to_regclass('public.resumenes_progreso') is not null then
    delete from public.resumenes_progreso
    where cliente_id = new.cliente_id
      and estado = 'borrador'
      and new.fecha between desde and hasta;
  end if;
  return null;
end;
$$;

revoke all on function public.rehacer_resumen_al_corregir() from public;

drop trigger if exists sesiones_rehacer_resumen on public.sesiones;
create trigger sesiones_rehacer_resumen
  after update of detalle on public.sesiones
  for each row execute function public.rehacer_resumen_al_corregir();
