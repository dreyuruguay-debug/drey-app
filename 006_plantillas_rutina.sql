-- Plantillas de rutina: el profe arma una rutina reutilizable una sola
-- vez (con sus ejercicios, series, reps, kg objetivo y descansos) y
-- después la usa como punto de partida para varios clientes, ajustando
-- lo que haga falta particular de cada uno en su propia rutina. Sigue
-- el mismo esquema que "rutinas" / "rutina_ejercicios" (002), pero sin
-- estar atada a ningún cliente.

create table if not exists public.plantillas (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  patron text,
  musculos text,
  creado_en timestamptz not null default now()
);

alter table public.plantillas enable row level security;

create policy "plantillas: solo el profe las ve"
  on public.plantillas for select
  to authenticated
  using (public.es_profe());

create policy "plantillas: solo el profe las crea"
  on public.plantillas for insert
  to authenticated
  with check (public.es_profe());

create policy "plantillas: solo el profe las edita"
  on public.plantillas for update
  to authenticated
  using (public.es_profe())
  with check (public.es_profe());

create policy "plantillas: solo el profe las borra"
  on public.plantillas for delete
  to authenticated
  using (public.es_profe());

create table if not exists public.plantilla_ejercicios (
  id uuid primary key default gen_random_uuid(),
  plantilla_id uuid not null references public.plantillas(id) on delete cascade,
  ejercicio_id uuid not null references public.ejercicios(id) on delete cascade,
  orden int not null default 0,
  series int not null default 4,
  reps_objetivo text,
  kg_objetivo numeric,
  descansos jsonb not null default '[30, 60, 90, 120]'::jsonb
);

alter table public.plantilla_ejercicios enable row level security;

create policy "plantilla_ejercicios: solo el profe los ve"
  on public.plantilla_ejercicios for select
  to authenticated
  using (public.es_profe());

create policy "plantilla_ejercicios: solo el profe los crea"
  on public.plantilla_ejercicios for insert
  to authenticated
  with check (public.es_profe());

create policy "plantilla_ejercicios: solo el profe los edita"
  on public.plantilla_ejercicios for update
  to authenticated
  using (public.es_profe())
  with check (public.es_profe());

create policy "plantilla_ejercicios: solo el profe los borra"
  on public.plantilla_ejercicios for delete
  to authenticated
  using (public.es_profe());
