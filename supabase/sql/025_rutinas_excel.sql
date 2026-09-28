-- 025 · Rutinas en Excel: cada semana distinta, notas y tempo
--
-- El profe puede armar las rutinas en la planilla oficial de DREY
-- (Excel o Google Sheets), subirlas y volver a bajarlas. La planilla y
-- el editor de la app guardan exactamente lo mismo, así que cada
-- ejercicio de una rutina (y de una plantilla) suma:
--
--   semanas → lo que cambia en cada semana del ciclo, cuando no es
--             "sube lo mismo cada semana" (eso sigue en "progresion", 017).
--             La semana 1 son series / reps_objetivo / kg_objetivo de
--             siempre; acá van las semanas 2 en adelante, completas:
--             [{"semana": 2, "series": 3, "reps": "8", "kg": 75},
--              {"semana": 3, "series": 4, "reps": "8", "kg": 75}]
--             kg puede ser null (sin peso). [] = todas las semanas iguales.
--   notas  → indicaciones del profe para el alumno ("bajá lento").
--   tempo  → cadencia de cada repetición ("3-1-1-0").
--
-- No cambia nada de lo que ya existe: las rutinas de antes quedan con
-- semanas vacío y sin notas ni tempo.
-- Se puede correr más de una vez sin romper nada.

alter table public.rutina_ejercicios
  add column if not exists semanas jsonb not null default '[]'::jsonb
  check (jsonb_typeof(semanas) = 'array');
alter table public.rutina_ejercicios
  add column if not exists notas text
  check (notas is null or char_length(notas) <= 500);
alter table public.rutina_ejercicios
  add column if not exists tempo text
  check (tempo is null or char_length(tempo) <= 20);

alter table public.plantilla_ejercicios
  add column if not exists semanas jsonb not null default '[]'::jsonb
  check (jsonb_typeof(semanas) = 'array');
alter table public.plantilla_ejercicios
  add column if not exists notas text
  check (notas is null or char_length(notas) <= 500);
alter table public.plantilla_ejercicios
  add column if not exists tempo text
  check (tempo is null or char_length(tempo) <= 20);
