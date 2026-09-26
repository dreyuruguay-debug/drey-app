-- Biblioteca de ejercicios, rutinas de cada cliente y su calendario
-- semanal. Usa la función public.es_profe() creada junto con la tabla
-- "perfiles" para que las políticas de acceso no repitan la consulta.

-- 1) Biblioteca de ejercicios (compartida entre todos los clientes)
create table if not exists public.ejercicios (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  grupo_muscular text not null,
  video_url text,
  creado_en timestamptz not null default now()
);

alter table public.ejercicios enable row level security;

create policy "ejercicios: cualquier usuario logueado puede ver"
  on public.ejercicios for select
  to authenticated
  using (true);

create policy "ejercicios: solo el profe los crea"
  on public.ejercicios for insert
  to authenticated
  with check (public.es_profe());

create policy "ejercicios: solo el profe los edita"
  on public.ejercicios for update
  to authenticated
  using (public.es_profe())
  with check (public.es_profe());

create policy "ejercicios: solo el profe los borra"
  on public.ejercicios for delete
  to authenticated
  using (public.es_profe());

-- 2) Rutinas (Rutina A, B, C...) de cada cliente
create table if not exists public.rutinas (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.perfiles(id) on delete cascade,
  nombre text not null,
  patron text,
  musculos text,
  orden int not null default 0,
  creado_en timestamptz not null default now()
);

alter table public.rutinas enable row level security;

create policy "rutinas: el dueño o el profe pueden ver"
  on public.rutinas for select
  to authenticated
  using (auth.uid() = cliente_id or public.es_profe());

create policy "rutinas: solo el profe las crea"
  on public.rutinas for insert
  to authenticated
  with check (public.es_profe());

create policy "rutinas: solo el profe las edita"
  on public.rutinas for update
  to authenticated
  using (public.es_profe())
  with check (public.es_profe());

create policy "rutinas: solo el profe las borra"
  on public.rutinas for delete
  to authenticated
  using (public.es_profe());

-- 3) Ejercicios dentro de cada rutina, con series/reps/peso objetivo
create table if not exists public.rutina_ejercicios (
  id uuid primary key default gen_random_uuid(),
  rutina_id uuid not null references public.rutinas(id) on delete cascade,
  ejercicio_id uuid not null references public.ejercicios(id) on delete cascade,
  orden int not null default 0,
  series int not null default 4,
  reps_objetivo text,
  kg_objetivo numeric,
  descansos jsonb not null default '[30, 60, 90, 120]'::jsonb
);

alter table public.rutina_ejercicios enable row level security;

create policy "rutina_ejercicios: el dueño de la rutina o el profe pueden ver"
  on public.rutina_ejercicios for select
  to authenticated
  using (
    public.es_profe()
    or exists (
      select 1 from public.rutinas r
      where r.id = rutina_id and r.cliente_id = auth.uid()
    )
  );

create policy "rutina_ejercicios: solo el profe los crea"
  on public.rutina_ejercicios for insert
  to authenticated
  with check (public.es_profe());

create policy "rutina_ejercicios: solo el profe los edita"
  on public.rutina_ejercicios for update
  to authenticated
  using (public.es_profe())
  with check (public.es_profe());

create policy "rutina_ejercicios: solo el profe los borra"
  on public.rutina_ejercicios for delete
  to authenticated
  using (public.es_profe());

-- 4) Calendario semanal: qué rutina le toca a cada cliente cada día
create table if not exists public.calendario_cliente (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.perfiles(id) on delete cascade,
  dia text not null,
  rutina_id uuid references public.rutinas(id) on delete set null,
  unique (cliente_id, dia)
);

alter table public.calendario_cliente enable row level security;

create policy "calendario_cliente: el dueño o el profe pueden ver"
  on public.calendario_cliente for select
  to authenticated
  using (auth.uid() = cliente_id or public.es_profe());

create policy "calendario_cliente: solo el profe lo crea"
  on public.calendario_cliente for insert
  to authenticated
  with check (public.es_profe());

create policy "calendario_cliente: solo el profe lo edita"
  on public.calendario_cliente for update
  to authenticated
  using (public.es_profe())
  with check (public.es_profe());

create policy "calendario_cliente: solo el profe lo borra"
  on public.calendario_cliente for delete
  to authenticated
  using (public.es_profe());
