-- 034 · Cobro por cupos (Entrega C): cada espacio cobra a sus alumnos
-- ----------------------------------------------------------------------
-- Necesita los SQL 032 y 033.
--
-- Hasta ahora había UNA lista de planes para alumnos y UNOS datos de cobro
-- (los de Facu, en Ajustes). Desde acá cada espacio (cada profe y cada
-- gimnasio) tiene los suyos:
--
--   1) PLANES DE ALUMNOS por espacio (planes.espacio_id). El dueño crea,
--      cambia y oculta los suyos (guardar_plan_espacio). Los planes no se
--      borran (hay alumnos que los tienen).
--   2) DATOS DE COBRO por espacio (tabla datos_cobro: banco, titular,
--      cuenta, moneda, alias y un link de Mercado Pago general). Los ve el
--      alumno de ese espacio (al registrarse, con el código, y en
--      Suscripción).
--   3) CÓDIGOS DE DESCUENTO de planes por espacio: un código vale solo para
--      los planes de su espacio, y lo crea su dueño. Los de ropa siguen
--      siendo de DREY (sin espacio).
--   4) Mercado Pago automático para alumnos queda APAGADO (cobraría a la
--      cuenta de DREY, no a la del profe); los links de pago de cada plan
--      siguen andando.
--   5) MIGRACIÓN: los planes de hoy, sus códigos y los datos de
--      transferencia de Ajustes pasan al espacio principal (el que tiene
--      más alumnos con esos planes: Facu). Si otro espacio ya tenía alumnos
--      con esos planes, se le hace una copia de cada plan y sus alumnos
--      pasan a la copia (mismo precio).
--
-- Se puede correr más de una vez sin romper nada.


-- 1) Tablas y columnas ---------------------------------------------------------
alter table public.planes add column if not exists espacio_id uuid
  references public.espacios(id) on delete cascade;
create index if not exists planes_espacio_idx on public.planes (espacio_id, orden);

alter table public.codigos_descuento add column if not exists espacio_id uuid
  references public.espacios(id) on delete cascade;
-- El mismo código (por ejemplo "VERANO") lo pueden tener dos espacios.
drop index if exists public.codigos_descuento_codigo_idx;
create unique index if not exists codigos_descuento_espacio_codigo_idx
  on public.codigos_descuento (
    coalesce(espacio_id, '00000000-0000-0000-0000-000000000000'::uuid), upper(codigo)
  );

create table if not exists public.datos_cobro (
  espacio_id uuid primary key references public.espacios(id) on delete cascade,
  banco text check (banco is null or char_length(banco) <= 80),
  titular text check (titular is null or char_length(titular) <= 120),
  cuenta text check (cuenta is null or char_length(cuenta) <= 80),
  moneda text check (moneda is null or char_length(moneda) <= 40),
  alias text check (alias is null or char_length(alias) <= 80),
  link_mp text check (link_mp is null or link_mp ~ '^https://'),
  actualizado_en timestamptz not null default now()
);

alter table public.datos_cobro enable row level security;
drop policy if exists "datos_cobro: el Admin y los del espacio" on public.datos_cobro;
create policy "datos_cobro: el Admin y los del espacio"
  on public.datos_cobro for select to authenticated
  using (public.es_admin() or public.mi_rol_en_espacio(espacio_id) is not null);
grant select on public.datos_cobro to authenticated;


-- 2) Quién cobra en un espacio --------------------------------------------------
-- El dueño (en su espacio personal, el profe) o el Admin.
create or replace function public.puede_cobrar(p_espacio uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.es_admin() or coalesce(public.mi_rol_en_espacio(p_espacio) = 'dueno', false);
$$;

revoke all on function public.puede_cobrar(uuid) from public, anon;
grant execute on function public.puede_cobrar(uuid) to authenticated;


-- 3) Planes de cada espacio ----------------------------------------------------

-- Los planes visibles de un espacio, por su código (registro, sin sesión).
create or replace function public.planes_de_espacio(p_codigo text)
returns table (
  id text, nombre text, descripcion text, precio_primer_mes int, precio_mensual int,
  link_mp text, orden int
)
language sql
stable
security definer
set search_path = public
as $$
  select pl.id, pl.nombre, pl.descripcion, pl.precio_primer_mes, pl.precio_mensual,
         pl.link_mp, pl.orden
  from public.planes pl
  join public.espacios e on e.id = pl.espacio_id
  where e.codigo = public.normalizar_codigo(p_codigo) and pl.activo
  order by pl.orden, pl.precio_mensual;
$$;

