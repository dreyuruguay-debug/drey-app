-- 014 · Cobro con Mercado Pago y códigos de descuento
--
-- 1) planes: precios de cada plan. Es la ÚNICA fuente de precios para
--    cobrar (la app los lee de acá; Mercado Pago cobra lo que dice acá).
--    Para cambiar un precio: Supabase → Table Editor → planes.
-- 2) codigos_descuento: códigos que crea el profe.
--      · tipo 'plan': descuento al pagar el plan (porcentaje o monto fijo,
--        solo el primer mes o todos, con límite de usos y vencimiento).
--      · tipo 'ropa': beneficio de la marca de ropa; el cliente lo ve en
--        "Comunidad y beneficios" (no se aplica acá, es informativo).
-- 3) pagos: cada intento de pago con Mercado Pago y cómo terminó.
-- 4) calcular_precio(): cuánto tiene que pagar un cliente (plan, primer
--    mes o no, código). La usan la app (para mostrar) y la función de
--    Mercado Pago (para cobrar), así nunca muestran precios distintos.
-- 5) registrar_pago_aprobado(): cuando Mercado Pago avisa que el pago
--    se aprobó, activa la cuenta y suma un mes. Solo la puede usar la
--    función de Mercado Pago (service role), nunca la app.
--
-- Se puede correr más de una vez sin romper nada.

-- 1) Planes ------------------------------------------------------------------
create table if not exists public.planes (
  id text primary key,
  nombre text not null,
  precio_primer_mes int not null check (precio_primer_mes >= 0),
  precio_mensual int not null check (precio_mensual >= 0),
  activo boolean not null default true,
  orden int not null default 0
);

insert into public.planes (id, nombre, precio_primer_mes, precio_mensual, orden) values
  ('seguimiento', 'Plan seguimiento', 5000, 4000, 1),
  ('seguimiento-online', 'Plan seguimiento online', 3000, 1500, 2),
  ('rutina', 'Plan rutina', 1500, 500, 3)
on conflict (id) do nothing;

alter table public.planes enable row level security;

drop policy if exists "planes: todos ven los precios" on public.planes;
create policy "planes: todos ven los precios"
  on public.planes for select to anon, authenticated
  using (true);

drop policy if exists "planes: solo el administrador los cambia" on public.planes;
create policy "planes: solo el administrador los cambia"
  on public.planes for all to authenticated
  using (public.es_admin())
  with check (public.es_admin());

-- 2) Códigos de descuento -----------------------------------------------------
create table if not exists public.codigos_descuento (
  id uuid primary key default gen_random_uuid(),
  codigo text not null,
  tipo text not null default 'plan' check (tipo in ('plan', 'ropa')),
  descripcion text,
  porcentaje numeric check (porcentaje is null or (porcentaje > 0 and porcentaje <= 100)),
  monto_fijo int check (monto_fijo is null or monto_fijo > 0),
  solo_primer_mes boolean not null default true,
  planes text[] not null default '{}',
  usos_maximos int check (usos_maximos is null or usos_maximos > 0),
  usos int not null default 0,
  vence date,
  activo boolean not null default true,
  profe_id uuid default auth.uid() references public.perfiles(id) on delete set null,
  creado_en timestamptz not null default now()
);

create unique index if not exists codigos_descuento_codigo_idx
  on public.codigos_descuento (upper(codigo));

alter table public.codigos_descuento enable row level security;

drop policy if exists "codigos: el profe ve los suyos y los clientes los de ropa" on public.codigos_descuento;
create policy "codigos: el profe ve los suyos y los clientes los de ropa"
  on public.codigos_descuento for select to authenticated
  using (
    (public.es_profe() and (profe_id = auth.uid() or public.es_admin()))
    or (tipo = 'ropa' and activo and public.acceso_vigente(auth.uid()))
  );

drop policy if exists "codigos: el profe crea los suyos" on public.codigos_descuento;
create policy "codigos: el profe crea los suyos"
  on public.codigos_descuento for insert to authenticated
  with check (public.es_profe() and (profe_id = auth.uid() or public.es_admin()));

drop policy if exists "codigos: el profe edita los suyos" on public.codigos_descuento;
create policy "codigos: el profe edita los suyos"
  on public.codigos_descuento for update to authenticated
  using (public.es_profe() and (profe_id = auth.uid() or public.es_admin()))
  with check (public.es_profe() and (profe_id = auth.uid() or public.es_admin()));

drop policy if exists "codigos: el profe borra los suyos" on public.codigos_descuento;
create policy "codigos: el profe borra los suyos"
  on public.codigos_descuento for delete to authenticated
  using (public.es_profe() and (profe_id = auth.uid() or public.es_admin()));

-- 3) Pagos --------------------------------------------------------------------
create table if not exists public.pagos (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.perfiles(id) on delete cascade,
  plan text,
  monto_base int not null default 0,
  monto int not null default 0,
  primer_mes boolean not null default false,
  codigo text,
  codigo_id uuid references public.codigos_descuento(id) on delete set null,
  metodo text not null default 'mercadopago',
  estado text not null default 'pendiente'
    check (estado in ('pendiente', 'aprobado', 'rechazado', 'cancelado')),
  mp_preference_id text,
  mp_payment_id text,
  detalle text,
  creado_en timestamptz not null default now(),
  aprobado_en timestamptz
);

create index if not exists pagos_cliente_idx on public.pagos (cliente_id, creado_en desc);

alter table public.pagos enable row level security;

