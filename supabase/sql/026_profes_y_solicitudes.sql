-- 026 · Perfil de cada profe y solicitudes "Quiero entrenar con vos"
-- ----------------------------------------------------------------------
-- Cómo funciona:
--   1. Cada profe completa su perfil público (foto, especialidades,
--      modalidad, experiencia, descripción) y decide si toma alumnos
--      nuevos.
--   2. El alumno ve la lista de profes disponibles con su perfil y le
--      manda una solicitud (con un mensaje opcional). Al profe le llega
--      una notificación.
--   3. El profe acepta (pasa a ser su profe) o rechaza (al alumno le
--      llega el aviso y puede elegir otro).
--   4. El Admin, siempre, puede asignar o cambiar el profe de cualquier
--      alumno directamente (desde la ficha del alumno o desde Equipo).
--
-- Qué crea:
--   · perfiles_profe     → el perfil público de cada profe.
--   · bucket fotos-profes → las fotos de perfil (públicas).
--   · solicitudes_profe  → cada pedido de un alumno a un profe.
--   · profes_disponibles()            → la lista que ve el alumno.
--   · solicitar_profe(), cancelar_solicitud_profe(),
--     responder_solicitud_profe(), solicitudes_recibidas().
--   · Un trigger que, cuando cambia el profe de un alumno (por cualquier
--     camino), cierra sus solicitudes pendientes y avisa a quien
--     corresponda.
--
-- Nada de lo que ya existe cambia de lugar. Se puede correr más de una
-- vez sin romper nada.

-- 0) ¿La cuenta actual es profe? (solo profe, sin contar al Admin) ---------
-- es_profe() significa "entra al panel" (profe o Admin, ver 020). Para el
-- perfil de profe hace falta saber si es profe de verdad.
create or replace function public.soy_profe()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select es_profe from public.perfiles where id = auth.uid()), false);
$$;

revoke all on function public.soy_profe() from public, anon;
grant execute on function public.soy_profe() to authenticated;

-- 1) Perfil público del profe ---------------------------------------------
create table if not exists public.perfiles_profe (
  profe_id uuid primary key references public.perfiles(id) on delete cascade,
  foto_url text check (foto_url is null or char_length(foto_url) <= 500),
  especialidades text[] not null default '{}'
    check (coalesce(array_length(especialidades, 1), 0) <= 8),
  modalidades text[] not null default '{}'
    check (modalidades <@ array['presencial', 'online']::text[]),
  experiencia_anios int check (experiencia_anios is null or experiencia_anios between 0 and 60),
  descripcion text check (descripcion is null or char_length(descripcion) <= 800),
  instagram text check (instagram is null or char_length(instagram) <= 60),
  acepta_alumnos boolean not null default true,
  actualizado_en timestamptz not null default now()
);

alter table public.perfiles_profe enable row level security;

drop policy if exists "perfiles_profe: el profe y el Admin lo ven" on public.perfiles_profe;
create policy "perfiles_profe: el profe y el Admin lo ven"
  on public.perfiles_profe for select to authenticated
  using (profe_id = auth.uid() or public.es_admin());

drop policy if exists "perfiles_profe: el profe crea el suyo" on public.perfiles_profe;
create policy "perfiles_profe: el profe crea el suyo"
  on public.perfiles_profe for insert to authenticated
  with check ((profe_id = auth.uid() and public.soy_profe()) or public.es_admin());

drop policy if exists "perfiles_profe: el profe edita el suyo" on public.perfiles_profe;
create policy "perfiles_profe: el profe edita el suyo"
  on public.perfiles_profe for update to authenticated
  using ((profe_id = auth.uid() and public.soy_profe()) or public.es_admin())
  with check ((profe_id = auth.uid() and public.soy_profe()) or public.es_admin());

drop policy if exists "perfiles_profe: solo el Admin borra" on public.perfiles_profe;
create policy "perfiles_profe: solo el Admin borra"
  on public.perfiles_profe for delete to authenticated
  using (public.es_admin());

create or replace function public.marcar_perfil_profe_actualizado()
returns trigger
language plpgsql
as $$
begin
  new.actualizado_en := now();
  return new;
