-- 013 · Cada profe ve solo sus clientes
--
-- Hasta ahora cualquier cuenta de profe veía y editaba a todos los
-- clientes (función es_profe()). Desde acá:
--
--   · Un profe ve a los clientes que lo eligieron a él (profe_id).
--   · Los clientes que eligieron un GIMNASIO (sin profe) los ven los
--     profes de ese gimnasio. Los que no eligieron nada, todos los profes.
--     Apenas un profe habilita o confirma el pago de uno de esos
--     clientes, el cliente queda asignado a ese profe.
--   · El "administrador" (es_admin = true, el dueño de DREY) ve a todos,
--     administra gimnasios, planes y precios. Si hoy hay un solo profe,
--     queda como administrador automáticamente.
--
-- Además protege los datos de la cuenta: un cliente puede editar sus
-- datos personales, pero NO su estado, vencimiento, plan ni a qué profe
-- pertenece (antes, técnicamente, podía). Eso solo lo cambian el profe,
-- las funciones de la base (pagos de Mercado Pago, aceptar términos) o
-- vos desde el SQL Editor.
--
-- Se puede correr más de una vez sin romper nada.

-- 1) Administrador -----------------------------------------------------------
alter table public.perfiles add column if not exists es_admin boolean not null default false;

update public.perfiles
set es_admin = true
where es_profe = true
  and (select count(*) from public.perfiles p where p.es_profe = true) = 1
  and not exists (select 1 from public.perfiles a where a.es_admin = true);

-- Clientes sin profe asignado: si hoy hay un solo profe, son de él
-- (lo mismo que hizo 007 con los clientes que ya existían entonces).
update public.perfiles c
set profe_id = (select p.id from public.perfiles p where p.es_profe = true limit 1)
where coalesce(c.es_profe, false) = false
  and c.profe_id is null
  and (select count(*) from public.perfiles p where p.es_profe = true) = 1;

create or replace function public.es_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select es_admin and es_profe from public.perfiles where id = auth.uid()),
    false
  );
$$;

revoke all on function public.es_admin() from public;
grant execute on function public.es_admin() to authenticated;

-- 2) ¿El usuario actual (profe) puede ver/administrar a este cliente? --------
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
      )
  );
$$;

revoke all on function public.puede_ver_cliente(uuid) from public;
grant execute on function public.puede_ver_cliente(uuid) to authenticated;

-- Lo mismo, a partir de una rutina (para los ejercicios de la rutina).
create or replace function public.puede_ver_rutina(p_rutina uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select public.puede_ver_cliente(r.cliente_id) from public.rutinas r where r.id = p_rutina),
    false
  );
$$;

revoke all on function public.puede_ver_rutina(uuid) from public;
grant execute on function public.puede_ver_rutina(uuid) to authenticated;

-- 3) Protección de los datos de la cuenta ----------------------------------
-- Corre antes de cada cambio en "perfiles" y deshace lo que esa persona
-- no puede cambiar. Las funciones de la base que necesitan escribir esos
-- datos encienden antes la "llave de sistema" (drey.sistema), que solo
-- dura hasta el final de esa operación.
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
  -- SQL Editor, Mercado Pago (service role) o funciones de la base.
  if auth.uid() is null or coalesce(current_setting('drey.sistema', true), '') = 'on' then
    return new;
  end if;

  select coalesce(es_profe, false), coalesce(es_admin, false) and coalesce(es_profe, false)
  into v_profe, v_admin
  from public.perfiles
  where id = auth.uid();

  -- Nadie se da permisos de profe o de administrador desde la app.
  if not v_admin then
    new.es_profe := old.es_profe;
    new.es_admin := old.es_admin;
  end if;

  -- Consentimiento y baja: solo con sus funciones (011).
  new.terminos_version := old.terminos_version;
  new.terminos_aceptados_en := old.terminos_aceptados_en;
  new.consentimiento_salud_en := old.consentimiento_salud_en;
  new.baja_solicitada_en := old.baja_solicitada_en;

  if old.id = auth.uid() then
    -- Cada uno sobre su propia cuenta: datos personales sí, cuenta no.
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

  -- Un profe sobre un cliente.
  if v_profe and not v_admin then
    -- Solo puede asignárselo a sí mismo (no pasárselo a otro profe).
    if new.profe_id is distinct from old.profe_id and new.profe_id is distinct from auth.uid() then
      new.profe_id := old.profe_id;
    end if;
  end if;

  -- Si el cliente todavía no tenía profe, queda con el que lo atendió.
  if v_profe and new.profe_id is null then
    new.profe_id := auth.uid();
  end if;

  return new;
end;
$$;

drop trigger if exists perfiles_proteger_campos on public.perfiles;
create trigger perfiles_proteger_campos
  before update on public.perfiles
  for each row execute function public.proteger_campos_de_perfil();

