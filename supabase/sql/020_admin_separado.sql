-- 020 · Admin: una cuenta aparte, que no es profe
-- ----------------------------------------------------------------------
-- Hasta ahora el administrador era un profe con un permiso extra
-- (es_admin + es_profe). Desde acá son dos cosas distintas:
--
--   · PROFE (es_profe): entrena clientes. Aparece en "Elegí tu profe", se
--     le asignan clientes y ve solo los suyos.
--   · ADMIN (es_admin): la cuenta del dueño de DREY. Entra al mismo panel,
--     ve y administra TODO (clientes, profes, gimnasios, planes, precios,
--     códigos), pero no es profe: no aparece en las listas de profes, no se
--     le asignan clientes y nadie lo elige al registrarse.
--
-- Una cuenta no puede ser las dos cosas a la vez (lo controla la base).
--
-- Qué hace este archivo:
--   1) El profe que hoy era administrador queda como profe común.
--   2) La base no deja que una cuenta sea profe y Admin al mismo tiempo.
--   3) Actualiza las funciones que deciden quién ve qué.
--   4) Crea convertir_en_admin('email'): convierte una cuenta registrada
--      en la cuenta Admin. Se corre UNA vez, aparte, desde el SQL Editor
--      (ver el LEEME). Desde la app nadie puede usarla.
--
-- Se puede correr más de una vez sin romper nada.

-- 1) El administrador de antes queda como profe común ------------------------
update public.perfiles
set es_admin = false
where es_admin and coalesce(es_profe, false);

-- 2) Profe o Admin, nunca las dos ---------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'perfiles_admin_no_es_profe' and conrelid = 'public.perfiles'::regclass
  ) then
    alter table public.perfiles
      add constraint perfiles_admin_no_es_profe
      check (not (coalesce(es_admin, false) and coalesce(es_profe, false)));
  end if;
end;
$$;

-- 3) Quién entra al panel y quién es Admin ------------------------------------
-- es_profe() la usan las reglas de la biblioteca, plantillas, gimnasios y
-- códigos. Desde ahora significa "entra al panel": profe o Admin.
create or replace function public.es_profe()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select coalesce(es_profe, false) or coalesce(es_admin, false)
     from public.perfiles where id = auth.uid()),
    false
  );
$$;

-- La regla de gimnasios la consulta también quien todavía no inició sesión
-- (registro): para esa persona devuelve false.
grant execute on function public.es_profe() to anon, authenticated;

create or replace function public.es_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select es_admin from public.perfiles where id = auth.uid()), false);
$$;

revoke all on function public.es_admin() from public;
grant execute on function public.es_admin() to authenticated;

-- Clientes que ve cada uno (reemplaza la de 018). Cliente = ni profe ni
-- Admin. El Admin ve a todos; el profe, los suyos; el dueño de gimnasio,
-- los de su gimnasio.
create or replace function public.puede_ver_cliente(p_cliente uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.perfiles yo
    join public.perfiles c on c.id = p_cliente
    where yo.id = auth.uid()
      and (coalesce(yo.es_profe, false) or coalesce(yo.es_admin, false))
      and not coalesce(c.es_profe, false)
      and not coalesce(c.es_admin, false)
      and (
        yo.es_admin
        or c.profe_id = yo.id
        or (
          c.profe_id is null
          and (c.gimnasio_id is null or c.gimnasio_id = yo.gimnasio_id)
        )
        or exists (select 1 from public.gimnasios g where g.id = c.gimnasio_id and g.dueno_id = yo.id)
        or (c.profe_id is not null and public.profe_de_mis_gimnasios(c.profe_id))
      )
  );
$$;

-- El Admin y los profes no tienen plan: siempre tienen acceso (reemplaza
-- la de 012).
create or replace function public.acceso_vigente(p_usuario uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (
      select coalesce(p.es_profe, false)
        or coalesce(p.es_admin, false)
        or (
          p.estado = 'activo'
          and (p.vencimiento is null or p.vencimiento + public.dias_de_gracia() >= public.hoy_uy())
        )
      from public.perfiles p
      where p.id = p_usuario
    ),
    false
  );
$$;

revoke all on function public.acceso_vigente(uuid) from public;
grant execute on function public.acceso_vigente(uuid) to authenticated;