grant execute on function public.planes_de_espacio(text) to anon, authenticated;

-- Crear (p_id vacío) o cambiar un plan del espacio. Devuelve el id.
create or replace function public.guardar_plan_espacio(
  p_espacio uuid,
  p_id text,
  p_nombre text,
  p_descripcion text,
  p_precio_primer_mes int,
  p_precio_mensual int,
  p_link_mp text,
  p_activo boolean default true
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id text := nullif(trim(coalesce(p_id, '')), '');
  v_base text;
  v_numero int := 1;
  v_codigo text;
begin
  if not public.puede_cobrar(p_espacio) then
    raise exception 'Solo el dueño del espacio cambia sus planes';
  end if;
  if coalesce(trim(p_nombre), '') = '' then
    raise exception 'Poné un nombre para el plan';
  end if;
  if p_precio_primer_mes is null or p_precio_mensual is null
     or p_precio_primer_mes < 0 or p_precio_mensual < 0 then
    raise exception 'Revisá los precios';
  end if;
  if nullif(trim(coalesce(p_link_mp, '')), '') is not null and p_link_mp !~ '^https://' then
    raise exception 'El link de Mercado Pago tiene que empezar con https://';
  end if;
  if exists (
    select 1 from public.planes
    where espacio_id = p_espacio and lower(trim(nombre)) = lower(trim(p_nombre))
      and id is distinct from v_id
  ) then
    raise exception 'Ya tenés un plan con ese nombre';
  end if;

  if v_id is not null then
    if not exists (select 1 from public.planes where id = v_id and espacio_id = p_espacio) then
      raise exception 'Ese plan no es de este espacio';
    end if;
    update public.planes
    set nombre = left(trim(p_nombre), 80),
        descripcion = nullif(left(trim(coalesce(p_descripcion, '')), 300), ''),
        precio_primer_mes = p_precio_primer_mes,
        precio_mensual = p_precio_mensual,
        link_mp = nullif(trim(coalesce(p_link_mp, '')), ''),
        activo = coalesce(p_activo, true)
    where id = v_id;
    return v_id;
  end if;

  -- Plan nuevo: id = código del espacio + nombre ("facu-plan-pareja").
  v_codigo := lower((select codigo from public.espacios where id = p_espacio));
  v_base := left(v_codigo || '-' || trim(both '-' from regexp_replace(
    lower(translate(trim(p_nombre), 'áéíóúüñÁÉÍÓÚÜÑ', 'aeiouunaeiouun')), '[^a-z0-9]+', '-', 'g')), 60);
  v_id := v_base;
  while exists (select 1 from public.planes where id = v_id) loop
    v_numero := v_numero + 1;
    v_id := v_base || '-' || v_numero;
  end loop;

  insert into public.planes (
    id, nombre, descripcion, precio_primer_mes, precio_mensual, link_mp, activo, orden, espacio_id
  ) values (
    v_id, left(trim(p_nombre), 80), nullif(left(trim(coalesce(p_descripcion, '')), 300), ''),
    p_precio_primer_mes, p_precio_mensual, nullif(trim(coalesce(p_link_mp, '')), ''),
    coalesce(p_activo, true),
    coalesce((select max(orden) from public.planes where espacio_id = p_espacio), 0) + 1,
    p_espacio
  );
  return v_id;
end;
$$;

revoke all on function public.guardar_plan_espacio(uuid, text, text, text, int, int, text, boolean) from public, anon;
grant execute on function public.guardar_plan_espacio(uuid, text, text, text, int, int, text, boolean) to authenticated;


-- 4) Datos de cobro de cada espacio -------------------------------------------