end;
$$;

drop trigger if exists perfiles_profe_actualizado on public.perfiles_profe;
create trigger perfiles_profe_actualizado
  before update on public.perfiles_profe
  for each row execute function public.marcar_perfil_profe_actualizado();

-- 2) Fotos de perfil de los profes (públicas: son la "cara" del profe) ----
-- Cada profe sube la suya en la carpeta con su id: <id>/foto-123.jpg
insert into storage.buckets (id, name, public)
values ('fotos-profes', 'fotos-profes', true)
on conflict (id) do nothing;

drop policy if exists "fotos-profes: el profe sube la suya" on storage.objects;
create policy "fotos-profes: el profe sube la suya"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'fotos-profes'
    and ((storage.foldername(name))[1] = auth.uid()::text or public.es_admin())
    and public.es_profe()
  );

drop policy if exists "fotos-profes: el profe reemplaza la suya" on storage.objects;
create policy "fotos-profes: el profe reemplaza la suya"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'fotos-profes'
    and ((storage.foldername(name))[1] = auth.uid()::text or public.es_admin())
  )
  with check (
    bucket_id = 'fotos-profes'
    and ((storage.foldername(name))[1] = auth.uid()::text or public.es_admin())
  );

drop policy if exists "fotos-profes: el profe borra la suya" on storage.objects;
create policy "fotos-profes: el profe borra la suya"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'fotos-profes'
    and ((storage.foldername(name))[1] = auth.uid()::text or public.es_admin())
  );

-- 3) Lista de profes que ve el alumno ---------------------------------------
-- Solo datos públicos (nunca celular ni email). Sirve también sin sesión
-- (el registro). Primero los que toman alumnos y tienen el perfil
-- completo.
create or replace function public.profes_disponibles()
returns table (
  id uuid,
  nombre text,
  gimnasio text,
  foto_url text,
  especialidades text[],
  modalidades text[],
  experiencia_anios int,
  descripcion text,
  instagram text,
  acepta_alumnos boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select p.id,
         trim(coalesce(p.nombre, '') || ' ' || coalesce(p.apellido, '')),
         g.nombre,
         pp.foto_url,
         coalesce(pp.especialidades, '{}'),
         coalesce(pp.modalidades, '{}'),
         pp.experiencia_anios,
         pp.descripcion,
         pp.instagram,
         coalesce(pp.acepta_alumnos, true)
  from public.perfiles p
  left join public.perfiles_profe pp on pp.profe_id = p.id
  left join public.gimnasios g on g.id = p.gimnasio_id
  where p.es_profe = true
  order by coalesce(pp.acepta_alumnos, true) desc,
           (pp.descripcion is not null or coalesce(array_length(pp.especialidades, 1), 0) > 0) desc,
           2;
$$;

revoke all on function public.profes_disponibles() from public;
grant execute on function public.profes_disponibles() to anon, authenticated;

-- "Elegí tu profe o gimnasio" del registro (reemplaza la de 007): ya no
-- ofrece a los profes que no toman alumnos nuevos.
create or replace function public.opciones_de_profe()
returns table (tipo text, id uuid, nombre text, detalle text)
language sql
stable
security definer
set search_path = public
as $$
  select 'profe'::text,
         p.id,
         trim(coalesce(p.nombre, '') || ' ' || coalesce(p.apellido, '')),
         g.nombre
  from public.perfiles p
  left join public.gimnasios g on g.id = p.gimnasio_id
  left join public.perfiles_profe pp on pp.profe_id = p.id
  where p.es_profe = true
    and coalesce(pp.acepta_alumnos, true)
  union all
  select 'gimnasio'::text, g.id, g.nombre, null::text
  from public.gimnasios g
  where g.activo = true
  order by 1 desc, 3;
$$;

revoke all on function public.opciones_de_profe() from public;
grant execute on function public.opciones_de_profe() to anon, authenticated;

-- 4) Solicitudes ------------------------------------------------------------
create table if not exists public.solicitudes_profe (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.perfiles(id) on delete cascade,
  profe_id uuid not null references public.perfiles(id) on delete cascade,
  mensaje text check (mensaje is null or char_length(mensaje) <= 500),
  estado text not null default 'pendiente'
    check (estado in ('pendiente', 'aceptada', 'rechazada', 'cancelada')),
  respuesta text check (respuesta is null or char_length(respuesta) <= 300),
  creado_en timestamptz not null default now(),
  respondido_en timestamptz,
  respondido_por uuid references public.perfiles(id) on delete set null
);

