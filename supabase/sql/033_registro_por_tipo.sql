-- 033 · Cobro por cupos (Entrega B): registro por tipo de cuenta, códigos
--       de espacio, profes que se suman a gimnasios y equipo del gimnasio
-- ----------------------------------------------------------------------
-- Necesita el SQL 032.
--
-- Qué hace este archivo:
--   1) REGISTRO POR TIPO: la base lee "tipo_cuenta" del registro:
--        'alumno'   → como siempre; si vino un código de espacio, queda en
--                     ese profe o gimnasio.
--        'profe'    → cuenta de profe con su espacio en prueba gratis y su
--                     código; si escribió el código de un gimnasio, le
--                     llega la solicitud al dueño.
--        'gimnasio' → lo mismo, más el gimnasio con su espacio (en prueba)
--                     y él como dueño (y como profe, si da clases).
--      Profes y gimnasios entran solos (D8): al Admin le llega un aviso.
--   2) CÓDIGOS: buscar un espacio por código y ver si un código está libre
--      (sirven sin sesión, para el registro), y la lista de profes y
--      gimnasios que toman alumnos.
--   3) PROFES Y GIMNASIOS: el profe pide sumarse con el código del
--      gimnasio; el dueño acepta o rechaza, invita por email, quita profes
--      (sus alumnos quedan en el gimnasio), cambia el código y el
--      interruptor "los profes pueden habilitar" (D5), y ve quién habilitó
--      a quién. El profe puede salir de un gimnasio.
--   4) CUIDADOS, ahora que cualquiera puede registrarse como profe:
--      · Un profe no cambia su propio gimnasio desde la app.
--      · Un dueño de gimnasio ve solo los alumnos de su gimnasio, no los
--        alumnos particulares de los profes que trabajan con él.
--      · Los alumnos "sueltos" (sin profe, sin gimnasio, sin espacio) solo
--        los ven el Admin y los profes de confianza (los que el Admin dejó
--        sin costo, como Facu).
--      · Lo compartido (ejercicios de la biblioteca y sus fotos, plantillas
--        compartidas) lo edita quien lo creó, un profe de confianza o el
--        Admin. Los códigos de descuento (valen para todos) y la conexión
--        con Google Drive, solo el Admin y los profes de confianza.
--      · Las funciones del dueño revisan bien que sea el dueño.
--   5) Notificaciones nuevas.
--
-- Se puede correr más de una vez sin romper nada.


-- 1) Cuidados -------------------------------------------------------------------

-- Profe de confianza: el Admin, o el dueño de un espacio que el Admin dejó
-- sin costo (como Facu). Un profe que se registró solo, aunque pague, no lo
-- es.
create or replace function public.profe_de_confianza()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.es_admin() or exists (
    select 1
    from public.membresias m
    join public.perfiles p on p.id = m.perfil_id
    where m.perfil_id = auth.uid()
      and m.rol = 'dueno'
      and m.estado = 'activa'
      and coalesce(p.es_profe, false)
      and public.estado_espacio(m.espacio_id) = 'sin_costo'
  );
$$;

revoke all on function public.profe_de_confianza() from public, anon;
grant execute on function public.profe_de_confianza() to authenticated;

-- Un profe no se cambia de gimnasio a sí mismo (se suma con una solicitud
-- o una invitación). El Admin y la base sí.
create or replace function public.proteger_gimnasio_de_profe()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null
     or coalesce(current_setting('drey.sistema', true), '') = 'on'
     or public.es_admin() then
    return new;
  end if;
  if coalesce(old.es_profe, false) and new.gimnasio_id is distinct from old.gimnasio_id then
    new.gimnasio_id := old.gimnasio_id;
  end if;
  return new;
end;
$$;

drop trigger if exists perfiles_proteger_gimnasio on public.perfiles;
create trigger perfiles_proteger_gimnasio
  before update on public.perfiles
  for each row execute function public.proteger_gimnasio_de_profe();

-- Clientes que ve cada uno (reemplaza la de 032). Igual, salvo:
--   · los alumnos sueltos (sin profe, sin gimnasio y sin espacio): ya no
--     los ve cualquier profe, solo el Admin y los profes de confianza;
--   · el dueño de un gimnasio ya no ve a TODOS los alumnos de los profes
--     que trabajan ahí (también los particulares de cada profe): ve los de
--     su gimnasio (por el gimnasio o por el espacio).
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
          c.profe_id is null and c.gimnasio_id is null and c.espacio_id is null
          and public.profe_de_confianza()
        )
        or (c.profe_id is null and c.gimnasio_id is not null and c.gimnasio_id = yo.gimnasio_id)
        or exists (select 1 from public.gimnasios g where g.id = c.gimnasio_id and g.dueno_id = yo.id)
        or exists (
          select 1 from public.membresias m
          where m.espacio_id = c.espacio_id
            and m.perfil_id = yo.id
            and m.estado = 'activa'
            and (m.rol = 'dueno' or c.profe_id = yo.id)
        )
      )
  );
$$;

-- Biblioteca: quién creó cada ejercicio. Los nuevos los anota la base.
alter table public.ejercicios add column if not exists creado_por uuid
  references public.perfiles(id) on delete set null default auth.uid();

drop policy if exists "ejercicios: solo el profe los edita" on public.ejercicios;
drop policy if exists "ejercicios: los edita quien los creó o un profe de confianza" on public.ejercicios;
create policy "ejercicios: los edita quien los creó o un profe de confianza"
  on public.ejercicios for update to authenticated
  using (public.es_profe() and (creado_por = auth.uid() or public.profe_de_confianza()))
  with check (public.es_profe() and (creado_por = auth.uid() or public.profe_de_confianza()));

-- Fotos de los ejercicios: cualquier profe sube; reemplaza o borra quien
-- la subió, un profe de confianza o el Admin.
drop policy if exists "ejercicios-fotos: solo el profe reemplaza" on storage.objects;
drop policy if exists "ejercicios-fotos: reemplaza quien la subió" on storage.objects;
create policy "ejercicios-fotos: reemplaza quien la subió"
  on storage.objects for update to authenticated
  using (bucket_id = 'ejercicios-fotos' and public.es_profe()
         and (owner = auth.uid() or public.profe_de_confianza()))
  with check (bucket_id = 'ejercicios-fotos' and public.es_profe());
