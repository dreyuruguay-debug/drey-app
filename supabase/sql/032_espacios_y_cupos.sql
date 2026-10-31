-- 032 · Cobro por cupos (Entrega A): espacios, membresías, planes DREY,
--       cupos y prueba gratis
-- ----------------------------------------------------------------------
-- El modelo nuevo, en una frase:
--   El alumno le paga a su profe o a su gimnasio. El profe o el gimnasio
--   le paga a DREY por cupos de alumnos. La base no deja habilitar más
--   alumnos que los cupos pagados.
--
-- Conceptos (ver "DREY - Plan cobro por cupos y registro por tipo.txt"):
--   · ESPACIO: quien le paga a DREY y tiene alumnos. Dos tipos:
--       'profe'    = el espacio personal de un profe (sus alumnos propios).
--       'gimnasio' = el espacio de un gimnasio (uno por cada fila de
--                    "gimnasios").
--   · MEMBRESÍA: una cuenta de profe dentro de un espacio, con un rol:
--       'dueno' = administra todo el espacio (en el espacio personal, el
--                 propio profe; en un gimnasio, su dueño).
--       'profe' = ve solo sus alumnos del espacio y sus rutinas.
--   · Cada ALUMNO pertenece a un solo espacio (perfiles.espacio_id) y
--     ocupa un CUPO mientras está activo (y hasta el fin del período del
--     espacio aunque lo den de baja antes: perfiles.cupo_hasta).
--   · PLANES DREY: los planes por cupos que pagan los espacios.
--   · PRUEBA GRATIS: todo espacio nuevo nace en prueba (Ajustes: 14 días,
--     3 alumnos).
--
-- Qué hace este archivo:
--   1) Ajustes nuevos (prueba gratis, datos de cobro de DREY, días de
--      aviso a los alumnos cuando el espacio no paga).
--   2) Tablas: planes_drey, espacios, membresias, pagos_drey,
--      habilitaciones; en perfiles: espacio_id, cupo_hasta,
--      ultimo_espacio_id.
--   3) Las reglas: estado del espacio, cupos, quién habilita, quién ve
--      a quién.
--   4) Triggers que mantienen todo sincronizado con lo de siempre
--      (profes, gimnasios, dueños) y el control de cupos al habilitar.
--   5) Funciones para la app: mis_espacios, elegir_espacio, avisar pago
--      a DREY, elegir plan DREY, registrar pago DREY (Admin), resumen de
--      espacios (Admin).
--   6) Habilitar un alumno (registrar_pago_manual) revisa cupo y permiso.
--   7) Notificaciones nuevas, historial del Admin y comprobantes.
--   8) Migración: cada profe con su espacio personal, cada gimnasio con
--      su espacio, cada alumno en su espacio. Lo que ya funcionaba queda
--      "sin costo" (sin tope de cupos) hasta que el Admin diga otra cosa.
--
-- Qué NO cambia todavía: el registro, los planes de los alumnos y los
-- datos de cobro que ve el alumno (siguen siendo los de siempre).
--
-- Se puede correr más de una vez sin romper nada.


-- 1) Ajustes nuevos -----------------------------------------------------------
alter table public.ajustes add column if not exists prueba_activa boolean not null default true;
alter table public.ajustes add column if not exists prueba_dias int not null default 14;
alter table public.ajustes add column if not exists prueba_cupos int not null default 3;
alter table public.ajustes add column if not exists dias_aviso_alumnos_espacio int not null default 14;
-- Datos de cobro de DREY (los que ven los profes y gimnasios en
-- "Suscripción DREY"). Los transferencia_* de siempre siguen siendo los
-- que ven los alumnos hasta la Entrega C.
alter table public.ajustes add column if not exists drey_banco text;
alter table public.ajustes add column if not exists drey_titular text;
alter table public.ajustes add column if not exists drey_cuenta text;
alter table public.ajustes add column if not exists drey_moneda text;
alter table public.ajustes add column if not exists drey_link_mp text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'ajustes_prueba_rangos') then
    alter table public.ajustes add constraint ajustes_prueba_rangos check (
      prueba_dias between 1 and 90
      and prueba_cupos between 0 and 100
      and dias_aviso_alumnos_espacio between 0 and 60
    );
  end if;
end;
$$;


-- 2) Tablas -------------------------------------------------------------------

-- Planes DREY: los que pagan los espacios, por cupos (decisión D1).
create table if not exists public.planes_drey (
  id text primary key,
  nombre text not null,
  tipo text not null default 'profe' check (tipo in ('profe', 'gimnasio')),
  cupos int not null check (cupos > 0),
  precio_mensual int not null check (precio_mensual >= 0),
  precio_primer_mes int check (precio_primer_mes >= 0),
  link_mp text,
  descripcion text,
  activo boolean not null default true,
  orden int not null default 0,
  creado_en timestamptz not null default now()
);

insert into public.planes_drey (id, nombre, tipo, cupos, precio_mensual, orden) values
  ('profe-10', 'Profe 10', 'profe', 10, 990, 10),
  ('profe-25', 'Profe 25', 'profe', 25, 1990, 20),
  ('profe-50', 'Profe 50', 'profe', 50, 3490, 30),
  ('gimnasio-50', 'Gimnasio 50', 'gimnasio', 50, 4990, 40),
  ('gimnasio-100', 'Gimnasio 100', 'gimnasio', 100, 7990, 50),
  ('gimnasio-200', 'Gimnasio 200', 'gimnasio', 200, 12990, 60)
on conflict (id) do nothing;

-- Espacios.
create table if not exists public.espacios (
  id uuid primary key default gen_random_uuid(),
  tipo text not null check (tipo in ('profe', 'gimnasio')),
  codigo text not null,
  nombre text not null,
  profe_id uuid references public.perfiles(id) on delete cascade,
  gimnasio_id uuid references public.gimnasios(id) on delete cascade,
  plan_drey text references public.planes_drey(id) on update cascade,
  plan_drey_pedido text references public.planes_drey(id) on update cascade on delete set null,
  cupos_extra int not null default 0 check (cupos_extra >= 0),
  sin_costo boolean not null default false,
  -- Solo si sin_costo: cuántos cupos tiene (null = sin tope).
  cupos_sin_costo int check (cupos_sin_costo >= 0),
  -- Interruptor del gimnasio: los profes también pueden habilitar (D5).
  profes_habilitan boolean not null default false,
  estado text not null default 'prueba' check (estado in ('prueba', 'pendiente', 'activo', 'pausado')),
  prueba_hasta date,
  vencimiento date,
  aviso_pago boolean not null default false,
  aviso_pago_en timestamptz,
  comprobante text,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  constraint espacios_codigo_formato check (codigo ~ '^[A-Z0-9]{4,20}$'),
  constraint espacios_tipo_coherente check (
    (tipo = 'profe' and profe_id is not null and gimnasio_id is null)
    or (tipo = 'gimnasio' and gimnasio_id is not null and profe_id is null)
  )
);

create unique index if not exists espacios_codigo_unico on public.espacios (codigo);
create unique index if not exists espacios_un_personal_por_profe on public.espacios (profe_id) where tipo = 'profe';
create unique index if not exists espacios_uno_por_gimnasio on public.espacios (gimnasio_id) where tipo = 'gimnasio';

-- Membresías: cada profe en cada espacio donde trabaja.
create table if not exists public.membresias (
  id uuid primary key default gen_random_uuid(),
  espacio_id uuid not null references public.espacios(id) on delete cascade,
  perfil_id uuid not null references public.perfiles(id) on delete cascade,
  rol text not null check (rol in ('dueno', 'profe')),
  estado text not null default 'activa' check (estado in ('pendiente', 'activa')),
  invitado_por uuid references public.perfiles(id) on delete set null,
  creado_en timestamptz not null default now(),
  unique (espacio_id, perfil_id)
);

create index if not exists membresias_perfil_idx on public.membresias (perfil_id);