-- Rol del usuario actual, para el panel (reemplaza la de 018).
create or replace function public.mi_rol()
returns json
language sql
stable
security definer
set search_path = public
as $$
  select json_build_object(
    'es_profe', coalesce(p.es_profe, false),
    'es_admin', coalesce(p.es_admin, false),
    'gimnasios', coalesce(
      (select json_agg(json_build_object('id', g.id, 'nombre', g.nombre) order by g.nombre)
       from public.gimnasios g where g.dueno_id = p.id),
      '[]'::json
    )
  )
  from public.perfiles p
  where p.id = auth.uid();
$$;

revoke all on function public.mi_rol() from public, anon;
grant execute on function public.mi_rol() to authenticated;

-- Buscar una cuenta por email (Equipo y gimnasios). Ahora también dice si
-- es el Admin, para no ofrecer "Hacer profe" sobre esa cuenta.
drop function if exists public.buscar_cuenta_por_email(text);
create function public.buscar_cuenta_por_email(p_email text)
returns table (id uuid, nombre text, apellido text, es_profe boolean, es_admin boolean)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, p.nombre, p.apellido, coalesce(p.es_profe, false), coalesce(p.es_admin, false)
  from auth.users u
  join public.perfiles p on p.id = u.id
  where public.es_admin() and lower(u.email) = lower(trim(p_email))
  limit 1;
$$;

revoke all on function public.buscar_cuenta_por_email(text) from public, anon;
grant execute on function public.buscar_cuenta_por_email(text) to authenticated;

-- "Escribirle a mi profe": su profe; si no tiene, el contacto del Admin
-- (reemplaza la de 013).
create or replace function public.mi_profe()
returns table (nombre text, celular text)
language sql
stable
security definer
set search_path = public
as $$
  with yo as (select c.profe_id from public.perfiles c where c.id = auth.uid())
  select trim(coalesce(p.nombre, '') || ' ' || coalesce(p.apellido, '')), p.celular
  from public.perfiles p, yo
  where (yo.profe_id is not null and p.id = yo.profe_id and p.es_profe)
     or (yo.profe_id is null and p.es_admin)
  limit 1;
$$;

revoke all on function public.mi_profe() from public, anon;
grant execute on function public.mi_profe() to authenticated;

-- Confirmar un pago a mano (reemplaza la de 018). Igual que antes, pero si
-- lo confirma el Admin el cliente NO queda asignado al Admin (no es
-- profe): sigue sin profe hasta que el Admin o un profe se lo asignen.
create or replace function public.registrar_pago_manual(p_cliente uuid, p_monto int default null)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_precio json;
  v_monto int;
  v_hoy date := public.hoy_uy();
  v_vencimiento date;
  v_soy_profe boolean := coalesce((select es_profe from public.perfiles where id = auth.uid()), false);
begin
  if not public.puede_ver_cliente(p_cliente) then
    raise exception 'No tenés acceso a este cliente';
  end if;

  v_precio := public.calcular_precio(p_cliente, null);
  v_monto := coalesce(p_monto, (v_precio ->> 'monto')::int, 0);

  insert into public.pagos (
    cliente_id, plan, monto_base, monto, primer_mes, codigo, codigo_id,
    metodo, estado, aprobado_en, detalle
  ) values (
    p_cliente, v_precio ->> 'plan', coalesce((v_precio ->> 'monto_base')::int, v_monto), v_monto,
    coalesce((v_precio ->> 'primer_mes')::boolean, false), v_precio ->> 'codigo',
    nullif(v_precio ->> 'codigo_id', '')::uuid,
    'manual', 'aprobado', now(),
    case when v_soy_profe then 'Confirmado por el profe' else 'Confirmado por el Admin' end
  );

  perform set_config('drey.sistema', 'on', true);
  update public.perfiles
  set estado = 'activo',
      aviso_pago = false,
      profe_id = coalesce(profe_id, case when v_soy_profe then auth.uid() end),
      vencimiento = (greatest(coalesce(vencimiento, v_hoy), v_hoy) + interval '1 month')::date
  where id = p_cliente
  returning vencimiento into v_vencimiento;

  if (v_precio ->> 'codigo_id') is not null then
    update public.codigos_descuento set usos = usos + 1 where id = (v_precio ->> 'codigo_id')::uuid;
  end if;

  return json_build_object('vencimiento', v_vencimiento, 'monto', v_monto);
