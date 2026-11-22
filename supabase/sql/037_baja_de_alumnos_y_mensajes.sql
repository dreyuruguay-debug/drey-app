-- 037 · Baja de alumnos y mensajes del profe (noviembre 2026)
--
-- Qué agrega:
--   1. DAR DE BAJA a un alumno que ya no sigue. Sale de las listas del
--      profe y deja de tener acceso, pero conserva su cuenta y todo su
--      historial. El profe lo puede volver a sumar cuando quiera.
--      · Estado nuevo en perfiles: 'baja' (además de 'pendiente' y 'activo').
--      · El cupo se libera como siempre (SQL 032): al terminar el período
--        ya pago del espacio. Así no se puede rotar alumnos dentro del mes.
--   2. MENSAJES DEL PROFE: un mensaje grande que el alumno ve al abrir la
--      app, para todos sus alumnos o para uno solo, en los días que elija
--      (también sirve para el saludo de Navidad o de fin de año).
--
-- Hay que correrlo ANTES de subir la app nueva.
-- Se puede correr más de una vez sin romper nada.

-- 1) Baja de alumnos -----------------------------------------------------------
alter table public.perfiles add column if not exists baja_en timestamptz;
alter table public.perfiles
  add column if not exists baja_por uuid references public.perfiles(id) on delete set null;

-- Si la tabla tuviera una regla vieja que solo acepta 'pendiente' y
-- 'activo' en "estado", se quita para que acepte 'baja'. (Los cambios de
-- estado los hacen solo las funciones de la base.)
do $$
declare
  v_regla record;
begin
  for v_regla in
    select conname
    from pg_constraint
    where conrelid = 'public.perfiles'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%estado%'
      and pg_get_constraintdef(oid) not ilike '%baja%'
  loop
    execute format('alter table public.perfiles drop constraint %I', v_regla.conname);
    raise notice 'Se quitó la regla % de perfiles (no aceptaba el estado baja).', v_regla.conname;
  end loop;
end;
$$;