-- Pagos de los espacios a DREY.
-- Si se borra el espacio, sus pagos quedan (con el nombre que tenía).
create table if not exists public.pagos_drey (
  id uuid primary key default gen_random_uuid(),
  espacio_id uuid references public.espacios(id) on delete set null,
  espacio_nombre text,
  plan text,
  cupos int,
  monto int not null default 0 check (monto >= 0),
  primer_mes boolean not null default false,
  metodo text not null default 'transferencia'
    check (metodo in ('transferencia', 'mercadopago', 'efectivo', 'otro')),
  estado text not null default 'aprobado' check (estado in ('aprobado', 'anulado')),
  comprobante text,
  nota text,
  periodo_desde date,
  periodo_hasta date,
  registrado_por uuid references public.perfiles(id) on delete set null,
  creado_en timestamptz not null default now()
);

alter table public.pagos_drey add column if not exists espacio_nombre text;

create index if not exists pagos_drey_espacio_idx on public.pagos_drey (espacio_id, creado_en desc);

-- Quién habilitó a quién (cupo 23 de 50). Lo muestra el dueño del
-- gimnasio en la Entrega B; ya se anota desde ahora.
create table if not exists public.habilitaciones (
  id bigint generated always as identity primary key,
  espacio_id uuid not null references public.espacios(id) on delete cascade,
  alumno_id uuid not null references public.perfiles(id) on delete cascade,
  por_id uuid references public.perfiles(id) on delete set null,
  rol text,
  cupo int,
  cupos int,
  creado_en timestamptz not null default now()
);

create index if not exists habilitaciones_espacio_idx on public.habilitaciones (espacio_id, creado_en desc);

-- Alumnos: a qué espacio pertenecen y hasta cuándo ocupan su cupo.
-- Profes: el último espacio que eligieron en el selector.
alter table public.perfiles add column if not exists espacio_id uuid references public.espacios(id) on delete set null;
alter table public.perfiles add column if not exists cupo_hasta date;
alter table public.perfiles add column if not exists ultimo_espacio_id uuid references public.espacios(id) on delete set null;

create index if not exists perfiles_espacio_idx on public.perfiles (espacio_id, estado);


-- 3) Las reglas ---------------------------------------------------------------

-- Código de espacio: mayúsculas, sin tildes, solo letras y números.
create or replace function public.normalizar_codigo(p_texto text)
returns text
language sql
immutable
as $$
  select left(regexp_replace(
    upper(translate(coalesce(p_texto, ''),
      'áéíóúüñàèìòùâêîôûÁÉÍÓÚÜÑÀÈÌÒÙÂÊÎÔÛ',
      'aeiouunaeiouaeiouAEIOUUNAEIOUAEIOU')),
    '[^A-Z0-9]', '', 'g'), 20);
$$;

-- Un código libre a partir de un nombre ("Facu" → FACU, si está tomado
-- FACU2, FACU3…). Mínimo 4 caracteres.
create or replace function public.codigo_libre(p_base text)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_base text := left(public.normalizar_codigo(p_base), 16);
  v_codigo text;
  v_numero int := 1;
begin
  if length(v_base) < 4 then
    v_base := left(v_base || 'DREY', 16);
  end if;
  v_codigo := v_base;
  while exists (select 1 from public.espacios where codigo = v_codigo) loop
    v_numero := v_numero + 1;
    v_codigo := v_base || v_numero;
  end loop;
  return v_codigo;
end;
$$;

revoke all on function public.codigo_libre(text) from public, anon, authenticated;

-- Estado real del espacio hoy:
--   'sin_costo' · 'prueba' · 'prueba_terminada' · 'activo' (incluye los
--   días de gracia después del vencimiento) · 'vencido' · 'pendiente' ·
--   'pausado'. Solo 'sin_costo', 'prueba' y 'activo' pueden habilitar.
create or replace function public.estado_espacio(p_espacio uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case
    when e.estado = 'pausado' then 'pausado'
    when e.sin_costo then 'sin_costo'
    when e.estado = 'prueba' and coalesce(e.prueba_hasta, public.hoy_uy()) >= public.hoy_uy() then 'prueba'
    when e.estado = 'prueba' then 'prueba_terminada'
    when e.estado = 'activo'
      and (e.vencimiento is null or e.vencimiento + public.dias_de_gracia() >= public.hoy_uy()) then 'activo'
    when e.estado = 'activo' then 'vencido'
    else 'pendiente'
  end
  from public.espacios e
  where e.id = p_espacio;
$$;

revoke all on function public.estado_espacio(uuid) from public, anon;
grant execute on function public.estado_espacio(uuid) to authenticated;

-- Cupos que tiene el espacio (null = sin tope).
create or replace function public.cupos_totales(p_espacio uuid)
returns int
language sql
stable
security definer
set search_path = public
as $$
  select case
    when e.sin_costo then
      case when e.cupos_sin_costo is null then null else e.cupos_sin_costo + e.cupos_extra end
    when public.estado_espacio(e.id) = 'prueba' then
      coalesce((select prueba_cupos from public.ajustes where id = 1), 3) + e.cupos_extra
    else
      coalesce((select cupos from public.planes_drey where id = e.plan_drey), 0) + e.cupos_extra
  end
  from public.espacios e
  where e.id = p_espacio;
$$;

revoke all on function public.cupos_totales(uuid) from public, anon, authenticated;

-- ¿Un alumno ocupa un cupo? Sí, si está habilitado y todavía tiene
-- acceso (no venció, o está en los días de gracia), o si se dio de baja
-- pero su cupo sigue tomado hasta el fin del período (cupo_hasta). Un
-- alumno que venció y no pagó NO ocupa lugar.
create or replace function public.ocupa_cupo(p_estado text, p_vencimiento date, p_cupo_hasta date)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select (
      p_estado = 'activo'
      and (p_vencimiento is null or p_vencimiento + public.dias_de_gracia() >= public.hoy_uy())
    )
    or coalesce(p_cupo_hasta >= public.hoy_uy(), false);
$$;

revoke all on function public.ocupa_cupo(text, date, date) from public, anon, authenticated;

-- Cupos usados: los alumnos del espacio que ocupan un cupo.
create or replace function public.cupos_usados(p_espacio uuid, p_sin uuid default null)
returns int
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::int
  from public.perfiles p
  where p.espacio_id = p_espacio
    and p.id is distinct from p_sin
    and not coalesce(p.es_profe, false)
    and not coalesce(p.es_admin, false)
    and public.ocupa_cupo(p.estado, p.vencimiento, p.cupo_hasta);
$$;

revoke all on function public.cupos_usados(uuid, uuid) from public, anon, authenticated;

-- Para la app: { total (null = sin tope), usados, libres (null = sin
-- tope) }. Solo quien es del espacio o el Admin.
create or replace function public.cupos_de(p_espacio uuid)
returns json
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_total int;
  v_usados int;
begin
  if not (public.es_admin() or public.mi_rol_en_espacio(p_espacio) is not null) then
    return null;
  end if;
  v_total := public.cupos_totales(p_espacio);
  v_usados := public.cupos_usados(p_espacio);
  return json_build_object(
    'total', v_total,
    'usados', v_usados,
    'libres', case when v_total is null then null else greatest(v_total - v_usados, 0) end
  );
end;
$$;

-- Hasta cuándo ocupa el cupo un alumno habilitado hoy: el fin del período
-- del espacio (fin de la prueba o vencimiento), nunca antes de hoy.
create or replace function public.fin_de_periodo(p_espacio uuid)
returns date
language sql
stable
security definer
set search_path = public
as $$
  select greatest(
    public.hoy_uy(),
    coalesce(
      case
        when e.sin_costo then null
        when e.estado = 'prueba' then e.prueba_hasta
        else e.vencimiento
      end,
      public.hoy_uy()
    )
  )
  from public.espacios e
  where e.id = p_espacio;
$$;

revoke all on function public.fin_de_periodo(uuid) from public, anon, authenticated;

-- Mi rol en un espacio: 'dueno', 'profe' o null.
create or replace function public.mi_rol_en_espacio(p_espacio uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select m.rol
  from public.membresias m
  join public.perfiles p on p.id = m.perfil_id
  where m.espacio_id = p_espacio
    and m.perfil_id = auth.uid()
    and m.estado = 'activa'
    and coalesce(p.es_profe, false);
$$;

revoke all on function public.mi_rol_en_espacio(uuid) from public, anon;
grant execute on function public.mi_rol_en_espacio(uuid) to authenticated;
grant execute on function public.cupos_de(uuid) to authenticated;
revoke all on function public.cupos_de(uuid) from public, anon;

-- ¿Puedo habilitar alumnos en este espacio? El Admin, el dueño, y los
-- profes del gimnasio solo si el dueño prendió el interruptor (D5).
create or replace function public.puede_habilitar(p_espacio uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.es_admin()
    or coalesce(public.mi_rol_en_espacio(p_espacio) = 'dueno', false)
    or (
      coalesce(public.mi_rol_en_espacio(p_espacio) = 'profe', false)
      and exists (select 1 from public.espacios e where e.id = p_espacio and e.profes_habilitan)
    );
$$;

revoke all on function public.puede_habilitar(uuid) from public, anon;
grant execute on function public.puede_habilitar(uuid) to authenticated;

-- A qué espacio corresponde un alumno según su profe y su gimnasio.
--   1) Si ya está en un espacio y su profe sigue siendo de ese espacio
--      (o no tiene profe y el espacio es su gimnasio), se queda.
--   2) Si tiene gimnasio con espacio, y su profe (si tiene) trabaja ahí:
--      el espacio del gimnasio.
--   3) Si tiene profe: el espacio personal del profe.
--   4) Si no: ninguno (queda "sin espacio", como hoy los que no eligieron).
create or replace function public.espacio_que_corresponde(p_actual uuid, p_profe uuid, p_gimnasio uuid)
returns uuid
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_espacio uuid;
begin
  if p_actual is not null and exists (
    select 1 from public.espacios e
    where e.id = p_actual
      and (
        (p_profe is not null and exists (
          select 1 from public.membresias m
          where m.espacio_id = e.id and m.perfil_id = p_profe and m.estado = 'activa'))
        or (p_profe is null and e.tipo = 'gimnasio' and e.gimnasio_id = p_gimnasio)
      )
  ) then
    return p_actual;
  end if;

  if p_gimnasio is not null then
    select e.id into v_espacio
    from public.espacios e
    where e.tipo = 'gimnasio' and e.gimnasio_id = p_gimnasio
      and (
        p_profe is null
        or exists (
          select 1 from public.membresias m
          where m.espacio_id = e.id and m.perfil_id = p_profe and m.estado = 'activa')
      );
    if v_espacio is not null then
      return v_espacio;
    end if;
  end if;

  if p_profe is not null then
    select e.id into v_espacio from public.espacios e where e.tipo = 'profe' and e.profe_id = p_profe;
    return v_espacio;
  end if;

  return null;
