-- 017 · Planificación por semanas (ciclos) y peso sugerido
--
-- Una rutina (o plantilla) puede tener un CICLO de N semanas: por
-- ejemplo 4 semanas. Cada ejercicio puede tener su PROGRESIÓN semanal:
-- cuántos kg (o repeticiones) se suben por semana. Ej: sentadilla 60 kg
-- con +2,5 kg por semana → semana 1: 60, semana 2: 62,5, semana 3: 65,
-- semana 4: 67,5. La app le muestra al alumno el peso de la semana que
-- le toca y lo deja cargado para arrancar.
--
--   rutinas.ciclo_semanas   → cuántas semanas dura (null = sin ciclo)
--   rutinas.ciclo_inicio    → cuándo empezó (se pone solo al guardar la
--                             rutina; "Empezar ciclo nuevo" lo reinicia)
--   *_ejercicios.progresion → {"kg": 2.5, "reps": 1} (lo que sube por semana)
--
-- Se puede correr más de una vez sin romper nada.

alter table public.rutinas add column if not exists ciclo_semanas int
  check (ciclo_semanas is null or ciclo_semanas between 1 and 16);
alter table public.rutinas add column if not exists ciclo_inicio date;
alter table public.plantillas add column if not exists ciclo_semanas int
  check (ciclo_semanas is null or ciclo_semanas between 1 and 16);

alter table public.rutina_ejercicios add column if not exists progresion jsonb not null default '{}'::jsonb;
alter table public.plantilla_ejercicios add column if not exists progresion jsonb not null default '{}'::jsonb;