-- Quién puede dar de baja (o volver a sumar) a un alumno: el Admin, su
-- profe, o el dueño del espacio (gimnasio) donde está.
create or replace function public.puede_dar_de_baja(p_cliente uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.es_admin()
    or (
      public.puede_ver_cliente(p_cliente)
      and exists (
        select 1 from public.perfiles c
        where c.id = p_cliente
          and (
            c.profe_id = auth.uid()
            or c.baja_por = auth.uid()
            or c.espacio_id is null
            or coalesce(public.mi_rol_en_espacio(c.espacio_id) = 'dueno', false)
          )
      )
    );
$$;

revoke all on function public.puede_dar_de_baja(uuid) from public, anon;
grant execute on function public.puede_dar_de_baja(uuid) to authenticated;

-- Da de baja a un alumno. No borra nada: rutinas, entrenamientos y pagos
-- quedan guardados.
create or replace function public.dar_de_baja_alumno(p_cliente uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sistema text := coalesce(current_setting('drey.sistema', true), '');
begin
  if auth.uid() is null or not public.puede_dar_de_baja(p_cliente) then
    raise exception 'Sin permiso para dar de baja a este alumno' using errcode = 'P0001';
  end if;
  if exists (
    select 1 from public.perfiles
    where id = p_cliente and (coalesce(es_profe, false) or coalesce(es_admin, false))
  ) then
    raise exception 'Solo se da de baja a alumnos' using errcode = 'P0001';
  end if;

  perform set_config('drey.sistema', 'on', true);
  update public.perfiles
  set estado = 'baja',
      baja_en = now(),
      baja_por = auth.uid(),
      aviso_pago = false
  where id = p_cliente and estado is distinct from 'baja';
  perform set_config('drey.sistema', v_sistema, true);
end;
$$;

revoke all on function public.dar_de_baja_alumno(uuid) from public, anon;
grant execute on function public.dar_de_baja_alumno(uuid) to authenticated;

-- Vuelve a sumar a un alumno dado de baja: queda "pendiente", como una
-- cuenta nueva, y se habilita desde Cobros igual que siempre (ahí la base
-- revisa que haya cupo).
create or replace function public.reactivar_alumno(p_cliente uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sistema text := coalesce(current_setting('drey.sistema', true), '');
begin
  if auth.uid() is null or not public.puede_dar_de_baja(p_cliente) then
    raise exception 'Sin permiso para volver a sumar a este alumno' using errcode = 'P0001';
  end if;

  perform set_config('drey.sistema', 'on', true);
  update public.perfiles
  set estado = 'pendiente'
  where id = p_cliente and estado = 'baja';
  perform set_config('drey.sistema', v_sistema, true);
end;
$$;

revoke all on function public.reactivar_alumno(uuid) from public, anon;
grant execute on function public.reactivar_alumno(uuid) to authenticated;

-- Al salir de la baja se limpian la fecha y quién la dio. Y si el alumno
-- dado de baja pasa a otro profe (por ejemplo, le aceptan una solicitud),
-- deja de estar de baja y queda pendiente con el profe nuevo.
create or replace function public.salir_de_baja()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.estado = 'baja' then
    if new.estado = 'baja' and new.profe_id is distinct from old.profe_id then
      new.estado := 'pendiente';
    end if;
    if new.estado is distinct from 'baja' then
      new.baja_en := null;
      new.baja_por := null;
    end if;
  end if;
  return new;
end;
$$;

-- (El nombre importa: los triggers corren en orden alfabético y este tiene
-- que ir antes de "perfiles_ubicar_en_espacio" y "perfiles_vigilar_cupo".)
drop trigger if exists perfiles_salir_de_baja on public.perfiles;
create trigger perfiles_salir_de_baja
  before update on public.perfiles
  for each row execute function public.salir_de_baja();


-- 2) Mensajes del profe ----------------------------------------------------------
-- cliente_id vacío = para todos los alumnos de ese profe.
-- desde / hasta: los días en que se muestra (los dos incluidos).
create table if not exists public.mensajes_profe (
  id uuid primary key default gen_random_uuid(),
  profe_id uuid not null default auth.uid() references public.perfiles(id) on delete cascade,
  cliente_id uuid references public.perfiles(id) on delete cascade,
  texto text not null check (char_length(btrim(texto)) between 1 and 300),
  desde date not null default public.hoy_uy(),
  hasta date not null default public.hoy_uy(),
  creado_en timestamptz not null default now(),
  check (hasta >= desde)
);

create index if not exists mensajes_profe_profe_idx on public.mensajes_profe (profe_id, hasta);
create index if not exists mensajes_profe_cliente_idx on public.mensajes_profe (cliente_id, hasta);

alter table public.mensajes_profe enable row level security;

-- Cada profe maneja los suyos (el Admin, todos). Uno para un alumno en
-- particular, solo si ese alumno es suyo.
drop policy if exists "mensajes_profe: el profe ve los suyos" on public.mensajes_profe;
create policy "mensajes_profe: el profe ve los suyos"
  on public.mensajes_profe for select to authenticated
  using (profe_id = auth.uid() or public.es_admin());

drop policy if exists "mensajes_profe: el profe crea los suyos" on public.mensajes_profe;
create policy "mensajes_profe: el profe crea los suyos"
  on public.mensajes_profe for insert to authenticated
  with check (
    profe_id = auth.uid()
    and public.es_profe()
    and (cliente_id is null or public.puede_ver_cliente(cliente_id))
  );

drop policy if exists "mensajes_profe: el profe cambia los suyos" on public.mensajes_profe;
create policy "mensajes_profe: el profe cambia los suyos"
  on public.mensajes_profe for update to authenticated
  using (profe_id = auth.uid() or public.es_admin())
  with check (
    (profe_id = auth.uid() or public.es_admin())
    and (cliente_id is null or public.puede_ver_cliente(cliente_id))
  );

drop policy if exists "mensajes_profe: el profe borra los suyos" on public.mensajes_profe;
create policy "mensajes_profe: el profe borra los suyos"
  on public.mensajes_profe for delete to authenticated
  using (profe_id = auth.uid() or public.es_admin());

revoke all on public.mensajes_profe from anon;
grant select, insert, update, delete on public.mensajes_profe to authenticated;

-- Lo que ve el alumno al abrir la app: el nombre de su profe (para el
-- saludo de las fiestas) y los mensajes de HOY: primero los que son solo
-- para él, después los generales; los más nuevos arriba.
-- Un alumno dado de baja no recibe mensajes.
create or replace function public.mensajes_para_mi()
returns json
language sql
stable
security definer
set search_path = public
as $$
  select json_build_object(
    'profe', (
      select nullif(btrim(coalesce(pr.nombre, '')), '')
      from public.perfiles pr
      where pr.id = yo.profe_id
    ),
    'mensajes', coalesce((
      select json_agg(
        json_build_object('id', m.id, 'texto', m.texto, 'personal', m.cliente_id is not null)
        order by (m.cliente_id is not null) desc, m.creado_en desc
      )
      from public.mensajes_profe m
      where yo.estado is distinct from 'baja'
        and public.hoy_uy() between m.desde and m.hasta
        and (m.cliente_id = yo.id or (m.cliente_id is null and m.profe_id = yo.profe_id))
    ), '[]'::json)
  )
  from public.perfiles yo
  where yo.id = auth.uid();
$$;

revoke all on function public.mensajes_para_mi() from public, anon;
grant execute on function public.mensajes_para_mi() to authenticated;

-- Para que la app vea enseguida lo nuevo.
notify pgrst, 'reload schema';
