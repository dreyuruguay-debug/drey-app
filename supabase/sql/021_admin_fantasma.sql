-- 021 · La cuenta Admin como "fantasma"
-- ----------------------------------------------------------------------
-- La cuenta Admin se crea registrándose en la app como cualquier cliente,
-- así que queda con datos de cliente: plan, profe elegido, fecha de
-- nacimiento, peso, lesiones, términos aceptados, etc. El Admin no es
-- cliente: nada de eso tiene que existir.
--
-- Esta versión de convertir_en_admin('email') (reemplaza la de 020) hace
-- lo mismo que antes y además deja la cuenta limpia:
--   · Borra los datos de cliente del perfil (queda solo nombre "Admin",
--     celular y email).
--   · Borra lo que la cuenta pudo haber generado como cliente: rutinas,
--     días asignados, entrenamientos, resúmenes, medidas y pagos.
--   · Borra los avisos que se le mandaron al profe por esta cuenta
--     ("Cuenta nueva", "avisó que pagó").
--   · Limpia los datos del registro guardados en la cuenta de acceso
--     (solo se ven en Supabase → Authentication).
--   · Si la cuenta no tiene perfil (por ejemplo, porque se creó desde
--     Supabase → Authentication → "Add user"), se lo crea.
--
-- Se puede correr sobre una cuenta que ya es Admin: la vuelve a limpiar.
-- Desde la app nadie puede usar esta función (solo el SQL Editor).

create or replace function public.convertir_en_admin(p_email text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_columna text;
  v_tabla text;
begin
  select u.id into v_id
  from auth.users u
  where lower(u.email) = lower(trim(p_email));

  if v_id is null then
    raise exception 'No hay ninguna cuenta registrada con el email %', p_email;
  end if;

  if exists (select 1 from public.perfiles c where c.profe_id = v_id) then
    raise exception 'Esa cuenta es profe y tiene clientes. Usá otra cuenta para el Admin.';
  end if;

  perform set_config('drey.sistema', 'on', true);

  insert into public.perfiles (id) values (v_id) on conflict (id) do nothing;

  -- Un solo Admin.
  update public.perfiles set es_admin = false where es_admin and id <> v_id;
  update public.gimnasios set dueno_id = null where dueno_id = v_id;

  update public.perfiles
  set es_profe = false,
      es_admin = true,
      nombre = 'Admin',
      apellido = '',
      profe_id = null,
      gimnasio_id = null,
      estado = 'activo',
      aviso_pago = false,
      vencimiento = null
  where id = v_id;

  -- Datos de cliente del perfil. Se revisa que cada columna exista, así
  -- esto funciona aunque la base tenga alguna columna más o menos.
  foreach v_columna in array array[
    'plan', 'codigo_descuento', 'fecha_nacimiento', 'peso', 'altura', 'objetivo',
    'lesiones', 'comprobante_nombre', 'terminos_version', 'terminos_aceptados_en',
    'consentimiento_salud_en', 'baja_solicitada_en'
  ] loop
    if exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'perfiles' and column_name = v_columna
    ) then
      execute format('update public.perfiles set %I = null where id = $1', v_columna) using v_id;
    end if;
  end loop;

  -- Lo que la cuenta pudo generar como cliente (en este orden por las
  -- relaciones entre tablas).
  if to_regclass('public.rutina_ejercicios') is not null then
    delete from public.rutina_ejercicios
    where rutina_id in (select r.id from public.rutinas r where r.cliente_id = v_id);
  end if;
  foreach v_tabla in array array[
    'calendario_cliente', 'rutinas', 'sesiones', 'resumenes_progreso', 'mediciones', 'pagos'
  ] loop
    if to_regclass('public.' || v_tabla) is not null then
      execute format('delete from public.%I where cliente_id = $1', v_tabla) using v_id;
    end if;
  end loop;

  -- Avisos que recibió el profe por esta cuenta.
  if to_regclass('public.avisos') is not null then
    delete from public.avisos
    where clave like 'cuenta:' || v_id || ':%'
       or clave like 'avisopago:' || v_id || ':%';
  end if;

  -- Datos del registro guardados en la cuenta de acceso. Si Supabase no
  -- deja tocarlos, se sigue igual (no se ven en la app).
  begin
    update auth.users
    set raw_user_meta_data = jsonb_build_object('nombre', 'Admin')
    where id = v_id;
  exception when others then
    null;
  end;

  return 'Listo: ' || p_email || ' es la cuenta Admin (limpia).';
end;
$$;

revoke all on function public.convertir_en_admin(text) from public, anon, authenticated;
