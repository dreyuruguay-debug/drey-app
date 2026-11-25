-- 001 · Base original: la tabla "perfiles" y el registro automático
--
-- Esto se creó a mano en Supabase al principio del proyecto (septiembre
-- 2026) y no estaba guardado en ningún archivo. Se recuperó de la base
-- real el 24/11/2026 (auditoría, tanda 2) para que la base se pueda
-- reconstruir entera desde GitHub, corriendo los SQL en orden: 001, 002,
-- 003...
--
-- Qué crea:
--   · perfiles: una fila por cuenta (alumno, profe o Admin), con el mismo
--     id que su usuario de Supabase (auth.users). Acá van solo las
--     columnas del principio; las demás las suman los SQL siguientes
--     (gimnasio_id y profe_id: 007; términos y consentimiento: 011;
--     es_admin: 013; hora_recordatorio: 030; espacios y cupos: 032; baja:
--     037). Las reglas de quién ve y cambia qué están en el 013 en
--     adelante.
--   · handle_new_user(): cuando alguien se registra, la base le crea su
--     perfil sola con los datos del formulario (los "metadatos" del
--     usuario). Por eso la app nunca crea perfiles (ver SQL 040).
--
-- NO hace falta correrlo en la base de hoy (ya lo tiene). Si se corre, no
-- cambia nada: se puede correr más de una vez.

-- 1) Tabla perfiles ----------------------------------------------------------------
create table if not exists public.perfiles (
  id uuid primary key references auth.users(id) on delete cascade,
  nombre text,
  apellido text,
  fecha_nacimiento date,
  peso numeric,
  celular text,
  objetivo text,
  lesiones text,
  plan text,
  codigo_descuento text,
  estado text not null default 'pendiente',
  vencimiento date,
  aviso_pago boolean not null default false,
  comprobante_nombre text,
  es_profe boolean not null default false,
  creado_en timestamptz not null default now()
);

alter table public.perfiles enable row level security;

-- 2) Registro automático -----------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.perfiles (
    id, nombre, apellido, fecha_nacimiento, peso, celular, objetivo, lesiones,
    plan, codigo_descuento, estado
  )
  values (
    new.id,
    new.raw_user_meta_data ->> 'nombre',
    new.raw_user_meta_data ->> 'apellido',
    nullif(new.raw_user_meta_data ->> 'fecha_nacimiento', '')::date,
    nullif(new.raw_user_meta_data ->> 'peso', '')::numeric,
    new.raw_user_meta_data ->> 'celular',
    new.raw_user_meta_data ->> 'objetivo',
    new.raw_user_meta_data ->> 'lesiones',
    new.raw_user_meta_data ->> 'plan',
    new.raw_user_meta_data ->> 'codigo_descuento',
    coalesce(new.raw_user_meta_data ->> 'estado', 'pendiente')
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 3) ¿Es profe? (versión del principio) ----------------------------------------------
-- El SQL 002 ya la usa y la versión de hoy recién se escribe en el 020.
-- Se crea SOLO si todavía no existe: en la base de hoy no toca nada (ahí
-- vale la del 020). Sirve para armar una base nueva corriendo los SQL en
-- orden desde el 001.
do $$
begin
  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'es_profe' and p.pronargs = 0
  ) then
    create function public.es_profe()
    returns boolean
    language sql
    stable
    security definer
    set search_path = public
    as $f$
      select coalesce((select es_profe from public.perfiles where id = auth.uid()), false);
    $f$;
  end if;
end;
$$;
