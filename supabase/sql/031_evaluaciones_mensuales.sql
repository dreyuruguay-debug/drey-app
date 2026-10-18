-- 031 · Evaluación mensual completa + guardado en Google Drive
-- ==========================================================================
-- El "resumen de 4 semanas" pasa a ser la EVALUACIÓN MENSUAL del alumno:
-- comparativa de cargas, repeticiones y volumen de TODOS los ejercicios,
-- gráficas, mejoras del mes, medidas (opcional) y las notas del profe.
-- Se puede descargar en PDF y guardar en Google Drive, en la carpeta de
-- cada alumno.
--
-- Qué trae:
--   1. Columnas nuevas en resumenes_progreso:
--        · notas: lo que escribe el profe además del comentario general
--          ("algo particular del mes", objetivos para el mes que viene y
--          una nota por ejercicio).
--        · incluir_medidas: si la evaluación muestra las medidas
--          corporales (peso, cintura…). Lo decide el profe; viene apagado.
--        · drive_url / drive_carpeta_url / drive_guardado_en: dónde quedó
--          el PDF en Google Drive.
--   2. Corregir un entrenamiento ya no BORRA el borrador de la evaluación
--      (se perdían los comentarios del profe): lo marca "desactualizado"
--      y la app lo vuelve a calcular sola, sin tocar las notas.
--   3. ajustes_drive: el link del "puente" con Google Drive y su clave.
--      Lo cargan el Admin (Ajustes → Drive); lo leen solo el Admin y los
--      profes (los alumnos no).
--   4. La notificación al alumno pasa a decir "evaluación del mes" (si el
--      Admin ya había cambiado el texto, se respeta el suyo).
--
-- Se puede correr más de una vez sin romper nada.
-- ==========================================================================


-- 1) Columnas nuevas de la evaluación ---------------------------------------
alter table public.resumenes_progreso
  add column if not exists notas jsonb not null default '{}'::jsonb;
alter table public.resumenes_progreso
  add column if not exists incluir_medidas boolean not null default false;
alter table public.resumenes_progreso add column if not exists drive_url text;
alter table public.resumenes_progreso add column if not exists drive_carpeta_url text;
alter table public.resumenes_progreso add column if not exists drive_guardado_en timestamptz;
alter table public.resumenes_progreso add column if not exists actualizado_en timestamptz;


-- 2) Corregir un entrenamiento ya no borra el borrador -----------------------
-- (Reemplaza la de 029.) Marca los borradores de ese mes como
-- desactualizados; la app los recalcula al abrirlos y conserva las notas.
create or replace function public.rehacer_resumen_al_corregir()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.detalle is distinct from old.detalle
     and to_regclass('public.resumenes_progreso') is not null then
    update public.resumenes_progreso
    set datos = coalesce(datos, '{}'::jsonb) || '{"desactualizado": true}'::jsonb
    where cliente_id = new.cliente_id
      and estado = 'borrador'
      and new.fecha between desde and hasta;
  end if;
  return null;
end;
$$;

revoke all on function public.rehacer_resumen_al_corregir() from public;


-- 3) Ajustes de Google Drive -------------------------------------------------
create table if not exists public.ajustes_drive (
  id int primary key default 1 check (id = 1),
  url_script text,
  clave text,
  carpeta_url text,
  actualizado_en timestamptz not null default now()
);

insert into public.ajustes_drive (id) values (1) on conflict (id) do nothing;

alter table public.ajustes_drive enable row level security;

-- Lo leen el Admin y los profes (es_profe() = entra al panel); lo cambia
-- solo el Admin. Los alumnos no lo ven.
drop policy if exists "ajustes_drive: lo lee el panel" on public.ajustes_drive;
create policy "ajustes_drive: lo lee el panel"
  on public.ajustes_drive for select to authenticated
  using (public.es_profe());

drop policy if exists "ajustes_drive: solo el Admin lo cambia" on public.ajustes_drive;
create policy "ajustes_drive: solo el Admin lo cambia"
  on public.ajustes_drive for update to authenticated
  using (public.es_admin())
  with check (public.es_admin());

revoke all on public.ajustes_drive from anon;
grant select, update on public.ajustes_drive to authenticated;

-- Fecha del cambio y línea en el Historial del Admin (sin mostrar la clave).
create or replace function public.historial_ajustes_drive()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cambios text[] := '{}';
begin
  new.actualizado_en := now();
  if new.url_script is distinct from old.url_script then
    v_cambios := v_cambios || case
      when coalesce(new.url_script, '') = '' then 'quitó la conexión con Google Drive'
      else 'conectó Google Drive' end;
  end if;
  if new.clave is distinct from old.clave and coalesce(new.url_script, '') <> '' then
    v_cambios := v_cambios || 'cambió la clave de Drive'::text;
  end if;
  if new.carpeta_url is distinct from old.carpeta_url then
    v_cambios := v_cambios || ('carpeta de Drive: ' || coalesce(nullif(new.carpeta_url, ''), '(sin link)'));
  end if;
  if array_length(v_cambios, 1) > 0 then
    perform public.anotar_historial('ajustes', 'Evaluaciones: ' || array_to_string(v_cambios, ', '));
  end if;
  return new;
end;
$$;

revoke all on function public.historial_ajustes_drive() from public;

drop trigger if exists ajustes_drive_historial on public.ajustes_drive;
create trigger ajustes_drive_historial
  before update on public.ajustes_drive
  for each row execute function public.historial_ajustes_drive();


-- 4) Texto de la notificación al alumno --------------------------------------
do $$
begin
  if to_regclass('public.tipos_aviso') is not null then
    update public.tipos_aviso
    set nombre = 'Evaluación del mes lista',
        descripcion = 'Cuando el profe publica la evaluación mensual (cada 4 semanas de entrenamiento).',
        titulo = case when titulo = titulo_original then 'Tu evaluación del mes está lista 📈' else titulo end,
        cuerpo = case when cuerpo = cuerpo_original then 'Tu profe revisó tu progreso: mirá todo lo que mejoraste.' else cuerpo end,
        titulo_original = 'Tu evaluación del mes está lista 📈',
        cuerpo_original = 'Tu profe revisó tu progreso: mirá todo lo que mejoraste.'
    where clave = 'resumen';
  end if;
end;
$$;