drop policy if exists "ejercicios-fotos: solo el profe borra" on storage.objects;
drop policy if exists "ejercicios-fotos: borra quien la subió" on storage.objects;
create policy "ejercicios-fotos: borra quien la subió"
  on storage.objects for delete to authenticated
  using (bucket_id = 'ejercicios-fotos' and public.es_profe()
         and (owner = auth.uid() or public.profe_de_confianza()));

-- Plantillas: las compartidas (sin profe) las ven todos los profes, pero
-- las cambia o borra solo un profe de confianza o el Admin.
create or replace function public.puede_editar_plantilla(p_plantilla uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.es_profe() and exists (
    select 1 from public.plantillas pl
    where pl.id = p_plantilla
      and (pl.profe_id = auth.uid() or public.es_admin()
           or (pl.profe_id is null and public.profe_de_confianza()))
  );
$$;

revoke all on function public.puede_editar_plantilla(uuid) from public, anon;
grant execute on function public.puede_editar_plantilla(uuid) to authenticated;

drop policy if exists "plantillas: el profe edita las suyas" on public.plantillas;
create policy "plantillas: el profe edita las suyas"
  on public.plantillas for update to authenticated
  using (public.puede_editar_plantilla(id))
  with check (public.es_profe());
drop policy if exists "plantillas: el profe borra las suyas" on public.plantillas;
create policy "plantillas: el profe borra las suyas"
  on public.plantillas for delete to authenticated
  using (public.puede_editar_plantilla(id));
drop policy if exists "plantilla_ejercicios: el profe crea los suyos" on public.plantilla_ejercicios;
create policy "plantilla_ejercicios: el profe crea los suyos"
  on public.plantilla_ejercicios for insert to authenticated
  with check (public.puede_editar_plantilla(plantilla_id));
drop policy if exists "plantilla_ejercicios: el profe edita los suyos" on public.plantilla_ejercicios;
create policy "plantilla_ejercicios: el profe edita los suyos"
  on public.plantilla_ejercicios for update to authenticated
  using (public.puede_editar_plantilla(plantilla_id))
  with check (public.puede_editar_plantilla(plantilla_id));
drop policy if exists "plantilla_ejercicios: el profe borra los suyos" on public.plantilla_ejercicios;
create policy "plantilla_ejercicios: el profe borra los suyos"
  on public.plantilla_ejercicios for delete to authenticated
  using (public.puede_editar_plantilla(plantilla_id));

-- Códigos de descuento: hoy valen para todos los alumnos, así que los
-- crean y cambian solo el Admin y los profes de confianza (en la Entrega
-- C cada espacio va a tener los suyos).
drop policy if exists "codigos: el profe crea los suyos" on public.codigos_descuento;
create policy "codigos: el profe crea los suyos"
  on public.codigos_descuento for insert to authenticated
  with check (public.es_profe() and (profe_id = auth.uid() or public.es_admin())
              and public.profe_de_confianza());
drop policy if exists "codigos: el profe edita los suyos" on public.codigos_descuento;
create policy "codigos: el profe edita los suyos"
  on public.codigos_descuento for update to authenticated
  using (public.es_profe() and (profe_id = auth.uid() or public.es_admin())
         and public.profe_de_confianza())
  with check (public.es_profe() and (profe_id = auth.uid() or public.es_admin())
              and public.profe_de_confianza());
drop policy if exists "codigos: el profe borra los suyos" on public.codigos_descuento;
create policy "codigos: el profe borra los suyos"
  on public.codigos_descuento for delete to authenticated
  using (public.es_profe() and (profe_id = auth.uid() or public.es_admin())
         and public.profe_de_confianza());

-- Conexión con Google Drive (tiene una clave): la leen el Admin y los
-- profes de confianza.
drop policy if exists "ajustes_drive: lo lee el panel" on public.ajustes_drive;
create policy "ajustes_drive: lo lee el panel"
  on public.ajustes_drive for select to authenticated
  using (public.es_admin() or public.profe_de_confianza());


-- 2) Solicitudes e invitaciones -------------------------------------------------

-- Un profe pide sumarse a un gimnasio (con su código).
create table if not exists public.solicitudes_membresia (
  id uuid primary key default gen_random_uuid(),
  espacio_id uuid not null references public.espacios(id) on delete cascade,
  profe_id uuid not null references public.perfiles(id) on delete cascade,
  estado text not null default 'pendiente'
    check (estado in ('pendiente', 'aceptada', 'rechazada', 'cancelada')),
  mensaje text check (mensaje is null or char_length(mensaje) <= 300),
  creado_en timestamptz not null default now(),
  respondido_en timestamptz,
  respondido_por uuid references public.perfiles(id) on delete set null
);

create unique index if not exists solicitudes_membresia_una_pendiente
  on public.solicitudes_membresia (espacio_id, profe_id) where estado = 'pendiente';

-- Un gimnasio invita a un profe por su email.
create table if not exists public.invitaciones (
  id uuid primary key default gen_random_uuid(),
  espacio_id uuid not null references public.espacios(id) on delete cascade,
  email text not null check (email = lower(trim(email)) and email ~ '^\S+@\S+\.\S+$'),
  estado text not null default 'pendiente'
    check (estado in ('pendiente', 'aceptada', 'rechazada', 'cancelada')),
  invitado_por uuid references public.perfiles(id) on delete set null,
  creado_en timestamptz not null default now(),
  respondido_en timestamptz
);

create unique index if not exists invitaciones_una_pendiente
  on public.invitaciones (espacio_id, email) where estado = 'pendiente';

alter table public.solicitudes_membresia enable row level security;
alter table public.invitaciones enable row level security;

-- Se leen con funciones; por las dudas, cada uno ve las suyas y el dueño
-- las de su espacio. Nadie las escribe directo.
drop policy if exists "solicitudes_membresia: quién las ve" on public.solicitudes_membresia;
create policy "solicitudes_membresia: quién las ve"
  on public.solicitudes_membresia for select to authenticated
  using (
    public.es_admin() or profe_id = auth.uid()
    or public.mi_rol_en_espacio(espacio_id) = 'dueno'
  );
-- El email confirmado de quien inició sesión (la app no puede leer
-- auth.users). Si no confirmó su email, no cuenta: así nadie toma una
-- invitación registrándose con un email ajeno.
create or replace function public.mi_email()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select lower(u.email) from auth.users u
  where u.id = auth.uid() and u.email_confirmed_at is not null;