-- 4) Políticas nuevas -----------------------------------------------------
-- Se borran TODAS las políticas anteriores de estas tablas y se crean de
-- nuevo, así no queda ninguna vieja dando acceso de más.
do $$
declare
  fila record;
begin
  for fila in
    select tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and tablename in (
        'perfiles', 'rutinas', 'rutina_ejercicios', 'calendario_cliente', 'sesiones',
        'resumenes_progreso', 'plantillas', 'plantilla_ejercicios', 'gimnasios'
      )
  loop
    execute format('drop policy %I on public.%I', fila.policyname, fila.tablename);
  end loop;
end;
$$;

-- perfiles
create policy "perfiles: el propio usuario o su profe ven"
  on public.perfiles for select to authenticated
  using (id = auth.uid() or public.puede_ver_cliente(id));

create policy "perfiles: cada uno crea el suyo"
  on public.perfiles for insert to authenticated
  with check (id = auth.uid());

create policy "perfiles: el propio usuario o su profe editan"
  on public.perfiles for update to authenticated
  using (id = auth.uid() or public.puede_ver_cliente(id))
  with check (id = auth.uid() or public.puede_ver_cliente(id));

create policy "perfiles: solo el administrador borra"
  on public.perfiles for delete to authenticated
  using (public.es_admin());

-- rutinas (el acceso del cliente depende del vencimiento: ver 012)
create policy "rutinas: el profe del cliente las ve"
  on public.rutinas for select to authenticated
  using (public.puede_ver_cliente(cliente_id));

create policy "rutinas: el cliente ve las suyas guardadas"
  on public.rutinas for select to authenticated
  using (cliente_id = auth.uid() and publicada and public.acceso_vigente(auth.uid()));

create policy "rutinas: el profe del cliente las crea"
  on public.rutinas for insert to authenticated
  with check (public.puede_ver_cliente(cliente_id));

create policy "rutinas: el profe del cliente las edita"
  on public.rutinas for update to authenticated
  using (public.puede_ver_cliente(cliente_id))
  with check (public.puede_ver_cliente(cliente_id));

create policy "rutinas: el profe del cliente las borra"
  on public.rutinas for delete to authenticated
  using (public.puede_ver_cliente(cliente_id));

-- rutina_ejercicios
create policy "rutina_ejercicios: el profe del cliente los ve"
  on public.rutina_ejercicios for select to authenticated
  using (public.puede_ver_rutina(rutina_id));

create policy "rutina_ejercicios: el cliente ve los de sus rutinas"
  on public.rutina_ejercicios for select to authenticated
  using (
    public.acceso_vigente(auth.uid())
    and exists (
      select 1 from public.rutinas r
      where r.id = rutina_id and r.cliente_id = auth.uid() and r.publicada
    )
  );

create policy "rutina_ejercicios: el profe del cliente los crea"
  on public.rutina_ejercicios for insert to authenticated
  with check (public.puede_ver_rutina(rutina_id));

create policy "rutina_ejercicios: el profe del cliente los edita"
  on public.rutina_ejercicios for update to authenticated
  using (public.puede_ver_rutina(rutina_id))
  with check (public.puede_ver_rutina(rutina_id));

create policy "rutina_ejercicios: el profe del cliente los borra"
  on public.rutina_ejercicios for delete to authenticated
  using (public.puede_ver_rutina(rutina_id));

-- calendario_cliente
create policy "calendario: el cliente o su profe lo ven"
  on public.calendario_cliente for select to authenticated
  using (cliente_id = auth.uid() or public.puede_ver_cliente(cliente_id));

create policy "calendario: el profe del cliente lo crea"
  on public.calendario_cliente for insert to authenticated
  with check (public.puede_ver_cliente(cliente_id));

create policy "calendario: el profe del cliente lo edita"
  on public.calendario_cliente for update to authenticated
  using (public.puede_ver_cliente(cliente_id))
  with check (public.puede_ver_cliente(cliente_id));

create policy "calendario: el profe del cliente lo borra"
  on public.calendario_cliente for delete to authenticated
  using (public.puede_ver_cliente(cliente_id));

-- sesiones (entrenamientos hechos)
create policy "sesiones: el cliente o su profe las ven"
  on public.sesiones for select to authenticated
  using (cliente_id = auth.uid() or public.puede_ver_cliente(cliente_id));

create policy "sesiones: el cliente registra las suyas"
  on public.sesiones for insert to authenticated
  with check (cliente_id = auth.uid());

-- resumenes_progreso
create policy "resumenes: el profe del cliente o el cliente si está publicado"
  on public.resumenes_progreso for select to authenticated
  using (
    public.puede_ver_cliente(cliente_id)
    or (cliente_id = auth.uid() and estado = 'publicado')
  );

