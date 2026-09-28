-- 022 · Panel del Admin: ajustes desde la app e historial de cambios
-- ----------------------------------------------------------------------
-- Hasta ahora algunas cosas del negocio se cambiaban en Supabase o en el
-- código. Desde acá el Admin las cambia desde "Ajustes" en su panel:
--
--   1) AJUSTES (tabla nueva, una sola fila): datos para transferencia,
--      cobro automático con Mercado Pago sí/no, link del grupo de WhatsApp,
--      días de aviso antes del vencimiento y días de gracia.
--   2) PLANES: además del precio, el nombre, la descripción, el link de
--      pago de Mercado Pago (pago manual) y si se muestra al registrarse.
--      El Admin puede crear planes nuevos. No se borran (hay clientes que
--      los tienen): se ocultan.
--   3) DÍAS DE GRACIA: la regla que bloquea el acceso ahora lee el número
--      de "ajustes" (antes estaba fijo en 3).
--   4) HISTORIAL: cada cambio que hace el Admin (precios, ajustes, profes,
--      gimnasios, clientes reasignados, pagos confirmados) queda anotado
--      solo, con fecha. Solo el Admin lo ve.
--
-- Todo lo controla la base: aunque alguien toque la app, solo el Admin
-- puede cambiar ajustes y planes.
--
-- Se puede correr más de una vez sin romper nada.

-- 1) Ajustes -----------------------------------------------------------------
create table if not exists public.ajustes (
  id int primary key default 1 check (id = 1),
  transferencia_banco text,
  transferencia_titular text,
  transferencia_cuenta text,
  transferencia_moneda text,
  cobro_automatico boolean not null default false,
  whatsapp_grupo_url text,
  dias_aviso int not null default 5 check (dias_aviso between 0 and 30),
  dias_de_gracia int not null default 3 check (dias_de_gracia between 0 and 30),
  actualizado_en timestamptz not null default now()
);

insert into public.ajustes (id) values (1) on conflict (id) do nothing;

alter table public.ajustes enable row level security;

-- Todos los leen (los datos de pago se muestran al registrarse, antes de
-- iniciar sesión). Solo el Admin los cambia. Nadie agrega ni borra filas.
drop policy if exists "ajustes: todos los leen" on public.ajustes;
create policy "ajustes: todos los leen"
  on public.ajustes for select to anon, authenticated
  using (true);

drop policy if exists "ajustes: solo el Admin los cambia" on public.ajustes;
create policy "ajustes: solo el Admin los cambia"
  on public.ajustes for update to authenticated
  using (public.es_admin())
  with check (public.es_admin());

grant select on public.ajustes to anon, authenticated;
grant update on public.ajustes to authenticated;

create or replace function public.marcar_ajustes_actualizados()
returns trigger
language plpgsql
as $$
begin
  new.actualizado_en := now();
  return new;
end;
$$;

drop trigger if exists ajustes_actualizados on public.ajustes;
create trigger ajustes_actualizados
  before update on public.ajustes
  for each row execute function public.marcar_ajustes_actualizados();

-- 2) Planes ------------------------------------------------------------------
alter table public.planes add column if not exists descripcion text;
alter table public.planes add column if not exists link_mp text;

-- Descripciones que hasta ahora estaban en el código.
update public.planes set descripcion = 'Rutina a medida y seguimiento presencial'
where id = 'seguimiento' and descripcion is null;
update public.planes set descripcion = 'Rutina y seguimiento solo online; una visita al mes si se puede'
where id = 'seguimiento-online' and descripcion is null;
update public.planes set descripcion = 'Solo la rutina: entrenás por tu cuenta'
where id = 'rutina' and descripcion is null;

-- El Admin crea y cambia planes, pero no los borra.
drop policy if exists "planes: solo el administrador los cambia" on public.planes;
drop policy if exists "planes: solo el Admin los crea" on public.planes;
drop policy if exists "planes: solo el Admin los cambia" on public.planes;
create policy "planes: solo el Admin los crea"
  on public.planes for insert to authenticated
  with check (public.es_admin());
create policy "planes: solo el Admin los cambia"
  on public.planes for update to authenticated
  using (public.es_admin())
  with check (public.es_admin());

grant select on public.planes to anon, authenticated;
grant insert, update on public.planes to authenticated;

-- 3) Días de gracia desde los ajustes (reemplaza la de 012) -------------------
create or replace function public.dias_de_gracia()
returns int
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select dias_de_gracia from public.ajustes where id = 1), 3);
$$;

-- 4) Historial de cambios del Admin ---------------------------------------
create table if not exists public.historial_admin (
  id bigint generated always as identity primary key,
  creado_en timestamptz not null default now(),
  admin_id uuid references public.perfiles(id) on delete set null,
  tipo text not null,
  detalle text not null
);

create index if not exists historial_admin_fecha_idx on public.historial_admin (creado_en desc);

alter table public.historial_admin enable row level security;

drop policy if exists "historial: solo el Admin lo ve" on public.historial_admin;
create policy "historial: solo el Admin lo ve"
  on public.historial_admin for select to authenticated
  using (public.es_admin());

grant select on public.historial_admin to authenticated;

-- Anota una línea, solo si el cambio lo hizo el Admin desde la app.
create or replace function public.anotar_historial(p_tipo text, p_detalle text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_detalle is null or p_detalle = '' or not public.es_admin() then
    return;
  end if;
  insert into public.historial_admin (admin_id, tipo, detalle)
  values (auth.uid(), p_tipo, p_detalle);
end;
$$;

revoke all on function public.anotar_historial(text, text) from public, anon, authenticated;

create or replace function public.nombre_de(p_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select nullif(trim(coalesce(nombre, '') || ' ' || coalesce(apellido, '')), '')
     from public.perfiles where id = p_id),
    'sin profe'
  );