$$;

revoke all on function public.mi_email() from public, anon;
grant execute on function public.mi_email() to authenticated;

drop policy if exists "invitaciones: quién las ve" on public.invitaciones;
create policy "invitaciones: quién las ve"
  on public.invitaciones for select to authenticated
  using (
    public.es_admin() or public.mi_rol_en_espacio(espacio_id) = 'dueno'
    or email = public.mi_email()
  );
grant select on public.solicitudes_membresia, public.invitaciones to authenticated;


-- 3) Notificaciones nuevas ---------------------------------------------------
insert into public.tipos_aviso as t (
  clave, orden, grupo, disparo, nombre, descripcion, titulo, cuerpo, titulo_original,
  cuerpo_original, url, destino, destinos_posibles, variables, nota
) values
  ('admin-profe-nuevo', 330, 'profe', 'accion', 'Profe nuevo',
   'Al Admin, cuando alguien se registra como profe.',
   'Profe nuevo: {profe}', 'Se registró con el código {codigo} y empieza su prueba gratis.',
   'Profe nuevo: {profe}', 'Se registró con el código {codigo} y empieza su prueba gratis.',
   '/profe/equipo?tab=espacios', 'admin', '{admin}',
   '[{"clave":"nombre","texto":"Nombre de quien recibe","ejemplo":"Admin"},{"clave":"profe","texto":"Profe nuevo","ejemplo":"Ana Gómez"},{"clave":"codigo","texto":"Su código","ejemplo":"ANA"}]',
   null),
  ('admin-gimnasio-nuevo', 340, 'profe', 'accion', 'Gimnasio nuevo',
   'Al Admin, cuando alguien registra un gimnasio.',
   'Gimnasio nuevo: {espacio}', '{profe} lo registró con el código {codigo}.',
   'Gimnasio nuevo: {espacio}', '{profe} lo registró con el código {codigo}.',
   '/profe/equipo?tab=espacios', 'admin', '{admin}',
   '[{"clave":"nombre","texto":"Nombre de quien recibe","ejemplo":"Admin"},{"clave":"espacio","texto":"Gimnasio","ejemplo":"FitCenter"},{"clave":"profe","texto":"Dueño","ejemplo":"Diego Pérez"},{"clave":"codigo","texto":"Código del gimnasio","ejemplo":"FITCENTER"}]',
   null),
  ('dueno-solicitud-profe', 350, 'profe', 'accion', 'Un profe quiere sumarse',
   'Al dueño del gimnasio, cuando un profe pide sumarse con el código.',
   '{profe} quiere sumarse a {espacio}', 'Entrá a Equipo para aceptar o rechazar.',
   '{profe} quiere sumarse a {espacio}', 'Entrá a Equipo para aceptar o rechazar.',
   '/profe/equipo', 'dueno', '{dueno}',
   '[{"clave":"nombre","texto":"Nombre de quien recibe","ejemplo":"Diego"},{"clave":"profe","texto":"Profe","ejemplo":"Ana Gómez"},{"clave":"espacio","texto":"Gimnasio","ejemplo":"FitCenter"}]',
   'Si el profe escribió un mensaje, se manda ese mensaje en lugar del texto.'),
  ('profe-membresia', 360, 'profe', 'accion', 'Respuesta de un gimnasio',
   'Al profe, cuando un gimnasio acepta o rechaza su solicitud, o lo quita del equipo.',
   '{resultado}', '{detalle}',
   '{resultado}', '{detalle}',
   '/profe/espacios', 'profe', '{profe}',
   '[{"clave":"nombre","texto":"Nombre de quien recibe","ejemplo":"Ana"},{"clave":"resultado","texto":"Qué pasó","ejemplo":"FitCenter te sumó a su equipo ✅"},{"clave":"detalle","texto":"Qué hacer","ejemplo":"Elegilo arriba del panel para ver sus alumnos."},{"clave":"espacio","texto":"Gimnasio","ejemplo":"FitCenter"}]',
   null),
  ('profe-invitacion', 370, 'profe', 'accion', 'Invitación de un gimnasio',
   'Al profe, cuando un gimnasio lo invita a su equipo.',
   '{espacio} te invita a su equipo', 'Entrá a Mi cuenta → Mis espacios para aceptar.',
   '{espacio} te invita a su equipo', 'Entrá a Mi cuenta → Mis espacios para aceptar.',
   '/profe/espacios', 'profe', '{profe}',
   '[{"clave":"nombre","texto":"Nombre de quien recibe","ejemplo":"Ana"},{"clave":"espacio","texto":"Gimnasio","ejemplo":"FitCenter"}]',
   null)
on conflict (clave) do update set
  orden = excluded.orden,
  grupo = excluded.grupo,
  disparo = excluded.disparo,
  nombre = excluded.nombre,
  descripcion = excluded.descripcion,
  titulo_original = excluded.titulo_original,
  cuerpo_original = excluded.cuerpo_original,
  url = excluded.url,
  destinos_posibles = excluded.destinos_posibles,
  variables = excluded.variables,
  nota = excluded.nota;

