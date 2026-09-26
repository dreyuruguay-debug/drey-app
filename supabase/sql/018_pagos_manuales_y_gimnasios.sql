-- 018 · Pagos manuales registrados, estadísticas y panel de gimnasios
--
-- 1) registrar_pago_manual(): cuando el profe habilita una cuenta o
--    confirma un pago por transferencia, ahora queda anotado en "pagos"
--    (con el monto del plan y el código de descuento). Así las
--    estadísticas pueden sumar los ingresos del mes. También suma el mes
--    de acceso (lo que antes hacía la app directamente).
-- 2) Gimnasios con DUEÑO: el dueño (una cuenta de profe) ve a los clientes
--    y a los profes de su gimnasio, sus estadísticas, y puede pasar un
--    cliente de un profe a otro del mismo gimnasio.
-- 3) El administrador (dueño de DREY) arma el equipo desde la app: crea
--    gimnasios, les pone dueño, convierte una cuenta en profe y lo asigna
--    a un gimnasio.
--
-- Se puede correr más de una vez sin romper nada.

-- 1) Pagos manuales ----------------------------------------------------------
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
    'manual', 'aprobado', now(), 'Confirmado por el profe'
  );

  perform set_config('drey.sistema', 'on', true);
  update public.perfiles
  set estado = 'activo',
      aviso_pago = false,
      -- Si el cliente no tenía profe (eligió un gimnasio o nada), queda
      -- con el que confirmó el pago.
      profe_id = coalesce(profe_id, auth.uid()),
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

-- 2) Dueños de gimnasio -------------------------------------------------------
alter table public.gimnasios
  add column if not exists dueno_id uuid references public.perfiles(id) on delete set null;

-- ¿Este profe trabaja en un gimnasio del que soy dueño?
create or replace function public.profe_de_mis_gimnasios(p_profe uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.perfiles pr
    join public.gimnasios g on g.id = pr.gimnasio_id
    where pr.id = p_profe and pr.es_profe and g.dueno_id = auth.uid()
  );
$$;

revoke all on function public.profe_de_mis_gimnasios(uuid) from public, anon;
grant execute on function public.profe_de_mis_gimnasios(uuid) to authenticated;

-- Clientes que ve cada profe (reemplaza la de 013 sumando al dueño).
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
      and yo.es_profe = true
      and coalesce(c.es_profe, false) = false
      and (
        yo.es_admin
        or c.profe_id = yo.id
        or (
          c.profe_id is null
          and (c.gimnasio_id is null or c.gimnasio_id = yo.gimnasio_id)
        )
        -- Dueño de gimnasio: los clientes de su gimnasio y los de sus profes.
        or exists (select 1 from public.gimnasios g where g.id = c.gimnasio_id and g.dueno_id = yo.id)
        or (c.profe_id is not null and public.profe_de_mis_gimnasios(c.profe_id))
      )
  );
$$;

-- Profes que ve cada uno: el administrador, todos; el dueño, los de su
-- gimnasio.
create or replace function public.puede_ver_profe(p_profe uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.es_admin() or public.profe_de_mis_gimnasios(p_profe);
$$;

revoke all on function public.puede_ver_profe(uuid) from public, anon;
grant execute on function public.puede_ver_profe(uuid) to authenticated;

drop policy if exists "perfiles: el propio usuario o su profe ven" on public.perfiles;
create policy "perfiles: el propio usuario o su profe ven"
  on public.perfiles for select to authenticated
  using (id = auth.uid() or public.puede_ver_cliente(id) or public.puede_ver_profe(id));

drop policy if exists "perfiles: el propio usuario o su profe editan" on public.perfiles;
create policy "perfiles: el propio usuario o su profe editan"
  on public.perfiles for update to authenticated
  using (id = auth.uid() or public.puede_ver_cliente(id) or public.es_admin())
  with check (id = auth.uid() or public.puede_ver_cliente(id) or public.es_admin());

-- Protección de la cuenta (reemplaza la de 013): igual que antes, y
-- además el dueño de un gimnasio puede pasar un cliente a otro profe de
-- su gimnasio.
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

  select coalesce(es_profe, false), coalesce(es_admin, false) and coalesce(es_profe, false)
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
    -- Solo el administrador cambia a un profe de gimnasio.
    if coalesce(old.es_profe, false) then
      new.gimnasio_id := old.gimnasio_id;
    end if;
  end if;

  if v_profe and new.profe_id is null and not coalesce(new.es_profe, false) then
    new.profe_id := auth.uid();
  end if;

  return new;
end;
$$;

-- Gimnasios: el dueño puede cambiarle el nombre al suyo.
drop policy if exists "gimnasios: solo el administrador los edita" on public.gimnasios;
drop policy if exists "gimnasios: el administrador o el dueño los editan" on public.gimnasios;
create policy "gimnasios: el administrador o el dueño los editan"
  on public.gimnasios for update to authenticated
  using (public.es_admin() or dueno_id = auth.uid())
  with check (public.es_admin() or dueno_id = auth.uid());

-- 3) Rol del usuario actual (para mostrar el panel que corresponde) ---------
create or replace function public.mi_rol()
returns json
language sql
stable
security definer
set search_path = public
as $$
  select json_build_object(
    'es_profe', coalesce(p.es_profe, false),
    'es_admin', coalesce(p.es_admin and p.es_profe, false),
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

-- Buscar una cuenta por su email (para sumarla como profe). Solo el
-- administrador.
create or replace function public.buscar_cuenta_por_email(p_email text)
returns table (id uuid, nombre text, apellido text, es_profe boolean)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, p.nombre, p.apellido, coalesce(p.es_profe, false)
  from auth.users u
  join public.perfiles p on p.id = u.id
  where public.es_admin() and lower(u.email) = lower(trim(p_email))
  limit 1;
$$;

revoke all on function public.buscar_cuenta_por_email(text) from public, anon;
grant execute on function public.buscar_cuenta_por_email(text) to authenticated;
