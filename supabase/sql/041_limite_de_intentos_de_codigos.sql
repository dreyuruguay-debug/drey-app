-- 041 · Límite de intentos para los códigos (auditoría de noviembre 2026, punto C)
--
-- El problema: sin iniciar sesión se podían probar códigos sin límite
-- (códigos de descuento y códigos de profes y gimnasios). Un programa
-- podía probar miles por minuto hasta adivinar uno.
--
-- Qué cambia:
--   · Cada código EQUIVOCADO que alguien prueba queda anotado (solo una
--     marca: quién, cuándo y una huella del código; no se guarda el código
--     ni la dirección de internet en limpio).
--   · Si alguien prueba 10 códigos equivocados DISTINTOS en 15 minutos, la
--     base le responde "Probaste muchos códigos seguidos..." a cualquier
--     código (también a los buenos) hasta que pasen los 15 minutos.
--     Repetir el mismo código equivocado no suma: solo cuentan los
--     distintos, así nadie queda bloqueado por tocar "Siguiente" dos veces.
--   · "Quién" es la cuenta, si inició sesión; si no, su dirección de
--     internet (guardada como huella, no en limpio).
--   · Las anotaciones de más de un día se borran solas.
--
-- Funciones que pasan a tener el límite (todas compartiendo el mismo
-- contador, para que no se pueda saltar probando en otra):
--   validar_codigo            códigos de descuento (registro del alumno)
--   buscar_espacio_por_codigo "¿Te pasaron un código?" y código del gimnasio
--   codigo_disponible         registro del profe/gimnasio ("ya está tomado")
--   planes_de_espacio         planes del profe o gimnasio elegido
--   datos_cobro_de_espacio    a quién se le paga (registro)
-- Lo que devuelven cuando el código está bien NO cambia.
--
-- Se puede correr antes o después de subir la app (la app vieja sigue
-- andando; la nueva muestra el mensaje del límite de forma prolija).
-- Se puede correr más de una vez sin romper nada.

-- 1) Las anotaciones ---------------------------------------------------------------
create table if not exists public.intentos_de_codigo (
  id bigint generated always as identity primary key,
  quien text not null,         -- 'u:<id de la cuenta>' o 'ip:<huella>'
  codigo_huella text not null, -- huella del código probado (no el código)
  creado_en timestamptz not null default now()
);

create index if not exists intentos_de_codigo_quien_fecha
  on public.intentos_de_codigo (quien, creado_en);
create index if not exists intentos_de_codigo_fecha
  on public.intentos_de_codigo (creado_en);

-- Nadie la lee ni la escribe desde la app: solo las funciones de abajo.
alter table public.intentos_de_codigo enable row level security;
revoke all on public.intentos_de_codigo from public, anon, authenticated;

-- 2) Ayudantes (solo para uso interno de la base) ----------------------------------

-- Cuántos códigos equivocados distintos se aceptan y en cuánto tiempo.
create or replace function public.limite_intentos_de_codigo()
returns table (maximo int, ventana interval)
language sql
immutable
as $$
  select 10, interval '15 minutes';
$$;

-- Quién está probando: la cuenta si inició sesión; si no, la huella de su
-- dirección de internet (Supabase la manda en los encabezados del pedido).
create or replace function public.quien_prueba_codigos()
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_encabezados json;
  v_ip text;
begin
  if auth.uid() is not null then
    return 'u:' || auth.uid()::text;
  end if;
  begin
    v_encabezados := nullif(current_setting('request.headers', true), '')::json;
  exception when others then
    v_encabezados := null;
  end;
  v_ip := coalesce(
    -- (Primero la que pone Cloudflare, que no se puede falsificar.)
    nullif(trim(v_encabezados ->> 'cf-connecting-ip'), ''),
    nullif(trim(v_encabezados ->> 'x-real-ip'), ''),
    nullif(trim(split_part(v_encabezados ->> 'x-forwarded-for', ',', 1)), ''),
    'sin-ip'
  );
  return 'ip:' || md5(v_ip);
end;
$$;

-- Frena si ya se pasó del límite. Se llama ANTES de buscar el código, así
-- un bloqueado no puede distinguir un código bueno de uno malo.
create or replace function public.frenar_si_prueba_demasiados_codigos()
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_quien text := public.quien_prueba_codigos();
  v_maximo int;
  v_ventana interval;
  v_fallidos int;
begin
  select l.maximo, l.ventana into v_maximo, v_ventana from public.limite_intentos_de_codigo() l;

  select count(distinct i.codigo_huella) into v_fallidos
  from public.intentos_de_codigo i
  where i.quien = v_quien
    and i.creado_en > now() - v_ventana;

  if v_fallidos >= v_maximo then
    raise exception 'Probaste muchos códigos seguidos. Por seguridad, esperá 15 minutos y volvé a intentar.'
      using errcode = 'PT429', hint = 'demasiados_intentos';
  end if;
end;
$$;