$$;

revoke all on function public.nombre_de(uuid) from public, anon, authenticated;

create or replace function public.pesos(p_valor int)
returns text
language sql
immutable
as $$
  select '$' || coalesce(p_valor::text, '—');
$$;

-- Planes
create or replace function public.historial_planes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cambios text[] := '{}';
begin
  if tg_op = 'INSERT' then
    perform public.anotar_historial('plan', 'Creó el plan "' || new.nombre || '" (' ||
      public.pesos(new.precio_primer_mes) || ' el primer mes, ' ||
      public.pesos(new.precio_mensual) || ' por mes)');
    return new;
  end if;

  if new.nombre is distinct from old.nombre then
    v_cambios := v_cambios || ('nombre: "' || old.nombre || '" → "' || new.nombre || '"');
  end if;
  if new.precio_primer_mes is distinct from old.precio_primer_mes then
    v_cambios := v_cambios || ('primer mes: ' || public.pesos(old.precio_primer_mes) || ' → ' || public.pesos(new.precio_primer_mes));
  end if;
  if new.precio_mensual is distinct from old.precio_mensual then
    v_cambios := v_cambios || ('por mes: ' || public.pesos(old.precio_mensual) || ' → ' || public.pesos(new.precio_mensual));
  end if;
  if new.descripcion is distinct from old.descripcion then
    v_cambios := v_cambios || 'descripción'::text;
  end if;
  if new.link_mp is distinct from old.link_mp then
    v_cambios := v_cambios || 'link de Mercado Pago'::text;
  end if;
  if new.activo is distinct from old.activo then
    v_cambios := v_cambios || (case when new.activo then 'ahora se muestra al registrarse' else 'oculto al registrarse' end);
  end if;

  if array_length(v_cambios, 1) > 0 then
    perform public.anotar_historial('plan', 'Plan "' || new.nombre || '": ' || array_to_string(v_cambios, ', '));
  end if;
  return new;
end;
$$;

drop trigger if exists planes_historial on public.planes;
create trigger planes_historial
  after insert or update on public.planes
  for each row execute function public.historial_planes();

-- Ajustes
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

  if array_length(v_cambios, 1) > 0 then
    perform public.anotar_historial('ajustes', 'Ajustes: ' || array_to_string(v_cambios, ', '));
  end if;
  return new;
end;
$$;

drop trigger if exists ajustes_historial on public.ajustes;
create trigger ajustes_historial
  after update on public.ajustes
  for each row execute function public.historial_ajustes();

-- Profes y clientes
create or replace function public.historial_perfiles()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_nombre text := coalesce(
    nullif(trim(coalesce(new.nombre, '') || ' ' || coalesce(new.apellido, '')), ''), 'Una cuenta');
begin
  if coalesce(new.es_profe, false) and not coalesce(old.es_profe, false) then
    perform public.anotar_historial('profe', v_nombre || ' ahora es profe');
  elsif coalesce(old.es_profe, false) and not coalesce(new.es_profe, false) then
    perform public.anotar_historial('profe', v_nombre || ' ya no es profe');
  end if;

  if coalesce(new.es_profe, false) and new.gimnasio_id is distinct from old.gimnasio_id then
    perform public.anotar_historial('profe', v_nombre || ' pasó al gimnasio ' ||
      coalesce((select nombre from public.gimnasios where id = new.gimnasio_id), '(ninguno)'));
  end if;

  if not coalesce(new.es_profe, false) and not coalesce(new.es_admin, false)
     and new.profe_id is distinct from old.profe_id then
    perform public.anotar_historial('cliente', v_nombre || ': de ' || public.nombre_de(old.profe_id) ||
      ' a ' || public.nombre_de(new.profe_id));
  end if;
  return new;
end;
$$;

drop trigger if exists perfiles_historial on public.perfiles;
create trigger perfiles_historial
  after update of es_profe, gimnasio_id, profe_id on public.perfiles
  for each row execute function public.historial_perfiles();

-- Gimnasios
create or replace function public.historial_gimnasios()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    perform public.anotar_historial('gimnasio', 'Creó el gimnasio ' || new.nombre);
    return new;
  end if;
  if new.nombre is distinct from old.nombre then
    perform public.anotar_historial('gimnasio', 'Gimnasio "' || old.nombre || '" ahora se llama "' || new.nombre || '"');
  end if;
  if new.dueno_id is distinct from old.dueno_id then
    perform public.anotar_historial('gimnasio', 'Gimnasio ' || new.nombre || ': dueño ' ||
      coalesce((select trim(coalesce(nombre, '') || ' ' || coalesce(apellido, '')) from public.perfiles where id = new.dueno_id), '(ninguno)'));
  end if;
  if new.activo is distinct from old.activo then
    perform public.anotar_historial('gimnasio', 'Gimnasio ' || new.nombre ||
      case when new.activo then ': visible al registrarse' else ': oculto' end);
  end if;
  return new;
end;
$$;

drop trigger if exists gimnasios_historial on public.gimnasios;
create trigger gimnasios_historial
  after insert or update on public.gimnasios
  for each row execute function public.historial_gimnasios();

-- Pagos confirmados a mano por el Admin
create or replace function public.historial_pagos()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.metodo = 'manual' and new.estado = 'aprobado' then
    perform public.anotar_historial('pago', 'Confirmó un pago de ' || public.nombre_de(new.cliente_id) ||
      ' (' || public.pesos(new.monto) || ')');
  end if;
  return new;
end;
$$;

drop trigger if exists pagos_historial on public.pagos;
create trigger pagos_historial
  after insert on public.pagos
  for each row execute function public.historial_pagos();