create or replace function public.guardar_datos_cobro(
  p_espacio uuid, p_banco text, p_titular text, p_cuenta text, p_moneda text,
  p_alias text, p_link_mp text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.puede_cobrar(p_espacio) then
    raise exception 'Solo el dueño del espacio cambia sus datos de cobro';
  end if;
  if nullif(trim(coalesce(p_link_mp, '')), '') is not null and p_link_mp !~ '^https://' then
    raise exception 'El link de Mercado Pago tiene que empezar con https://';
  end if;
  insert into public.datos_cobro (espacio_id, banco, titular, cuenta, moneda, alias, link_mp, actualizado_en)
  values (
    p_espacio,
    nullif(left(trim(coalesce(p_banco, '')), 80), ''),
    nullif(left(trim(coalesce(p_titular, '')), 120), ''),
    nullif(left(trim(coalesce(p_cuenta, '')), 80), ''),
    nullif(left(trim(coalesce(p_moneda, '')), 40), ''),
    nullif(left(trim(coalesce(p_alias, '')), 80), ''),
    nullif(trim(coalesce(p_link_mp, '')), ''),
    now()
  )
  on conflict (espacio_id) do update set
    banco = excluded.banco, titular = excluded.titular, cuenta = excluded.cuenta,
    moneda = excluded.moneda, alias = excluded.alias, link_mp = excluded.link_mp,
    actualizado_en = now();
end;
$$;

revoke all on function public.guardar_datos_cobro(uuid, text, text, text, text, text, text) from public, anon;
grant execute on function public.guardar_datos_cobro(uuid, text, text, text, text, text, text) to authenticated;

-- Los datos de cobro de un espacio, por su código (registro, sin sesión):
-- los mismos que el profe le pasa a sus alumnos.
create or replace function public.datos_cobro_de_espacio(p_codigo text)
returns json
language sql
stable
security definer
set search_path = public
as $$
  select json_build_object(
    'espacio', public.nombre_de_espacio(e.id),
    'banco', d.banco, 'titular', d.titular, 'cuenta', d.cuenta,
    'moneda', d.moneda, 'alias', d.alias, 'link_mp', d.link_mp
  )
  from public.espacios e
  left join public.datos_cobro d on d.espacio_id = e.id
  where e.codigo = public.normalizar_codigo(p_codigo);
$$;

grant execute on function public.datos_cobro_de_espacio(text) to anon, authenticated;

-- Los datos de cobro del alumno que inició sesión (Suscripción): los de su
-- espacio; si todavía no tiene espacio, los de DREY para alumnos de antes
-- (Ajustes).
create or replace function public.mi_cobro()
returns json
language sql
stable
security definer
set search_path = public
as $$
  select case
    when yo.espacio_id is not null then (
      select json_build_object(
        'espacio', public.nombre_de_espacio(yo.espacio_id),
        'banco', d.banco, 'titular', d.titular, 'cuenta', d.cuenta,
        'moneda', d.moneda, 'alias', d.alias, 'link_mp', d.link_mp
      )
      from (select 1) uno
      left join public.datos_cobro d on d.espacio_id = yo.espacio_id
    )
    else (
      select json_build_object(
        'espacio', null,
        'banco', a.transferencia_banco, 'titular', a.transferencia_titular,
        'cuenta', a.transferencia_cuenta, 'moneda', a.transferencia_moneda,
        'alias', null, 'link_mp', null
      )
      from public.ajustes a where a.id = 1
    )
  end
  from public.perfiles yo
  where yo.id = auth.uid();
$$;

revoke all on function public.mi_cobro() from public, anon;
grant execute on function public.mi_cobro() to authenticated;


-- 5) Códigos de descuento por espacio ----------------------------------------

-- Un código de plan vale solo para los planes de SU espacio (reemplaza la
-- de 014).
create or replace function public.buscar_codigo_valido(p_codigo text, p_plan text)
returns public.codigos_descuento
language sql
stable
security definer
set search_path = public
as $$
  select c.*
  from public.codigos_descuento c
  where upper(c.codigo) = upper(trim(p_codigo))
    and c.tipo = 'plan'
    and c.activo
    and c.espacio_id is not null
    and c.espacio_id = (select pl.espacio_id from public.planes pl where pl.id = p_plan and pl.activo)
    and (c.vence is null or c.vence >= public.hoy_uy())
    and (c.usos_maximos is null or c.usos < c.usos_maximos)
    and (cardinality(c.planes) = 0 or p_plan = any (c.planes))
  limit 1;
$$;

revoke all on function public.buscar_codigo_valido(text, text) from public, anon, authenticated;

-- Quién ve y maneja los códigos (reemplaza las de 014 y 033):
--   · de plan: el Admin y el dueño de su espacio;
--   · de ropa (beneficios de la marca DREY, sin espacio): el Admin y los
--     profes de confianza; los ven los alumnos al día.
drop policy if exists "codigos: el profe ve los suyos y los clientes los de ropa" on public.codigos_descuento;
create policy "codigos: el profe ve los suyos y los clientes los de ropa"
  on public.codigos_descuento for select to authenticated
  using (
    public.es_admin()
    or (tipo = 'plan' and espacio_id is not null and coalesce(public.mi_rol_en_espacio(espacio_id) = 'dueno', false))
    or (tipo = 'ropa' and public.profe_de_confianza())
    or (tipo = 'ropa' and activo and public.acceso_vigente(auth.uid()))
  );

