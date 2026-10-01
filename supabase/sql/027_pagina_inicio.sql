-- 027 · Página de inicio editable desde el panel del Admin
-- ----------------------------------------------------------------------
-- La web ahora abre con una página de inicio (video de fondo, logo,
-- bienvenida, objetivo, misión, fundador, planes, preguntas...). Todo lo
-- que dice lo cambia el Admin desde Ajustes → Portada, sin tocar código:
--
--   1) PAGINA_INICIO (tabla nueva, una sola fila):
--      · textos: los textos que escribió el Admin. Los que no escribió
--        usan el texto original que viene con la app.
--      · secciones: cuáles oculta ({"mision": false} = no se muestra).
--      · foto del fundador y los dos videos de fondo (si no hay, se usan
--        los que vienen con la app).
--   2) guardar_pagina_inicio(): guarda solo los textos y secciones que
--      cambiaron (mandar null en un texto lo vuelve al original).
--   3) Bucket "pagina-inicio": la foto y los videos que sube el Admin
--      (públicos; máximo 30 MB por archivo).
--   4) HISTORIAL: cada cambio queda anotado, como los de Ajustes (022).
--
-- Todos la pueden leer (es la página pública, se ve sin iniciar sesión).
-- Solo el Admin la cambia: lo controla la base, no la app.
--
-- Se puede correr más de una vez sin romper nada.

-- 1) Página de inicio ----------------------------------------------------------
create table if not exists public.pagina_inicio (
  id int primary key default 1 check (id = 1),
  textos jsonb not null default '{}'::jsonb
    check (jsonb_typeof(textos) = 'object' and pg_column_size(textos) < 60000),
  secciones jsonb not null default '{}'::jsonb
    check (jsonb_typeof(secciones) = 'object'),
  foto_fundador_url text,
  video_celular_url text,
  video_compu_url text,
  actualizado_en timestamptz not null default now()
);

insert into public.pagina_inicio (id) values (1) on conflict (id) do nothing;

alter table public.pagina_inicio enable row level security;

drop policy if exists "pagina_inicio: todos la leen" on public.pagina_inicio;
create policy "pagina_inicio: todos la leen"
  on public.pagina_inicio for select to anon, authenticated
  using (true);

drop policy if exists "pagina_inicio: solo el Admin la cambia" on public.pagina_inicio;
create policy "pagina_inicio: solo el Admin la cambia"
  on public.pagina_inicio for update to authenticated
  using (public.es_admin())
  with check (public.es_admin());

grant select on public.pagina_inicio to anon, authenticated;
grant update on public.pagina_inicio to authenticated;

-- Fecha del último cambio (la misma función que usa "ajustes", 022).
drop trigger if exists pagina_inicio_actualizada on public.pagina_inicio;
create trigger pagina_inicio_actualizada
  before update on public.pagina_inicio
  for each row execute function public.marcar_ajustes_actualizados();

-- 2) Guardar textos y secciones -----------------------------------------------
-- p_textos: {"objetivo.titulo": "Nuevo título", "mision.texto": null}
--   (null = volver al texto original).
-- p_secciones: {"mision": false} (true = se muestra, false = oculta).
create or replace function public.guardar_pagina_inicio(
  p_textos jsonb default '{}'::jsonb,
  p_secciones jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.es_admin() then
    raise exception 'Solo el Admin puede cambiar la página de inicio';
  end if;

  p_textos := coalesce(p_textos, '{}'::jsonb);
  p_secciones := coalesce(p_secciones, '{}'::jsonb);

  if jsonb_typeof(p_textos) <> 'object' or jsonb_typeof(p_secciones) <> 'object' then
    raise exception 'Formato inválido';
  end if;
  if exists (select 1 from jsonb_each(p_secciones) where jsonb_typeof(value) <> 'boolean') then
    raise exception 'Formato inválido';
  end if;

  insert into public.pagina_inicio (id) values (1) on conflict (id) do nothing;

  update public.pagina_inicio
     set textos = jsonb_strip_nulls(textos || p_textos),
         secciones = secciones || p_secciones
   where id = 1;
end;
$$;

revoke all on function public.guardar_pagina_inicio(jsonb, jsonb) from public, anon;
grant execute on function public.guardar_pagina_inicio(jsonb, jsonb) to authenticated;

-- 3) Bucket de la foto y los videos -------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'pagina-inicio',
  'pagina-inicio',
  true,
  31457280, -- 30 MB
  array['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/webm']
)
on conflict (id) do update
  set public = true,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "pagina-inicio: el Admin los ve" on storage.objects;