end;
$$;

revoke all on function public.registrar_pago_manual(uuid, int) from public, anon;
grant execute on function public.registrar_pago_manual(uuid, int) to authenticated;

-- Protección de la cuenta (reemplaza la de 018). Igual que antes, más:
--   · Solo el Admin da o quita el permiso de profe.
--   · A un cliente solo se le puede asignar como profe una cuenta de profe.
--   · No se le quita el permiso de profe a alguien que todavía tiene
--     clientes (primero hay que pasarlos a otro profe). Si era dueño de un
--     gimnasio, el gimnasio queda sin dueño.
create or replace function public.proteger_campos_de_perfil()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profe boolean := false;
  v_admin boolean := false;
begin
  if auth.uid() is null or coalesce(current_setting('drey.sistema', true), '') = 'on' then
    return new;
  end if;

  select coalesce(es_profe, false), coalesce(es_admin, false)
  into v_profe, v_admin
  from public.perfiles
  where id = auth.uid();

  if not v_admin then
    new.es_profe := old.es_profe;
    new.es_admin := old.es_admin;
  end if;

  new.terminos_version := old.terminos_version;
  new.terminos_aceptados_en := old.terminos_aceptados_en;
  new.consentimiento_salud_en := old.consentimiento_salud_en;
  new.baja_solicitada_en := old.baja_solicitada_en;

  -- El Admin le quita el permiso de profe a alguien.
  if coalesce(old.es_profe, false) and not coalesce(new.es_profe, false) then
    if exists (select 1 from public.perfiles c where c.profe_id = old.id) then
      raise exception 'Primero pasá sus clientes a otro profe';
    end if;
    update public.gimnasios set dueno_id = null where dueno_id = old.id;
  end if;

  -- El profe asignado tiene que ser una cuenta de profe.
  if new.profe_id is distinct from old.profe_id
     and new.profe_id is not null
     and not exists (select 1 from public.perfiles p where p.id = new.profe_id and p.es_profe) then
    raise exception 'Esa cuenta no es de un profe';
  end if;

  if old.id = auth.uid() then
    if not v_admin then
      new.estado := old.estado;
      new.vencimiento := old.vencimiento;
      new.plan := old.plan;
      new.profe_id := old.profe_id;
      if not v_profe then
        new.gimnasio_id := old.gimnasio_id;
      end if;
    end if;
    return new;
  end if;

  if v_profe and not v_admin then
    if new.profe_id is distinct from old.profe_id
       and new.profe_id is distinct from auth.uid()
       and not public.profe_de_mis_gimnasios(new.profe_id) then
      new.profe_id := old.profe_id;
    end if;
    if coalesce(old.es_profe, false) then
      new.gimnasio_id := old.gimnasio_id;
    end if;
  end if;

  -- Un cliente sin profe queda con el profe que lo atendió (el Admin no
  -- se asigna clientes: no es profe).
  if v_profe and new.profe_id is null
     and not coalesce(new.es_profe, false) and not coalesce(new.es_admin, false) then
    new.profe_id := auth.uid();
  end if;

  return new;
end;
$$;

-- 4) Notificaciones --------------------------------------------------------
-- Clientes sin profe: se le avisa al Admin (reemplaza la de 015).
create or replace function public.profes_a_avisar(p_cliente uuid)
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select c.profe_id from public.perfiles c where c.id = p_cliente and c.profe_id is not null
  union
  select a.id from public.perfiles a
  where a.es_admin
    and not exists (select 1 from public.perfiles c where c.id = p_cliente and c.profe_id is not null);
$$;

revoke all on function public.profes_a_avisar(uuid) from public, anon, authenticated;

-- "Cuenta nueva" / "avisó que pagó": solo por clientes (reemplaza la de 015).
create or replace function public.aviso_al_profe_de_cuenta()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profe uuid;
  v_nombre text := trim(coalesce(new.nombre, '') || ' ' || coalesce(new.apellido, ''));
