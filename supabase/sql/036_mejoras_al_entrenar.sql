-- 036 · Mejoras al entrenar (noviembre 2026)
--
-- Qué agrega:
--   1. Ejercicios por tiempo (plancha: 3 series de 6 segundos). Cada
--      ejercicio de una rutina o plantilla puede ir "por tiempo": las
--      repeticiones pasan a ser segundos y el alumno tiene un cronómetro.
--   2. Cuánto duró cada entrenamiento (para el récord de "rutina completa
--      en menos tiempo").
--   3. Borrar un entrenamiento guardado sin querer: el alumno borra los
--      suyos, y su profe o el Admin los de sus alumnos.
--
-- Hay que correrlo ANTES de subir la app nueva.
-- Se puede correr más de una vez sin romper nada.

-- 1) Ejercicios por tiempo ----------------------------------------------------
-- false = por repeticiones (como siempre). true = "reps_objetivo" y las
-- repeticiones de cada serie son segundos.
alter table public.rutina_ejercicios
  add column if not exists por_tiempo boolean not null default false;
alter table public.plantilla_ejercicios
  add column if not exists por_tiempo boolean not null default false;

-- 2) Duración del entrenamiento ----------------------------------------------
-- En segundos, sin contar las pausas. Vacío en los entrenamientos de antes.
alter table public.sesiones
  add column if not exists duracion_seg int
  check (duracion_seg is null or duracion_seg >= 0);

-- Al corregir un entrenamiento solo cambia "detalle" (ver SQL 029): la
-- duración tampoco se puede tocar.
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
    new.duracion_seg := old.duracion_seg;
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

-- 3) Borrar un entrenamiento --------------------------------------------------
drop policy if exists "sesiones: el cliente o su profe las borran" on public.sesiones;
create policy "sesiones: el cliente o su profe las borran"
  on public.sesiones for delete to authenticated
  using (cliente_id = auth.uid() or public.puede_ver_cliente(cliente_id));

grant delete on public.sesiones to authenticated;

-- Si el entrenamiento borrado estaba dentro de una evaluación en borrador,
-- se marca "desactualizada": la app la recalcula sola al abrirla, sin
-- perder las notas del profe (igual que al corregir: SQL 031). Las ya
-- publicadas no se tocan.
create or replace function public.rehacer_resumen_al_borrar()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if to_regclass('public.resumenes_progreso') is not null then
    update public.resumenes_progreso
    set datos = coalesce(datos, '{}'::jsonb) || '{"desactualizado": true}'::jsonb
    where cliente_id = old.cliente_id
      and estado = 'borrador'
      and old.fecha between desde and hasta;
  end if;
  return null;
end;
$$;

revoke all on function public.rehacer_resumen_al_borrar() from public;

drop trigger if exists sesiones_rehacer_resumen_al_borrar on public.sesiones;
create trigger sesiones_rehacer_resumen_al_borrar
  after delete on public.sesiones
  for each row execute function public.rehacer_resumen_al_borrar();

-- Para que la app vea enseguida las columnas nuevas.
notify pgrst, 'reload schema';