create or replace function public.puede_manejar_codigo(p_tipo text, p_espacio uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.es_admin()
    or (p_tipo = 'plan' and p_espacio is not null
        and coalesce(public.mi_rol_en_espacio(p_espacio) = 'dueno', false))
    or (p_tipo = 'ropa' and p_espacio is null and public.profe_de_confianza());
$$;

revoke all on function public.puede_manejar_codigo(text, uuid) from public, anon;
grant execute on function public.puede_manejar_codigo(text, uuid) to authenticated;

drop policy if exists "codigos: el profe crea los suyos" on public.codigos_descuento;
create policy "codigos: el profe crea los suyos"
  on public.codigos_descuento for insert to authenticated
  with check (public.puede_manejar_codigo(tipo, espacio_id));
drop policy if exists "codigos: el profe edita los suyos" on public.codigos_descuento;
create policy "codigos: el profe edita los suyos"
  on public.codigos_descuento for update to authenticated
  using (public.puede_manejar_codigo(tipo, espacio_id))
  with check (public.puede_manejar_codigo(tipo, espacio_id));
drop policy if exists "codigos: el profe borra los suyos" on public.codigos_descuento;
create policy "codigos: el profe borra los suyos"
  on public.codigos_descuento for delete to authenticated
  using (public.puede_manejar_codigo(tipo, espacio_id));


-- 6) Mercado Pago automático para alumnos: apagado ---------------------------
-- (Cobraría en la cuenta de DREY. Se vuelve a prender cuando cada espacio
-- conecte su propia cuenta de Mercado Pago.)
update public.ajustes set cobro_automatico = false where id = 1 and cobro_automatico;


-- 7) Migración ------------------------------------------------------------------
do $$
declare
  v_principal uuid;
  fila record;
  pl record;
  v_nuevo text;
  v_ajustes public.ajustes%rowtype;
begin
  if not exists (select 1 from public.planes where espacio_id is null) then
    return; -- ya migrado
  end if;

  perform set_config('drey.sistema', 'on', true);
  perform set_config('drey.migracion', 'on', true);

  -- El espacio principal: el que tiene más alumnos con los planes de hoy.
  select p.espacio_id into v_principal
  from public.perfiles p
  join public.espacios e on e.id = p.espacio_id
  where p.plan in (select id from public.planes where espacio_id is null)
    and not coalesce(p.es_profe, false) and not coalesce(p.es_admin, false)
  group by p.espacio_id, e.creado_en
  order by count(*) desc, e.creado_en
  limit 1;

  -- Sin alumnos todavía: el espacio sin costo más viejo de un profe.
  if v_principal is null then
    select id into v_principal from public.espacios
    where tipo = 'profe' and sin_costo order by creado_en limit 1;
  end if;
  if v_principal is null then
    return; -- no hay espacios: no hay a quién pasarle los planes
  end if;

  -- Otros espacios con alumnos en esos planes: una copia para cada uno.
  for fila in
    select distinct e.id, e.codigo
    from public.perfiles p
    join public.espacios e on e.id = p.espacio_id
    where e.id <> v_principal
      and p.plan in (select id from public.planes where espacio_id is null)
  loop
    for pl in select * from public.planes where espacio_id is null loop
      if exists (select 1 from public.perfiles p where p.espacio_id = fila.id and p.plan = pl.id) then
        v_nuevo := left(pl.id || '-' || lower(fila.codigo), 60);
        insert into public.planes (
          id, nombre, descripcion, precio_primer_mes, precio_mensual, link_mp, activo, orden, espacio_id
        ) values (
          v_nuevo, pl.nombre, pl.descripcion, pl.precio_primer_mes, pl.precio_mensual,
          null, pl.activo, pl.orden, fila.id
        ) on conflict (id) do nothing;
        update public.perfiles p set plan = v_nuevo where p.espacio_id = fila.id and p.plan = pl.id;
      end if;
    end loop;
  end loop;

  update public.planes set espacio_id = v_principal where espacio_id is null;

  -- Códigos de plan: del espacio principal (eran para esos planes).
  update public.codigos_descuento set espacio_id = v_principal
  where tipo = 'plan' and espacio_id is null;

  -- Datos de transferencia de Ajustes: del espacio principal.
  select * into v_ajustes from public.ajustes where id = 1;
  if coalesce(v_ajustes.transferencia_banco, v_ajustes.transferencia_titular,
              v_ajustes.transferencia_cuenta, v_ajustes.transferencia_moneda) is not null then
    insert into public.datos_cobro (espacio_id, banco, titular, cuenta, moneda)
    values (v_principal, v_ajustes.transferencia_banco, v_ajustes.transferencia_titular,
            v_ajustes.transferencia_cuenta, v_ajustes.transferencia_moneda)
    on conflict (espacio_id) do nothing;
  end if;

  perform set_config('drey.sistema', 'off', true);
  perform set_config('drey.migracion', 'off', true);