create policy "resumenes: el profe del cliente los crea"
  on public.resumenes_progreso for insert to authenticated
  with check (public.puede_ver_cliente(cliente_id));

create policy "resumenes: el profe del cliente los edita"
  on public.resumenes_progreso for update to authenticated
  using (public.puede_ver_cliente(cliente_id))
  with check (public.puede_ver_cliente(cliente_id));

create policy "resumenes: el profe del cliente los borra"
  on public.resumenes_progreso for delete to authenticated
  using (public.puede_ver_cliente(cliente_id));

-- plantillas: cada profe las suyas (el administrador ve todas)
alter table public.plantillas
  add column if not exists profe_id uuid references public.perfiles(id) on delete set null;
alter table public.plantillas alter column profe_id set default auth.uid();

update public.plantillas
set profe_id = (select p.id from public.perfiles p where p.es_profe = true order by p.es_admin desc limit 1)
where profe_id is null
  and (select count(*) from public.perfiles p where p.es_profe = true) = 1;

create or replace function public.puede_ver_plantilla(p_plantilla uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.es_profe() and exists (
    select 1 from public.plantillas pl
    where pl.id = p_plantilla
      and (pl.profe_id = auth.uid() or pl.profe_id is null or public.es_admin())
  );
$$;

revoke all on function public.puede_ver_plantilla(uuid) from public;
grant execute on function public.puede_ver_plantilla(uuid) to authenticated;

create policy "plantillas: el profe ve las suyas"
  on public.plantillas for select to authenticated
  using (public.puede_ver_plantilla(id));

create policy "plantillas: el profe crea las suyas"
  on public.plantillas for insert to authenticated
  with check (public.es_profe() and (profe_id = auth.uid() or public.es_admin()));

create policy "plantillas: el profe edita las suyas"
  on public.plantillas for update to authenticated
  using (public.puede_ver_plantilla(id))
  with check (public.es_profe());

create policy "plantillas: el profe borra las suyas"
  on public.plantillas for delete to authenticated
  using (public.puede_ver_plantilla(id));

create policy "plantilla_ejercicios: el profe ve los suyos"
  on public.plantilla_ejercicios for select to authenticated
  using (public.puede_ver_plantilla(plantilla_id));

create policy "plantilla_ejercicios: el profe crea los suyos"
  on public.plantilla_ejercicios for insert to authenticated
  with check (public.puede_ver_plantilla(plantilla_id));

create policy "plantilla_ejercicios: el profe edita los suyos"
  on public.plantilla_ejercicios for update to authenticated
  using (public.puede_ver_plantilla(plantilla_id))
  with check (public.puede_ver_plantilla(plantilla_id));

create policy "plantilla_ejercicios: el profe borra los suyos"
  on public.plantilla_ejercicios for delete to authenticated
  using (public.puede_ver_plantilla(plantilla_id));

-- gimnasios: se ven los activos; solo el administrador los maneja
create policy "gimnasios: se ven los activos"
  on public.gimnasios for select to anon, authenticated
  using (activo or public.es_profe());

create policy "gimnasios: solo el administrador los crea"
  on public.gimnasios for insert to authenticated
  with check (public.es_admin());

create policy "gimnasios: solo el administrador los edita"
  on public.gimnasios for update to authenticated
  using (public.es_admin())
  with check (public.es_admin());

create policy "gimnasios: solo el administrador los borra"
  on public.gimnasios for delete to authenticated
  using (public.es_admin());

-- Comprobantes de pago: el cliente los suyos, el profe los de sus clientes.
drop policy if exists "comprobantes: el dueño o el profe lo ven" on storage.objects;
create policy "comprobantes: el dueño o el profe lo ven"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'comprobantes'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or exists (
        select 1 from public.perfiles c
        where c.id::text = (storage.foldername(name))[1]
          and public.puede_ver_cliente(c.id)
      )
    )
  );

-- 5) El profe del cliente -----------------------------------------------------
-- El cliente no puede leer el perfil de su profe (solo el suyo). Esta
-- función le da solo el nombre y el celular, para el botón "Escribirle a
-- mi profe" / "Reportar un problema". Si no tiene profe asignado, usa el
-- del administrador.
create or replace function public.mi_profe()
returns table (nombre text, celular text)
language sql
stable
security definer
set search_path = public
as $$
  select trim(coalesce(p.nombre, '') || ' ' || coalesce(p.apellido, '')), p.celular
  from public.perfiles p
  where p.es_profe = true
    and (
      p.id = (select c.profe_id from public.perfiles c where c.id = auth.uid())
      or (
        (select c.profe_id from public.perfiles c where c.id = auth.uid()) is null
        and p.es_admin
      )
    )
  limit 1;
$$;

revoke all on function public.mi_profe() from public, anon;
grant execute on function public.mi_profe() to authenticated;