-- Avisa a los dueños de un espacio.
create or replace function public.avisar_duenos(p_tipo text, p_espacio uuid, p_vars jsonb, p_clave text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_dueno uuid;
begin
  for v_dueno in
    select perfil_id from public.membresias
    where espacio_id = p_espacio and rol = 'dueno' and estado = 'activa'
  loop
    perform public.avisar(p_tipo, v_dueno, p_vars, p_clave || ':' || v_dueno);
  end loop;
end;
$$;

revoke all on function public.avisar_duenos(text, uuid, jsonb, text) from public, anon, authenticated;

create or replace function public.avisar_admins(p_tipo text, p_vars jsonb, p_clave text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin uuid;
begin
  for v_admin in select id from public.perfiles where es_admin loop
    perform public.avisar(p_tipo, v_admin, p_vars, p_clave || ':' || v_admin);
  end loop;
end;
$$;

revoke all on function public.avisar_admins(text, jsonb, text) from public, anon, authenticated;


-- 4) Códigos (sirven sin sesión, para el registro) ----------------------------

-- ¿Está libre este código? { disponible, codigo (como queda), motivo
-- ('corto' | 'tomado'), sugerencia }.
create or replace function public.codigo_disponible(p_codigo text)
returns json
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_codigo text := public.normalizar_codigo(p_codigo);
begin
  if length(v_codigo) < 4 then
    return json_build_object('disponible', false, 'codigo', v_codigo, 'motivo', 'corto',
      'sugerencia', public.codigo_libre(v_codigo));
  end if;
  if exists (select 1 from public.espacios where codigo = v_codigo) then
    return json_build_object('disponible', false, 'codigo', v_codigo, 'motivo', 'tomado',
      'sugerencia', public.codigo_libre(v_codigo));
  end if;
  return json_build_object('disponible', true, 'codigo', v_codigo);
end;
$$;

grant execute on function public.codigo_disponible(text) to anon, authenticated;

-- Nombre visible de un espacio: el del gimnasio, o el del profe.
create or replace function public.nombre_de_espacio(p_espacio uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case
    when e.tipo = 'profe' then coalesce(
      nullif(trim(coalesce(p.nombre, '') || ' ' || coalesce(p.apellido, '')), ''), e.nombre)
    else e.nombre
  end
  from public.espacios e
  left join public.perfiles p on p.id = e.profe_id
  where e.id = p_espacio;
$$;

revoke all on function public.nombre_de_espacio(uuid) from public, anon, authenticated;

-- Un espacio por su código: solo nombre, tipo y si toma alumnos.
create or replace function public.buscar_espacio_por_codigo(p_codigo text)
returns table (codigo text, tipo text, nombre text, toma_alumnos boolean)
language sql
stable
security definer
set search_path = public
as $$
  select e.codigo, e.tipo, public.nombre_de_espacio(e.id),
         public.estado_espacio(e.id) in ('sin_costo', 'prueba', 'activo')
  from public.espacios e
  where e.codigo = public.normalizar_codigo(p_codigo);
$$;

grant execute on function public.buscar_espacio_por_codigo(text) to anon, authenticated;

-- Los profes y gimnasios que toman alumnos (paso "Tu profe o gimnasio" del
-- registro). Solo nombres: nada más.
create or replace function public.espacios_para_alumnos()
returns table (codigo text, tipo text, nombre text, profe_id uuid)
language sql
stable
security definer
set search_path = public
as $$
  select e.codigo, e.tipo, public.nombre_de_espacio(e.id), e.profe_id
  from public.espacios e
  left join public.gimnasios g on g.id = e.gimnasio_id
  left join public.perfiles p on p.id = e.profe_id
  left join public.perfiles_profe pp on pp.profe_id = e.profe_id
  where public.estado_espacio(e.id) in ('sin_costo', 'prueba', 'activo')
    and (
      (e.tipo = 'gimnasio' and coalesce(g.activo, false))
      or (e.tipo = 'profe' and coalesce(p.es_profe, false) and coalesce(pp.acepta_alumnos, true))
    )
  order by (e.tipo = 'gimnasio') desc, 3;
$$;

grant execute on function public.espacios_para_alumnos() to anon, authenticated;


-- 5) Registro por tipo de cuenta ----------------------------------------------

-- Antes de crear el perfil: profe/gimnasio → cuenta de profe; alumno con
-- código → su profe o gimnasio.
create or replace function public.registro_por_tipo()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  meta jsonb;
  v_tipo text;
  v_espacio public.espacios%rowtype;
begin
  select raw_user_meta_data into meta from auth.users where id = new.id;
  if meta is null then
    return new;
  end if;
  v_tipo := lower(coalesce(nullif(meta ->> 'tipo_cuenta', ''), 'alumno'));

  if v_tipo in ('profe', 'gimnasio') then
    new.es_profe := true;
    new.es_admin := false;
    new.estado := 'activo';
    new.plan := null;
    new.profe_id := null;
    new.gimnasio_id := null;
    new.vencimiento := null;
    new.aviso_pago := false;
    new.codigo_descuento := null;
    new.consentimiento_salud_en := null;
    return new;
  end if;

  if coalesce(meta ->> 'espacio_codigo', '') <> '' then
    select * into v_espacio
    from public.espacios
    where codigo = public.normalizar_codigo(meta ->> 'espacio_codigo')
      and public.estado_espacio(id) <> 'pausado';
    if v_espacio.id is not null then
      if v_espacio.tipo = 'gimnasio' then
        new.gimnasio_id := v_espacio.gimnasio_id;
        new.profe_id := null;
      else
        new.profe_id := v_espacio.profe_id;
        new.gimnasio_id := null;
      end if;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists perfiles_registro_tipo on public.perfiles;
create trigger perfiles_registro_tipo
  before insert on public.perfiles
  for each row execute function public.registro_por_tipo();

-- Después de crear el perfil de un profe (su espacio personal ya existe,
-- trigger perfiles_espacios_de_profe): su código, su plan, el gimnasio si
-- registró uno, la solicitud al gimnasio si escribió un código, y el
-- aviso al Admin.
create or replace function public.registro_de_profe_despues()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  meta jsonb;
  v_tipo text;
  v_personal uuid;
  v_gimnasio uuid;
  v_espacio_gym uuid;
  v_codigo text;
  v_plan public.planes_drey%rowtype;
  v_destino uuid;
  v_nombre text := coalesce(nullif(trim(coalesce(new.nombre, '') || ' ' || coalesce(new.apellido, '')), ''), 'Un profe');
  v_nombre_gym text;
  v_unirse public.espacios%rowtype;
begin
  if not coalesce(new.es_profe, false) then
    return new;
  end if;
  select raw_user_meta_data into meta from auth.users where id = new.id;
  v_tipo := lower(coalesce(meta ->> 'tipo_cuenta', ''));
  if v_tipo not in ('profe', 'gimnasio') then
    return new;
  end if;

  v_personal := (select id from public.espacios where tipo = 'profe' and profe_id = new.id);

  -- El código que eligió (si está libre y es válido).
  v_codigo := public.normalizar_codigo(meta ->> 'codigo');
  if v_personal is not null and length(v_codigo) >= 4
     and not exists (select 1 from public.espacios where codigo = v_codigo) then
    update public.espacios set codigo = v_codigo where id = v_personal;
  end if;

  if v_tipo = 'gimnasio' then
    v_nombre_gym := left(coalesce(nullif(trim(meta ->> 'gimnasio_nombre'), ''), 'Gimnasio de ' || v_nombre), 80);
    insert into public.gimnasios (nombre, dueno_id) values (v_nombre_gym, new.id)
    returning id into v_gimnasio;
    v_espacio_gym := (select id from public.espacios where tipo = 'gimnasio' and gimnasio_id = v_gimnasio);

    v_codigo := public.normalizar_codigo(meta ->> 'gimnasio_codigo');
    if length(v_codigo) >= 4 and not exists (select 1 from public.espacios where codigo = v_codigo) then
      update public.espacios set codigo = v_codigo where id = v_espacio_gym;
    end if;

    -- ¿También da clases? Queda como profe del gimnasio (sus alumnos van
    -- al gimnasio).
    if lower(coalesce(meta ->> 'da_clases', '')) = 'true' then
      perform set_config('drey.sistema', 'on', true);
      update public.perfiles set gimnasio_id = v_gimnasio where id = new.id;
      perform set_config('drey.sistema', 'off', true);
    end if;
  end if;

  -- El plan DREY que eligió en la portada (queda "elegido": se aplica al
  -- pagar). Va al gimnasio si es un plan de gimnasio.
  select * into v_plan from public.planes_drey where id = meta ->> 'plan_drey' and activo;
  if v_plan.id is not null then
    v_destino := case when v_plan.tipo = 'gimnasio' then v_espacio_gym else v_personal end;
    if v_destino is not null then
      update public.espacios set plan_drey_pedido = v_plan.id where id = v_destino;
    end if;
  end if;

  -- Pidió sumarse a un gimnasio con su código.
  if coalesce(meta ->> 'codigo_gimnasio', '') <> '' then
    select * into v_unirse from public.espacios
    where codigo = public.normalizar_codigo(meta ->> 'codigo_gimnasio') and tipo = 'gimnasio';
    if v_unirse.id is not null and v_unirse.id is distinct from v_espacio_gym then
      insert into public.solicitudes_membresia (espacio_id, profe_id)
      values (v_unirse.id, new.id)
      on conflict do nothing;
      perform public.avisar_duenos('dueno-solicitud-profe', v_unirse.id,
        jsonb_build_object('profe', v_nombre, 'espacio', v_unirse.nombre),
        'solmem:' || v_unirse.id || ':' || new.id || ':registro');
    end if;
  end if;

  if v_tipo = 'gimnasio' then
    perform public.avisar_admins('admin-gimnasio-nuevo', jsonb_build_object(
      'espacio', v_nombre_gym, 'profe', v_nombre,
      'codigo', (select codigo from public.espacios where id = v_espacio_gym)
    ), 'gimnuevo:' || new.id);
  else
    perform public.avisar_admins('admin-profe-nuevo', jsonb_build_object(
      'profe', v_nombre, 'codigo', (select codigo from public.espacios where id = v_personal)
    ), 'profenuevo:' || new.id);
  end if;
  return new;
end;
$$;

drop trigger if exists perfiles_registro_tipo_despues on public.perfiles;
create trigger perfiles_registro_tipo_despues
  after insert on public.perfiles
  for each row execute function public.registro_de_profe_despues();


-- 6) El profe y sus espacios --------------------------------------------------