end;
$$;


-- 8) El plan de cada alumno es de SU espacio ----------------------------------
-- Al registrarse, o si cambia de espacio, se busca el plan del mismo nombre
-- en el espacio nuevo (si no hay, queda sin plan y su profe le pone uno).
-- Cambiarle el plan a mano lo puede el dueño del espacio o el Admin, y
-- solo por uno de ese espacio.
create or replace function public.plan_del_espacio(p_plan text, p_espacio uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select id from public.planes where id = p_plan and espacio_id = p_espacio and activo),
    (select n.id from public.planes n
     where n.espacio_id = p_espacio and n.activo
       and lower(n.nombre) = lower((select nombre from public.planes where id = p_plan))
     order by n.orden limit 1)
  );
$$;

revoke all on function public.plan_del_espacio(text, uuid) from public, anon, authenticated;

create or replace function public.ubicar_plan_del_alumno()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_mismo_espacio boolean := tg_op = 'UPDATE' and new.espacio_id is not distinct from old.espacio_id;
  v_a_mano boolean := tg_op = 'UPDATE' and new.plan is distinct from old.plan;
begin
  if coalesce(new.es_profe, false) or coalesce(new.es_admin, false)
     or new.espacio_id is null then
    return new;
  end if;
  if tg_op = 'UPDATE' and not v_a_mano and v_mismo_espacio then
    return new;
  end if;

  -- Cambio de plan a mano (con o sin cambio de espacio): solo el dueño del
  -- espacio o el Admin, desde la ficha del alumno. La base por dentro (sin
  -- sesión) sí puede.
  if v_a_mano and auth.uid() is not null and not public.puede_cobrar(new.espacio_id) then
    raise exception 'Solo el dueño del espacio cambia el plan de un alumno';
  end if;

  if v_a_mano then
    -- Elegido a mano: tiene que ser de su espacio (puede ser uno oculto,
    -- por ejemplo un plan "becado" que el dueño no ofrece).
    if new.plan is not null
       and not exists (select 1 from public.planes where id = new.plan and espacio_id = new.espacio_id) then
      raise exception 'Ese plan no es de este espacio';
    end if;
    return new;
  end if;

  -- Al registrarse o al cambiar de espacio: un plan visible de su espacio
  -- (el mismo, o el del mismo nombre); si no hay, sin plan.
  if new.plan is not null then
    new.plan := public.plan_del_espacio(new.plan, new.espacio_id);
  end if;
  return new;
end;
$$;

drop trigger if exists perfiles_ubicar_plan on public.perfiles;
-- (Sin "of plan, espacio_id": el espacio también lo cambia otro trigger,
-- perfiles_ubicar_en_espacio, que corre antes que este.)
create trigger perfiles_ubicar_plan
  before insert or update on public.perfiles
  for each row execute function public.ubicar_plan_del_alumno();

-- Quién ve la tabla de planes (reemplaza la de 014, que se los mostraba a
-- todos, también los ocultos): el Admin, los profes del espacio y el
-- alumno que lo tiene. Sin sesión se usa planes_de_espacio() (solo los
-- visibles de un espacio, por su código); la tabla le devuelve vacío.
drop policy if exists "planes: todos ven los precios" on public.planes;
drop policy if exists "planes: el Admin, los del espacio y quien lo tiene" on public.planes;
create policy "planes: el Admin, los del espacio y quien lo tiene"
  on public.planes for select to authenticated
  using (
    public.es_admin()
    or public.mi_rol_en_espacio(espacio_id) is not null
    or id = (select p.plan from public.perfiles p where p.id = auth.uid())
  );

-- Desde acá, todo plan es de un espacio.
do $$
begin
  if not exists (select 1 from public.planes where espacio_id is null) then
    alter table public.planes alter column espacio_id set not null;
  end if;
  -- Dos planes con el mismo nombre en un espacio, no (si ya hubiera, se
  -- deja como está y lo controla guardar_plan_espacio).
  if not exists (
    select 1 from public.planes group by espacio_id, lower(trim(nombre)) having count(*) > 1
  ) then
    create unique index if not exists planes_espacio_nombre_idx
      on public.planes (espacio_id, lower(trim(nombre)));
  end if;
end;
$$;