create policy "pagina-inicio: el Admin los ve"
  on storage.objects for select to authenticated
  using (bucket_id = 'pagina-inicio' and public.es_admin());

drop policy if exists "pagina-inicio: el Admin sube" on storage.objects;
create policy "pagina-inicio: el Admin sube"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'pagina-inicio' and public.es_admin());

drop policy if exists "pagina-inicio: el Admin reemplaza" on storage.objects;
create policy "pagina-inicio: el Admin reemplaza"
  on storage.objects for update to authenticated
  using (bucket_id = 'pagina-inicio' and public.es_admin())
  with check (bucket_id = 'pagina-inicio' and public.es_admin());

drop policy if exists "pagina-inicio: el Admin borra" on storage.objects;
create policy "pagina-inicio: el Admin borra"
  on storage.objects for delete to authenticated
  using (bucket_id = 'pagina-inicio' and public.es_admin());

-- 4) Historial ----------------------------------------------------------------
-- Nombre de cada sección, para que el historial se entienda.
create or replace function public.nombre_seccion_inicio(p_id text)
returns text
language sql
immutable
as $$
  select case p_id
    when 'portada' then 'Portada'
    when 'objetivo' then 'Objetivo'
    when 'mision' then 'Misión'
    when 'como' then 'Cómo funciona'
    when 'fundador' then 'Fundador'
    when 'profes' then 'Profes'
    when 'planes' then 'Planes'
    when 'sumate' then 'Para profes y gimnasios'
    when 'preguntas' then 'Preguntas'
    when 'cierre' then 'Cierre'
    when 'contacto' then 'Contacto'
    else p_id
  end;
$$;

create or replace function public.historial_pagina_inicio()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cambios text[] := '{}';
  v_textos text;
  v_secciones text;
begin
  -- Textos: qué secciones cambiaron (la parte antes del punto de cada clave).
  select string_agg(distinct public.nombre_seccion_inicio(split_part(clave, '.', 1)), ', ')
    into v_textos
  from (
    select coalesce(n.key, o.key) as clave
    from jsonb_each(new.textos) n
    full join jsonb_each(old.textos) o on o.key = n.key
    where n.value is distinct from o.value
  ) cambiadas;
  if v_textos is not null then
    v_cambios := v_cambios || ('textos de ' || v_textos);
  end if;

  -- Secciones mostradas u ocultadas.
  select string_agg(
           case when coalesce((new.secciones ->> s.id)::boolean, true)
                then 'mostró ' else 'ocultó ' end || public.nombre_seccion_inicio(s.id),
           ', ')
    into v_secciones
  from (
    select key as id from jsonb_object_keys(new.secciones) as key
    union
    select key from jsonb_object_keys(old.secciones) as key
  ) s
  where coalesce((new.secciones ->> s.id)::boolean, true)
        is distinct from coalesce((old.secciones ->> s.id)::boolean, true);
  if v_secciones is not null then
    v_cambios := v_cambios || v_secciones;
  end if;

  if new.foto_fundador_url is distinct from old.foto_fundador_url then
    v_cambios := v_cambios || (case when new.foto_fundador_url is null
      then 'quitó la foto del fundador' else 'cambió la foto del fundador' end);
  end if;
  if new.video_celular_url is distinct from old.video_celular_url then
    v_cambios := v_cambios || (case when new.video_celular_url is null
      then 'volvió al video original del celular' else 'cambió el video del celular' end);
  end if;
  if new.video_compu_url is distinct from old.video_compu_url then
    v_cambios := v_cambios || (case when new.video_compu_url is null
      then 'volvió al video original de la compu' else 'cambió el video de la compu' end);
  end if;

  if array_length(v_cambios, 1) > 0 then
    perform public.anotar_historial('pagina', 'Página de inicio: ' || array_to_string(v_cambios, '; '));
  end if;
  return new;
end;
$$;

drop trigger if exists pagina_inicio_historial on public.pagina_inicio;
create trigger pagina_inicio_historial
  after update on public.pagina_inicio
  for each row execute function public.historial_pagina_inicio();