-- Pedir sumarse a un gimnasio con su código.
create or replace function public.unirme_a_espacio(p_codigo text, p_mensaje text default null)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_espacio public.espacios%rowtype;
  v_solicitud uuid;
begin
  if not public.soy_profe() then
    raise exception 'Solo los profes se suman a un gimnasio';
  end if;
  select * into v_espacio from public.espacios where codigo = public.normalizar_codigo(p_codigo);
  if v_espacio.id is null then
    raise exception 'No hay ningún gimnasio con ese código';
  end if;
  if v_espacio.tipo <> 'gimnasio' then
    raise exception 'Ese código es de un profe: solo podés sumarte a gimnasios';
  end if;
  if exists (select 1 from public.membresias where espacio_id = v_espacio.id and perfil_id = auth.uid()) then
    raise exception 'Ya sos parte de ese gimnasio';
  end if;

  -- Si el gimnasio ya lo había invitado, entra directo.
  if exists (
    select 1 from public.invitaciones i
    where i.espacio_id = v_espacio.id and i.estado = 'pendiente'
      and i.email = public.mi_email()
  ) then
    update public.invitaciones set estado = 'aceptada', respondido_en = now()
    where espacio_id = v_espacio.id and estado = 'pendiente' and email = public.mi_email();
    perform public.sumar_profe_al_espacio(v_espacio.id, auth.uid());
    return json_build_object('estado', 'aceptada', 'espacio', v_espacio.nombre);
  end if;

  insert into public.solicitudes_membresia (espacio_id, profe_id, mensaje)
  values (v_espacio.id, auth.uid(), nullif(left(trim(coalesce(p_mensaje, '')), 300), ''))
  on conflict do nothing
  returning id into v_solicitud;

  -- Un aviso por solicitud (si ya tenía una pendiente, no se repite).
  if v_solicitud is not null then
    perform public.avisar_duenos('dueno-solicitud-profe', v_espacio.id,
      jsonb_build_object('profe', public.nombre_de(auth.uid()), 'espacio', v_espacio.nombre,
        'mensaje_personal', nullif(trim(coalesce(p_mensaje, '')), '')),
      'solmem:' || v_solicitud);
  end if;

  return json_build_object('estado', 'pendiente', 'espacio', v_espacio.nombre);
end;
$$;

revoke all on function public.unirme_a_espacio(text, text) from public, anon;
grant execute on function public.unirme_a_espacio(text, text) to authenticated;

