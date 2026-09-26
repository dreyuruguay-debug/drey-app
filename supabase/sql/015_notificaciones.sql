-- 015 · Notificaciones en el celular (Web Push)
--
-- Cómo funciona:
--   1. Cuando el alumno (o el profe) toca "Activar notificaciones", el
--      celular da una "dirección" para mandarle avisos. Se guarda en
--      push_suscripciones (una por celular).
--   2. Cuando pasa algo, se anota un aviso en la tabla "avisos" (la cola):
--        · Al alumno: rutina nueva, resumen de avance publicado, "Hoy te
--          toca…" (cada mañana), "Tu plan vence en 3 días / hoy" y "último
--          día para pagar".
--        · Al profe: cuenta nueva, "avisó que pagó", pago con Mercado Pago.
--   3. Cada minuto, si hay avisos en la cola, la base llama a la función
--      "enviar-avisos" de Supabase, que los manda a los celulares.
--
-- Para los pasos 2 (a la mañana) y 3 se usan dos extensiones de Supabase:
-- pg_cron (tareas programadas) y pg_net (llamar a la función). Este
-- archivo las activa. Falta un solo dato que se completa a mano (ver
-- LEEME): la dirección del proyecto en ajustes_internos.
--
-- Se puede correr más de una vez sin romper nada.

-- 0) Extensiones (si no se pueden activar desde acá, se activan en
--    Database → Extensions y se vuelve a correr este archivo).
do $$
begin
  begin
    create extension if not exists pg_net with schema extensions;
  exception when others then
    raise notice 'No se pudo activar pg_net: %', sqlerrm;
  end;
  begin
    create extension if not exists pg_cron with schema pg_catalog;
  exception when others then
    raise notice 'No se pudo activar pg_cron: %', sqlerrm;
  end;
end;
$$;

-- 1) Ajustes internos (solo los lee la base y las funciones de Supabase,
--    nunca la app: tiene RLS y ninguna regla de acceso).
create table if not exists public.ajustes_internos (
  clave text primary key,
  valor text not null default ''
);
alter table public.ajustes_internos enable row level security;

insert into public.ajustes_internos (clave, valor) values
  ('avisos_secreto', encode(gen_random_bytes(24), 'hex')),
  ('url_proyecto', '')
on conflict (clave) do nothing;

-- 2) Celulares suscriptos
create table if not exists public.push_suscripciones (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null default auth.uid() references public.perfiles(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  dispositivo text,
  creado_en timestamptz not null default now()
);

create index if not exists push_suscripciones_usuario_idx on public.push_suscripciones (usuario_id);
alter table public.push_suscripciones enable row level security;

drop policy if exists "push: cada uno ve los suyos" on public.push_suscripciones;
create policy "push: cada uno ve los suyos"
  on public.push_suscripciones for select to authenticated
  using (usuario_id = auth.uid());

drop policy if exists "push: cada uno agrega los suyos" on public.push_suscripciones;
create policy "push: cada uno agrega los suyos"
  on public.push_suscripciones for insert to authenticated
  with check (usuario_id = auth.uid());

drop policy if exists "push: cada uno actualiza los suyos" on public.push_suscripciones;
create policy "push: cada uno actualiza los suyos"
  on public.push_suscripciones for update to authenticated
  using (usuario_id = auth.uid())
  with check (usuario_id = auth.uid());

drop policy if exists "push: cada uno borra los suyos" on public.push_suscripciones;
create policy "push: cada uno borra los suyos"
  on public.push_suscripciones for delete to authenticated
  using (usuario_id = auth.uid());

-- Si el mismo celular ya estaba anotado con otra cuenta (se cambió de
-- usuario), pasa a la cuenta nueva.
create or replace function public.guardar_suscripcion_push(
  p_endpoint text, p_p256dh text, p_auth text, p_dispositivo text
)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.push_suscripciones (usuario_id, endpoint, p256dh, auth, dispositivo)
  values (auth.uid(), p_endpoint, p_p256dh, p_auth, left(p_dispositivo, 120))
  on conflict (endpoint) do update
    set usuario_id = auth.uid(), p256dh = excluded.p256dh, auth = excluded.auth,
        dispositivo = excluded.dispositivo;
$$;

revoke all on function public.guardar_suscripcion_push(text, text, text, text) from public, anon;
grant execute on function public.guardar_suscripcion_push(text, text, text, text) to authenticated;

-- 3) Cola de avisos
create table if not exists public.avisos (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references public.perfiles(id) on delete cascade,
  tipo text not null,
  titulo text not null,
  cuerpo text,
  url text,
  clave text unique,
  creado_en timestamptz not null default now(),
  enviado_en timestamptz,
  intentos int not null default 0
);