-- Solo lectura desde la app. Los crea y actualiza la función de Mercado
-- Pago con el service role (que no pasa por estas reglas).
drop policy if exists "pagos: el cliente o su profe los ven" on public.pagos;
create policy "pagos: el cliente o su profe los ven"
  on public.pagos for select to authenticated
  using (cliente_id = auth.uid() or public.puede_ver_cliente(cliente_id));

-- 4) Precio a pagar -------------------------------------------------------------
-- Busca un código válido para un plan. Devuelve la fila o null.
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
    and (c.vence is null or c.vence >= public.hoy_uy())
    and (c.usos_maximos is null or c.usos < c.usos_maximos)
    and (cardinality(c.planes) = 0 or p_plan = any (c.planes))
  limit 1;
$$;

revoke all on function public.buscar_codigo_valido(text, text) from public, anon, authenticated;

-- Para el registro (todavía sin sesión): dice si un código sirve y qué
-- descuento hace, sin mostrar nada más.
create or replace function public.validar_codigo(p_codigo text, p_plan text)
returns json
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  c public.codigos_descuento;
begin
  if coalesce(trim(p_codigo), '') = '' then
    return json_build_object('valido', false);
  end if;
  c := public.buscar_codigo_valido(p_codigo, p_plan);
  if c.id is null then
    return json_build_object('valido', false, 'mensaje', 'Ese código no existe o ya no está vigente.');
  end if;
  return json_build_object(
    'valido', true,
    'codigo', upper(c.codigo),
    'porcentaje', c.porcentaje,
    'monto_fijo', c.monto_fijo,
    'solo_primer_mes', c.solo_primer_mes,
    'descripcion', c.descripcion
  );
end;
$$;

revoke all on function public.validar_codigo(text, text) from public;
grant execute on function public.validar_codigo(text, text) to anon, authenticated;

-- Cuánto paga un cliente este mes.
--   · Primer mes = nunca tuvo un vencimiento (nunca se habilitó ni pagó).
--   · Si no se pasa código, usa el que escribió al registrarse.
create or replace function public.calcular_precio(p_cliente uuid, p_codigo text default null)
returns json
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  p public.perfiles;
  pl public.planes;
  c public.codigos_descuento;
  v_codigo text;
  v_primer boolean;
  v_base int;
  v_descuento int := 0;
  v_mensaje text;
begin
  select * into p from public.perfiles where id = p_cliente;
  if p.id is null then
    return json_build_object('error', 'No encontramos la cuenta.');
  end if;

  select * into pl from public.planes where id = p.plan and activo;
  if pl.id is null then
    return json_build_object('error', 'Tu cuenta no tiene un plan elegido. Escribile a tu profe.');
  end if;

  v_primer := p.vencimiento is null;
  v_base := case when v_primer then pl.precio_primer_mes else pl.precio_mensual end;
  v_codigo := nullif(trim(coalesce(p_codigo, p.codigo_descuento, '')), '');

  if v_codigo is not null then
    c := public.buscar_codigo_valido(v_codigo, p.plan);
    if c.id is null then
      v_mensaje := 'El código ' || upper(v_codigo) || ' no existe o ya no está vigente.';
    elsif c.solo_primer_mes and not v_primer then
      v_mensaje := 'El código ' || upper(c.codigo) || ' es solo para el primer mes.';
      c := null;
    else
      v_descuento := least(
        v_base,
        coalesce(c.monto_fijo, 0) + round(v_base * coalesce(c.porcentaje, 0) / 100.0)::int
      );
    end if;
  end if;

  return json_build_object(
    'plan', pl.id,
    'plan_nombre', pl.nombre,
    'primer_mes', v_primer,
    'monto_base', v_base,
    'descuento', v_descuento,
    'monto', v_base - v_descuento,
    'codigo', case when c.id is null then null else upper(c.codigo) end,
    'codigo_id', c.id,
    'mensaje_codigo', v_mensaje
  );
end;
$$;

revoke all on function public.calcular_precio(uuid, text) from public, anon, authenticated;
grant execute on function public.calcular_precio(uuid, text) to service_role;

-- Versión para la app: siempre sobre la cuenta de quien la usa.
create or replace function public.mi_precio(p_codigo text default null)
returns json
language sql
stable
security definer
set search_path = public
as $$
  select public.calcular_precio(auth.uid(), p_codigo);
$$;

revoke all on function public.mi_precio(text) from public;
grant execute on function public.mi_precio(text) to authenticated;

-- 5) Pago aprobado -----------------------------------------------------------
-- Devuelve true si lo registró ahora, false si ya estaba registrado (así
-- un aviso repetido de Mercado Pago no suma dos meses).
create or replace function public.registrar_pago_aprobado(p_pago uuid, p_mp_payment text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cliente uuid;
  v_codigo uuid;
  v_hoy date := public.hoy_uy();
begin
  update public.pagos
  set estado = 'aprobado', aprobado_en = now(), mp_payment_id = coalesce(p_mp_payment, mp_payment_id)
  where id = p_pago and estado <> 'aprobado'
  returning cliente_id, codigo_id into v_cliente, v_codigo;

  if v_cliente is null then
    return false;
  end if;

  perform set_config('drey.sistema', 'on', true);

  update public.perfiles
  set estado = 'activo',
      aviso_pago = false,
      vencimiento = (greatest(coalesce(vencimiento, v_hoy), v_hoy) + interval '1 month')::date
  where id = v_cliente;

  if v_codigo is not null then
    update public.codigos_descuento set usos = usos + 1 where id = v_codigo;
  end if;

  return true;
end;
$$;

revoke all on function public.registrar_pago_aprobado(uuid, text) from public, anon, authenticated;
grant execute on function public.registrar_pago_aprobado(uuid, text) to service_role;