-- Anota un código equivocado (y de vez en cuando borra lo de más de un día).
create or replace function public.anotar_codigo_equivocado(p_codigo text)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
begin
  insert into public.intentos_de_codigo (quien, codigo_huella)
  values (public.quien_prueba_codigos(), md5(upper(trim(coalesce(p_codigo, '')))));

  if random() < 0.05 then
    delete from public.intentos_de_codigo where creado_en < now() - interval '1 day';
  end if;
end;
$$;

revoke all on function public.limite_intentos_de_codigo() from public, anon, authenticated;
revoke all on function public.quien_prueba_codigos() from public, anon, authenticated;
revoke all on function public.frenar_si_prueba_demasiados_codigos() from public, anon, authenticated;
revoke all on function public.anotar_codigo_equivocado(text) from public, anon, authenticated;

-- 3) Las funciones de códigos, ahora con el límite ---------------------------------
-- (Pasan de "stable" a "volatile" porque ahora anotan los intentos.)

-- Códigos de descuento (SQL 014). Mismo resultado que antes.
create or replace function public.validar_codigo(p_codigo text, p_plan text)
returns json
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  c public.codigos_descuento;
begin
  if coalesce(trim(p_codigo), '') = '' then
    return json_build_object('valido', false);
  end if;
  perform public.frenar_si_prueba_demasiados_codigos();
  c := public.buscar_codigo_valido(p_codigo, p_plan);
  if c.id is null then
    perform public.anotar_codigo_equivocado('descuento:' || p_codigo);
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

-- Buscar un profe o gimnasio por su código (SQL 033). Mismo resultado.
create or replace function public.buscar_espacio_por_codigo(p_codigo text)
returns table (codigo text, tipo text, nombre text, toma_alumnos boolean)
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_codigo text := public.normalizar_codigo(p_codigo);
begin
  if v_codigo = '' then
    return;
  end if;
  perform public.frenar_si_prueba_demasiados_codigos();
  return query
    select e.codigo, e.tipo, public.nombre_de_espacio(e.id),
           public.estado_espacio(e.id) in ('sin_costo', 'prueba', 'activo')
    from public.espacios e
    where e.codigo = v_codigo;
  if not found then
    perform public.anotar_codigo_equivocado('espacio:' || v_codigo);
  end if;
end;
$$;

revoke all on function public.buscar_espacio_por_codigo(text) from public;
grant execute on function public.buscar_espacio_por_codigo(text) to anon, authenticated;

-- ¿Está libre este código? (registro de profes y gimnasios, SQL 033).
-- "Ya está tomado" revela que el código existe: cuenta como intento.
create or replace function public.codigo_disponible(p_codigo text)
returns json
language plpgsql
volatile
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
  perform public.frenar_si_prueba_demasiados_codigos();
  if exists (select 1 from public.espacios where codigo = v_codigo) then
    perform public.anotar_codigo_equivocado('espacio:' || v_codigo);
    return json_build_object('disponible', false, 'codigo', v_codigo, 'motivo', 'tomado',
      'sugerencia', public.codigo_libre(v_codigo));
  end if;
  return json_build_object('disponible', true, 'codigo', v_codigo);
end;
$$;

revoke all on function public.codigo_disponible(text) from public;
grant execute on function public.codigo_disponible(text) to anon, authenticated;

-- Planes visibles de un espacio (registro, SQL 034). Mismo resultado.
create or replace function public.planes_de_espacio(p_codigo text)
returns table (
  id text, nombre text, descripcion text, precio_primer_mes int, precio_mensual int,
  link_mp text, orden int
)
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_codigo text := public.normalizar_codigo(p_codigo);
  v_espacio uuid;
begin
  perform public.frenar_si_prueba_demasiados_codigos();
  select e.id into v_espacio from public.espacios e where e.codigo = v_codigo;
  if v_espacio is null then
    perform public.anotar_codigo_equivocado('espacio:' || v_codigo);
    return;
  end if;
  return query
    select pl.id, pl.nombre, pl.descripcion, pl.precio_primer_mes, pl.precio_mensual,
           pl.link_mp, pl.orden
    from public.planes pl
    where pl.espacio_id = v_espacio and pl.activo
    order by pl.orden, pl.precio_mensual;
end;
$$;

revoke all on function public.planes_de_espacio(text) from public;
grant execute on function public.planes_de_espacio(text) to anon, authenticated;

-- A quién se le paga y link de Mercado Pago (registro, SQL 039). Mismo resultado.
create or replace function public.datos_cobro_de_espacio(p_codigo text)
returns json
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_codigo text := public.normalizar_codigo(p_codigo);
  v_resultado json;
begin
  perform public.frenar_si_prueba_demasiados_codigos();
  select json_build_object(
    'espacio', public.nombre_de_espacio(e.id),
    'link_mp', d.link_mp
  )
  into v_resultado
  from public.espacios e
  left join public.datos_cobro d on d.espacio_id = e.id
  where e.codigo = v_codigo;
  if v_resultado is null then
    perform public.anotar_codigo_equivocado('espacio:' || v_codigo);
  end if;
  return v_resultado;
end;
$$;

revoke all on function public.datos_cobro_de_espacio(text) from public;
grant execute on function public.datos_cobro_de_espacio(text) to anon, authenticated;
