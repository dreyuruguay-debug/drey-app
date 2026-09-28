-- 024 · Biblioteca protegida (mejora 21)
-- ----------------------------------------------------------------------
-- Antes, cualquier profe borraba un ejercicio con un toque y desaparecía
-- de TODAS las rutinas y plantillas de todos los clientes. Ahora:
--
--   1) ARCHIVAR en vez de borrar: un ejercicio archivado no aparece para
--      agregar a rutinas nuevas, pero sigue igual en las rutinas y
--      plantillas donde ya estaba. Se recupera cuando se quiera. Cualquier
--      profe puede archivar y recuperar (columna "archivado_en").
--   2) SOLO EL ADMIN BORRA, y solo un ejercicio que no está en ninguna
--      rutina ni plantilla. La base lo controla: si está en alguna, no se
--      puede borrar (hay que archivarlo).
--   3) EN CUÁNTAS RUTINAS SE USA: la función uso_de_ejercicio() cuenta
--      rutinas, clientes y plantillas de todos los profes, para que la
--      confirmación lo diga antes de archivar o borrar.
--   4) HISTORIAL: quién archiva, recupera o borra un ejercicio queda
--      anotado en el Historial de cambios del Admin (SQL 022).
--   5) LINKS DE VIDEO SEGUROS: tienen que empezar con https://. Los que ya
--      estaban cargados se arreglan solos cuando se puede ("http://" pasa
--      a "https://" y "youtu.be/..." a "https://youtu.be/...").
--
-- No borra ejercicios ni cambia rutinas. Se puede correr más de una vez
-- sin romper nada.

-- 1) Archivar ------------------------------------------------------------------
-- null = en uso; con fecha = archivado (desde esa fecha).
alter table public.ejercicios add column if not exists archivado_en timestamptz;

-- 2) Solo el Admin borra -------------------------------------------------------
drop policy if exists "ejercicios: solo el profe los borra" on public.ejercicios;
drop policy if exists "ejercicios: solo el Admin los borra" on public.ejercicios;
create policy "ejercicios: solo el Admin los borra"
  on public.ejercicios for delete
  to authenticated
  using (public.es_admin());

-- ...y solo si no está en ninguna rutina ni plantilla. Antes, borrarlo lo
-- sacaba de todas ("on delete cascade"); ahora la base no deja borrarlo
-- ("on delete restrict"). Se reemplaza la regla vieja por una con nombre
-- fijo, así correr este archivo de nuevo no duplica nada.
do $$
declare
  v_tabla text;
  v_regla text;
  v_nueva text;
begin
  foreach v_tabla in array array['rutina_ejercicios', 'plantilla_ejercicios'] loop
    if to_regclass('public.' || v_tabla) is null then
      continue;
    end if;
    v_nueva := v_tabla || '_ejercicio_protegido';

    for v_regla in
      select c.conname
      from pg_constraint c
      where c.conrelid = ('public.' || v_tabla)::regclass
        and c.contype = 'f'
        and c.confrelid = 'public.ejercicios'::regclass
        and c.conname <> v_nueva
    loop
      execute format('alter table public.%I drop constraint %I', v_tabla, v_regla);
    end loop;

    if not exists (
      select 1 from pg_constraint
      where conrelid = ('public.' || v_tabla)::regclass and conname = v_nueva
    ) then
      execute format(
        'alter table public.%I add constraint %I foreign key (ejercicio_id) '
        'references public.ejercicios(id) on delete restrict',
        v_tabla, v_nueva
      );
    end if;
  end loop;
end
$$;

-- 3) En cuántas rutinas se usa -------------------------------------------------
-- Cuenta en TODAS las rutinas y plantillas (un profe solo ve las de sus
-- clientes, pero archivar afecta a todos). Devuelve solo números, y solo
-- a un profe o al Admin.
create or replace function public.uso_de_ejercicio(p_ejercicio uuid)
returns json
language sql
stable
security definer
set search_path = public
as $$
  select case when public.es_profe() then json_build_object(
    'rutinas', (
      select count(distinct re.rutina_id)
      from public.rutina_ejercicios re
      where re.ejercicio_id = p_ejercicio
    ),
    'clientes', (
      select count(distinct r.cliente_id)
      from public.rutina_ejercicios re
      join public.rutinas r on r.id = re.rutina_id
      where re.ejercicio_id = p_ejercicio
    ),
    'plantillas', (
      select count(distinct pe.plantilla_id)
      from public.plantilla_ejercicios pe
      where pe.ejercicio_id = p_ejercicio
    )
  ) end;
