-- 011 · Privacidad y consentimiento (Ley 18.331)
--
-- 1) Cada perfil guarda qué versión de los términos y la política de
--    privacidad aceptó, cuándo, y cuándo dio su consentimiento expreso
--    para los datos de salud (lesiones, peso, fecha de nacimiento).
-- 2) Al registrarse, la app manda esa aceptación junto con los demás
--    datos y un trigger la copia al perfil con la hora del servidor.
-- 3) Las cuentas que ya existían aceptan desde la app la primera vez que
--    entran (función aceptar_terminos).
-- 4) El cliente puede pedir la baja de su cuenta (solicitar_baja): el
--    profe lo ve como tarea en su Inicio.
--
-- Usa la "llave de sistema" (drey.sistema) que se explica en 013: las
-- funciones de este archivo la encienden para poder escribir columnas
-- que el cliente no puede tocar directamente.
--
-- Se puede correr más de una vez sin romper nada.

alter table public.perfiles add column if not exists terminos_version text;
alter table public.perfiles add column if not exists terminos_aceptados_en timestamptz;
alter table public.perfiles add column if not exists consentimiento_salud_en timestamptz;
alter table public.perfiles add column if not exists baja_solicitada_en timestamptz;

-- 1) Guardar la aceptación del registro -----------------------------------
create or replace function public.guardar_consentimiento_al_registrarse()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  meta jsonb;
begin
  select raw_user_meta_data into meta from auth.users where id = new.id;
  if meta is null then
    return new;
  end if;

  if coalesce(meta ->> 'terminos_version', '') <> '' then
    new.terminos_version := left(meta ->> 'terminos_version', 40);
    new.terminos_aceptados_en := now();
  end if;

  if (meta ->> 'consentimiento_salud') = 'true' then
    new.consentimiento_salud_en := now();
  end if;

  return new;
end;
$$;

drop trigger if exists perfiles_guardar_consentimiento on public.perfiles;
create trigger perfiles_guardar_consentimiento
  before insert on public.perfiles
  for each row execute function public.guardar_consentimiento_al_registrarse();

-- 2) Aceptar desde la app (cuentas que ya existían o términos nuevos) ------
create or replace function public.aceptar_terminos(p_version text, p_salud boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Hay que iniciar sesión';
  end if;
  perform set_config('drey.sistema', 'on', true);
  update public.perfiles
  set terminos_version = left(p_version, 40),
      terminos_aceptados_en = now(),
      consentimiento_salud_en = case
        when p_salud then coalesce(consentimiento_salud_en, now())
        else consentimiento_salud_en
      end
  where id = auth.uid();
end;
$$;

revoke all on function public.aceptar_terminos(text, boolean) from public;
grant execute on function public.aceptar_terminos(text, boolean) to authenticated;

-- 3) Pedir la baja de la cuenta ---------------------------------------------
-- No borra nada: deja marcado el pedido para que el profe lo resuelva
-- (borrar el usuario desde Supabase → Authentication → Users).
create or replace function public.solicitar_baja()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Hay que iniciar sesión';
  end if;
  perform set_config('drey.sistema', 'on', true);
  update public.perfiles
  set baja_solicitada_en = coalesce(baja_solicitada_en, now())
  where id = auth.uid();
end;
$$;

revoke all on function public.solicitar_baja() from public;
grant execute on function public.solicitar_baja() to authenticated;
