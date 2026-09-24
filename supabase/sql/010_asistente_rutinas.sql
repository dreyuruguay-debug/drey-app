-- 010 · Asistente paso a paso para crear rutinas (versión Profe)
--
-- 1) Rutinas y plantillas suman:
--    - grupos_musculares: los grupos que se eligen en el paso 2
--      (Pecho, Hombros, Tríceps...). Sirven para recomendar ejercicios.
--    - calentamiento: el calentamiento previo general de la rutina, como
--      lista de actividades. Ej: [{"nombre":"Cinta","duracion":"10 min","items":[]},
--      {"nombre":"Movilidad","duracion":"","items":["Movilidad de hombros"]}]
--    - pausa_min / pausa_max: la pausa entre ejercicios o bloques (seg).
--    - vuelta_calma: la vuelta a la calma (opcional), con la misma forma
--      que el calentamiento.
-- 2) Solo las rutinas suman "publicada": una rutina que el profe todavía
--    está armando con el asistente queda en borrador (false) y el cliente
--    no la ve hasta que el profe toca "Guardar rutina". Las rutinas que
--    ya existen quedan publicadas (true), así nada cambia para los clientes.
-- 3) Cada ejercicio de una rutina (y de una plantilla) suma:
--    - descanso_min / descanso_max: el descanso como rango (60–90 s).
--    - calentamiento: sus series de calentamiento, o vacío si no tiene.
--      Ej: {"series": 2, "detalle": "2 × 10 con 40 kg"}
--
-- Se puede correr más de una vez sin romper nada.

alter table public.rutinas add column if not exists grupos_musculares text[] not null default '{}';
alter table public.rutinas add column if not exists calentamiento jsonb not null default '[]'::jsonb;
alter table public.rutinas add column if not exists pausa_min int;
alter table public.rutinas add column if not exists pausa_max int;
alter table public.rutinas add column if not exists vuelta_calma jsonb not null default '[]'::jsonb;
alter table public.rutinas add column if not exists publicada boolean not null default true;

alter table public.plantillas add column if not exists grupos_musculares text[] not null default '{}';
alter table public.plantillas add column if not exists calentamiento jsonb not null default '[]'::jsonb;
alter table public.plantillas add column if not exists pausa_min int;
alter table public.plantillas add column if not exists pausa_max int;
alter table public.plantillas add column if not exists vuelta_calma jsonb not null default '[]'::jsonb;

alter table public.rutina_ejercicios add column if not exists descanso_min int;
alter table public.rutina_ejercicios add column if not exists descanso_max int;
alter table public.rutina_ejercicios add column if not exists calentamiento jsonb;

alter table public.plantilla_ejercicios add column if not exists descanso_min int;
alter table public.plantilla_ejercicios add column if not exists descanso_max int;
alter table public.plantilla_ejercicios add column if not exists calentamiento jsonb;

-- El cliente solo ve sus rutinas ya guardadas (publicadas); el profe ve
-- todas, también las que está armando. Como los ejercicios de una rutina
-- se ven solo si se ve la rutina, esto también los oculta.
drop policy if exists "rutinas: el dueño o el profe pueden ver" on public.rutinas;
create policy "rutinas: el dueño o el profe pueden ver"
  on public.rutinas for select
  to authenticated
  using (public.es_profe() or (auth.uid() = cliente_id and publicada));