$$;

revoke all on function public.uso_de_ejercicio(uuid) from public, anon;
grant execute on function public.uso_de_ejercicio(uuid) to authenticated;

-- 4) Historial -----------------------------------------------------------------
-- Anota quién archiva, recupera o borra un ejercicio desde la app (profe o
-- Admin). Lo que se hace desde el SQL Editor no se anota. La columna
-- "admin_id" del historial guarda quién lo hizo.
create or replace function public.historial_ejercicios()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_quien text;
  v_texto text;
begin
  if auth.uid() is null or to_regclass('public.historial_admin') is null then
    return null;
  end if;

  select case
      when coalesce(p.es_admin, false) then 'El Admin'
      else coalesce(nullif(trim(coalesce(p.nombre, '') || ' ' || coalesce(p.apellido, '')), ''), 'Un profe')
    end
  into v_quien
  from public.perfiles p
  where p.id = auth.uid();
  v_quien := coalesce(v_quien, 'Alguien');

  if tg_op = 'DELETE' then
    v_texto := v_quien || ' borró para siempre el ejercicio "' || old.nombre || '"';
  elsif old.archivado_en is null and new.archivado_en is not null then
    v_texto := v_quien || ' archivó el ejercicio "' || new.nombre || '"';
  elsif old.archivado_en is not null and new.archivado_en is null then
    v_texto := v_quien || ' recuperó el ejercicio "' || new.nombre || '"';
  else
    return null;
  end if;

  insert into public.historial_admin (admin_id, tipo, detalle)
  values (auth.uid(), 'biblioteca', v_texto);
  return null;
end;
$$;

revoke all on function public.historial_ejercicios() from public, anon, authenticated;

drop trigger if exists ejercicios_historial on public.ejercicios;
create trigger ejercicios_historial
  after update of archivado_en or delete on public.ejercicios
  for each row execute function public.historial_ejercicios();

-- 5) Links de video: solo https:// ---------------------------------------------
-- Primero se arreglan los que ya estaban (espacios, "http://", sin
-- "https://" adelante). La app hace lo mismo al guardar (utils/linkVideo.js).
update public.ejercicios
set video_url = nullif(btrim(video_url), '')
where video_url is not null and video_url is distinct from nullif(btrim(video_url), '');

update public.ejercicios
set video_url = 'https://' || substr(video_url, 8)
where video_url ~* '^http://';

update public.ejercicios
set video_url = 'https://' || video_url
where video_url !~* '^[a-z][a-z0-9+.-]*:'
  and video_url ~* '^(www\.)?[a-z0-9-]+(\.[a-z0-9-]+)+(/|$)';

-- Desde ahora la base no acepta otro tipo de link. Si quedara alguno viejo
-- que no se pudo arreglar (el resumen de abajo lo cuenta en
-- "videos_a_revisar"), sigue guardado y la app pide corregirlo al editar
-- ese ejercicio.
alter table public.ejercicios drop constraint if exists ejercicios_video_https;
alter table public.ejercicios add constraint ejercicios_video_https
  check (video_url is null or video_url ~* '^https://\S+$') not valid;

do $$
begin
  if not exists (
    select 1 from public.ejercicios
    where video_url is not null and video_url !~* '^https://\S+$'
  ) then
    alter table public.ejercicios validate constraint ejercicios_video_https;
  end if;
end
$$;

-- Resumen ----------------------------------------------------------------------
select
  (select count(*) from public.ejercicios where archivado_en is null) as ejercicios_en_uso,
  (select count(*) from public.ejercicios where archivado_en is not null) as archivados,
  (select count(*) from public.ejercicios
    where video_url is not null and video_url !~* '^https://\S+$') as videos_a_revisar;