end;
$$;

revoke all on function public.espacio_que_corresponde(uuid, uuid, uuid) from public, anon, authenticated;

-- Clientes que ve cada uno (reemplaza la de 020). Todo lo de antes, más:
-- el dueño de un espacio ve a todos sus alumnos, y cada profe a los
-- suyos de cada espacio donde trabaja.
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


-- 4) Tablas: quién ve y quién cambia -----------------------------------------
alter table public.planes_drey enable row level security;
alter table public.espacios enable row level security;
alter table public.membresias enable row level security;
alter table public.pagos_drey enable row level security;
alter table public.habilitaciones enable row level security;

-- Planes DREY: los visibles los ve cualquiera (se van a mostrar en la
-- portada); el Admin ve y cambia todos. No se borran: se ocultan.
-- (Dos reglas separadas: quien no inició sesión no puede usar es_admin().)
drop policy if exists "planes_drey: se ven los visibles" on public.planes_drey;
create policy "planes_drey: se ven los visibles"
  on public.planes_drey for select to anon, authenticated
  using (activo);
drop policy if exists "planes_drey: el Admin ve todos" on public.planes_drey;
create policy "planes_drey: el Admin ve todos"
  on public.planes_drey for select to authenticated
  using (public.es_admin());
drop policy if exists "planes_drey: el Admin los crea" on public.planes_drey;
create policy "planes_drey: el Admin los crea"
  on public.planes_drey for insert to authenticated
  with check (public.es_admin());
drop policy if exists "planes_drey: el Admin los cambia" on public.planes_drey;
create policy "planes_drey: el Admin los cambia"
  on public.planes_drey for update to authenticated
  using (public.es_admin()) with check (public.es_admin());
grant select on public.planes_drey to anon, authenticated;
grant insert, update on public.planes_drey to authenticated;

-- Espacios: el Admin todo; cada profe los suyos (solo lectura: lo que
-- cambia el dueño pasa por funciones).
drop policy if exists "espacios: el Admin y sus miembros los ven" on public.espacios;
create policy "espacios: el Admin y sus miembros los ven"
  on public.espacios for select to authenticated
  using (public.es_admin() or public.mi_rol_en_espacio(id) is not null);
drop policy if exists "espacios: el Admin los cambia" on public.espacios;
create policy "espacios: el Admin los cambia"
  on public.espacios for update to authenticated
  using (public.es_admin()) with check (public.es_admin());
drop policy if exists "espacios: el Admin los borra" on public.espacios;
create policy "espacios: el Admin los borra"
  on public.espacios for delete to authenticated
  using (public.es_admin());
grant select, update, delete on public.espacios to authenticated;

-- Membresías: el Admin todas; cada uno las suyas; el dueño las de su
-- espacio.
drop policy if exists "membresias: quién las ve" on public.membresias;
create policy "membresias: quién las ve"
  on public.membresias for select to authenticated
  using (
    public.es_admin()
    or perfil_id = auth.uid()
    or public.mi_rol_en_espacio(espacio_id) = 'dueno'
  );
grant select on public.membresias to authenticated;

-- Pagos a DREY: el Admin y el dueño del espacio. Se anotan solo con
-- funciones.
drop policy if exists "pagos_drey: el Admin y el dueño los ven" on public.pagos_drey;
create policy "pagos_drey: el Admin y el dueño los ven"
  on public.pagos_drey for select to authenticated
  using (public.es_admin() or public.mi_rol_en_espacio(espacio_id) = 'dueno');
grant select on public.pagos_drey to authenticated;

drop policy if exists "habilitaciones: el Admin y el dueño las ven" on public.habilitaciones;
create policy "habilitaciones: el Admin y el dueño las ven"
  on public.habilitaciones for select to authenticated
  using (public.es_admin() or public.mi_rol_en_espacio(espacio_id) = 'dueno');
grant select on public.habilitaciones to authenticated;

create or replace function public.marcar_espacio_actualizado()
returns trigger
language plpgsql
as $$
begin
  new.actualizado_en := now();
  if new.codigo is distinct from old.codigo then
    new.codigo := public.normalizar_codigo(new.codigo);
  end if;
  return new;
end;
$$;

drop trigger if exists espacios_actualizado on public.espacios;
create trigger espacios_actualizado
  before update on public.espacios
  for each row execute function public.marcar_espacio_actualizado();


-- 5) Mantener todo sincronizado ---------------------------------------------