create index if not exists avisos_pendientes_idx on public.avisos (creado_en) where enviado_en is null;
alter table public.avisos enable row level security;

drop policy if exists "avisos: cada uno ve los suyos" on public.avisos;
create policy "avisos: cada uno ve los suyos"
  on public.avisos for select to authenticated
  using (usuario_id = auth.uid());

-- Anota un aviso, solo si esa persona tiene algún celular suscripto.
-- "clave" evita repetir el mismo aviso (por ejemplo, uno por día).
create or replace function public.encolar_aviso(
  p_usuario uuid, p_tipo text, p_titulo text, p_cuerpo text, p_url text, p_clave text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_usuario is null
     or not exists (select 1 from public.push_suscripciones where usuario_id = p_usuario) then
    return;
  end if;
  insert into public.avisos (usuario_id, tipo, titulo, cuerpo, url, clave)
  values (p_usuario, p_tipo, p_titulo, p_cuerpo, p_url, p_clave)
  on conflict (clave) do nothing;
end;
$$;

revoke all on function public.encolar_aviso(uuid, text, text, text, text, text) from public, anon, authenticated;

-- Quién tiene que enterarse de lo que pasa con un cliente: su profe; si
-- no tiene, el administrador.
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
  where a.es_admin and a.es_profe
    and not exists (select 1 from public.perfiles c where c.id = p_cliente and c.profe_id is not null);
$$;

revoke all on function public.profes_a_avisar(uuid) from public, anon, authenticated;

-- 4) Avisos automáticos (triggers) ----------------------------------------

-- Rutina nueva (cuando el profe la guarda y el alumno ya la puede ver)
create or replace function public.aviso_rutina_nueva()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.publicada and (tg_op = 'INSERT' or not coalesce(old.publicada, false)) then
    perform public.encolar_aviso(
      new.cliente_id, 'rutina', 'Tenés rutina nueva 💪',
      'Tu profe te armó "' || new.nombre || '". Entrá a verla.', '/rutinas', 'rutina:' || new.id
    );
  end if;
  return new;
end;
$$;

drop trigger if exists rutinas_aviso_nueva on public.rutinas;
create trigger rutinas_aviso_nueva
  after insert or update of publicada on public.rutinas
  for each row execute function public.aviso_rutina_nueva();

-- Resumen de avance publicado
create or replace function public.aviso_resumen_publicado()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.estado = 'publicado' and old.estado is distinct from 'publicado' then
    perform public.encolar_aviso(
      new.cliente_id, 'resumen', 'Tu resumen de avance está listo 📈',
      'Tu profe revisó tus últimas 4 semanas.', '/progreso#avance', 'resumen:' || new.id
    );
  end if;
  return new;
end;
$$;

drop trigger if exists resumenes_aviso_publicado on public.resumenes_progreso;
create trigger resumenes_aviso_publicado
  after update of estado on public.resumenes_progreso
  for each row execute function public.aviso_resumen_publicado();

-- Al profe: cuenta nueva y "avisó que pagó"
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
  if coalesce(new.es_profe, false) then
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