-- Un alumno tiene como mucho UNA solicitud esperando respuesta.
create unique index if not exists solicitudes_profe_una_pendiente
  on public.solicitudes_profe (cliente_id) where estado = 'pendiente';
create index if not exists solicitudes_profe_profe_idx
  on public.solicitudes_profe (profe_id, estado);

alter table public.solicitudes_profe enable row level security;

-- Las ve el alumno que la mandó, el profe que la recibió y el Admin. Nadie
-- las crea ni las cambia directo: se usan las funciones de abajo.
drop policy if exists "solicitudes: las ven el alumno, el profe y el Admin" on public.solicitudes_profe;
create policy "solicitudes: las ven el alumno, el profe y el Admin"
  on public.solicitudes_profe for select to authenticated
  using (cliente_id = auth.uid() or profe_id = auth.uid() or public.es_admin());

-- El alumno pide un profe. Si ya tenía otra solicitud esperando, esa se
-- cancela (solo una a la vez). Devuelve el id de la solicitud.
create or replace function public.solicitar_profe(p_profe uuid, p_mensaje text default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_yo public.perfiles%rowtype;
  v_id uuid;
  v_mensaje text := nullif(left(trim(coalesce(p_mensaje, '')), 500), '');
  v_nombre text;
begin
  select * into v_yo from public.perfiles where id = auth.uid();
  if v_yo.id is null or coalesce(v_yo.es_profe, false) or coalesce(v_yo.es_admin, false) then
    raise exception 'Solo los alumnos pueden pedir un profe';
  end if;

  if not exists (select 1 from public.perfiles where id = p_profe and es_profe) then
    raise exception 'Ese profe no está disponible';
  end if;

  if exists (select 1 from public.perfiles_profe where profe_id = p_profe and not acepta_alumnos) then
    raise exception 'Ese profe no está tomando alumnos nuevos';
  end if;

  if v_yo.profe_id = p_profe then
    raise exception 'Ya entrenás con ese profe';
  end if;

  -- Si ya le había pedido a este mismo profe, queda la que estaba.
  select id into v_id from public.solicitudes_profe
  where cliente_id = v_yo.id and profe_id = p_profe and estado = 'pendiente';
  if v_id is not null then
    return v_id;
  end if;

  if (select count(*) from public.solicitudes_profe
      where cliente_id = v_yo.id and creado_en > now() - interval '1 day') >= 5 then
    raise exception 'Hiciste muchas solicitudes hoy. Probá de nuevo mañana';
  end if;

  update public.solicitudes_profe
  set estado = 'cancelada', respondido_en = now(), respondido_por = v_yo.id,
      respuesta = 'La cambiaste por otra solicitud'
  where cliente_id = v_yo.id and estado = 'pendiente';

  insert into public.solicitudes_profe (cliente_id, profe_id, mensaje)
  values (v_yo.id, p_profe, v_mensaje)
  returning id into v_id;

  v_nombre := nullif(trim(coalesce(v_yo.nombre, '') || ' ' || coalesce(v_yo.apellido, '')), '');
  perform public.encolar_aviso(
    p_profe, 'profe-solicitud',
    coalesce(v_nombre, 'Un alumno') || ' quiere entrenar con vos',
    coalesce(left(v_mensaje, 120), 'Entrá para aceptar o rechazar la solicitud.'),
    '/profe/solicitudes', 'solicitud:' || v_id
  );

  return v_id;
end;
$$;

revoke all on function public.solicitar_profe(uuid, text) from public, anon;
grant execute on function public.solicitar_profe(uuid, text) to authenticated;

-- El alumno cancela su solicitud (solo si todavía nadie la respondió).
create or replace function public.cancelar_solicitud_profe(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.solicitudes_profe
  set estado = 'cancelada', respondido_en = now(), respondido_por = auth.uid(),
      respuesta = 'La cancelaste'
  where id = p_id and cliente_id = auth.uid() and estado = 'pendiente';
  if not found then
    raise exception 'Esa solicitud ya no está pendiente';
  end if;
end;
$$;

revoke all on function public.cancelar_solicitud_profe(uuid) from public, anon;
grant execute on function public.cancelar_solicitud_profe(uuid) to authenticated;

-- El profe (o el Admin) acepta o rechaza. Al aceptar, el alumno pasa a
-- ser de ese profe (y de su gimnasio). Al alumno le llega el aviso.
create or replace function public.responder_solicitud_profe(
  p_id uuid, p_aceptar boolean, p_respuesta text default null
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sol public.solicitudes_profe%rowtype;
  v_respuesta text := nullif(left(trim(coalesce(p_respuesta, '')), 300), '');
  v_profe_nombre text;
begin
  select * into v_sol from public.solicitudes_profe where id = p_id for update;
  if v_sol.id is null then
    raise exception 'No encontramos esa solicitud';
  end if;
  if v_sol.profe_id <> auth.uid() and not public.es_admin() then
    raise exception 'No podés responder esta solicitud';
  end if;
  if v_sol.estado <> 'pendiente' then
    raise exception 'Esta solicitud ya fue respondida';
  end if;

  v_profe_nombre := coalesce(
    (select nullif(trim(coalesce(nombre, '') || ' ' || coalesce(apellido, '')), '')
     from public.perfiles where id = v_sol.profe_id),
    'Tu profe');

  if p_aceptar then
    if not exists (select 1 from public.perfiles where id = v_sol.profe_id and es_profe) then
      raise exception 'Esa cuenta ya no es de un profe';
    end if;

    update public.solicitudes_profe
    set estado = 'aceptada', respondido_en = now(), respondido_por = auth.uid(),
        respuesta = v_respuesta
    where id = v_sol.id;

    -- El cambio de profe lo hace la base (el alumno no puede cambiarse
    -- solo). "drey.via_solicitud" le dice al trigger de abajo que el
    -- aviso al alumno ya lo manda esta función.
    perform set_config('drey.sistema', 'on', true);
    perform set_config('drey.via_solicitud', 'on', true);
    update public.perfiles
    set profe_id = v_sol.profe_id,
        gimnasio_id = (select gimnasio_id from public.perfiles where id = v_sol.profe_id)
    where id = v_sol.cliente_id;
    perform set_config('drey.via_solicitud', 'off', true);
    perform set_config('drey.sistema', 'off', true);

    perform public.encolar_aviso(
      v_sol.cliente_id, 'solicitud', v_profe_nombre || ' aceptó tu solicitud 🎉',
      coalesce(v_respuesta, 'Desde ahora es tu profe. Pronto te arma la rutina.'),
      '/perfil', 'solicitud-ok:' || v_sol.id
    );
  else
    update public.solicitudes_profe
    set estado = 'rechazada', respondido_en = now(), respondido_por = auth.uid(),
        respuesta = v_respuesta
    where id = v_sol.id;

    perform public.encolar_aviso(
      v_sol.cliente_id, 'solicitud', v_profe_nombre || ' no puede tomarte ahora',
      coalesce(v_respuesta, 'Podés elegir otro profe desde la app.'),
      '/profes', 'solicitud-no:' || v_sol.id
    );
  end if;

  return json_build_object('estado', case when p_aceptar then 'aceptada' else 'rechazada' end);
end;
$$;

revoke all on function public.responder_solicitud_profe(uuid, boolean, text) from public, anon;
grant execute on function public.responder_solicitud_profe(uuid, boolean, text) to authenticated;

-- Solicitudes que ve el profe (las suyas) o el Admin (todas), con lo
-- justo del alumno para decidir: nombre, plan, objetivo y su mensaje.
-- Las pendientes y las respondidas en los últimos 30 días.
create or replace function public.solicitudes_recibidas()
returns table (
  id uuid,
  cliente_id uuid,
  cliente_nombre text,
  plan text,
  objetivo text,
  mensaje text,
  estado text,
  respuesta text,
  creado_en timestamptz,
  respondido_en timestamptz,
  profe_id uuid,
  profe_nombre text
)
language sql
stable
security definer
set search_path = public
as $$
  select s.id,
         s.cliente_id,
         trim(coalesce(c.nombre, '') || ' ' || coalesce(c.apellido, '')),
         c.plan,
         c.objetivo,
         s.mensaje,
         s.estado,
         s.respuesta,
         s.creado_en,
         s.respondido_en,
         s.profe_id,
         trim(coalesce(p.nombre, '') || ' ' || coalesce(p.apellido, ''))
  from public.solicitudes_profe s
  join public.perfiles c on c.id = s.cliente_id
  join public.perfiles p on p.id = s.profe_id
  where (s.profe_id = auth.uid() or public.es_admin())
    and (s.estado = 'pendiente' or s.respondido_en > now() - interval '30 days')
  order by (s.estado = 'pendiente') desc, coalesce(s.respondido_en, s.creado_en) desc
  limit 200;
$$;

revoke all on function public.solicitudes_recibidas() from public, anon;
grant execute on function public.solicitudes_recibidas() to authenticated;

-- 5) Cuando cambia el profe de un alumno (por cualquier camino) -----------
-- Aceptar una solicitud, el Admin desde la ficha o desde Equipo, el dueño
-- de un gimnasio, o un profe que confirma el pago de un alumno sin profe:
--   · Las solicitudes pendientes del alumno se cierran (aceptada si era a
--     ese mismo profe; cancelada si no).
--   · Avisos: al profe nuevo ("Nuevo alumno"), al profe anterior y al
--     alumno ("Tu profe ahora es…"), salvo a quien hizo el cambio.
create or replace function public.al_cambiar_profe_de_alumno()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_alumno text := coalesce(
    nullif(trim(coalesce(new.nombre, '') || ' ' || coalesce(new.apellido, '')), ''), 'Un alumno');
  v_clave text := extract(epoch from now())::bigint::text;
begin
  if coalesce(new.es_profe, false) or coalesce(new.es_admin, false)
     or new.profe_id is not distinct from old.profe_id then
    return new;
  end if;

  if new.profe_id is not null then
    update public.solicitudes_profe
    set estado = case when profe_id = new.profe_id then 'aceptada' else 'cancelada' end,
        respondido_en = now(),
        respondido_por = auth.uid(),
        respuesta = case when profe_id = new.profe_id then respuesta else 'Te asignaron otro profe' end
    where cliente_id = new.id and estado = 'pendiente';

    if auth.uid() is distinct from new.profe_id then
      perform public.encolar_aviso(
        new.profe_id, 'profe-alumno', 'Nuevo alumno: ' || v_alumno,
        'Ya está en tu lista de clientes. Armale la rutina.',
        '/profe/clientes/' || new.id, 'alumno-nuevo:' || new.id || ':' || new.profe_id || ':' || v_clave
      );
    end if;

    if coalesce(current_setting('drey.via_solicitud', true), '') <> 'on'
       and auth.uid() is distinct from new.id then
      perform public.encolar_aviso(
        new.id, 'solicitud', 'Tu profe ahora es ' || public.nombre_de(new.profe_id),
        'Entrá a tu perfil para conocerlo.', '/perfil',
        'profe-asignado:' || new.id || ':' || new.profe_id || ':' || v_clave
      );
    end if;
  end if;

  if old.profe_id is not null and auth.uid() is distinct from old.profe_id then
    perform public.encolar_aviso(
      old.profe_id, 'profe-alumno', v_alumno || ' cambió de profe',
      case when new.profe_id is null then 'Ya no está en tu lista de clientes.'
           else 'Ahora entrena con ' || public.nombre_de(new.profe_id) || '.' end,
      '/profe/clientes', 'alumno-se-fue:' || new.id || ':' || old.profe_id || ':' || v_clave
    );
  end if;

  return new;
end;
$$;

drop trigger if exists perfiles_cambio_de_profe on public.perfiles;
create trigger perfiles_cambio_de_profe
  after update of profe_id on public.perfiles
  for each row execute function public.al_cambiar_profe_de_alumno();