-- Estado con el que nace un espacio: en prueba (si la prueba gratis está
-- prendida) o pendiente de elegir plan.
create or replace function public.crear_espacio(
  p_tipo text, p_nombre text, p_profe uuid, p_gimnasio uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_prueba boolean := coalesce((select prueba_activa from public.ajustes where id = 1), true);
  v_dias int := coalesce((select prueba_dias from public.ajustes where id = 1), 14);
begin
  if p_tipo = 'profe' then
    select id into v_id from public.espacios where tipo = 'profe' and profe_id = p_profe;
  else
    select id into v_id from public.espacios where tipo = 'gimnasio' and gimnasio_id = p_gimnasio;
  end if;
  if v_id is not null then
    return v_id;
  end if;

  insert into public.espacios (tipo, codigo, nombre, profe_id, gimnasio_id, estado, prueba_hasta)
  values (
    p_tipo,
    -- Profe: su nombre ("Facu" → FACU). Gimnasio: el nombre entero sin
    -- espacios ("Gimnasio Las Piedras" → GIMNASIOLASPIEDR).
    public.codigo_libre(case when p_tipo = 'profe'
      then split_part(trim(coalesce(p_nombre, '')), ' ', 1)
      else coalesce(p_nombre, '') end),
    coalesce(nullif(trim(p_nombre), ''), case when p_tipo = 'profe' then 'Profe' else 'Gimnasio' end),
    case when p_tipo = 'profe' then p_profe end,
    case when p_tipo = 'gimnasio' then p_gimnasio end,
    case when v_prueba then 'prueba' else 'pendiente' end,
    case when v_prueba then public.hoy_uy() + v_dias end
  )
  returning id into v_id;
  return v_id;
end;
$$;

revoke all on function public.crear_espacio(text, text, uuid, uuid) from public, anon, authenticated;

-- Pone (o cambia) la membresía de alguien en un espacio. El rol de dueño
-- nunca se pisa con "profe".
create or replace function public.poner_membresia(p_espacio uuid, p_perfil uuid, p_rol text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_espacio is null or p_perfil is null then
    return;
  end if;
  insert into public.membresias (espacio_id, perfil_id, rol, estado)
  values (p_espacio, p_perfil, p_rol, 'activa')
  on conflict (espacio_id, perfil_id) do update
    set rol = case when public.membresias.rol = 'dueno' then 'dueno' else excluded.rol end,
        estado = 'activa';
end;
$$;

revoke all on function public.poner_membresia(uuid, uuid, text) from public, anon, authenticated;

-- Un profe nuevo (o una cuenta que pasa a ser profe): su espacio personal
-- y, si trabaja en un gimnasio, su lugar en ese gimnasio. Si deja de ser
-- profe, sale de todos los espacios y su espacio personal se pausa.
create or replace function public.sincronizar_espacios_de_profe()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_personal uuid;
  v_viejo uuid;
  v_sistema text;
  v_migracion text;
begin
  if coalesce(new.es_profe, false)
     and (tg_op = 'INSERT' or not coalesce(old.es_profe, false)) then
    v_personal := public.crear_espacio(
      'profe', trim(coalesce(new.nombre, '') || ' ' || coalesce(new.apellido, '')), new.id, null);
    perform public.poner_membresia(v_personal, new.id, 'dueno');
    update public.espacios set estado = case when estado = 'pausado' then 'pendiente' else estado end
    where id = v_personal;
    if new.gimnasio_id is not null then
      perform public.poner_membresia(
        (select id from public.espacios where tipo = 'gimnasio' and gimnasio_id = new.gimnasio_id),
        new.id, 'profe');
    end if;
    return new;
  end if;

  if tg_op = 'UPDATE' and coalesce(old.es_profe, false) and not coalesce(new.es_profe, false) then
    delete from public.membresias where perfil_id = new.id;
    update public.espacios set estado = 'pausado' where tipo = 'profe' and profe_id = new.id;
    return new;
  end if;

  -- Cambió de gimnasio: sale del anterior (salvo que sea su dueño), entra
  -- al nuevo, y sus alumnos que estaban en el gimnasio anterior pasan al
  -- espacio que les corresponde ahora (el suyo, o el gimnasio nuevo).
  if tg_op = 'UPDATE' and coalesce(new.es_profe, false)
     and new.gimnasio_id is distinct from old.gimnasio_id then
    v_viejo := (select id from public.espacios where tipo = 'gimnasio' and gimnasio_id = old.gimnasio_id);
    delete from public.membresias
    where espacio_id = v_viejo and perfil_id = new.id and rol = 'profe';
    if new.gimnasio_id is not null then
      perform public.poner_membresia(
        (select id from public.espacios where tipo = 'gimnasio' and gimnasio_id = new.gimnasio_id),
        new.id, 'profe');
    end if;
    if v_viejo is not null and not exists (
      select 1 from public.membresias where espacio_id = v_viejo and perfil_id = new.id
    ) then
      v_sistema := coalesce(current_setting('drey.sistema', true), '');
      v_migracion := coalesce(current_setting('drey.migracion', true), '');
      perform set_config('drey.sistema', 'on', true);
      perform set_config('drey.migracion', 'on', true);
      update public.perfiles c
      set espacio_id = public.espacio_que_corresponde(null, c.profe_id, c.gimnasio_id)
      where c.profe_id = new.id and c.espacio_id = v_viejo;
      perform set_config('drey.sistema', v_sistema, true);
      perform set_config('drey.migracion', v_migracion, true);
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists perfiles_espacios_de_profe on public.perfiles;
create trigger perfiles_espacios_de_profe
  after insert or update of es_profe, gimnasio_id on public.perfiles
  for each row execute function public.sincronizar_espacios_de_profe();

-- Gimnasios: cada uno con su espacio, su nombre y su dueño.
create or replace function public.sincronizar_espacio_de_gimnasio()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_espacio uuid;
begin
  v_espacio := public.crear_espacio('gimnasio', new.nombre, null, new.id);

  if tg_op = 'UPDATE' and new.nombre is distinct from old.nombre then
    update public.espacios set nombre = new.nombre where id = v_espacio;
  end if;

  if tg_op = 'UPDATE' and old.dueno_id is not null and new.dueno_id is distinct from old.dueno_id then
    -- El dueño anterior: si trabaja en el gimnasio sigue como profe; si
    -- no, sale.
    if exists (
      select 1 from public.perfiles
      where id = old.dueno_id and coalesce(es_profe, false) and gimnasio_id = new.id
    ) then
      update public.membresias set rol = 'profe'
      where espacio_id = v_espacio and perfil_id = old.dueno_id;
    else
      delete from public.membresias where espacio_id = v_espacio and perfil_id = old.dueno_id;
    end if;
  end if;

  if new.dueno_id is not null then
    insert into public.membresias (espacio_id, perfil_id, rol, estado)
    values (v_espacio, new.dueno_id, 'dueno', 'activa')
    on conflict (espacio_id, perfil_id) do update set rol = 'dueno', estado = 'activa';
  end if;

  -- Los profes que ya trabajaban en ese gimnasio.
  insert into public.membresias (espacio_id, perfil_id, rol, estado)
  select v_espacio, p.id, 'profe', 'activa'
  from public.perfiles p
  where p.gimnasio_id = new.id and coalesce(p.es_profe, false)
  on conflict (espacio_id, perfil_id) do nothing;

  return new;
end;
$$;

drop trigger if exists gimnasios_espacio on public.gimnasios;
create trigger gimnasios_espacio
  after insert or update of nombre, dueno_id on public.gimnasios
  for each row execute function public.sincronizar_espacio_de_gimnasio();

-- Cada alumno en su espacio. Nadie desde la app cambia el espacio ni el
-- cupo de un alumno a mano (salvo el Admin, el espacio): sale de su profe
-- y su gimnasio, o lo pone la base al habilitarlo.
create or replace function public.ubicar_alumno_en_espacio()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sistema boolean := auth.uid() is null
    or coalesce(current_setting('drey.sistema', true), '') = 'on';
  v_admin boolean := false;
begin
  if coalesce(new.es_profe, false) or coalesce(new.es_admin, false) then
    new.espacio_id := null;
    new.cupo_hasta := null;
    return new;
  end if;

  if not v_sistema then
    v_admin := public.es_admin();
    if tg_op = 'INSERT' then
      new.espacio_id := null;
      new.cupo_hasta := null;
    else
      new.cupo_hasta := old.cupo_hasta;
      if not v_admin then
        new.espacio_id := old.espacio_id;
      end if;
    end if;
  end if;

  -- Si alguien con permiso eligió el espacio a mano, se respeta.
  if tg_op = 'UPDATE' and new.espacio_id is distinct from old.espacio_id and new.espacio_id is not null then
    return new;
  end if;

  if tg_op = 'INSERT'
     or new.espacio_id is null
     or new.profe_id is distinct from old.profe_id
     or new.gimnasio_id is distinct from old.gimnasio_id then
    new.espacio_id := public.espacio_que_corresponde(new.espacio_id, new.profe_id, new.gimnasio_id);
  end if;
  return new;
end;
$$;

drop trigger if exists perfiles_ubicar_en_espacio on public.perfiles;
create trigger perfiles_ubicar_en_espacio
  before insert or update on public.perfiles
  for each row execute function public.ubicar_alumno_en_espacio();

-- EL CONTROL DE CUPOS. Corre cada vez que un alumno queda activo en un
-- espacio donde no estaba ocupando un cupo:
--   · HABILITARLO (no tenía acceso: nuevo, pendiente o vencido sin pagar):
--     solo puede quien tiene permiso en ese espacio (dueño, Admin, o profe
--     del gimnasio con el interruptor prendido), y si lo hizo un profe del
--     gimnasio se le avisa al dueño (D5).
--   · PASARLO a otro espacio estando al día (cambió de profe, por ejemplo
--     al aceptar su solicitud): no es habilitar, no pide permiso.
-- En los dos casos: el espacio tiene que estar en prueba, al día o sin
-- costo, y tiene que quedar un cupo libre. El alumno ocupa el cupo hasta
-- el fin del período del espacio.
-- Confirmar otro mes a un alumno que ya ocupa su cupo no pasa por acá.
create or replace function public.controlar_cupo()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenia_acceso boolean;
  v_estado text;
  v_total int;
  v_usados int;
  v_rol text;
  v_espacio public.espacios%rowtype;
  v_quien text;
  v_alumno text;
  v_dueno uuid;
begin
  if coalesce(new.es_profe, false) or coalesce(new.es_admin, false)
     or new.espacio_id is null or new.estado is distinct from 'activo'
     or coalesce(current_setting('drey.migracion', true), '') = 'on' then
    return new;
  end if;

  v_tenia_acceso := tg_op = 'UPDATE' and public.ocupa_cupo(old.estado, old.vencimiento, old.cupo_hasta);

  -- Ya ocupaba un cupo en este mismo espacio: nada que controlar. Si
  -- cambió el vencimiento (confirmó otro mes), el cupo se estira.
  if v_tenia_acceso and old.espacio_id = new.espacio_id then
    if new.vencimiento is distinct from old.vencimiento then
      new.cupo_hasta := greatest(coalesce(old.cupo_hasta, public.hoy_uy()), public.fin_de_periodo(new.espacio_id));
    end if;
    return new;
  end if;

  -- Bloquea el espacio un momento: dos habilitaciones a la vez no pueden
  -- pasarse del cupo.
  select * into v_espacio from public.espacios where id = new.espacio_id for update;

  if not v_tenia_acceso and auth.uid() is not null and not public.es_admin() then
    v_rol := public.mi_rol_en_espacio(new.espacio_id);
    if not public.puede_habilitar(new.espacio_id) then
      raise exception 'Sin permiso para habilitar: en este gimnasio habilita el dueño'
        using errcode = 'P0001';
    end if;
  end if;

  v_estado := public.estado_espacio(new.espacio_id);
  if v_estado not in ('sin_costo', 'prueba', 'activo') then
    raise exception 'Suscripción DREY: el espacio no está al día (%)', v_estado
      using errcode = 'P0001';
  end if;

  v_total := public.cupos_totales(new.espacio_id);
  v_usados := public.cupos_usados(new.espacio_id, new.id);
  if v_total is not null and v_usados >= v_total then
    raise exception 'Cupo lleno: % de % alumnos', v_usados, v_total
      using errcode = 'P0001';
  end if;

  new.cupo_hasta := greatest(coalesce(new.cupo_hasta, public.hoy_uy()), public.fin_de_periodo(new.espacio_id));

  if not v_tenia_acceso and tg_op = 'UPDATE' then
    insert into public.habilitaciones (espacio_id, alumno_id, por_id, rol, cupo, cupos)
    values (new.espacio_id, new.id, auth.uid(),
            coalesce(v_rol, case when public.es_admin() then 'admin' end), v_usados + 1, v_total);

    -- Lo habilitó un profe del gimnasio: aviso al dueño (D5).
    if v_rol = 'profe' then
      v_quien := public.nombre_de(auth.uid());
      v_alumno := coalesce(nullif(trim(coalesce(new.nombre, '') || ' ' || coalesce(new.apellido, '')), ''), 'un alumno');
      for v_dueno in
        select perfil_id from public.membresias
        where espacio_id = new.espacio_id and rol = 'dueno' and estado = 'activa'
      loop
        perform public.avisar('dueno-habilitacion', v_dueno, jsonb_build_object(
          'profe', v_quien,
          'alumno', v_alumno,
          'cupo', (v_usados + 1)::text,
          'cupos', coalesce(v_total::text, 'sin tope'),
          'espacio', v_espacio.nombre
        ), 'habilito:' || new.id || ':' || v_dueno || ':' || public.hoy_uy());
      end loop;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists perfiles_vigilar_cupo on public.perfiles;
create trigger perfiles_vigilar_cupo
  before insert or update on public.perfiles
  for each row execute function public.controlar_cupo();


-- 6) Funciones para la app ----------------------------------------------------

-- Los espacios del profe que inició sesión (para el selector de arriba
-- del panel). El espacio personal primero.
create or replace function public.mis_espacios()
returns table (
  id uuid,
  tipo text,
  codigo text,
  nombre text,
  rol text,
  estado text,
  estado_real text,
  plan_drey text,
  plan_nombre text,
  plan_drey_pedido text,
  cupos_total int,
  cupos_usados int,
  sin_costo boolean,
  profes_habilitan boolean,
  prueba_hasta date,
  vencimiento date,
  aviso_pago boolean,
  comprobante text,
  ultimo boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select
    e.id, e.tipo, e.codigo, e.nombre, m.rol, e.estado,
    public.estado_espacio(e.id),
    e.plan_drey, pd.nombre, e.plan_drey_pedido,
    public.cupos_totales(e.id), public.cupos_usados(e.id),
    e.sin_costo, e.profes_habilitan, e.prueba_hasta, e.vencimiento,
    e.aviso_pago, case when m.rol = 'dueno' then e.comprobante end,
    coalesce(e.id = yo.ultimo_espacio_id, false)
  from public.membresias m
  join public.espacios e on e.id = m.espacio_id
  join public.perfiles yo on yo.id = m.perfil_id
  left join public.planes_drey pd on pd.id = e.plan_drey
  where m.perfil_id = auth.uid()
    and m.estado = 'activa'
    and coalesce(yo.es_profe, false)
  order by (e.tipo = 'profe') desc, e.nombre;
$$;

revoke all on function public.mis_espacios() from public, anon;
grant execute on function public.mis_espacios() to authenticated;

-- Recuerda el último espacio elegido (para abrir el panel ahí mismo en
-- otro celular).
create or replace function public.elegir_espacio(p_espacio uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.mi_rol_en_espacio(p_espacio) is null then
    raise exception 'No sos parte de ese espacio';
  end if;
  update public.perfiles set ultimo_espacio_id = p_espacio where id = auth.uid();
end;
$$;

revoke all on function public.elegir_espacio(uuid) from public, anon;
grant execute on function public.elegir_espacio(uuid) to authenticated;

-- El dueño elige (o cambia) su plan DREY. Se aplica cuando el Admin
-- confirma el pago.
create or replace function public.elegir_plan_drey(p_espacio uuid, p_plan text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not (public.es_admin() or public.mi_rol_en_espacio(p_espacio) = 'dueno') then
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

revoke all on function public.elegir_plan_drey(uuid, text) from public, anon;
grant execute on function public.elegir_plan_drey(uuid, text) to authenticated;

-- El dueño avisa que le pagó a DREY (con comprobante opcional, subido a
-- su carpeta del bucket "comprobantes"). Le llega al Admin.
create or replace function public.avisar_pago_drey(p_espacio uuid, p_comprobante text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_nombre text;
  v_admin uuid;
begin
  if public.mi_rol_en_espacio(p_espacio) is distinct from 'dueno' then
    raise exception 'Solo el dueño del espacio avisa el pago';
  end if;
  if p_comprobante is not null and split_part(p_comprobante, '/', 1) <> auth.uid()::text then
    raise exception 'Comprobante inválido';
  end if;
  if not exists (
    select 1 from public.espacios where id = p_espacio and coalesce(plan_drey_pedido, plan_drey) is not null
  ) then
    raise exception 'Primero elegí un plan';
  end if;

  update public.espacios
  set aviso_pago = true, aviso_pago_en = now(), comprobante = coalesce(p_comprobante, comprobante)
  where id = p_espacio
  returning nombre into v_nombre;

  for v_admin in select id from public.perfiles where es_admin loop
    perform public.avisar('admin-espacio-pago', v_admin,
      jsonb_build_object('espacio', v_nombre),
      'drey-pago:' || p_espacio || ':' || extract(epoch from now())::bigint);
  end loop;
end;
$$;

revoke all on function public.avisar_pago_drey(uuid, text) from public, anon;
grant execute on function public.avisar_pago_drey(uuid, text) to authenticated;

-- El Admin confirma un pago de un espacio: aplica el plan elegido, suma un
-- mes (desde hoy o desde el vencimiento si todavía no venció) y avisa al
-- dueño. p_monto: si viene vacío, el precio del plan (el del primer mes
-- si es el primer pago y el plan lo tiene).
create or replace function public.registrar_pago_drey(
  p_espacio uuid,
  p_monto int default null,
  p_metodo text default 'transferencia',
  p_nota text default null
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_espacio public.espacios%rowtype;
  v_plan public.planes_drey%rowtype;
  v_primer boolean;
  v_monto int;
  v_desde date;
  v_hasta date;
  v_dueno uuid;
begin
  if not public.es_admin() then
    raise exception 'Solo el Admin confirma pagos a DREY';
  end if;

  select * into v_espacio from public.espacios where id = p_espacio for update;
  if v_espacio.id is null then
    raise exception 'Ese espacio no existe';
  end if;

  select * into v_plan from public.planes_drey where id = coalesce(v_espacio.plan_drey_pedido, v_espacio.plan_drey);
  if v_plan.id is null then
    raise exception 'El espacio todavía no eligió un plan DREY';
  end if;

  v_primer := not exists (select 1 from public.pagos_drey where espacio_id = p_espacio and estado = 'aprobado');
  v_monto := coalesce(p_monto, case when v_primer then v_plan.precio_primer_mes end, v_plan.precio_mensual);
  v_desde := greatest(coalesce(v_espacio.vencimiento, public.hoy_uy()), public.hoy_uy());
  if v_espacio.estado <> 'activo' then
    v_desde := public.hoy_uy();
  end if;
  v_hasta := (v_desde + interval '1 month')::date;

  insert into public.pagos_drey (
    espacio_id, espacio_nombre, plan, cupos, monto, primer_mes, metodo, estado, comprobante, nota,
    periodo_desde, periodo_hasta, registrado_por
  ) values (
    p_espacio, v_espacio.nombre, v_plan.id, v_plan.cupos, v_monto, v_primer,
    coalesce(nullif(p_metodo, ''), 'transferencia'), 'aprobado', v_espacio.comprobante, p_nota,
    v_desde, v_hasta, auth.uid()
  );

  update public.espacios
  set plan_drey = v_plan.id,
      plan_drey_pedido = null,
      estado = 'activo',
      vencimiento = v_hasta,
      aviso_pago = false,
      prueba_hasta = null
  where id = p_espacio;

  for v_dueno in
    select perfil_id from public.membresias where espacio_id = p_espacio and rol = 'dueno' and estado = 'activa'
  loop
    perform public.avisar('espacio-pago-confirmado', v_dueno, jsonb_build_object(
      'espacio', v_espacio.nombre, 'plan', v_plan.nombre, 'fecha', public.fecha_corta(v_hasta)
    ), 'drey-confirmado:' || p_espacio || ':' || v_hasta);
  end loop;

  return json_build_object('vencimiento', v_hasta, 'monto', v_monto, 'plan', v_plan.nombre);
end;
$$;

revoke all on function public.registrar_pago_drey(uuid, int, text, text) from public, anon;
grant execute on function public.registrar_pago_drey(uuid, int, text, text) to authenticated;

-- Todos los espacios con sus números (solo el Admin): Pagos →
-- Suscripciones DREY, Equipo → Espacios e Inicio.
create or replace function public.resumen_espacios()
returns table (
  id uuid,
  tipo text,
  codigo text,
  nombre text,
  estado text,
  estado_real text,
  plan_drey text,
  plan_nombre text,
  plan_drey_pedido text,
  pedido_nombre text,
  cupos_extra int,
  sin_costo boolean,
  cupos_sin_costo int,
  profes_habilitan boolean,
  cupos_total int,
  cupos_usados int,
  prueba_hasta date,
  vencimiento date,
  aviso_pago boolean,
  aviso_pago_en timestamptz,
  comprobante text,
  dueno text,
  dueno_email text,
  dueno_celular text,
  profes int,
  creado_en timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    e.id, e.tipo, e.codigo, e.nombre, e.estado, public.estado_espacio(e.id),
    e.plan_drey, pd.nombre, e.plan_drey_pedido, pp.nombre,
    e.cupos_extra, e.sin_costo, e.cupos_sin_costo, e.profes_habilitan,
    public.cupos_totales(e.id), public.cupos_usados(e.id),
    e.prueba_hasta, e.vencimiento, e.aviso_pago, e.aviso_pago_en, e.comprobante,
    d.nombre_completo, d.email, d.celular,
    (select count(*)::int from public.membresias m2 where m2.espacio_id = e.id and m2.estado = 'activa'),
    e.creado_en
  from public.espacios e
  left join public.planes_drey pd on pd.id = e.plan_drey
  left join public.planes_drey pp on pp.id = e.plan_drey_pedido
  left join lateral (
    select trim(coalesce(p.nombre, '') || ' ' || coalesce(p.apellido, '')) as nombre_completo,
           u.email, p.celular
    from public.membresias m
    join public.perfiles p on p.id = m.perfil_id
    left join auth.users u on u.id = p.id
    where m.espacio_id = e.id and m.rol = 'dueno' and m.estado = 'activa'
    order by m.creado_en
    limit 1
  ) d on true
  where public.es_admin()
  order by e.aviso_pago desc, e.tipo, e.nombre;
$$;

revoke all on function public.resumen_espacios() from public, anon;
grant execute on function public.resumen_espacios() to authenticated;


-- 7) Habilitar un alumno revisa cupo y permiso (reemplaza la de 020) ---------
-- p_espacio: el espacio elegido en el panel. Solo se usa si el alumno
-- todavía no tiene espacio (por ejemplo, se registró sin elegir profe).
drop function if exists public.registrar_pago_manual(uuid, int);
create or replace function public.registrar_pago_manual(
  p_cliente uuid,
  p_monto int default null,
  p_espacio uuid default null
)
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
  v_espacio uuid;
begin
  if not public.puede_ver_cliente(p_cliente) then
    raise exception 'No tenés acceso a este cliente';
  end if;

  v_espacio := (select espacio_id from public.perfiles where id = p_cliente);
  if v_espacio is null then
    if p_espacio is not null and (public.es_admin() or public.mi_rol_en_espacio(p_espacio) is not null) then
      v_espacio := p_espacio;
    elsif v_soy_profe then
      v_espacio := (select id from public.espacios where tipo = 'profe' and profe_id = auth.uid());
    end if;
  end if;

  -- Habilitar y confirmar pagos en un espacio: el dueño, el Admin, o los
  -- profes del gimnasio si el dueño lo permite (D5).
  if v_espacio is not null and not public.puede_habilitar(v_espacio) then
    raise exception 'Sin permiso para habilitar: en este gimnasio habilita el dueño'
      using errcode = 'P0001';
  end if;

  v_precio := public.calcular_precio(p_cliente, null);
  v_monto := coalesce(p_monto, (v_precio ->> 'monto')::int, 0);

  -- Primero el perfil (acá corre el control de cupos: si no hay lugar,
  -- no se anota ningún pago).
  perform set_config('drey.sistema', 'on', true);
  update public.perfiles
  set estado = 'activo',
      aviso_pago = false,
      espacio_id = coalesce(espacio_id, v_espacio),
      profe_id = coalesce(profe_id, case when v_soy_profe then auth.uid() end),
      vencimiento = (greatest(coalesce(vencimiento, v_hoy), v_hoy) + interval '1 month')::date
  where id = p_cliente
  returning vencimiento into v_vencimiento;
  perform set_config('drey.sistema', 'off', true);

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

  if (v_precio ->> 'codigo_id') is not null then
    update public.codigos_descuento set usos = usos + 1 where id = (v_precio ->> 'codigo_id')::uuid;
  end if;

  return json_build_object('vencimiento', v_vencimiento, 'monto', v_monto);
end;
$$;

revoke all on function public.registrar_pago_manual(uuid, int, uuid) from public, anon;
grant execute on function public.registrar_pago_manual(uuid, int, uuid) to authenticated;


-- 8) Notificaciones nuevas ----------------------------------------------------
insert into public.tipos_aviso as t (
  clave, orden, grupo, disparo, nombre, descripcion, titulo, cuerpo, titulo_original,
  cuerpo_original, url, destino, destinos_posibles, variables, nota
) values
  ('dueno-habilitacion', 300, 'profe', 'accion', 'Un profe habilitó un alumno',
   'Al dueño del gimnasio, cuando un profe del gimnasio habilita a un alumno (solo si el dueño dejó que los profes habiliten).',
   '{profe} habilitó a {alumno}', 'Cupo {cupo} de {cupos} en {espacio}.',
   '{profe} habilitó a {alumno}', 'Cupo {cupo} de {cupos} en {espacio}.',
   '/profe/cuentas', 'dueno', '{dueno}',
   '[{"clave":"nombre","texto":"Nombre de quien recibe","ejemplo":"Bruno"},{"clave":"profe","texto":"Profe que habilitó","ejemplo":"Ana Gómez"},{"clave":"alumno","texto":"Alumno habilitado","ejemplo":"María López"},{"clave":"cupo","texto":"Cupo que ocupa","ejemplo":"23"},{"clave":"cupos","texto":"Cupos del plan","ejemplo":"50"},{"clave":"espacio","texto":"Gimnasio","ejemplo":"FitCenter"}]',
   null),
  ('admin-espacio-pago', 310, 'profe', 'accion', 'Un espacio avisó que pagó DREY',
   'Al Admin, cuando un profe o gimnasio toca "Ya pagué" en Suscripción DREY.',
   '{espacio} avisó que pagó DREY', 'Revisá el comprobante y confirmalo en Pagos → Suscripciones DREY.',
   '{espacio} avisó que pagó DREY', 'Revisá el comprobante y confirmalo en Pagos → Suscripciones DREY.',
   '/profe/cuentas?tab=drey', 'admin', '{admin}',
   '[{"clave":"nombre","texto":"Nombre de quien recibe","ejemplo":"Admin"},{"clave":"espacio","texto":"Profe o gimnasio","ejemplo":"FitCenter"}]',
   null),
  ('espacio-pago-confirmado', 320, 'profe', 'accion', 'Suscripción DREY confirmada',
   'Al dueño del espacio, cuando el Admin confirma su pago a DREY.',
   'Suscripción DREY al día ✅', '{espacio}: plan {plan} hasta el {fecha}.',
   'Suscripción DREY al día ✅', '{espacio}: plan {plan} hasta el {fecha}.',
   '/profe/suscripcion', 'dueno', '{dueno}',
   '[{"clave":"nombre","texto":"Nombre de quien recibe","ejemplo":"Bruno"},{"clave":"espacio","texto":"Profe o gimnasio","ejemplo":"FitCenter"},{"clave":"plan","texto":"Plan DREY","ejemplo":"Gimnasio 50"},{"clave":"fecha","texto":"Nuevo vencimiento","ejemplo":"30/11"}]',
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


-- 9) Historial del Admin ----------------------------------------------------
create or replace function public.historial_planes_drey()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cambios text[] := '{}';
begin
  if tg_op = 'INSERT' then
    perform public.anotar_historial('drey', 'Creó el plan DREY "' || new.nombre || '" (' ||
      new.cupos || ' alumnos, ' || public.pesos(new.precio_mensual) || ' por mes)');
    return new;
  end if;
  if new.nombre is distinct from old.nombre then
    v_cambios := v_cambios || ('nombre: "' || old.nombre || '" → "' || new.nombre || '"');
  end if;
  if new.cupos is distinct from old.cupos then
    v_cambios := v_cambios || ('cupos: ' || old.cupos || ' → ' || new.cupos);
  end if;
  if new.precio_mensual is distinct from old.precio_mensual then
    v_cambios := v_cambios || ('por mes: ' || public.pesos(old.precio_mensual) || ' → ' || public.pesos(new.precio_mensual));
  end if;
  if new.precio_primer_mes is distinct from old.precio_primer_mes then
    v_cambios := v_cambios || ('primer mes: ' || public.pesos(old.precio_primer_mes) || ' → ' || public.pesos(new.precio_primer_mes));
  end if;
  if new.link_mp is distinct from old.link_mp then
    v_cambios := v_cambios || 'link de Mercado Pago'::text;
  end if;
  if new.descripcion is distinct from old.descripcion then
    v_cambios := v_cambios || 'descripción'::text;
  end if;
  if new.activo is distinct from old.activo then
    v_cambios := v_cambios || (case when new.activo then 'ahora se ofrece' else 'oculto' end);
  end if;
  if array_length(v_cambios, 1) > 0 then
    perform public.anotar_historial('drey', 'Plan DREY "' || new.nombre || '": ' || array_to_string(v_cambios, ', '));
  end if;
  return new;
end;
$$;

drop trigger if exists planes_drey_historial on public.planes_drey;
create trigger planes_drey_historial
  after insert or update on public.planes_drey
  for each row execute function public.historial_planes_drey();

create or replace function public.historial_espacios()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cambios text[] := '{}';
begin
  if tg_op = 'DELETE' then
    perform public.anotar_historial('espacio', 'Borró el espacio ' || old.nombre || ' (' || old.codigo || ')');
    return old;
  end if;
  if new.nombre is distinct from old.nombre then
    v_cambios := v_cambios || ('nombre → "' || new.nombre || '"');
  end if;
  if new.codigo is distinct from old.codigo then
    v_cambios := v_cambios || ('código: ' || old.codigo || ' → ' || new.codigo);
  end if;
  if new.plan_drey is distinct from old.plan_drey then
    v_cambios := v_cambios || ('plan: ' ||
      coalesce((select nombre from public.planes_drey where id = old.plan_drey), 'ninguno') || ' → ' ||
      coalesce((select nombre from public.planes_drey where id = new.plan_drey), 'ninguno'));
  end if;
  if new.cupos_extra is distinct from old.cupos_extra then
    v_cambios := v_cambios || ('cupos extra: ' || old.cupos_extra || ' → ' || new.cupos_extra);
  end if;
  if new.sin_costo is distinct from old.sin_costo then
    v_cambios := v_cambios || (case when new.sin_costo then 'ahora es sin costo' else 'ya no es sin costo' end);
  end if;
  if new.cupos_sin_costo is distinct from old.cupos_sin_costo then
    v_cambios := v_cambios || ('cupos sin costo: ' || coalesce(new.cupos_sin_costo::text, 'sin tope'));
  end if;
  if new.profes_habilitan is distinct from old.profes_habilitan then
    v_cambios := v_cambios || (case when new.profes_habilitan then 'los profes pueden habilitar' else 'solo el dueño habilita' end);
  end if;
  if new.estado is distinct from old.estado then
    v_cambios := v_cambios || ('estado: ' || old.estado || ' → ' || new.estado);
  end if;
  if new.vencimiento is distinct from old.vencimiento then
    v_cambios := v_cambios || ('vence: ' || coalesce(public.fecha_corta(new.vencimiento), '—'));
  end if;
  if new.prueba_hasta is distinct from old.prueba_hasta and new.prueba_hasta is not null then
    v_cambios := v_cambios || ('prueba hasta: ' || public.fecha_corta(new.prueba_hasta));
  end if;
  if array_length(v_cambios, 1) > 0 then
    perform public.anotar_historial('espacio', 'Espacio ' || new.nombre || ': ' || array_to_string(v_cambios, ', '));
  end if;
  return new;
end;
$$;

drop trigger if exists espacios_historial on public.espacios;
create trigger espacios_historial
  after update or delete on public.espacios
  for each row execute function public.historial_espacios();

create or replace function public.historial_pagos_drey()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.anotar_historial('drey', 'Confirmó el pago de ' ||
    coalesce(new.espacio_nombre, (select nombre from public.espacios where id = new.espacio_id), 'un espacio') ||
    ' a DREY (' || public.pesos(new.monto) || ', plan ' ||
    coalesce((select nombre from public.planes_drey where id = new.plan), new.plan, '—') ||
    ', hasta el ' || coalesce(public.fecha_corta(new.periodo_hasta), '—') || ')');
  return new;
end;
$$;

drop trigger if exists pagos_drey_historial on public.pagos_drey;
create trigger pagos_drey_historial
  after insert on public.pagos_drey
  for each row execute function public.historial_pagos_drey();

-- Ajustes (reemplaza la de 022): lo de siempre más lo nuevo.
create or replace function public.historial_ajustes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cambios text[] := '{}';
begin
  if (new.transferencia_banco, new.transferencia_titular, new.transferencia_cuenta, new.transferencia_moneda)
     is distinct from
     (old.transferencia_banco, old.transferencia_titular, old.transferencia_cuenta, old.transferencia_moneda) then
    v_cambios := v_cambios || 'datos para transferencia'::text;
  end if;
  if new.cobro_automatico is distinct from old.cobro_automatico then
    v_cambios := v_cambios || (case when new.cobro_automatico
      then 'activó el cobro automático con Mercado Pago'
      else 'desactivó el cobro automático con Mercado Pago' end);
  end if;
  if new.whatsapp_grupo_url is distinct from old.whatsapp_grupo_url then
    v_cambios := v_cambios || 'link del grupo de WhatsApp'::text;
  end if;
  if new.dias_aviso is distinct from old.dias_aviso then
    v_cambios := v_cambios || ('aviso de vencimiento: ' || old.dias_aviso || ' → ' || new.dias_aviso || ' días antes');
  end if;
  if new.dias_de_gracia is distinct from old.dias_de_gracia then
    v_cambios := v_cambios || ('días de gracia: ' || old.dias_de_gracia || ' → ' || new.dias_de_gracia);
  end if;
  if new.prueba_activa is distinct from old.prueba_activa then
    v_cambios := v_cambios || (case when new.prueba_activa then 'prendió la prueba gratis' else 'apagó la prueba gratis' end);
  end if;
  if new.prueba_dias is distinct from old.prueba_dias then
    v_cambios := v_cambios || ('días de prueba: ' || old.prueba_dias || ' → ' || new.prueba_dias);
  end if;
  if new.prueba_cupos is distinct from old.prueba_cupos then
    v_cambios := v_cambios || ('alumnos en la prueba: ' || old.prueba_cupos || ' → ' || new.prueba_cupos);
  end if;
  if new.dias_aviso_alumnos_espacio is distinct from old.dias_aviso_alumnos_espacio then
    v_cambios := v_cambios || ('días de aviso a los alumnos si el espacio no paga: ' ||
      old.dias_aviso_alumnos_espacio || ' → ' || new.dias_aviso_alumnos_espacio);
  end if;
  if (new.drey_banco, new.drey_titular, new.drey_cuenta, new.drey_moneda, new.drey_link_mp)
     is distinct from
     (old.drey_banco, old.drey_titular, old.drey_cuenta, old.drey_moneda, old.drey_link_mp) then
    v_cambios := v_cambios || 'datos de cobro de DREY'::text;
  end if;

  if array_length(v_cambios, 1) > 0 then
    perform public.anotar_historial('ajustes', 'Ajustes: ' || array_to_string(v_cambios, ', '));
  end if;
  return new;
end;
$$;


-- 10) Comprobantes: el Admin ve los de los espacios -------------------------
drop policy if exists "comprobantes: el Admin los ve todos" on storage.objects;
create policy "comprobantes: el Admin los ve todos"
  on storage.objects for select to authenticated
  using (bucket_id = 'comprobantes' and public.es_admin());


-- 11) Migración -------------------------------------------------------------
-- La primera vez que se corre:
--   · cada profe con su espacio personal (él como dueño);
--   · cada gimnasio con su espacio (su dueño como dueño, sus profes como
--     profes);
--   · cada alumno en el espacio que le corresponde (su profe o su
--     gimnasio), ocupando su cupo si está activo;
--   · los espacios que ya tienen alumnos habilitados (Facu y cualquiera
--     que ya esté trabajando) quedan "sin costo" y sin tope, para que nada
--     se corte; en esos gimnasios los profes siguen habilitando y cobrando
--     como hoy. El Admin lo cambia cuando quiera desde Equipo → Espacios.
--   · los demás, en prueba gratis.
-- Si se vuelve a correr, solo completa lo que falte.
do $$
declare
  v_primera_vez boolean := not exists (select 1 from public.espacios);
  fila record;
  v_espacio uuid;
begin
  perform set_config('drey.migracion', 'on', true);
  perform set_config('drey.sistema', 'on', true);

  -- Gimnasios.
  for fila in select * from public.gimnasios loop
    v_espacio := public.crear_espacio('gimnasio', fila.nombre, null, fila.id);
    if fila.dueno_id is not null then
      insert into public.membresias (espacio_id, perfil_id, rol, estado)
      values (v_espacio, fila.dueno_id, 'dueno', 'activa')
      on conflict (espacio_id, perfil_id) do update set rol = 'dueno', estado = 'activa';
    end if;
  end loop;

  -- Profes.
  for fila in
    select * from public.perfiles where coalesce(es_profe, false) order by creado_en
  loop
    v_espacio := public.crear_espacio(
      'profe', trim(coalesce(fila.nombre, '') || ' ' || coalesce(fila.apellido, '')), fila.id, null);
    perform public.poner_membresia(v_espacio, fila.id, 'dueno');
    if fila.gimnasio_id is not null then
      perform public.poner_membresia(
        (select id from public.espacios where tipo = 'gimnasio' and gimnasio_id = fila.gimnasio_id),
        fila.id, 'profe');
    end if;
  end loop;

  -- Alumnos sin espacio.
  update public.perfiles p
  set espacio_id = public.espacio_que_corresponde(null, p.profe_id, p.gimnasio_id)
  where p.espacio_id is null
    and not coalesce(p.es_profe, false)
    and not coalesce(p.es_admin, false);

  if v_primera_vez then
    -- Los que ya trabajan (con algún alumno habilitado): sin costo.
    update public.espacios e
    set sin_costo = true, cupos_sin_costo = null, estado = 'activo', prueba_hasta = null
    where exists (
      select 1 from public.perfiles p
      where p.espacio_id = e.id and p.estado = 'activo'
        and not coalesce(p.es_profe, false) and not coalesce(p.es_admin, false)
    );
    -- En los gimnasios que ya trabajan, sus profes siguen pudiendo
    -- habilitar y cobrar a sus alumnos como hasta hoy. El Admin (y en la
    -- Entrega B el dueño) lo apaga cuando quiera.
    update public.espacios set profes_habilitan = true
    where tipo = 'gimnasio' and sin_costo;
  end if;

  -- Los alumnos habilitados y al día ocupan su cupo hasta el fin del
  -- período (los vencidos que no pagaron, no).
  update public.perfiles p
  set cupo_hasta = public.fin_de_periodo(p.espacio_id)
  where p.espacio_id is not null and p.cupo_hasta is null
    and public.ocupa_cupo(p.estado, p.vencimiento, null);

  perform set_config('drey.sistema', 'off', true);
  perform set_config('drey.migracion', 'off', true);
end;
$$;