begin
  if coalesce(new.es_profe, false) or coalesce(new.es_admin, false) then
    return new;
  end if;
  for v_profe in select public.profes_a_avisar(new.id) loop
    if tg_op = 'INSERT' then
      perform public.encolar_aviso(
        v_profe, 'profe-cuenta', 'Cuenta nueva: ' || v_nombre,
        'Se registró y espera que la habilites.', '/profe/cuentas', 'cuenta:' || new.id || ':' || v_profe
      );
    elsif new.aviso_pago and not coalesce(old.aviso_pago, false) then
      perform public.encolar_aviso(
        v_profe, 'profe-pago', v_nombre || ' avisó que pagó',
        'Revisá el comprobante y confirmalo.', '/profe/cuentas',
        'avisopago:' || new.id || ':' || v_profe || ':' || extract(epoch from now())::bigint
      );
    end if;
  end loop;
  return new;
end;
$$;

-- Avisos de cada mañana: solo a clientes (reemplaza la de 015).
create or replace function public.generar_avisos_del_dia()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_hoy date := public.hoy_uy();
  v_dia text := (array['Lunes','Martes','Miércoles','Jueves','Viernes','Sábado','Domingo'])[extract(isodow from v_hoy)::int];
  v_antes int := (select count(*) from public.avisos);
  fila record;
begin
  for fila in
    select p.id, r.nombre
    from public.perfiles p
    join public.calendario_cliente c on c.cliente_id = p.id and c.dia = v_dia
    join public.rutinas r on r.id = c.rutina_id and r.publicada
    where not coalesce(p.es_profe, false)
      and not coalesce(p.es_admin, false)
      and public.acceso_vigente(p.id)
      and not exists (select 1 from public.sesiones s where s.cliente_id = p.id and s.fecha = v_hoy)
  loop
    perform public.encolar_aviso(
      fila.id, 'hoy', 'Hoy te toca ' || fila.nombre || ' 🔥',
      'Tu entrenamiento de hoy te espera.', '/inicio', 'hoy:' || fila.id || ':' || v_hoy
    );
  end loop;

  for fila in
    select p.id, p.vencimiento
    from public.perfiles p
    where not coalesce(p.es_profe, false) and not coalesce(p.es_admin, false)
      and p.estado = 'activo' and p.vencimiento is not null
      and not coalesce(p.aviso_pago, false)
  loop
    if fila.vencimiento - v_hoy = 3 then
      perform public.encolar_aviso(fila.id, 'vence', 'Tu plan vence en 3 días',
        'Renovalo desde la app para no cortar tu entrenamiento.', '/suscripcion',
        'vence3:' || fila.id || ':' || fila.vencimiento);
    elsif fila.vencimiento = v_hoy then
      perform public.encolar_aviso(fila.id, 'vence', 'Tu plan vence hoy',
        'Podés pagar desde la app en un minuto.', '/suscripcion',
        'vence0:' || fila.id || ':' || fila.vencimiento);
    elsif fila.vencimiento + public.dias_de_gracia() = v_hoy then
      perform public.encolar_aviso(fila.id, 'vence', 'Último día para pagar',
        'Mañana se pausa el acceso a tus rutinas.', '/suscripcion',
        'gracia:' || fila.id || ':' || fila.vencimiento);
    end if;
  end loop;

  return (select count(*) from public.avisos) - v_antes;
end;
$$;

revoke all on function public.generar_avisos_del_dia() from public, anon, authenticated;

-- 5) Convertir una cuenta en la cuenta Admin ---------------------------------
-- Uso (desde el SQL Editor, una sola vez):
--   select public.convertir_en_admin('el-email-de-la-cuenta@gmail.com');
--
-- La cuenta tiene que estar registrada en la app. Queda llamada "Admin",
-- deja de ser profe y de tener plan, y pasa a ser la única cuenta Admin.
-- Desde la app nadie puede usar esta función (solo el SQL Editor).
create or replace function public.convertir_en_admin(p_email text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  select u.id into v_id
  from auth.users u
  where lower(u.email) = lower(trim(p_email));

  if v_id is null or not exists (select 1 from public.perfiles where id = v_id) then
    raise exception 'No hay ninguna cuenta registrada con el email %', p_email;
  end if;

  if exists (select 1 from public.perfiles c where c.profe_id = v_id) then
    raise exception 'Esa cuenta es profe y tiene clientes. Usá otra cuenta para el Admin.';
  end if;

  perform set_config('drey.sistema', 'on', true);

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

  return 'Listo: ' || p_email || ' es la cuenta Admin.';
end;
$$;

revoke all on function public.convertir_en_admin(text) from public, anon, authenticated;