drop trigger if exists perfiles_aviso_al_profe on public.perfiles;
create trigger perfiles_aviso_al_profe
  after insert or update of aviso_pago on public.perfiles
  for each row execute function public.aviso_al_profe_de_cuenta();

-- Al profe: pago con Mercado Pago aprobado
create or replace function public.aviso_pago_aprobado()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profe uuid;
  v_nombre text;
begin
  if new.estado = 'aprobado' and old.estado is distinct from 'aprobado' and new.metodo = 'mercadopago' then
    select trim(coalesce(nombre, '') || ' ' || coalesce(apellido, '')) into v_nombre
    from public.perfiles where id = new.cliente_id;
    for v_profe in select public.profes_a_avisar(new.cliente_id) loop
      perform public.encolar_aviso(
        v_profe, 'profe-mp', v_nombre || ' pagó con Mercado Pago',
        'Se le activó el plan por un mes más.', '/profe/cuentas', 'mp:' || new.id || ':' || v_profe
      );
    end loop;
  end if;
  return new;
end;
$$;

drop trigger if exists pagos_aviso_aprobado on public.pagos;
create trigger pagos_aviso_aprobado
  after update of estado on public.pagos
  for each row execute function public.aviso_pago_aprobado();

-- 5) Avisos de cada mañana ----------------------------------------------
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
  -- "Hoy te toca…": tiene rutina hoy, puede verla y todavía no entrenó.
  for fila in
    select p.id, r.nombre
    from public.perfiles p
    join public.calendario_cliente c on c.cliente_id = p.id and c.dia = v_dia
    join public.rutinas r on r.id = c.rutina_id and r.publicada
    where not coalesce(p.es_profe, false)
      and public.acceso_vigente(p.id)
      and not exists (select 1 from public.sesiones s where s.cliente_id = p.id and s.fecha = v_hoy)
  loop
    perform public.encolar_aviso(
      fila.id, 'hoy', 'Hoy te toca ' || fila.nombre || ' 🔥',
      'Tu entrenamiento de hoy te espera.', '/inicio', 'hoy:' || fila.id || ':' || v_hoy
    );
  end loop;

  -- Vencimiento del plan
  for fila in
    select p.id, p.vencimiento
    from public.perfiles p
    where not coalesce(p.es_profe, false) and p.estado = 'activo' and p.vencimiento is not null
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

-- 6) Mandar la cola: llama a la función "enviar-avisos" (solo si hay
--    avisos esperando y ya está cargada la dirección del proyecto).
create or replace function public.disparar_envio_de_avisos()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_url text := (select valor from public.ajustes_internos where clave = 'url_proyecto');
  v_secreto text := (select valor from public.ajustes_internos where clave = 'avisos_secreto');
begin
  if coalesce(v_url, '') = '' then
    return;
  end if;
  if not exists (
    select 1 from public.avisos
    where enviado_en is null and intentos < 5 and creado_en > now() - interval '1 day'
  ) then
    return;
  end if;
  perform net.http_post(
    url := rtrim(v_url, '/') || '/functions/v1/enviar-avisos',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-drey-secreto', v_secreto),
    body := '{}'::jsonb
  );
end;
$$;

revoke all on function public.disparar_envio_de_avisos() from public, anon, authenticated;

-- 7) Tareas programadas (pg_cron). La hora es UTC: 11:00 UTC = 8:00 en
--    Uruguay. Para cambiar la hora de los avisos de la mañana, cambiar
--    '0 11 * * *' y volver a correr este archivo.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job
    where jobname in ('drey-avisos-del-dia', 'drey-enviar-avisos');
    perform cron.schedule('drey-avisos-del-dia', '0 11 * * *', 'select public.generar_avisos_del_dia()');
    perform cron.schedule('drey-enviar-avisos', '* * * * *', 'select public.disparar_envio_de_avisos()');
  else
    raise notice 'pg_cron no está activo: los avisos automáticos quedan sin programar.';
  end if;
end;
$$;