-- Suma un profe al equipo de un gimnasio (lo usan aceptar una solicitud y
-- aceptar una invitación). Solo la membresía: su "gimnasio" de antes
-- (perfiles.gimnasio_id) no se toca, así sus alumnos particulares siguen
-- siendo suyos y nadie del gimnasio los ve.
create or replace function public.sumar_profe_al_espacio(p_espacio uuid, p_profe uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.poner_membresia(p_espacio, p_profe, 'profe');
end;
$$;

revoke all on function public.sumar_profe_al_espacio(uuid, uuid) from public, anon, authenticated;

create or replace function public.cancelar_solicitud_membresia(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.solicitudes_membresia
  set estado = 'cancelada', respondido_en = now()
  where id = p_id and profe_id = auth.uid() and estado = 'pendiente';
  if not found then
    raise exception 'No encontramos esa solicitud';
  end if;
end;
$$;

revoke all on function public.cancelar_solicitud_membresia(uuid) from public, anon;
grant execute on function public.cancelar_solicitud_membresia(uuid) to authenticated;

-- Las solicitudes que mandó el profe (las últimas).
create or replace function public.mis_solicitudes_membresia()
returns table (id uuid, espacio text, estado text, creado_en timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select s.id, e.nombre, s.estado, s.creado_en
  from public.solicitudes_membresia s
  join public.espacios e on e.id = s.espacio_id
  where s.profe_id = auth.uid()
  order by s.creado_en desc
  limit 20;
$$;

revoke all on function public.mis_solicitudes_membresia() from public, anon;
grant execute on function public.mis_solicitudes_membresia() to authenticated;

-- Las invitaciones que le llegaron al email del profe.
create or replace function public.mis_invitaciones()
returns table (id uuid, espacio text, invitado_por text, creado_en timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select i.id, e.nombre, public.nombre_de(i.invitado_por), i.creado_en
  from public.invitaciones i
  join public.espacios e on e.id = i.espacio_id
  where i.estado = 'pendiente'
    and i.email = public.mi_email()
    and not exists (select 1 from public.membresias m where m.espacio_id = i.espacio_id and m.perfil_id = auth.uid())
  order by i.creado_en desc;
$$;

revoke all on function public.mis_invitaciones() from public, anon;
grant execute on function public.mis_invitaciones() to authenticated;

create or replace function public.responder_invitacion(p_id uuid, p_aceptar boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inv public.invitaciones%rowtype;
begin
  select * into v_inv from public.invitaciones
  where id = p_id and estado = 'pendiente' and email = public.mi_email();
  if v_inv.id is null then
    raise exception 'No encontramos esa invitación';
  end if;
  if p_aceptar and not public.soy_profe() then
    raise exception 'Solo los profes se suman a un gimnasio';
  end if;
  update public.invitaciones
  set estado = case when p_aceptar then 'aceptada' else 'rechazada' end, respondido_en = now()
  where id = p_id;
  if p_aceptar then
    perform public.sumar_profe_al_espacio(v_inv.espacio_id, auth.uid());
    update public.solicitudes_membresia set estado = 'aceptada', respondido_en = now()
    where espacio_id = v_inv.espacio_id and profe_id = auth.uid() and estado = 'pendiente';
  end if;
end;
$$;

revoke all on function public.responder_invitacion(uuid, boolean) from public, anon;
grant execute on function public.responder_invitacion(uuid, boolean) to authenticated;

-- Cambiar el código de un espacio (el dueño o el Admin).
create or replace function public.cambiar_codigo_espacio(p_espacio uuid, p_codigo text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_codigo text := public.normalizar_codigo(p_codigo);
begin
  if not (public.es_admin() or coalesce(public.mi_rol_en_espacio(p_espacio) = 'dueno', false)) then
    raise exception 'Solo el dueño cambia el código';
  end if;
  if length(v_codigo) < 4 then
    raise exception 'El código tiene que tener al menos 4 letras o números';
  end if;
  if exists (select 1 from public.espacios where codigo = v_codigo and id <> p_espacio) then
    raise exception 'Ese código ya lo usa otro espacio';
  end if;
  update public.espacios set codigo = v_codigo where id = p_espacio;
  return v_codigo;
end;
$$;

revoke all on function public.cambiar_codigo_espacio(uuid, text) from public, anon;
grant execute on function public.cambiar_codigo_espacio(uuid, text) to authenticated;


-- 7) El equipo del gimnasio (el dueño) ---------------------------------------

create or replace function public.puedo_manejar_equipo(p_espacio uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    exists (select 1 from public.espacios where id = p_espacio and tipo = 'gimnasio')
      and (public.es_admin() or public.mi_rol_en_espacio(p_espacio) = 'dueno'),
    false
  );
$$;

revoke all on function public.puedo_manejar_equipo(uuid) from public, anon, authenticated;

-- Las personas del equipo, con sus alumnos y quiénes entrenaron esta semana.
create or replace function public.equipo_de_espacio(p_espacio uuid)
returns table (
  perfil_id uuid, nombre text, celular text, rol text, alumnos int, entrenaron int, desde timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select m.perfil_id, public.nombre_de(m.perfil_id), p.celular, m.rol,
    (select count(*)::int from public.perfiles c
     where c.espacio_id = p_espacio and c.profe_id = m.perfil_id
       and public.ocupa_cupo(c.estado, c.vencimiento, c.cupo_hasta)),
    (select count(distinct s.cliente_id)::int from public.sesiones s
     join public.perfiles c on c.id = s.cliente_id
     where c.espacio_id = p_espacio and c.profe_id = m.perfil_id
       and s.fecha >= public.hoy_uy() - (extract(isodow from public.hoy_uy())::int - 1)),
    m.creado_en
  from public.membresias m
  join public.perfiles p on p.id = m.perfil_id
  where m.espacio_id = p_espacio and m.estado = 'activa'
    and public.puedo_manejar_equipo(p_espacio)
  order by (m.rol = 'dueno') desc, 2;
$$;

revoke all on function public.equipo_de_espacio(uuid) from public, anon;
grant execute on function public.equipo_de_espacio(uuid) to authenticated;

-- Solicitudes e invitaciones pendientes del gimnasio.
create or replace function public.pendientes_de_equipo(p_espacio uuid)
returns table (id uuid, tipo text, nombre text, email text, mensaje text, creado_en timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select s.id, 'solicitud'::text, public.nombre_de(s.profe_id), null::text, s.mensaje, s.creado_en
  from public.solicitudes_membresia s
  where s.espacio_id = p_espacio and s.estado = 'pendiente' and public.puedo_manejar_equipo(p_espacio)
  union all
  select i.id, 'invitacion'::text, null::text, i.email, null::text, i.creado_en
  from public.invitaciones i
  where i.espacio_id = p_espacio and i.estado = 'pendiente' and public.puedo_manejar_equipo(p_espacio)
  order by 6 desc;
$$;

revoke all on function public.pendientes_de_equipo(uuid) from public, anon;
grant execute on function public.pendientes_de_equipo(uuid) to authenticated;

create or replace function public.responder_solicitud_membresia(p_id uuid, p_aceptar boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sol public.solicitudes_membresia%rowtype;
  v_nombre text;
begin
  select * into v_sol from public.solicitudes_membresia where id = p_id and estado = 'pendiente';
  if v_sol.id is null then
    raise exception 'No encontramos esa solicitud';
  end if;
  if not public.puedo_manejar_equipo(v_sol.espacio_id) then
    raise exception 'Solo el dueño del gimnasio responde';
  end if;
  update public.solicitudes_membresia
  set estado = case when p_aceptar then 'aceptada' else 'rechazada' end,
      respondido_en = now(), respondido_por = auth.uid()
  where id = p_id;
  v_nombre := (select nombre from public.espacios where id = v_sol.espacio_id);
  if p_aceptar then
    perform public.sumar_profe_al_espacio(v_sol.espacio_id, v_sol.profe_id);
  end if;
  perform public.avisar('profe-membresia', v_sol.profe_id, jsonb_build_object(
    'espacio', v_nombre,
    'resultado', case when p_aceptar then v_nombre || ' te sumó a su equipo ✅'
                      else v_nombre || ' no aceptó tu solicitud' end,
    'detalle', case when p_aceptar then 'Elegilo arriba del panel para ver sus alumnos.'
                    else 'Podés hablar con el dueño del gimnasio.' end
  ), 'solmemresp:' || p_id);
end;
$$;

revoke all on function public.responder_solicitud_membresia(uuid, boolean) from public, anon;
grant execute on function public.responder_solicitud_membresia(uuid, boolean) to authenticated;

-- Invitar a un profe por email. Si ya tiene cuenta de profe le llega el
-- aviso; si todavía no tiene, la ve cuando se registre como profe con ese
-- email. Devuelve { existe_cuenta }.
create or replace function public.invitar_profe(p_espacio uuid, p_email text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text := lower(trim(coalesce(p_email, '')));
  v_cuenta public.perfiles%rowtype;
  v_nombre text := (select nombre from public.espacios where id = p_espacio);
begin
  if not public.puedo_manejar_equipo(p_espacio) then
    raise exception 'Solo el dueño del gimnasio invita';
  end if;
  if v_email !~ '^\S+@\S+\.\S+$' then
    raise exception 'Revisá el email';
  end if;
  select p.* into v_cuenta from auth.users u join public.perfiles p on p.id = u.id
  where lower(u.email) = v_email;
  if v_cuenta.id is not null then
    if coalesce(v_cuenta.es_admin, false) or not coalesce(v_cuenta.es_profe, false) then
      raise exception 'Ese email no es de una cuenta de profe';
    end if;
    if exists (select 1 from public.membresias where espacio_id = p_espacio and perfil_id = v_cuenta.id) then
      raise exception 'Ya es parte del equipo';
    end if;
  end if;

  insert into public.invitaciones (espacio_id, email, invitado_por)
  values (p_espacio, v_email, auth.uid())
  on conflict do nothing;

  if v_cuenta.id is not null then
    perform public.avisar('profe-invitacion', v_cuenta.id,
      jsonb_build_object('espacio', v_nombre), 'invitacion:' || p_espacio || ':' || v_cuenta.id);
  end if;
  return json_build_object('existe_cuenta', v_cuenta.id is not null);
end;
$$;

revoke all on function public.invitar_profe(uuid, text) from public, anon;
grant execute on function public.invitar_profe(uuid, text) to authenticated;

create or replace function public.cancelar_invitacion(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.invitaciones set estado = 'cancelada', respondido_en = now()
  where id = p_id and estado = 'pendiente' and public.puedo_manejar_equipo(espacio_id);
  if not found then
    raise exception 'No encontramos esa invitación';
  end if;
end;
$$;

revoke all on function public.cancelar_invitacion(uuid) from public, anon;
grant execute on function public.cancelar_invitacion(uuid) to authenticated;

-- Saca a un profe del gimnasio. Sus alumnos se quedan en el gimnasio y
-- pasan a p_destino (otra persona del equipo; si no se elige, el dueño).
create or replace function public.sacar_del_espacio(p_espacio uuid, p_profe uuid, p_destino uuid)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_espacio public.espacios%rowtype;
  v_destino uuid := p_destino;
  v_movidos int;
begin
  select * into v_espacio from public.espacios where id = p_espacio;
  if v_destino is null or v_destino = p_profe or not exists (
    select 1 from public.membresias m join public.perfiles p on p.id = m.perfil_id
    where m.espacio_id = p_espacio and m.perfil_id = v_destino and m.estado = 'activa'
      and coalesce(p.es_profe, false)
  ) then
    select m.perfil_id into v_destino
    from public.membresias m join public.perfiles p on p.id = m.perfil_id
    where m.espacio_id = p_espacio and m.rol = 'dueno' and m.estado = 'activa'
      and m.perfil_id <> p_profe and coalesce(p.es_profe, false)
    order by m.creado_en
    limit 1;
  end if;

  perform set_config('drey.sistema', 'on', true);
  update public.perfiles
  set profe_id = v_destino, gimnasio_id = v_espacio.gimnasio_id
  where espacio_id = p_espacio and profe_id = p_profe;
  get diagnostics v_movidos = row_count;

  delete from public.membresias where espacio_id = p_espacio and perfil_id = p_profe and rol = 'profe';
  update public.perfiles set gimnasio_id = null
  where id = p_profe and gimnasio_id = v_espacio.gimnasio_id;
  perform set_config('drey.sistema', 'off', true);
  return v_movidos;
end;
$$;

revoke all on function public.sacar_del_espacio(uuid, uuid, uuid) from public, anon, authenticated;

-- El dueño (o el Admin) quita a un profe del equipo.
create or replace function public.quitar_profe_de_espacio(p_espacio uuid, p_profe uuid, p_destino uuid default null)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_movidos int;
  v_nombre text := (select nombre from public.espacios where id = p_espacio);
begin
  if not public.puedo_manejar_equipo(p_espacio) then
    raise exception 'Solo el dueño del gimnasio quita profes';
  end if;
  if not exists (
    select 1 from public.membresias where espacio_id = p_espacio and perfil_id = p_profe and rol = 'profe'
  ) then
    raise exception 'Esa persona no es profe de este gimnasio';
  end if;
  v_movidos := public.sacar_del_espacio(p_espacio, p_profe, p_destino);
  perform public.avisar('profe-membresia', p_profe, jsonb_build_object(
    'espacio', v_nombre,
    'resultado', 'Ya no sos parte de ' || v_nombre,
    'detalle', 'Tus alumnos de ese gimnasio quedaron en el gimnasio.'
  ), 'quitado:' || p_espacio || ':' || p_profe || ':' || extract(epoch from now())::bigint);
  return v_movidos;
end;
$$;

revoke all on function public.quitar_profe_de_espacio(uuid, uuid, uuid) from public, anon;
grant execute on function public.quitar_profe_de_espacio(uuid, uuid, uuid) to authenticated;

-- El profe se va de un gimnasio (sus alumnos quedan con el dueño).
create or replace function public.salir_de_espacio(p_espacio uuid)
returns int
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.mi_rol_en_espacio(p_espacio) is distinct from 'profe' then
    raise exception 'Solo los profes del gimnasio pueden salir (el dueño no)';
  end if;
  return public.sacar_del_espacio(p_espacio, auth.uid(), null);
end;
$$;

revoke all on function public.salir_de_espacio(uuid) from public, anon;
grant execute on function public.salir_de_espacio(uuid) to authenticated;

-- Interruptor del dueño: los profes del gimnasio también habilitan (D5).
create or replace function public.cambiar_profes_habilitan(p_espacio uuid, p_valor boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.puedo_manejar_equipo(p_espacio) then
    raise exception 'Solo el dueño del gimnasio lo cambia';
  end if;
  update public.espacios set profes_habilitan = coalesce(p_valor, false) where id = p_espacio;
end;
$$;

revoke all on function public.cambiar_profes_habilitan(uuid, boolean) from public, anon;
grant execute on function public.cambiar_profes_habilitan(uuid, boolean) to authenticated;

-- Quién habilitó a quién (el dueño y el Admin).
create or replace function public.historial_habilitaciones(p_espacio uuid, p_limite int default 50)
returns table (creado_en timestamptz, alumno text, por text, rol text, cupo int, cupos int)
language sql
stable
security definer
set search_path = public
as $$
  select h.creado_en, public.nombre_de(h.alumno_id),
         case when h.rol = 'admin' then 'DREY' else public.nombre_de(h.por_id) end,
         h.rol, h.cupo, h.cupos
  from public.habilitaciones h
  where h.espacio_id = p_espacio
    and (public.es_admin() or public.mi_rol_en_espacio(p_espacio) = 'dueno')
  order by h.creado_en desc
  limit least(greatest(coalesce(p_limite, 50), 1), 200);
$$;

revoke all on function public.historial_habilitaciones(uuid, int) from public, anon;
grant execute on function public.historial_habilitaciones(uuid, int) to authenticated;


-- 8) Alumnos sin profe dentro de un espacio ---------------------------------
-- Las notificaciones "de profe" de un alumno que todavía no tiene profe
-- (por ejemplo, se registró con el código de un gimnasio) le llegan al
-- dueño de su espacio; si no tiene espacio, al Admin, como siempre
-- (reemplaza la de 030).
create or replace function public.destinatarios_de_profe(p_tipo text, p_cliente uuid, p_profe uuid default null)
returns setof uuid
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_destino text := coalesce((select destino from public.tipos_aviso where clave = p_tipo), 'profe-o-admin');
  v_profe uuid := coalesce(p_profe, (select profe_id from public.perfiles where id = p_cliente));
  v_espacio uuid := (select espacio_id from public.perfiles where id = p_cliente);
  v_hay_dueno boolean := false;
begin
  if v_destino in ('profe', 'profe-y-admin', 'profe-o-admin') and v_profe is not null then
    return next v_profe;
  end if;

  if v_destino = 'profe-o-admin' and v_profe is null and v_espacio is not null then
    return query
      select m.perfil_id from public.membresias m
      join public.perfiles p on p.id = m.perfil_id
      where m.espacio_id = v_espacio and m.rol = 'dueno' and m.estado = 'activa'
        and coalesce(p.es_profe, false);
    v_hay_dueno := found;
  end if;

  if v_destino in ('admin', 'profe-y-admin')
     or (v_destino = 'profe-o-admin' and v_profe is null and not v_hay_dueno) then
    return query
      select id from public.perfiles
      where es_admin and id is distinct from v_profe;
  end if;
end;
$$;

revoke all on function public.destinatarios_de_profe(text, uuid, uuid) from public, anon, authenticated;

-- "Escribirle a mi profe": su profe; si no tiene, el dueño de su espacio;
-- si tampoco, el Admin (reemplaza la de 020).
create or replace function public.mi_profe()
returns table (nombre text, celular text)
language sql
stable
security definer
set search_path = public
as $$
  with yo as (select c.profe_id, c.espacio_id from public.perfiles c where c.id = auth.uid()),
  candidatos as (
    select p.nombre, p.apellido, p.celular, 1 as orden
    from public.perfiles p, yo
    where yo.profe_id is not null and p.id = yo.profe_id and p.es_profe
    union all
    select p.nombre, p.apellido, p.celular, 2
    from yo
    join public.membresias m on m.espacio_id = yo.espacio_id and m.rol = 'dueno' and m.estado = 'activa'
    join public.perfiles p on p.id = m.perfil_id and p.es_profe
    where yo.profe_id is null
    union all
    select p.nombre, p.apellido, p.celular, 3
    from public.perfiles p
    where p.es_admin
  )
  select trim(coalesce(nombre, '') || ' ' || coalesce(apellido, '')), celular
  from candidatos
  order by orden
  limit 1;
$$;

revoke all on function public.mi_profe() from public, anon;
grant execute on function public.mi_profe() to authenticated;


-- 9) Arreglo de la 032: elegir el plan DREY solo el dueño -----------------------
-- (antes, alguien que no era del espacio también podía).
create or replace function public.elegir_plan_drey(p_espacio uuid, p_plan text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not (public.es_admin() or coalesce(public.mi_rol_en_espacio(p_espacio) = 'dueno', false)) then
    raise exception 'Solo el dueño del espacio elige el plan';
  end if;
  if not exists (
    select 1 from public.planes_drey pd, public.espacios e
    where pd.id = p_plan and pd.activo and e.id = p_espacio and pd.tipo = e.tipo
  ) then
    raise exception 'Ese plan no existe o no es para este espacio';
  end if;
  update public.espacios
  set plan_drey_pedido = case when plan_drey = p_plan and estado = 'activo' then null else p_plan end
  where id = p_espacio;
end;
$$;
