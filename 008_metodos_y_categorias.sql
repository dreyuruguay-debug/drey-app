-- 008 · Métodos de entrenamiento, bloques y categorías
--
-- 1) Cada ejercicio de una rutina (y de una plantilla) guarda:
--    - metodo: 'normal', 'biserie', 'triserie', 'giant_set', 'circuito',
--      'top_set', 'back_off', 'drop_set', 'rest_pause', 'myo_reps',
--      'amrap' o 'emom' (la lista y sus explicaciones están en
--      src/data/metodos.js).
--    - grupo: los ejercicios seguidos que comparten el mismo "grupo"
--      forman un bloque (por ejemplo, los 2 de una biserie).
--    - config: los datos propios del método (bajadas del drop set,
--      rondas del circuito, minutos del EMOM...).
--    - rpe: esfuerzo objetivo (por ejemplo "8"), además del kg.
-- 2) Rutinas y plantillas suman una descripción.
-- 3) La biblioteca de ejercicios pasa a 7 categorías (Empuje, Tracción,
--    Multiarticulares, Piernas, Zona media, Cardiorrespiratorio, Brazos)
--    y un ejercicio puede estar en más de una.
--
-- Las rutinas que ya existen no cambian: todos sus ejercicios quedan
-- como "serie normal". Se puede correr más de una vez sin romper nada.

alter table public.rutina_ejercicios add column if not exists metodo text not null default 'normal';
alter table public.rutina_ejercicios add column if not exists grupo text;
alter table public.rutina_ejercicios add column if not exists config jsonb not null default '{}'::jsonb;
alter table public.rutina_ejercicios add column if not exists rpe text;

alter table public.plantilla_ejercicios add column if not exists metodo text not null default 'normal';
alter table public.plantilla_ejercicios add column if not exists grupo text;
alter table public.plantilla_ejercicios add column if not exists config jsonb not null default '{}'::jsonb;
alter table public.plantilla_ejercicios add column if not exists rpe text;

alter table public.rutinas add column if not exists descripcion text;
alter table public.plantillas add column if not exists descripcion text;

alter table public.ejercicios add column if not exists categorias text[] not null default '{}';

-- Ejercicios que ya estaban cargados: se les asigna la categoría que
-- corresponde a su grupo muscular. Solo toca los que todavía no tienen
-- ninguna categoría, así no pisa lo que el profe ya haya elegido.
update public.ejercicios
set categorias = case grupo_muscular
  when 'Pectorales'  then array['Empuje']
  when 'Hombros'     then array['Empuje']
  when 'Tríceps'     then array['Empuje', 'Brazos']
  when 'Espalda'     then array['Tracción']
  when 'Bíceps'      then array['Tracción', 'Brazos']
  when 'Antebrazo'   then array['Brazos']
  when 'Piernas'     then array['Piernas']
  when 'Glúteos'     then array['Piernas']
  when 'Abdominales' then array['Zona media']
  else array[grupo_muscular]
end
where categorias = '{}';

create index if not exists ejercicios_categorias_idx on public.ejercicios using gin (categorias);
