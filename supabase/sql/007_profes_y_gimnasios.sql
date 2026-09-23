-- 007 · Varios profes y gimnasios
--
-- Deja la base preparada para que DREY tenga más de un profe y más de
-- un gimnasio. Cada cliente queda asociado al profe o gimnasio que
-- eligió al registrarse. Mientras haya un solo profe, todo sigue
-- funcionando igual que antes.
--
-- Se puede correr más de una vez sin romper nada.

-- 1) Gimnasios ------------------------------------------------------------
create table if not exists public.gimnasios (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  activo boolean not null default true,
  creado_en timestamptz not null default now()
);

alter table public.gimnasios enable row level security;

drop policy if exists "gimnasios: se ven los activos" on public.gimnasios;
create policy "gimnasios: se ven los activos"
  on public.gimnasios for select
  to anon, authenticated
  using (activo or public.es_profe());

drop policy if exists "gimnasios: solo el profe los crea" on public.gimnasios;
create policy "gimnasios: solo el profe los crea"
  on public.gimnasios for insert
  to authenticated
  with check (public.es_profe());

drop policy if exists "gimnasios: solo el profe los edita" on public.gimnasios;
create policy "gimnasios: solo el profe los edita"
  on public.gimnasios for update
  to authenticated
  using (public.es_profe())
  with check (public.es_profe());

drop policy if exists "gimnasios: solo el profe los borra" on public.gimnasios;
create policy "gimnasios: solo el profe los borra"
  on public.gimnasios for delete
  to authenticated
  using (public.es_profe());

-- 2) A qué profe y gimnasio pertenece cada persona -------------------------
-- En un profe: gimnasio_id = dónde trabaja.
-- En un cliente: profe_id y/o gimnasio_id = lo que eligió al registrarse.
alter table public.perfiles
  add column if not exists gimnasio_id uuid references public.gimnasios(id) on delete set null;

alter table public.perfiles
  add column if not exists profe_id uuid references public.perfiles(id) on delete set null;

create index if not exists perfiles_profe_id_idx on public.perfiles (profe_id);
create index if not exists perfiles_gimnasio_id_idx on public.perfiles (gimnasio_id);

-- 3) Lista de opciones para "Elegí tu profe o gimnasio" --------------------
-- La persona todavía no inició sesión cuando se registra, así que no
-- puede leer la tabla de perfiles. Esta función le muestra solo lo
-- necesario (nombre del profe y de su gimnasio), nunca otros datos.
create or replace function public.opciones_de_profe()
returns table (tipo text, id uuid, nombre text, detalle text)
language sql
stable
security definer
set search_path = public
as $$
  select 'profe'::text,
         p.id,
         trim(coalesce(p.nombre, '') || ' ' || coalesce(p.apellido, '')),
         g.nombre
  from public.perfiles p
  left join public.gimnasios g on g.id = p.gimnasio_id
  where p.es_profe = true
  union all
  select 'gimnasio'::text, g.id, g.nombre, null::text
  from public.gimnasios g
  where g.activo = true
  order by 1 desc, 3;
$$;

revoke all on function public.opciones_de_profe() from public;
grant execute on function public.opciones_de_profe() to anon, authenticated;

-- 4) Guardar la elección del registro en el perfil -------------------------
-- El registro manda profe_id, gimnasio_id y aviso_pago junto con los
-- demás datos del usuario. Cuando se crea la fila en "perfiles", este
-- trigger los copia a sus columnas, verificando que el profe y el
-- gimnasio existan de verdad (así nadie puede asociarse a algo falso).
create or replace function public.asignar_profe_al_registrarse()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  meta jsonb;
  v_profe uuid;
  v_gimnasio uuid;
begin
  if coalesce(new.es_profe, false) then
    return new;
  end if;

  select raw_user_meta_data into meta from auth.users where id = new.id;
  if meta is null then
    return new;
  end if;

  begin
    v_profe := nullif(meta ->> 'profe_id', '')::uuid;
  exception when others then
    v_profe := null;
  end;

  begin
    v_gimnasio := nullif(meta ->> 'gimnasio_id', '')::uuid;
  exception when others then
    v_gimnasio := null;
  end;

  if v_profe is not null
     and exists (select 1 from public.perfiles where id = v_profe and es_profe = true) then
    new.profe_id := v_profe;
    -- El cliente queda también en el gimnasio donde trabaja su profe.
    new.gimnasio_id := (select gimnasio_id from public.perfiles where id = v_profe);
  elsif v_gimnasio is not null
     and exists (select 1 from public.gimnasios where id = v_gimnasio and activo = true) then
    new.gimnasio_id := v_gimnasio;
  end if;

  if (meta ->> 'aviso_pago') = 'true' then
    new.aviso_pago := true;
  end if;

  return new;
end;
$$;

drop trigger if exists perfiles_asignar_profe on public.perfiles;
create trigger perfiles_asignar_profe
  before insert on public.perfiles
  for each row execute function public.asignar_profe_al_registrarse();

-- 5) Clientes que ya existían ---------------------------------------------
-- Si hoy hay un solo profe, todos los clientes anteriores quedan
-- asociados a él.
update public.perfiles c
set profe_id = (select p.id from public.perfiles p where p.es_profe = true limit 1)
where coalesce(c.es_profe, false) = false
  and c.profe_id is null
  and (select count(*) from public.perfiles p where p.es_profe = true) = 1;
