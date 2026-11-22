-- 038 · Valoración antropométrica y evaluación del año (noviembre 2026)
--
-- Qué agrega:
--   1. VALORACIÓN ANTROPOMÉTRICA (la que hace la nutricionista). En cada
--      medición, además del peso y el % de grasa que ya estaban:
--      % de masa muscular, grasa visceral y los 6 pliegues en milímetros
--      (tríceps, espalda, oblicuo, abdomen, muslo y pantorrilla). La suma
--      de pliegues la calcula la app. Se cargan a mano o desde Excel, con
--      la fecha que sea (también de hace tiempo).
--   2. EVALUACIÓN DEL AÑO: una evaluación general por alumno y por año,
--      que el profe revisa, comenta y publica para el alumno.
--
-- Hay que correrlo ANTES de subir la app nueva.
-- Se puede correr más de una vez sin romper nada.

-- 1) Valoración antropométrica -------------------------------------------------
alter table public.mediciones add column if not exists masa_muscular numeric
  check (masa_muscular is null or (masa_muscular >= 0 and masa_muscular <= 80));
alter table public.mediciones add column if not exists grasa_visceral numeric
  check (grasa_visceral is null or (grasa_visceral >= 0 and grasa_visceral <= 60));
alter table public.mediciones add column if not exists pl_triceps numeric
  check (pl_triceps is null or (pl_triceps >= 0 and pl_triceps <= 100));
alter table public.mediciones add column if not exists pl_espalda numeric
  check (pl_espalda is null or (pl_espalda >= 0 and pl_espalda <= 100));
alter table public.mediciones add column if not exists pl_oblicuo numeric
  check (pl_oblicuo is null or (pl_oblicuo >= 0 and pl_oblicuo <= 100));
alter table public.mediciones add column if not exists pl_abdomen numeric
  check (pl_abdomen is null or (pl_abdomen >= 0 and pl_abdomen <= 100));
alter table public.mediciones add column if not exists pl_muslo numeric
  check (pl_muslo is null or (pl_muslo >= 0 and pl_muslo <= 100));
alter table public.mediciones add column if not exists pl_pantorrilla numeric
  check (pl_pantorrilla is null or (pl_pantorrilla >= 0 and pl_pantorrilla <= 100));

-- 2) Evaluación del año ----------------------------------------------------------
-- Una por alumno y por año. "datos" es la foto de los números del año
-- (la arma la app: src/utils/evaluacionAnual.js). El alumno la ve recién
-- cuando el profe la publica.
create table if not exists public.evaluaciones_anuales (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.perfiles(id) on delete cascade,
  anio int not null check (anio between 2020 and 2100),
  datos jsonb not null default '{}'::jsonb,
  comentario_profe text,
  objetivos text,
  estado text not null default 'borrador' check (estado in ('borrador', 'publicado')),
  visto boolean not null default false,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  publicado_en timestamptz,
  unique (cliente_id, anio)
);

alter table public.evaluaciones_anuales enable row level security;

drop policy if exists "evaluaciones_anuales: el profe y el alumno la ven" on public.evaluaciones_anuales;
create policy "evaluaciones_anuales: el profe y el alumno la ven"
  on public.evaluaciones_anuales for select to authenticated
  using (
    public.puede_ver_cliente(cliente_id)
    or (cliente_id = auth.uid() and estado = 'publicado')
  );

drop policy if exists "evaluaciones_anuales: el profe la crea" on public.evaluaciones_anuales;
create policy "evaluaciones_anuales: el profe la crea"
  on public.evaluaciones_anuales for insert to authenticated
  with check (public.puede_ver_cliente(cliente_id));

drop policy if exists "evaluaciones_anuales: el profe la cambia" on public.evaluaciones_anuales;
create policy "evaluaciones_anuales: el profe la cambia"
  on public.evaluaciones_anuales for update to authenticated
  using (public.puede_ver_cliente(cliente_id))
  with check (public.puede_ver_cliente(cliente_id));

drop policy if exists "evaluaciones_anuales: el profe la borra" on public.evaluaciones_anuales;
create policy "evaluaciones_anuales: el profe la borra"
  on public.evaluaciones_anuales for delete to authenticated
  using (public.puede_ver_cliente(cliente_id));

revoke all on public.evaluaciones_anuales from anon;
grant select, insert, update, delete on public.evaluaciones_anuales to authenticated;

-- El alumno marca que ya la vio (no puede cambiar nada más).
create or replace function public.marcar_evaluacion_anual_vista(p_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.evaluaciones_anuales
  set visto = true
  where id = p_id and cliente_id = auth.uid() and estado = 'publicado';
$$;

revoke all on function public.marcar_evaluacion_anual_vista(uuid) from public, anon;
grant execute on function public.marcar_evaluacion_anual_vista(uuid) to authenticated;

-- Para que la app vea enseguida lo nuevo.
notify pgrst, 'reload schema';
