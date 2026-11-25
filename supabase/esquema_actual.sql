-- ESQUEMA ACTUAL DE LA BASE DE DREY (foto al 24/11/2026, después del SQL 042)
--
-- Qué es: TODA la base en un solo archivo (tablas, reglas de permisos,
-- funciones, triggers, buckets de archivos y los datos iniciales:
-- ajustes, planes, biblioteca de ejercicios y tipos de aviso). Es la suma
-- de correr los SQL 001 al 042 en orden.
--
-- Para qué sirve:
--   · CONSULTAR cómo está hoy una tabla o una función, sin tener que
--     buscar en cuál de los 42 archivos se cambió por última vez.
--   · ARMAR UNA BASE NUEVA desde cero (por ejemplo, una de prueba): en un
--     proyecto nuevo de Supabase se corre este archivo una sola vez.
--
-- NO hay que correrlo en la base de hoy (ya tiene todo).
--
-- Los SQL numerados (supabase/sql/) siguen siendo los que se corren para
-- cada cambio nuevo. Este archivo se vuelve a generar al final de cada
-- tanda (lo arma Claude a partir de los SQL, en una base de prueba).
--
-- Lo que NO está acá, a propósito:
--   · el "secreto" de los avisos (ajustes_internos): cada base genera el
--     suyo con el SQL 015;
--   · los datos de las personas (perfiles, rutinas, entrenamientos...).

--
-- PostgreSQL database dump
--


-- Dumped from database version 16.15 (Ubuntu 16.15-0ubuntu0.24.04.1)
-- Dumped by pg_dump version 16.15 (Ubuntu 16.15-0ubuntu0.24.04.1)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--



--
-- Name: acceso_vigente(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.acceso_vigente(p_usuario uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select coalesce(
    (
      select coalesce(p.es_profe, false)
        or coalesce(p.es_admin, false)
        or (
          p.estado = 'activo'
          and (p.vencimiento is null or p.vencimiento + public.dias_de_gracia() >= public.hoy_uy())
          and not public.alumno_bloqueado_por_espacio(p.id)
        )
      from public.perfiles p
      where p.id = p_usuario
    ),
    false
  );
$$;


--
-- Name: aceptar_terminos(text, boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.aceptar_terminos(p_version text, p_salud boolean) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  if auth.uid() is null then
    raise exception 'Hay que iniciar sesión';
  end if;
  perform set_config('drey.sistema', 'on', true);
  update public.perfiles
  set terminos_version = left(p_version, 40),
      terminos_aceptados_en = now(),
      consentimiento_salud_en = case
        when p_salud then coalesce(consentimiento_salud_en, now())
        else consentimiento_salud_en
      end
  where id = auth.uid();
end;
$$;


--
-- Name: actividad_clientes(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.actividad_clientes() RETURNS TABLE(cliente_id uuid, primera date, ultima date, ciclos integer[])
    LANGUAGE sql STABLE
    SET search_path TO 'public'
    AS $$
  with base as (
    select s.cliente_id,
           s.fecha,
           min(s.fecha) over (partition by s.cliente_id) as primera
    from public.sesiones s
  )
  select base.cliente_id,
         min(base.primera) as primera,
         max(base.fecha) as ultima,
         array_agg(distinct ((base.fecha - base.primera) / 28 + 1)::int) as ciclos
  from base
  group by base.cliente_id;
$$;


--
-- Name: al_cambiar_profe_de_alumno(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.al_cambiar_profe_de_alumno() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
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
      perform public.avisar_profes('profe-alumno-nuevo', new.id, new.profe_id, '{}'::jsonb,
        'alumno-nuevo:' || new.id || ':' || v_clave);
    end if;

    if coalesce(current_setting('drey.via_solicitud', true), '') <> 'on'
       and auth.uid() is distinct from new.id then
      perform public.avisar('profe-asignado', new.id,
        jsonb_build_object('profe', public.nombre_de(new.profe_id)),
        'profe-asignado:' || new.id || ':' || new.profe_id || ':' || v_clave);
    end if;
  end if;

  if old.profe_id is not null and auth.uid() is distinct from old.profe_id then
    perform public.avisar_profes('profe-alumno-se-fue', new.id, old.profe_id,
      jsonb_build_object(
        'profe_nuevo', case when new.profe_id is null then '' else public.nombre_de(new.profe_id) end,
        'mensaje_personal', case when new.profe_id is null then 'Ya no está en tu lista de clientes.' else '' end
      ),
      'alumno-se-fue:' || new.id || ':' || v_clave);
  end if;

  return new;
end;
$$;


--
-- Name: alumno_bloqueado_por_espacio(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.alumno_bloqueado_por_espacio(p_usuario uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select coalesce((
    select public.hoy_uy() >= public.alumnos_entrenan_hasta(p.espacio_id)
    from public.perfiles p
    where p.id = p_usuario
      and p.espacio_id is not null
      and not coalesce(p.es_profe, false)
      and not coalesce(p.es_admin, false)
  ), false);
$$;


--
-- Name: alumnos_entrenan_hasta(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.alumnos_entrenan_hasta(p_espacio uuid) RETURNS date
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select public.espacio_sin_servicio_desde(p_espacio) + public.dias_alumnos_de_espacio();
$$;


--
-- Name: anotar_codigo_equivocado(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.anotar_codigo_equivocado(p_codigo text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  insert into public.intentos_de_codigo (quien, codigo_huella)
  values (public.quien_prueba_codigos(), md5(upper(trim(coalesce(p_codigo, '')))));

  if random() < 0.05 then
    delete from public.intentos_de_codigo where creado_en < now() - interval '1 day';
  end if;
end;
$$;


--
-- Name: anotar_historial(text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.anotar_historial(p_tipo text, p_detalle text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  if p_detalle is null or p_detalle = '' or not public.es_admin() then
    return;
  end if;
  insert into public.historial_admin (admin_id, tipo, detalle)
  values (auth.uid(), p_tipo, p_detalle);
end;
$$;


--
-- Name: asignar_profe_al_registrarse(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.asignar_profe_al_registrarse() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  meta jsonb;
  v_profe uuid;
  v_gimnasio uuid;
begin
  if coalesce(new.es_profe, false) then
    return new;
  end if;

  select raw_user_meta_data into meta from auth.users where id = new.id;
  if meta is null then
    return new;
  end if;

  begin
    v_profe := nullif(meta ->> 'profe_id', '')::uuid;
  exception when others then
    v_profe := null;
  end;

  begin
    v_gimnasio := nullif(meta ->> 'gimnasio_id', '')::uuid;
  exception when others then
    v_gimnasio := null;
  end;

  if v_profe is not null
     and exists (select 1 from public.perfiles where id = v_profe and es_profe = true) then
    new.profe_id := v_profe;
    -- El cliente queda también en el gimnasio donde trabaja su profe.
    new.gimnasio_id := (select gimnasio_id from public.perfiles where id = v_profe);
  elsif v_gimnasio is not null
     and exists (select 1 from public.gimnasios where id = v_gimnasio and activo = true) then
    new.gimnasio_id := v_gimnasio;
  end if;

  if (meta ->> 'aviso_pago') = 'true' then
    new.aviso_pago := true;
  end if;

  return new;
end;
$$;


--
-- Name: avisar(text, uuid, jsonb, text, timestamp with time zone); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.avisar(p_tipo text, p_usuario uuid, p_vars jsonb DEFAULT '{}'::jsonb, p_clave text DEFAULT NULL::text, p_enviar_desde timestamp with time zone DEFAULT NULL::timestamp with time zone) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_tipo public.tipos_aviso%rowtype;
  v_vars jsonb;
  v_cuerpo text;
begin
  select * into v_tipo from public.tipos_aviso where clave = p_tipo;
  if v_tipo.clave is null or not v_tipo.activo or p_usuario is null then
    return false;
  end if;

  -- Notificaciones de alumno: solo a los planes elegidos (si eligió).
  if v_tipo.grupo = 'alumno' and coalesce(cardinality(v_tipo.planes), 0) > 0
     and not exists (
       select 1 from public.perfiles where id = p_usuario and plan = any (v_tipo.planes)
     ) then
    return false;
  end if;

  v_vars := jsonb_build_object(
    'nombre',
    coalesce((select nullif(trim(nombre), '') from public.perfiles where id = p_usuario), '')
  ) || coalesce(p_vars, '{}'::jsonb);

  v_cuerpo := coalesce(
    nullif(trim(v_vars ->> 'mensaje_personal'), ''),
    public.rellenar_aviso(v_tipo.cuerpo, v_vars)
  );

  return public.encolar_aviso_en(
    p_usuario,
    p_tipo,
    public.rellenar_aviso(v_tipo.titulo, v_vars),
    v_cuerpo,
    public.rellenar_aviso(v_tipo.url, v_vars),
    coalesce(p_clave, p_tipo || ':' || p_usuario || ':' || (extract(epoch from clock_timestamp()) * 1000)::bigint),
    p_enviar_desde
  );
end;
$$;


--
-- Name: avisar_admins(text, jsonb, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.avisar_admins(p_tipo text, p_vars jsonb, p_clave text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_admin uuid;
begin
  for v_admin in select id from public.perfiles where es_admin loop
    perform public.avisar(p_tipo, v_admin, p_vars, p_clave || ':' || v_admin);
  end loop;
end;
$$;


--
-- Name: avisar_duenos(text, uuid, jsonb, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.avisar_duenos(p_tipo text, p_espacio uuid, p_vars jsonb, p_clave text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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


--
-- Name: avisar_pago_drey(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.avisar_pago_drey(p_espacio uuid, p_comprobante text DEFAULT NULL::text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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


--
-- Name: avisar_profes(text, uuid, uuid, jsonb, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.avisar_profes(p_tipo text, p_cliente uuid, p_profe uuid, p_vars jsonb, p_clave text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_destino uuid;
  v_vars jsonb := jsonb_build_object(
    'alumno', coalesce(
      (select nullif(trim(coalesce(nombre, '') || ' ' || coalesce(apellido, '')), '')
       from public.perfiles where id = p_cliente), 'Un alumno'),
    'cliente_id', coalesce(p_cliente::text, '')
  ) || coalesce(p_vars, '{}'::jsonb);
begin
  if not public.tipo_aviso_activo(p_tipo) then
    return;
  end if;
  for v_destino in select public.destinatarios_de_profe(p_tipo, p_cliente, p_profe) loop
    perform public.avisar(p_tipo, v_destino, v_vars, p_clave || ':' || v_destino);
  end loop;
end;
$$;


--
-- Name: aviso_al_profe_de_cuenta(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.aviso_al_profe_de_cuenta() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  if coalesce(new.es_profe, false) or coalesce(new.es_admin, false) then
    return new;
  end if;
  if tg_op = 'INSERT' then
    perform public.avisar_profes('profe-cuenta', new.id, null, '{}'::jsonb, 'cuenta:' || new.id);
  elsif new.aviso_pago and not coalesce(old.aviso_pago, false) then
    perform public.avisar_profes('profe-pago', new.id, null, '{}'::jsonb,
      'avisopago:' || new.id || ':' || extract(epoch from now())::bigint);
  end if;
  return new;
end;
$$;


--
-- Name: aviso_cuenta_del_alumno(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.aviso_cuenta_del_alumno() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_vars jsonb := jsonb_build_object('fecha', public.fecha_corta(new.vencimiento));
begin
  if coalesce(new.es_profe, false) or coalesce(new.es_admin, false) then
    return new;
  end if;
  if new.estado = 'activo' and old.estado is distinct from 'activo' then
    perform public.avisar('cuenta-activada', new.id, v_vars,
      'cuenta-activa:' || new.id || ':' || coalesce(new.vencimiento::text, ''));
  elsif new.vencimiento is not null and old.vencimiento is not null
        and new.vencimiento > old.vencimiento then
    perform public.avisar('pago-confirmado', new.id, v_vars,
      'pago-ok:' || new.id || ':' || new.vencimiento);
  end if;
  return new;
end;
$$;


--
-- Name: aviso_ejercicios_de_rutina_cambiaron(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.aviso_ejercicios_de_rutina_cambiaron() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  perform public.aviso_rutina_editada(coalesce(new.rutina_id, old.rutina_id));
  return null;
end;
$$;


--
-- Name: aviso_entrenamiento_al_profe(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.aviso_entrenamiento_al_profe() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_comentario text := nullif(trim(coalesce(new.comentario, '')), '');
  v_vars jsonb;
begin
  if exists (select 1 from public.perfiles
             where id = new.cliente_id and (coalesce(es_profe, false) or coalesce(es_admin, false))) then
    return new;
  end if;
  v_vars := jsonb_build_object(
    'rutina', coalesce((select nombre from public.rutinas where id = new.rutina_id), 'Entrenamiento'),
    'esfuerzo', case when new.esfuerzo between 1 and 5 then 'Esfuerzo ' || new.esfuerzo || ' de 5' else '' end,
    'comentario', coalesce(left(v_comentario, 120), '')
  );
  if v_comentario is not null and public.tipo_aviso_activo('profe-comentario') then
    perform public.avisar_profes('profe-comentario', new.cliente_id, null, v_vars, 'comentario:' || new.id);
  else
    perform public.avisar_profes('profe-entreno', new.cliente_id, null, v_vars, 'entreno:' || new.id);
  end if;
  return new;
end;
$$;


--
-- Name: aviso_resumen_publicado(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.aviso_resumen_publicado() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  if new.estado = 'publicado' and old.estado is distinct from 'publicado' then
    perform public.avisar('resumen', new.cliente_id, '{}'::jsonb, 'resumen:' || new.id);
  end if;
  return new;
end;
$$;


--
-- Name: aviso_rutina_cambio(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.aviso_rutina_cambio() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  -- Solo cambios de contenido de una rutina ya publicada (no el orden).
  if old.publicada and new.publicada
     and (to_jsonb(new) - 'orden') is distinct from (to_jsonb(old) - 'orden') then
    perform public.aviso_rutina_editada(new.id);
  end if;
  return null;
end;
$$;


--
-- Name: aviso_rutina_editada(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.aviso_rutina_editada(p_rutina uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_rutina record;
begin
  if not public.tipo_aviso_activo('rutina-editada') then
    return;
  end if;
  select id, cliente_id, nombre, publicada into v_rutina from public.rutinas where id = p_rutina;
  if v_rutina.id is null or not v_rutina.publicada then
    return;
  end if;
  -- Recién publicada: ya le llegó "Rutina nueva".
  if exists (select 1 from public.avisos
             where clave = 'rutina:' || p_rutina and creado_en > now() - interval '15 minutes') then
    return;
  end if;
  update public.avisos
  set enviar_desde = now() + interval '10 minutes'
  where tipo = 'rutina-editada' and clave like 'rutina-edit:' || p_rutina || ':%'
    and enviado_en is null and reclamado_en is null;
  if found then
    return;
  end if;
  perform public.avisar('rutina-editada', v_rutina.cliente_id,
    jsonb_build_object('rutina', v_rutina.nombre),
    'rutina-edit:' || p_rutina || ':' || (extract(epoch from clock_timestamp()) * 1000)::bigint,
    now() + interval '10 minutes');
end;
$$;


--
-- Name: aviso_rutina_nueva(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.aviso_rutina_nueva() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  if new.publicada and (tg_op = 'INSERT' or not coalesce(old.publicada, false)) then
    perform public.avisar('rutina-nueva', new.cliente_id,
      jsonb_build_object('rutina', new.nombre), 'rutina:' || new.id);
  end if;
  return new;
end;
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: avisos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.avisos (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    usuario_id uuid NOT NULL,
    tipo text NOT NULL,
    titulo text NOT NULL,
    cuerpo text,
    url text,
    clave text,
    creado_en timestamp with time zone DEFAULT now() NOT NULL,
    enviado_en timestamp with time zone,
    intentos integer DEFAULT 0 NOT NULL,
    enviar_desde timestamp with time zone DEFAULT now() NOT NULL,
    reclamado_en timestamp with time zone
);


--
-- Name: avisos_listos_para_enviar(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.avisos_listos_para_enviar() RETURNS SETOF public.avisos
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select * from public.avisos
  where enviado_en is null
    and intentos < 5
    and enviar_desde <= now() + interval '3 seconds'
    and creado_en > now() - interval '1 day'
    and (reclamado_en is null or reclamado_en < now() - interval '2 minutes')
    and not (tipo = 'descanso' and enviar_desde < now() - interval '2 minutes');
$$;


--
-- Name: codigos_descuento; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.codigos_descuento (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    codigo text NOT NULL,
    tipo text DEFAULT 'plan'::text NOT NULL,
    descripcion text,
    porcentaje numeric,
    monto_fijo integer,
    solo_primer_mes boolean DEFAULT true NOT NULL,
    planes text[] DEFAULT '{}'::text[] NOT NULL,
    usos_maximos integer,
    usos integer DEFAULT 0 NOT NULL,
    vence date,
    activo boolean DEFAULT true NOT NULL,
    profe_id uuid DEFAULT auth.uid(),
    creado_en timestamp with time zone DEFAULT now() NOT NULL,
    espacio_id uuid,
    CONSTRAINT codigos_descuento_monto_fijo_check CHECK (((monto_fijo IS NULL) OR (monto_fijo > 0))),
    CONSTRAINT codigos_descuento_porcentaje_check CHECK (((porcentaje IS NULL) OR ((porcentaje > (0)::numeric) AND (porcentaje <= (100)::numeric)))),
    CONSTRAINT codigos_descuento_tipo_check CHECK ((tipo = ANY (ARRAY['plan'::text, 'ropa'::text]))),
    CONSTRAINT codigos_descuento_usos_maximos_check CHECK (((usos_maximos IS NULL) OR (usos_maximos > 0)))
);


--
-- Name: buscar_codigo_valido(text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.buscar_codigo_valido(p_codigo text, p_plan text) RETURNS public.codigos_descuento
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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


--
-- Name: buscar_cuenta_por_email(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.buscar_cuenta_por_email(p_email text) RETURNS TABLE(id uuid, nombre text, apellido text, es_profe boolean, es_admin boolean)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select p.id, p.nombre, p.apellido, coalesce(p.es_profe, false), coalesce(p.es_admin, false)
  from auth.users u
  join public.perfiles p on p.id = u.id
  where public.es_admin() and lower(u.email) = lower(trim(p_email))
  limit 1;
$$;


--
-- Name: buscar_espacio_por_codigo(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.buscar_espacio_por_codigo(p_codigo text) RETURNS TABLE(codigo text, tipo text, nombre text, toma_alumnos boolean)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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


--
-- Name: calcular_precio(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.calcular_precio(p_cliente uuid, p_codigo text DEFAULT NULL::text) RETURNS json
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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


--
-- Name: cambiar_codigo_espacio(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.cambiar_codigo_espacio(p_espacio uuid, p_codigo text) RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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


--
-- Name: cambiar_profes_habilitan(uuid, boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.cambiar_profes_habilitan(p_espacio uuid, p_valor boolean) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  if not public.puedo_manejar_equipo(p_espacio) then
    raise exception 'Solo el dueño del gimnasio lo cambia';
  end if;
  update public.espacios set profes_habilitan = coalesce(p_valor, false) where id = p_espacio;
end;
$$;


--
-- Name: cancelar_aviso_descanso(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.cancelar_aviso_descanso() RETURNS void
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  delete from public.avisos
  where usuario_id = auth.uid() and tipo = 'descanso' and enviado_en is null and reclamado_en is null;
$$;


--
-- Name: cancelar_invitacion(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.cancelar_invitacion(p_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  update public.invitaciones set estado = 'cancelada', respondido_en = now()
  where id = p_id and estado = 'pendiente' and public.puedo_manejar_equipo(espacio_id);
  if not found then
    raise exception 'No encontramos esa invitación';
  end if;
end;
$$;


--
-- Name: cancelar_solicitud_membresia(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.cancelar_solicitud_membresia(p_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  update public.solicitudes_membresia
  set estado = 'cancelada', respondido_en = now()
  where id = p_id and profe_id = auth.uid() and estado = 'pendiente';
  if not found then
    raise exception 'No encontramos esa solicitud';
  end if;
end;
$$;


--
-- Name: cancelar_solicitud_profe(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.cancelar_solicitud_profe(p_id uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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


--
-- Name: codigo_disponible(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.codigo_disponible(p_codigo text) RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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


--
-- Name: codigo_libre(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.codigo_libre(p_base text) RETURNS text
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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


--
-- Name: controlar_cupo(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.controlar_cupo() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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


--
-- Name: convertir_en_admin(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.convertir_en_admin(p_email text) RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $_$
declare
  v_id uuid;
  v_columna text;
  v_tabla text;
begin
  select u.id into v_id
  from auth.users u
  where lower(u.email) = lower(trim(p_email));

  if v_id is null then
    raise exception 'No hay ninguna cuenta registrada con el email %', p_email;
  end if;

  if exists (select 1 from public.perfiles c where c.profe_id = v_id) then
    raise exception 'Esa cuenta es profe y tiene clientes. Usá otra cuenta para el Admin.';
  end if;

  perform set_config('drey.sistema', 'on', true);

  insert into public.perfiles (id) values (v_id) on conflict (id) do nothing;

  -- Un solo Admin.
  update public.perfiles set es_admin = false where es_admin and id <> v_id;
  update public.gimnasios set dueno_id = null where dueno_id = v_id;

  update public.perfiles
  set es_profe = false,
      es_admin = true,
      nombre = 'Admin',
      apellido = '',
      profe_id = null,
      gimnasio_id = null,
      estado = 'activo',
      aviso_pago = false,
      vencimiento = null
  where id = v_id;

  -- Datos de cliente del perfil. Se revisa que cada columna exista, así
  -- esto funciona aunque la base tenga alguna columna más o menos.
  foreach v_columna in array array[
    'plan', 'codigo_descuento', 'fecha_nacimiento', 'peso', 'altura', 'objetivo',
    'lesiones', 'comprobante_nombre', 'terminos_version', 'terminos_aceptados_en',
    'consentimiento_salud_en', 'baja_solicitada_en'
  ] loop
    if exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'perfiles' and column_name = v_columna
    ) then
      execute format('update public.perfiles set %I = null where id = $1', v_columna) using v_id;
    end if;
  end loop;

  -- Lo que la cuenta pudo generar como cliente (en este orden por las
  -- relaciones entre tablas).
  if to_regclass('public.rutina_ejercicios') is not null then
    delete from public.rutina_ejercicios
    where rutina_id in (select r.id from public.rutinas r where r.cliente_id = v_id);
  end if;
  foreach v_tabla in array array[
    'calendario_cliente', 'rutinas', 'sesiones', 'resumenes_progreso', 'mediciones', 'pagos'
  ] loop
    if to_regclass('public.' || v_tabla) is not null then
      execute format('delete from public.%I where cliente_id = $1', v_tabla) using v_id;
    end if;
  end loop;

  -- Avisos que recibió el profe por esta cuenta.
  if to_regclass('public.avisos') is not null then
    delete from public.avisos
    where clave like 'cuenta:' || v_id || ':%'
       or clave like 'avisopago:' || v_id || ':%';
  end if;

  -- Datos del registro guardados en la cuenta de acceso. Si Supabase no
  -- deja tocarlos, se sigue igual (no se ven en la app).
  begin
    update auth.users
    set raw_user_meta_data = jsonb_build_object('nombre', 'Admin')
    where id = v_id;
  exception when others then
    null;
  end;

  return 'Listo: ' || p_email || ' es la cuenta Admin (limpia).';
end;
$_$;


--
-- Name: crear_espacio(text, text, uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.crear_espacio(p_tipo text, p_nombre text, p_profe uuid, p_gimnasio uuid) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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


--
-- Name: cupos_de(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.cupos_de(p_espacio uuid) RETURNS json
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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


--
-- Name: cupos_totales(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.cupos_totales(p_espacio uuid) RETURNS integer
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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


--
-- Name: cupos_usados(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.cupos_usados(p_espacio uuid, p_sin uuid DEFAULT NULL::uuid) RETURNS integer
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select count(*)::int
  from public.perfiles p
  where p.espacio_id = p_espacio
    and p.id is distinct from p_sin
    and not coalesce(p.es_profe, false)
    and not coalesce(p.es_admin, false)
    and public.ocupa_cupo(p.estado, p.vencimiento, p.cupo_hasta);
$$;


--
-- Name: dar_de_baja_alumno(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.dar_de_baja_alumno(p_cliente uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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


--
-- Name: datos_cobro_de_espacio(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.datos_cobro_de_espacio(p_codigo text) RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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


--
-- Name: destinatarios_de_profe(text, uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.destinatarios_de_profe(p_tipo text, p_cliente uuid, p_profe uuid DEFAULT NULL::uuid) RETURNS SETOF uuid
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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


--
-- Name: dias_alumnos_de_espacio(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.dias_alumnos_de_espacio() RETURNS integer
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select greatest(coalesce((select dias_aviso_alumnos_espacio from public.ajustes where id = 1), 14), 0);
$$;


--
-- Name: dias_de_gracia(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.dias_de_gracia() RETURNS integer
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select coalesce((select dias_de_gracia from public.ajustes where id = 1), 3);
$$;


--
-- Name: disparar_envio_de_avisos(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.disparar_envio_de_avisos() RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_url text := (select valor from public.ajustes_internos where clave = 'url_proyecto');
  v_secreto text := (select valor from public.ajustes_internos where clave = 'avisos_secreto');
begin
  if coalesce(v_url, '') = '' then
    return;
  end if;
  if not exists (select 1 from public.avisos_listos_para_enviar()) then
    return;
  end if;
  perform net.http_post(
    url := rtrim(v_url, '/') || '/functions/v1/enviar-avisos',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-drey-secreto', v_secreto),
    body := '{}'::jsonb
  );
end;
$$;


--
-- Name: elegir_espacio(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.elegir_espacio(p_espacio uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  if public.mi_rol_en_espacio(p_espacio) is null then
    raise exception 'No sos parte de ese espacio';
  end if;
  update public.perfiles set ultimo_espacio_id = p_espacio where id = auth.uid();
end;
$$;


--
-- Name: elegir_plan_drey(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.elegir_plan_drey(p_espacio uuid, p_plan text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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


--
-- Name: en_hora(time without time zone, time without time zone); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.en_hora(p_ahora time without time zone, p_hora time without time zone) RETURNS boolean
    LANGUAGE sql IMMUTABLE
    AS $$
  select p_hora is not null and p_ahora >= p_hora and p_ahora - p_hora <= interval '3 hours';
$$;


--
-- Name: encolar_aviso(uuid, text, text, text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.encolar_aviso(p_usuario uuid, p_tipo text, p_titulo text, p_cuerpo text, p_url text, p_clave text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  perform public.encolar_aviso_en(p_usuario, p_tipo, p_titulo, p_cuerpo, p_url, p_clave, now());
end;
$$;


--
-- Name: encolar_aviso_en(uuid, text, text, text, text, text, timestamp with time zone); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.encolar_aviso_en(p_usuario uuid, p_tipo text, p_titulo text, p_cuerpo text, p_url text, p_clave text, p_enviar_desde timestamp with time zone) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  if p_usuario is null
     or not exists (select 1 from public.push_suscripciones where usuario_id = p_usuario) then
    return false;
  end if;
  insert into public.avisos (usuario_id, tipo, titulo, cuerpo, url, clave, enviar_desde)
  values (p_usuario, p_tipo, p_titulo, p_cuerpo, p_url, p_clave, coalesce(p_enviar_desde, now()))
  on conflict (clave) do nothing;
  return found;
end;
$$;


--
-- Name: equipo_de_espacio(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.equipo_de_espacio(p_espacio uuid) RETURNS TABLE(perfil_id uuid, nombre text, celular text, rol text, alumnos integer, entrenaron integer, desde timestamp with time zone)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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


--
-- Name: es_admin(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.es_admin() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select coalesce((select es_admin from public.perfiles where id = auth.uid()), false);
$$;


--
-- Name: es_profe(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.es_profe() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select coalesce(
    (select coalesce(es_profe, false) or coalesce(es_admin, false)
     from public.perfiles where id = auth.uid()),
    false
  );
$$;


--
-- Name: espacio_que_corresponde(uuid, uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.espacio_que_corresponde(p_actual uuid, p_profe uuid, p_gimnasio uuid) RETURNS uuid
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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


--
-- Name: espacio_sin_servicio_desde(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.espacio_sin_servicio_desde(p_espacio uuid) RETURNS date
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  -- (greatest ignora los null: por eso el "case" de afuera.)
  select case when x.desde is null then null
              else greatest(x.desde, coalesce(
                (select a.espacios_corte_desde from public.ajustes a where a.id = 1), x.desde))
         end
  from (select case public.estado_espacio(e.id)
    when 'activo' then null
    when 'sin_costo' then null
    when 'prueba' then null
    when 'prueba_terminada' then e.prueba_hasta + 1
    when 'vencido' then e.vencimiento + public.dias_de_gracia() + 1
    else coalesce(e.sin_servicio_desde, public.hoy_uy())
  end as desde
  from public.espacios e
  where e.id = p_espacio) x;
$$;


--
-- Name: espacios_para_alumnos(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.espacios_para_alumnos() RETURNS TABLE(codigo text, tipo text, nombre text, profe_id uuid)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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


--
-- Name: estado_espacio(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.estado_espacio(p_espacio uuid) RETURNS text
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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


--
-- Name: fecha_corta(date); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fecha_corta(p_fecha date) RETURNS text
    LANGUAGE sql IMMUTABLE
    AS $$
  select coalesce(to_char(p_fecha, 'DD/MM'), '');
$$;


--
-- Name: fin_de_periodo(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.fin_de_periodo(p_espacio uuid) RETURNS date
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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


--
-- Name: frenar_si_prueba_demasiados_codigos(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.frenar_si_prueba_demasiados_codigos() RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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


--
-- Name: generar_avisos_del_dia(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.generar_avisos_del_dia() RETURNS integer
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select public.generar_avisos_programados();
$$;


--
-- Name: generar_avisos_programados(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.generar_avisos_programados() RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_ahora timestamp := now() at time zone 'America/Montevideo';
  v_hoy date := (now() at time zone 'America/Montevideo')::date;
  v_hora time := (now() at time zone 'America/Montevideo')::time;
  v_dia text := (array['Lunes','Martes','Miércoles','Jueves','Viernes','Sábado','Domingo'])[extract(isodow from v_ahora)::int];
  v_antes int := (select count(*) from public.avisos);
  v_tipo public.tipos_aviso%rowtype;
  v_dias_aviso int := coalesce((select dias_aviso from public.ajustes limit 1), 5);
  fila record;
begin
  -- Hoy te toca (cada alumno a su hora, o a la hora general)
  select * into v_tipo from public.tipos_aviso where clave = 'hoy';
  if v_tipo.activo then
    for fila in
      select p.id, r.nombre
      from public.perfiles p
      join public.calendario_cliente c on c.cliente_id = p.id and c.dia = v_dia
      join public.rutinas r on r.id = c.rutina_id and r.publicada
      where not coalesce(p.es_profe, false)
        and not coalesce(p.es_admin, false)
        and public.en_hora(v_hora, coalesce(p.hora_recordatorio, v_tipo.hora))
        and public.acceso_vigente(p.id)
        and not exists (select 1 from public.sesiones s where s.cliente_id = p.id and s.fecha = v_hoy)
    loop
      perform public.avisar('hoy', fila.id, jsonb_build_object('rutina', fila.nombre),
        'hoy:' || fila.id || ':' || v_hoy);
    end loop;
  end if;

  -- Vencimientos
  for fila in
    select p.id, p.vencimiento
    from public.perfiles p
    where not coalesce(p.es_profe, false) and not coalesce(p.es_admin, false)
      and p.estado = 'activo' and p.vencimiento is not null
      and not coalesce(p.aviso_pago, false)
      and p.vencimiento between v_hoy - 31 and v_hoy + 31
  loop
    if v_dias_aviso > 0 and fila.vencimiento - v_hoy = v_dias_aviso
       and public.en_hora(v_hora, (select hora from public.tipos_aviso where clave = 'vence-antes')) then
      perform public.avisar('vence-antes', fila.id,
        jsonb_build_object('dias', v_dias_aviso, 'fecha', public.fecha_corta(fila.vencimiento)),
        'vence' || v_dias_aviso || ':' || fila.id || ':' || fila.vencimiento);
    elsif fila.vencimiento = v_hoy
       and public.en_hora(v_hora, (select hora from public.tipos_aviso where clave = 'vence-hoy')) then
      perform public.avisar('vence-hoy', fila.id,
        jsonb_build_object('fecha', public.fecha_corta(fila.vencimiento)),
        'vence0:' || fila.id || ':' || fila.vencimiento);
    elsif fila.vencimiento + public.dias_de_gracia() = v_hoy and public.dias_de_gracia() > 0
       and public.en_hora(v_hora, (select hora from public.tipos_aviso where clave = 'gracia')) then
      perform public.avisar('gracia', fila.id,
        jsonb_build_object('fecha', public.fecha_corta(fila.vencimiento)),
        'gracia:' || fila.id || ':' || fila.vencimiento);
    end if;
  end loop;

  -- Sin entrenar (al alumno y a su profe), una vez por racha
  for v_tipo in
    select * from public.tipos_aviso
    where clave in ('sin-entrenar', 'profe-sin-entrenar') and activo and public.en_hora(v_hora, hora)
  loop
    for fila in
      select p.id, coalesce(max(s.fecha), min(r.creado_en)::date) as ultima
      from public.perfiles p
      join public.rutinas r on r.cliente_id = p.id and r.publicada
      left join public.sesiones s on s.cliente_id = p.id
      where not coalesce(p.es_profe, false)
        and not coalesce(p.es_admin, false)
        and p.estado = 'activo'
        and public.acceso_vigente(p.id)
      group by p.id
      having coalesce(max(s.fecha), min(r.creado_en)::date)
             between v_hoy - 60 and v_hoy - greatest(coalesce(v_tipo.dias, 5), 1)
    loop
      if v_tipo.clave = 'sin-entrenar' then
        perform public.avisar('sin-entrenar', fila.id,
          jsonb_build_object('dias', v_hoy - fila.ultima),
          'sin-entrenar:' || fila.id || ':' || fila.ultima);
      else
        perform public.avisar_profes('profe-sin-entrenar', fila.id, null,
          jsonb_build_object('dias', v_hoy - fila.ultima),
          'profe-sin-entrenar:' || fila.id || ':' || fila.ultima);
      end if;
    end loop;
  end loop;

  -- Limpieza: los avisos de hace más de 60 días ya no sirven.
  delete from public.avisos where creado_en < now() - interval '60 days';

  return (select count(*) from public.avisos) - v_antes;
end;
$$;


--
-- Name: guardar_consentimiento_al_registrarse(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.guardar_consentimiento_al_registrarse() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  meta jsonb;
begin
  select raw_user_meta_data into meta from auth.users where id = new.id;
  if meta is null then
    return new;
  end if;

  if coalesce(meta ->> 'terminos_version', '') <> '' then
    new.terminos_version := left(meta ->> 'terminos_version', 40);
    new.terminos_aceptados_en := now();
  end if;

  if (meta ->> 'consentimiento_salud') = 'true' then
    new.consentimiento_salud_en := now();
  end if;

  return new;
end;
$$;


--
-- Name: guardar_datos_cobro(uuid, text, text, text, text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.guardar_datos_cobro(p_espacio uuid, p_banco text, p_titular text, p_cuenta text, p_moneda text, p_alias text, p_link_mp text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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


--
-- Name: guardar_mi_recordatorio(time without time zone); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.guardar_mi_recordatorio(p_hora time without time zone DEFAULT NULL::time without time zone) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  if auth.uid() is null then
    raise exception 'Iniciá sesión de nuevo';
  end if;
  update public.perfiles set hora_recordatorio = p_hora where id = auth.uid();
end;
$$;


--
-- Name: guardar_pagina_inicio(jsonb, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.guardar_pagina_inicio(p_textos jsonb DEFAULT '{}'::jsonb, p_secciones jsonb DEFAULT '{}'::jsonb) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  if not public.es_admin() then
    raise exception 'Solo el Admin puede cambiar la página de inicio';
  end if;

  p_textos := coalesce(p_textos, '{}'::jsonb);
  p_secciones := coalesce(p_secciones, '{}'::jsonb);

  if jsonb_typeof(p_textos) <> 'object' or jsonb_typeof(p_secciones) <> 'object' then
    raise exception 'Formato inválido';
  end if;
  if exists (select 1 from jsonb_each(p_secciones) where jsonb_typeof(value) <> 'boolean') then
    raise exception 'Formato inválido';
  end if;

  insert into public.pagina_inicio (id) values (1) on conflict (id) do nothing;

  update public.pagina_inicio
     set textos = jsonb_strip_nulls(textos || p_textos),
         secciones = secciones || p_secciones
   where id = 1;
end;
$$;


--
-- Name: guardar_plan_espacio(uuid, text, text, text, integer, integer, text, boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.guardar_plan_espacio(p_espacio uuid, p_id text, p_nombre text, p_descripcion text, p_precio_primer_mes integer, p_precio_mensual integer, p_link_mp text, p_activo boolean DEFAULT true) RETURNS text
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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


--
-- Name: guardar_suscripcion_push(text, text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.guardar_suscripcion_push(p_endpoint text, p_p256dh text, p_auth text, p_dispositivo text) RETURNS void
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  insert into public.push_suscripciones (usuario_id, endpoint, p256dh, auth, dispositivo)
  values (auth.uid(), p_endpoint, p_p256dh, p_auth, left(p_dispositivo, 120))
  on conflict (endpoint) do update
    set usuario_id = auth.uid(), p256dh = excluded.p256dh, auth = excluded.auth,
        dispositivo = excluded.dispositivo;
$$;


--
-- Name: guardar_tipo_aviso(text, boolean, text, text, time without time zone, integer, text, text[]); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.guardar_tipo_aviso(p_clave text, p_activo boolean, p_titulo text, p_cuerpo text, p_hora time without time zone DEFAULT NULL::time without time zone, p_dias integer DEFAULT NULL::integer, p_destino text DEFAULT NULL::text, p_planes text[] DEFAULT NULL::text[]) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_antes public.tipos_aviso%rowtype;
  v_titulo text := left(trim(coalesce(p_titulo, '')), 80);
  v_cuerpo text := left(trim(coalesce(p_cuerpo, '')), 180);
  v_planes text[] := case when coalesce(cardinality(p_planes), 0) = 0 then null else p_planes end;
  v_cambios text[] := '{}';
begin
  if not public.es_admin() then
    raise exception 'Solo el Admin puede cambiar las notificaciones';
  end if;
  select * into v_antes from public.tipos_aviso where clave = p_clave for update;
  if v_antes.clave is null then
    raise exception 'No existe esa notificación';
  end if;
  if v_titulo = '' then
    raise exception 'El título no puede quedar vacío';
  end if;
  if v_antes.disparo = 'horario' and p_hora is null then
    raise exception 'Elegí a qué hora sale';
  end if;
  if v_antes.dias_etiqueta is not null and (p_dias is null or p_dias < 1 or p_dias > 60) then
    raise exception 'Los días tienen que ser entre 1 y 60';
  end if;
  if v_antes.grupo = 'profe' and not (p_destino = any (v_antes.destinos_posibles)) then
    raise exception 'Elegí a quién le llega';
  end if;
  if v_planes is not null and exists (
    select 1 from unnest(v_planes) p where p not in (select id from public.planes)
  ) then
    raise exception 'Hay un plan que no existe';
  end if;

  update public.tipos_aviso set
    activo = coalesce(p_activo, activo),
    titulo = v_titulo,
    cuerpo = v_cuerpo,
    hora = case when v_antes.disparo = 'horario' then p_hora else hora end,
    dias = case when v_antes.dias_etiqueta is not null then p_dias else dias end,
    destino = case when v_antes.grupo = 'profe' then p_destino else destino end,
    planes = case when v_antes.grupo = 'alumno' then v_planes else planes end,
    actualizado_en = now()
  where clave = p_clave;

  if coalesce(p_activo, v_antes.activo) <> v_antes.activo then
    v_cambios := v_cambios || case when p_activo then 'prendida' else 'apagada' end;
  end if;
  if v_titulo <> v_antes.titulo or v_cuerpo <> v_antes.cuerpo then
    v_cambios := v_cambios || 'texto cambiado'::text;
  end if;
  if v_antes.disparo = 'horario' and p_hora is distinct from v_antes.hora then
    v_cambios := v_cambios || ('hora ' || to_char(v_antes.hora, 'HH24:MI') || ' → ' || to_char(p_hora, 'HH24:MI'));
  end if;
  if v_antes.dias_etiqueta is not null and p_dias is distinct from v_antes.dias then
    v_cambios := v_cambios || ('días ' || v_antes.dias || ' → ' || p_dias);
  end if;
  if v_antes.grupo = 'profe' and p_destino is distinct from v_antes.destino then
    v_cambios := v_cambios || ('le llega a: ' || p_destino);
  end if;
  if v_antes.grupo = 'alumno' and v_planes is distinct from v_antes.planes then
    v_cambios := v_cambios || ('planes: ' || coalesce(array_to_string(v_planes, ', '), 'todos'));
  end if;

  if cardinality(v_cambios) > 0 then
    perform public.anotar_historial('avisos', v_antes.nombre || ': ' || array_to_string(v_cambios, ' · '));
  end if;
end;
$$;


--
-- Name: handle_new_user(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.handle_new_user() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  insert into public.perfiles (
    id, nombre, apellido, fecha_nacimiento, peso, celular, objetivo, lesiones,
    plan, codigo_descuento, estado
  )
  values (
    new.id,
    new.raw_user_meta_data ->> 'nombre',
    new.raw_user_meta_data ->> 'apellido',
    nullif(new.raw_user_meta_data ->> 'fecha_nacimiento', '')::date,
    nullif(new.raw_user_meta_data ->> 'peso', '')::numeric,
    new.raw_user_meta_data ->> 'celular',
    new.raw_user_meta_data ->> 'objetivo',
    new.raw_user_meta_data ->> 'lesiones',
    new.raw_user_meta_data ->> 'plan',
    new.raw_user_meta_data ->> 'codigo_descuento',
    coalesce(new.raw_user_meta_data ->> 'estado', 'pendiente')
  );
  return new;
end;
$$;


--
-- Name: historial_ajustes(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.historial_ajustes() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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


--
-- Name: historial_ajustes_drive(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.historial_ajustes_drive() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_cambios text[] := '{}';
begin
  new.actualizado_en := now();
  if new.url_script is distinct from old.url_script then
    v_cambios := v_cambios || case
      when coalesce(new.url_script, '') = '' then 'quitó la conexión con Google Drive'
      else 'conectó Google Drive' end;
  end if;
  if new.clave is distinct from old.clave and coalesce(new.url_script, '') <> '' then
    v_cambios := v_cambios || 'cambió la clave de Drive'::text;
  end if;
  if new.carpeta_url is distinct from old.carpeta_url then
    v_cambios := v_cambios || ('carpeta de Drive: ' || coalesce(nullif(new.carpeta_url, ''), '(sin link)'));
  end if;
  if array_length(v_cambios, 1) > 0 then
    perform public.anotar_historial('ajustes', 'Evaluaciones: ' || array_to_string(v_cambios, ', '));
  end if;
  return new;
end;
$$;


--
-- Name: historial_avisos(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.historial_avisos(p_limite integer DEFAULT 100) RETURNS TABLE(id uuid, tipo text, nombre_tipo text, destinatario text, titulo text, cuerpo text, creado_en timestamp with time zone, enviar_desde timestamp with time zone, enviado_en timestamp with time zone, intentos integer)
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  if not public.es_admin() then
    raise exception 'Solo el Admin puede ver esto';
  end if;
  return query
    select a.id, a.tipo,
      coalesce(t.nombre, case when a.tipo = 'prueba' then 'Prueba' else a.tipo end),
      coalesce(nullif(trim(coalesce(p.nombre, '') || ' ' || coalesce(p.apellido, '')), ''), 'Sin nombre'),
      a.titulo, a.cuerpo, a.creado_en, a.enviar_desde, a.enviado_en, a.intentos
    from public.avisos a
    left join public.tipos_aviso t on t.clave = a.tipo
    left join public.perfiles p on p.id = a.usuario_id
    where a.tipo <> 'descanso'
    order by a.creado_en desc
    limit greatest(1, least(coalesce(p_limite, 100), 300));
end;
$$;


--
-- Name: historial_ejercicios(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.historial_ejercicios() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_quien text;
  v_texto text;
begin
  if auth.uid() is null or to_regclass('public.historial_admin') is null then
    return null;
  end if;

  select case
      when coalesce(p.es_admin, false) then 'El Admin'
      else coalesce(nullif(trim(coalesce(p.nombre, '') || ' ' || coalesce(p.apellido, '')), ''), 'Un profe')
    end
  into v_quien
  from public.perfiles p
  where p.id = auth.uid();
  v_quien := coalesce(v_quien, 'Alguien');

  if tg_op = 'DELETE' then
    v_texto := v_quien || ' borró para siempre el ejercicio "' || old.nombre || '"';
  elsif old.archivado_en is null and new.archivado_en is not null then
    v_texto := v_quien || ' archivó el ejercicio "' || new.nombre || '"';
  elsif old.archivado_en is not null and new.archivado_en is null then
    v_texto := v_quien || ' recuperó el ejercicio "' || new.nombre || '"';
  else
    return null;
  end if;

  insert into public.historial_admin (admin_id, tipo, detalle)
  values (auth.uid(), 'biblioteca', v_texto);
  return null;
end;
$$;


--
-- Name: historial_espacios(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.historial_espacios() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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


--
-- Name: historial_gimnasios(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.historial_gimnasios() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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


--
-- Name: historial_habilitaciones(uuid, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.historial_habilitaciones(p_espacio uuid, p_limite integer DEFAULT 50) RETURNS TABLE(creado_en timestamp with time zone, alumno text, por text, rol text, cupo integer, cupos integer)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select h.creado_en, public.nombre_de(h.alumno_id),
         case when h.rol = 'admin' then 'DREY' else public.nombre_de(h.por_id) end,
         h.rol, h.cupo, h.cupos
  from public.habilitaciones h
  where h.espacio_id = p_espacio
    and (public.es_admin() or public.mi_rol_en_espacio(p_espacio) = 'dueno')
  order by h.creado_en desc
  limit least(greatest(coalesce(p_limite, 50), 1), 200);
$$;


--
-- Name: historial_pagina_inicio(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.historial_pagina_inicio() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_cambios text[] := '{}';
  v_textos text;
  v_secciones text;
begin
  -- Textos: qué secciones cambiaron (la parte antes del punto de cada clave).
  select string_agg(distinct public.nombre_seccion_inicio(split_part(clave, '.', 1)), ', ')
    into v_textos
  from (
    select coalesce(n.key, o.key) as clave
    from jsonb_each(new.textos) n
    full join jsonb_each(old.textos) o on o.key = n.key
    where n.value is distinct from o.value
  ) cambiadas;
  if v_textos is not null then
    v_cambios := v_cambios || ('textos de ' || v_textos);
  end if;

  -- Secciones mostradas u ocultadas.
  select string_agg(
           case when coalesce((new.secciones ->> s.id)::boolean, true)
                then 'mostró ' else 'ocultó ' end || public.nombre_seccion_inicio(s.id),
           ', ')
    into v_secciones
  from (
    select key as id from jsonb_object_keys(new.secciones) as key
    union
    select key from jsonb_object_keys(old.secciones) as key
  ) s
  where coalesce((new.secciones ->> s.id)::boolean, true)
        is distinct from coalesce((old.secciones ->> s.id)::boolean, true);
  if v_secciones is not null then
    v_cambios := v_cambios || v_secciones;
  end if;

  if new.foto_fundador_url is distinct from old.foto_fundador_url then
    v_cambios := v_cambios || (case when new.foto_fundador_url is null
      then 'quitó la foto del fundador' else 'cambió la foto del fundador' end);
  end if;
  if new.video_celular_url is distinct from old.video_celular_url then
    v_cambios := v_cambios || (case when new.video_celular_url is null
      then 'volvió al video original del celular' else 'cambió el video del celular' end);
  end if;
  if new.video_compu_url is distinct from old.video_compu_url then
    v_cambios := v_cambios || (case when new.video_compu_url is null
      then 'volvió al video original de la compu' else 'cambió el video de la compu' end);
  end if;

  if array_length(v_cambios, 1) > 0 then
    perform public.anotar_historial('pagina', 'Página de inicio: ' || array_to_string(v_cambios, '; '));
  end if;
  return new;
end;
$$;


--
-- Name: historial_pagos(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.historial_pagos() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  if new.metodo = 'manual' and new.estado = 'aprobado' then
    perform public.anotar_historial('pago', 'Confirmó un pago de ' || public.nombre_de(new.cliente_id) ||
      ' (' || public.pesos(new.monto) || ')');
  end if;
  return new;
end;
$$;


--
-- Name: historial_pagos_drey(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.historial_pagos_drey() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  perform public.anotar_historial('drey', 'Confirmó el pago de ' ||
    coalesce(new.espacio_nombre, (select nombre from public.espacios where id = new.espacio_id), 'un espacio') ||
    ' a DREY (' || public.pesos(new.monto) || ', plan ' ||
    coalesce((select nombre from public.planes_drey where id = new.plan), new.plan, '—') ||
    ', hasta el ' || coalesce(public.fecha_corta(new.periodo_hasta), '—') || ')');
  return new;
end;
$$;


--
-- Name: historial_perfiles(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.historial_perfiles() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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


--
-- Name: historial_planes(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.historial_planes() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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


--
-- Name: historial_planes_drey(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.historial_planes_drey() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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


--
-- Name: hoy_uy(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.hoy_uy() RETURNS date
    LANGUAGE sql STABLE
    AS $$
  select (now() at time zone 'America/Montevideo')::date;
$$;


--
-- Name: invitar_profe(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.invitar_profe(p_espacio uuid, p_email text) RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $_$
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
$_$;


--
-- Name: limite_intentos_de_codigo(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.limite_intentos_de_codigo() RETURNS TABLE(maximo integer, ventana interval)
    LANGUAGE sql IMMUTABLE
    AS $$
  select 10, interval '15 minutes';
$$;


--
-- Name: marcar_ajustes_actualizados(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.marcar_ajustes_actualizados() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
  new.actualizado_en := now();
  return new;
end;
$$;


--
-- Name: marcar_espacio_actualizado(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.marcar_espacio_actualizado() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
  new.actualizado_en := now();
  if new.codigo is distinct from old.codigo then
    new.codigo := public.normalizar_codigo(new.codigo);
  end if;
  return new;
end;
$$;


--
-- Name: marcar_evaluacion_anual_vista(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.marcar_evaluacion_anual_vista(p_id uuid) RETURNS void
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  update public.evaluaciones_anuales
  set visto = true
  where id = p_id and cliente_id = auth.uid() and estado = 'publicado';
$$;


--
-- Name: marcar_perfil_profe_actualizado(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.marcar_perfil_profe_actualizado() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
  new.actualizado_en := now();
  return new;
end;
$$;


--
-- Name: marcar_resumen_visto(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.marcar_resumen_visto(p_id uuid) RETURNS void
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  update public.resumenes_progreso
  set visto = true
  where id = p_id and cliente_id = auth.uid() and estado = 'publicado';
$$;


--
-- Name: marcar_sin_servicio_de_espacio(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.marcar_sin_servicio_de_espacio() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
  if new.estado in ('pendiente', 'pausado') then
    if old.estado not in ('pendiente', 'pausado') then
      -- Si quien lo cambia no dijo desde cuándo (la tarea sí lo dice),
      -- desde hoy.
      if new.sin_servicio_desde is not distinct from old.sin_servicio_desde then
        new.sin_servicio_desde := public.hoy_uy();
      end if;
    end if;
    new.sin_servicio_desde := coalesce(new.sin_servicio_desde, public.hoy_uy());
  else
    new.sin_servicio_desde := null;
  end if;
  return new;
end;
$$;


--
-- Name: mensajes_para_mi(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.mensajes_para_mi() RETURNS json
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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


--
-- Name: mi_acceso(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.mi_acceso() RETURNS json
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select json_build_object(
    'estado', p.estado,
    'vencimiento', p.vencimiento,
    'dias_de_gracia', public.dias_de_gracia(),
    'dias_para_vencer', case when p.vencimiento is null then null else p.vencimiento - public.hoy_uy() end,
    'acceso', public.acceso_vigente(p.id),
    'espacio_cartel', h.hasta is not null and public.hoy_uy() < h.hasta,
    'espacio_bloqueado', h.hasta is not null and public.hoy_uy() >= h.hasta,
    'espacio_hasta', h.hasta,
    'espacio_tipo', (select e.tipo from public.espacios e where e.id = p.espacio_id)
  )
  from public.perfiles p
  left join lateral (
    select case
      when p.espacio_id is not null and not coalesce(p.es_profe, false) and not coalesce(p.es_admin, false)
      then public.alumnos_entrenan_hasta(p.espacio_id)
    end as hasta
  ) h on true
  where p.id = auth.uid();
$$;


--
-- Name: mi_cobro(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.mi_cobro() RETURNS json
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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


--
-- Name: mi_email(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.mi_email() RETURNS text
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select lower(u.email) from auth.users u
  where u.id = auth.uid() and u.email_confirmed_at is not null;
$$;


--
-- Name: mi_profe(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.mi_profe() RETURNS TABLE(nombre text, celular text)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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


--
-- Name: mi_recordatorio(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.mi_recordatorio() RETURNS json
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select json_build_object(
    'propia', (select to_char(hora_recordatorio, 'HH24:MI') from public.perfiles where id = auth.uid()),
    'general', (select to_char(hora, 'HH24:MI') from public.tipos_aviso where clave = 'hoy'),
    'activo', public.tipo_aviso_activo('hoy')
  );
$$;


--
-- Name: mi_rol(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.mi_rol() RETURNS json
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select json_build_object(
    'es_profe', coalesce(p.es_profe, false),
    'es_admin', coalesce(p.es_admin, false),
    'gimnasios', coalesce(
      (select json_agg(json_build_object('id', g.id, 'nombre', g.nombre) order by g.nombre)
       from public.gimnasios g where g.dueno_id = p.id),
      '[]'::json
    )
  )
  from public.perfiles p
  where p.id = auth.uid();
$$;


--
-- Name: mi_rol_en_espacio(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.mi_rol_en_espacio(p_espacio uuid) RETURNS text
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select m.rol
  from public.membresias m
  join public.perfiles p on p.id = m.perfil_id
  where m.espacio_id = p_espacio
    and m.perfil_id = auth.uid()
    and m.estado = 'activa'
    and coalesce(p.es_profe, false);
$$;


--
-- Name: mis_ajustes(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.mis_ajustes() RETURNS json
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  a public.ajustes%rowtype;
  v_con_sesion boolean := auth.uid() is not null;
  v_admin boolean := false;
  v_profe boolean := false;
  v_alumno_al_dia boolean := false;
begin
  select * into a from public.ajustes where id = 1;
  if not found then
    return null;
  end if;

  if v_con_sesion then
    select coalesce(p.es_admin, false), coalesce(p.es_profe, false)
    into v_admin, v_profe
    from public.perfiles p
    where p.id = auth.uid();
    -- acceso_vigente() también da true a profes y Admin: acá solo cuenta
    -- para los alumnos.
    v_alumno_al_dia := not coalesce(v_admin, false)
      and not coalesce(v_profe, false)
      and public.acceso_vigente(auth.uid());
  end if;

  return json_build_object(
    -- Para todos
    'cobro_automatico', a.cobro_automatico,
    'dias_aviso', a.dias_aviso,
    'dias_de_gracia', a.dias_de_gracia,
    'prueba_activa', a.prueba_activa,
    'prueba_dias', a.prueba_dias,
    'prueba_cupos', a.prueba_cupos,
    'dias_aviso_alumnos_espacio', a.dias_aviso_alumnos_espacio,
    -- Con sesión: transferencia a DREY (alumnos de antes de los espacios)
    'transferencia_banco', case when v_con_sesion then a.transferencia_banco end,
    'transferencia_titular', case when v_con_sesion then a.transferencia_titular end,
    'transferencia_cuenta', case when v_con_sesion then a.transferencia_cuenta end,
    'transferencia_moneda', case when v_con_sesion then a.transferencia_moneda end,
    -- Alumnos al día (y el Admin): grupo de WhatsApp de la comunidad
    'whatsapp_grupo_url', case when v_admin or v_alumno_al_dia then a.whatsapp_grupo_url end,
    -- Profes y gimnasios (y el Admin): cómo pagarle a DREY
    'drey_banco', case when v_admin or v_profe then a.drey_banco end,
    'drey_titular', case when v_admin or v_profe then a.drey_titular end,
    'drey_cuenta', case when v_admin or v_profe then a.drey_cuenta end,
    'drey_moneda', case when v_admin or v_profe then a.drey_moneda end,
    'drey_link_mp', case when v_admin or v_profe then a.drey_link_mp end
  );
end;
$$;


--
-- Name: mis_espacios(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.mis_espacios() RETURNS TABLE(id uuid, tipo text, codigo text, nombre text, rol text, estado text, estado_real text, plan_drey text, plan_nombre text, plan_drey_pedido text, cupos_total integer, cupos_usados integer, sin_costo boolean, profes_habilitan boolean, prueba_hasta date, vencimiento date, aviso_pago boolean, comprobante text, ultimo boolean, alumnos_hasta date)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select
    e.id, e.tipo, e.codigo, e.nombre, m.rol, e.estado,
    public.estado_espacio(e.id),
    e.plan_drey, pd.nombre, e.plan_drey_pedido,
    public.cupos_totales(e.id), public.cupos_usados(e.id),
    e.sin_costo, e.profes_habilitan, e.prueba_hasta, e.vencimiento,
    e.aviso_pago, case when m.rol = 'dueno' then e.comprobante end,
    coalesce(e.id = yo.ultimo_espacio_id, false),
    public.alumnos_entrenan_hasta(e.id)
  from public.membresias m
  join public.espacios e on e.id = m.espacio_id
  join public.perfiles yo on yo.id = m.perfil_id
  left join public.planes_drey pd on pd.id = e.plan_drey
  where m.perfil_id = auth.uid()
    and m.estado = 'activa'
  order by (e.tipo = 'profe') desc, e.nombre;
$$;


--
-- Name: mis_invitaciones(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.mis_invitaciones() RETURNS TABLE(id uuid, espacio text, invitado_por text, creado_en timestamp with time zone)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select i.id, e.nombre, public.nombre_de(i.invitado_por), i.creado_en
  from public.invitaciones i
  join public.espacios e on e.id = i.espacio_id
  where i.estado = 'pendiente'
    and i.email = public.mi_email()
    and not exists (select 1 from public.membresias m where m.espacio_id = i.espacio_id and m.perfil_id = auth.uid())
  order by i.creado_en desc;
$$;


--
-- Name: mis_solicitudes_membresia(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.mis_solicitudes_membresia() RETURNS TABLE(id uuid, espacio text, estado text, creado_en timestamp with time zone)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select s.id, e.nombre, s.estado, s.creado_en
  from public.solicitudes_membresia s
  join public.espacios e on e.id = s.espacio_id
  where s.profe_id = auth.uid()
  order by s.creado_en desc
  limit 20;
$$;


--
-- Name: nombre_de(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.nombre_de(p_id uuid) RETURNS text
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select coalesce(
    (select nullif(trim(coalesce(nombre, '') || ' ' || coalesce(apellido, '')), '')
     from public.perfiles where id = p_id),
    'sin profe'
  );
$$;


--
-- Name: nombre_de_espacio(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.nombre_de_espacio(p_espacio uuid) RETURNS text
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select case
    when e.tipo = 'profe' then coalesce(
      nullif(trim(coalesce(p.nombre, '') || ' ' || coalesce(p.apellido, '')), ''), e.nombre)
    else e.nombre
  end
  from public.espacios e
  left join public.perfiles p on p.id = e.profe_id
  where e.id = p_espacio;
$$;


--
-- Name: nombre_seccion_inicio(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.nombre_seccion_inicio(p_id text) RETURNS text
    LANGUAGE sql IMMUTABLE
    AS $$
  select case p_id
    when 'portada' then 'Portada'
    when 'objetivo' then 'Objetivo'
    when 'mision' then 'Misión'
    when 'como' then 'Cómo funciona'
    when 'fundador' then 'Fundador'
    when 'profes' then 'Profes'
    when 'planes' then 'Planes'
    when 'sumate' then 'Para profes y gimnasios'
    when 'preguntas' then 'Preguntas'
    when 'cierre' then 'Cierre'
    when 'contacto' then 'Contacto'
    else p_id
  end;
$$;


--
-- Name: normalizar_codigo(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.normalizar_codigo(p_texto text) RETURNS text
    LANGUAGE sql IMMUTABLE
    AS $$
  select left(regexp_replace(
    upper(translate(coalesce(p_texto, ''),
      'áéíóúüñàèìòùâêîôûÁÉÍÓÚÜÑÀÈÌÒÙÂÊÎÔÛ',
      'aeiouunaeiouaeiouAEIOUUNAEIOUAEIOU')),
    '[^A-Z0-9]', '', 'g'), 20);
$$;


--
-- Name: ocupa_cupo(text, date, date); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.ocupa_cupo(p_estado text, p_vencimiento date, p_cupo_hasta date) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select (
      p_estado = 'activo'
      and (p_vencimiento is null or p_vencimiento + public.dias_de_gracia() >= public.hoy_uy())
    )
    or coalesce(p_cupo_hasta >= public.hoy_uy(), false);
$$;


--
-- Name: opciones_de_profe(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.opciones_de_profe() RETURNS TABLE(tipo text, id uuid, nombre text, detalle text)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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


--
-- Name: pendientes_de_equipo(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.pendientes_de_equipo(p_espacio uuid) RETURNS TABLE(id uuid, tipo text, nombre text, email text, mensaje text, creado_en timestamp with time zone)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select s.id, 'solicitud'::text, public.nombre_de(s.profe_id), null::text, s.mensaje, s.creado_en
  from public.solicitudes_membresia s
  where s.espacio_id = p_espacio and s.estado = 'pendiente' and public.puedo_manejar_equipo(p_espacio)
  union all
  select i.id, 'invitacion'::text, null::text, i.email, null::text, i.creado_en
  from public.invitaciones i
  where i.espacio_id = p_espacio and i.estado = 'pendiente' and public.puedo_manejar_equipo(p_espacio)
  order by 6 desc;
$$;


--
-- Name: pesos(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.pesos(p_valor integer) RETURNS text
    LANGUAGE sql IMMUTABLE
    AS $_$
  select '$' || coalesce(p_valor::text, '—');
$_$;


--
-- Name: plan_del_espacio(text, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.plan_del_espacio(p_plan text, p_espacio uuid) RETURNS text
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select coalesce(
    (select id from public.planes where id = p_plan and espacio_id = p_espacio and activo),
    (select n.id from public.planes n
     where n.espacio_id = p_espacio and n.activo
       and lower(n.nombre) = lower((select nombre from public.planes where id = p_plan))
     order by n.orden limit 1)
  );
$$;


--
-- Name: planes_de_espacio(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.planes_de_espacio(p_codigo text) RETURNS TABLE(id text, nombre text, descripcion text, precio_primer_mes integer, precio_mensual integer, link_mp text, orden integer)
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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


--
-- Name: poner_membresia(uuid, uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.poner_membresia(p_espacio uuid, p_perfil uuid, p_rol text) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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


--
-- Name: probar_tipo_aviso(text, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.probar_tipo_aviso(p_clave text, p_titulo text DEFAULT NULL::text, p_cuerpo text DEFAULT NULL::text) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_tipo public.tipos_aviso%rowtype;
  v_vars jsonb := '{}'::jsonb;
  v_variable jsonb;
begin
  if not public.es_admin() then
    raise exception 'Solo el Admin puede probar notificaciones';
  end if;
  select * into v_tipo from public.tipos_aviso where clave = p_clave;
  if v_tipo.clave is null then
    raise exception 'No existe esa notificación';
  end if;
  for v_variable in select * from jsonb_array_elements(v_tipo.variables) loop
    v_vars := v_vars || jsonb_build_object(v_variable ->> 'clave', v_variable ->> 'ejemplo');
  end loop;
  perform public.encolar_aviso_en(
    auth.uid(), 'prueba',
    public.rellenar_aviso(coalesce(nullif(trim(p_titulo), ''), v_tipo.titulo), v_vars),
    public.rellenar_aviso(coalesce(p_cuerpo, v_tipo.cuerpo), v_vars),
    '/profe/ajustes?tab=avisos',
    'prueba:' || p_clave || ':' || (extract(epoch from clock_timestamp()) * 1000)::bigint,
    now()
  );
  return (select count(*)::int from public.push_suscripciones where usuario_id = auth.uid());
end;
$$;


--
-- Name: profe_de_confianza(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.profe_de_confianza() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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


--
-- Name: profe_de_mis_gimnasios(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.profe_de_mis_gimnasios(p_profe uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select exists (
    select 1
    from public.perfiles pr
    join public.gimnasios g on g.id = pr.gimnasio_id
    where pr.id = p_profe and pr.es_profe and g.dueno_id = auth.uid()
  );
$$;


--
-- Name: profes_a_avisar(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.profes_a_avisar(p_cliente uuid) RETURNS SETOF uuid
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select c.profe_id from public.perfiles c where c.id = p_cliente and c.profe_id is not null
  union
  select a.id from public.perfiles a
  where a.es_admin
    and not exists (select 1 from public.perfiles c where c.id = p_cliente and c.profe_id is not null);
$$;


--
-- Name: profes_disponibles(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.profes_disponibles() RETURNS TABLE(id uuid, nombre text, gimnasio text, foto_url text, especialidades text[], modalidades text[], experiencia_anios integer, descripcion text, instagram text, acepta_alumnos boolean)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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


--
-- Name: programar_aviso_descanso(integer, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.programar_aviso_descanso(p_segundos integer, p_siguiente text DEFAULT NULL::text) RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_yo uuid := auth.uid();
begin
  if v_yo is null or p_segundos is null or p_segundos < 3 or p_segundos > 1800 then
    return false;
  end if;
  delete from public.avisos
  where usuario_id = v_yo and tipo = 'descanso' and enviado_en is null and reclamado_en is null;
  return public.avisar('descanso', v_yo,
    jsonb_build_object('siguiente', coalesce(nullif(left(trim(p_siguiente), 80), ''), 'la próxima serie')),
    'descanso:' || v_yo || ':' || (extract(epoch from clock_timestamp()) * 1000)::bigint,
    now() + make_interval(secs => p_segundos));
end;
$$;


--
-- Name: proteger_campos_de_perfil(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.proteger_campos_de_perfil() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_profe boolean := false;
  v_admin boolean := false;
begin
  if auth.uid() is null or coalesce(current_setting('drey.sistema', true), '') = 'on' then
    return new;
  end if;

  select coalesce(es_profe, false), coalesce(es_admin, false)
  into v_profe, v_admin
  from public.perfiles
  where id = auth.uid();

  if not v_admin then
    new.es_profe := old.es_profe;
    new.es_admin := old.es_admin;
  end if;

  new.terminos_version := old.terminos_version;
  new.terminos_aceptados_en := old.terminos_aceptados_en;
  new.consentimiento_salud_en := old.consentimiento_salud_en;
  new.baja_solicitada_en := old.baja_solicitada_en;

  -- El Admin le quita el permiso de profe a alguien.
  if coalesce(old.es_profe, false) and not coalesce(new.es_profe, false) then
    if exists (select 1 from public.perfiles c where c.profe_id = old.id) then
      raise exception 'Primero pasá sus clientes a otro profe';
    end if;
    update public.gimnasios set dueno_id = null where dueno_id = old.id;
  end if;

  -- El profe asignado tiene que ser una cuenta de profe.
  if new.profe_id is distinct from old.profe_id
     and new.profe_id is not null
     and not exists (select 1 from public.perfiles p where p.id = new.profe_id and p.es_profe) then
    raise exception 'Esa cuenta no es de un profe';
  end if;

  if old.id = auth.uid() then
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

  if v_profe and not v_admin then
    if new.profe_id is distinct from old.profe_id
       and new.profe_id is distinct from auth.uid()
       and not public.profe_de_mis_gimnasios(new.profe_id) then
      new.profe_id := old.profe_id;
    end if;
    if coalesce(old.es_profe, false) then
      new.gimnasio_id := old.gimnasio_id;
    end if;
  end if;

  -- Un cliente sin profe queda con el profe que lo atendió (el Admin no
  -- se asigna clientes: no es profe).
  if v_profe and new.profe_id is null
     and not coalesce(new.es_profe, false) and not coalesce(new.es_admin, false) then
    new.profe_id := auth.uid();
  end if;

  return new;
end;
$$;


--
-- Name: proteger_gimnasio_de_profe(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.proteger_gimnasio_de_profe() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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


--
-- Name: proteger_sesion_corregida(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.proteger_sesion_corregida() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
begin
  if auth.uid() is not null and pg_trigger_depth() = 1 then
    new.id := old.id;
    new.cliente_id := old.cliente_id;
    new.rutina_id := old.rutina_id;
    new.fecha := old.fecha;
    new.esfuerzo := old.esfuerzo;
    new.comentario := old.comentario;
    new.duracion_seg := old.duracion_seg;
    new.creado_en := old.creado_en;
    new.editado_en := old.editado_en;
    new.editado_por := old.editado_por;
  end if;

  if new.detalle is distinct from old.detalle then
    new.editado_en := now();
    new.editado_por := auth.uid();
  end if;
  return new;
end;
$$;


--
-- Name: puede_cobrar(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.puede_cobrar(p_espacio uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select public.es_admin() or coalesce(public.mi_rol_en_espacio(p_espacio) = 'dueno', false);
$$;


--
-- Name: puede_dar_de_baja(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.puede_dar_de_baja(p_cliente uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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


--
-- Name: puede_editar_plantilla(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.puede_editar_plantilla(p_plantilla uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select public.es_profe() and exists (
    select 1 from public.plantillas pl
    where pl.id = p_plantilla
      and (pl.profe_id = auth.uid() or public.es_admin()
           or (pl.profe_id is null and public.profe_de_confianza()))
  );
$$;


--
-- Name: puede_habilitar(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.puede_habilitar(p_espacio uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select public.es_admin()
    or coalesce(public.mi_rol_en_espacio(p_espacio) = 'dueno', false)
    or (
      coalesce(public.mi_rol_en_espacio(p_espacio) = 'profe', false)
      and exists (select 1 from public.espacios e where e.id = p_espacio and e.profes_habilitan)
    );
$$;


--
-- Name: puede_manejar_codigo(text, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.puede_manejar_codigo(p_tipo text, p_espacio uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select public.es_admin()
    or (p_tipo = 'plan' and p_espacio is not null
        and coalesce(public.mi_rol_en_espacio(p_espacio) = 'dueno', false))
    or (p_tipo = 'ropa' and p_espacio is null and public.profe_de_confianza());
$$;


--
-- Name: puede_ver_cliente(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.puede_ver_cliente(p_cliente uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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


--
-- Name: puede_ver_plantilla(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.puede_ver_plantilla(p_plantilla uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select public.es_profe() and exists (
    select 1 from public.plantillas pl
    where pl.id = p_plantilla
      and (pl.profe_id = auth.uid() or pl.profe_id is null or public.es_admin())
  );
$$;


--
-- Name: puede_ver_profe(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.puede_ver_profe(p_profe uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select public.es_admin() or public.profe_de_mis_gimnasios(p_profe);
$$;


--
-- Name: puede_ver_rutina(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.puede_ver_rutina(p_rutina uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select coalesce(
    (select public.puede_ver_cliente(r.cliente_id) from public.rutinas r where r.id = p_rutina),
    false
  );
$$;


--
-- Name: puedo_manejar_equipo(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.puedo_manejar_equipo(p_espacio uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select coalesce(
    exists (select 1 from public.espacios where id = p_espacio and tipo = 'gimnasio')
      and (public.es_admin() or public.mi_rol_en_espacio(p_espacio) = 'dueno'),
    false
  );
$$;


--
-- Name: quien_prueba_codigos(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.quien_prueba_codigos() RETURNS text
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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


--
-- Name: quitar_profe_de_espacio(uuid, uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.quitar_profe_de_espacio(p_espacio uuid, p_profe uuid, p_destino uuid DEFAULT NULL::uuid) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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


--
-- Name: reactivar_alumno(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.reactivar_alumno(p_cliente uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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


--
-- Name: reclamar_avisos(integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.reclamar_avisos(p_limite integer DEFAULT 100) RETURNS SETOF public.avisos
    LANGUAGE sql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  update public.avisos a
  set reclamado_en = now()
  where a.id in (
    select l.id from public.avisos_listos_para_enviar() l
    join public.avisos x on x.id = l.id
    order by l.enviar_desde
    limit greatest(1, least(coalesce(p_limite, 100), 500))
    for update of x skip locked
  )
  returning a.*;
$$;


--
-- Name: registrar_pago_drey(uuid, integer, text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.registrar_pago_drey(p_espacio uuid, p_monto integer DEFAULT NULL::integer, p_metodo text DEFAULT 'transferencia'::text, p_nota text DEFAULT NULL::text) RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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


--
-- Name: registrar_pago_manual(uuid, integer, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.registrar_pago_manual(p_cliente uuid, p_monto integer DEFAULT NULL::integer, p_espacio uuid DEFAULT NULL::uuid) RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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


--
-- Name: registro_de_profe_despues(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.registro_de_profe_despues() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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


--
-- Name: registro_por_tipo(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.registro_por_tipo() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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


--
-- Name: rehacer_resumen_al_borrar(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.rehacer_resumen_al_borrar() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  if to_regclass('public.resumenes_progreso') is not null then
    update public.resumenes_progreso
    set datos = coalesce(datos, '{}'::jsonb) || '{"desactualizado": true}'::jsonb
    where cliente_id = old.cliente_id
      and estado = 'borrador'
      and old.fecha between desde and hasta;
  end if;
  return null;
end;
$$;


--
-- Name: rehacer_resumen_al_corregir(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.rehacer_resumen_al_corregir() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  if new.detalle is distinct from old.detalle
     and to_regclass('public.resumenes_progreso') is not null then
    update public.resumenes_progreso
    set datos = coalesce(datos, '{}'::jsonb) || '{"desactualizado": true}'::jsonb
    where cliente_id = new.cliente_id
      and estado = 'borrador'
      and new.fecha between desde and hasta;
  end if;
  return null;
end;
$$;


--
-- Name: rellenar_aviso(text, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.rellenar_aviso(p_texto text, p_vars jsonb) RETURNS text
    LANGUAGE plpgsql IMMUTABLE
    AS $_$
declare
  v_texto text := coalesce(p_texto, '');
  v_par record;
begin
  for v_par in select key, value from jsonb_each_text(coalesce(p_vars, '{}'::jsonb)) loop
    v_texto := replace(v_texto, '{' || v_par.key || '}', coalesce(v_par.value, ''));
  end loop;
  v_texto := regexp_replace(v_texto, '\{[a-z_]+\}', '', 'g');
  v_texto := regexp_replace(v_texto, '""', '', 'g');
  v_texto := regexp_replace(v_texto, '\s+([.,!?:])', '\1', 'g');
  v_texto := regexp_replace(v_texto, '\s{2,}', ' ', 'g');
  v_texto := regexp_replace(v_texto, '^\s*·\s*|\s*·\s*$', '', 'g');
  return trim(v_texto);
end;
$_$;


--
-- Name: responder_invitacion(uuid, boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.responder_invitacion(p_id uuid, p_aceptar boolean) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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


--
-- Name: responder_solicitud_membresia(uuid, boolean); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.responder_solicitud_membresia(p_id uuid, p_aceptar boolean) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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


--
-- Name: responder_solicitud_profe(uuid, boolean, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.responder_solicitud_profe(p_id uuid, p_aceptar boolean, p_respuesta text DEFAULT NULL::text) RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_sol public.solicitudes_profe%rowtype;
  v_respuesta text := nullif(left(trim(coalesce(p_respuesta, '')), 300), '');
  v_profe_nombre text;
  v_vars jsonb;
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
  v_vars := jsonb_build_object('profe', v_profe_nombre, 'mensaje_personal', coalesce(v_respuesta, ''));

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

    perform public.avisar('solicitud-ok', v_sol.cliente_id, v_vars, 'solicitud-ok:' || v_sol.id);
  else
    update public.solicitudes_profe
    set estado = 'rechazada', respondido_en = now(), respondido_por = auth.uid(),
        respuesta = v_respuesta
    where id = v_sol.id;

    perform public.avisar('solicitud-no', v_sol.cliente_id, v_vars, 'solicitud-no:' || v_sol.id);
  end if;

  return json_build_object('estado', case when p_aceptar then 'aceptada' else 'rechazada' end);
end;
$$;


--
-- Name: resumen_espacio(uuid, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.resumen_espacio(p_espacio uuid, p_dias_sin_entrenar integer DEFAULT 7) RETURNS json
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_hoy date := public.hoy_uy();
  v_dias int := greatest(coalesce(p_dias_sin_entrenar, 7), 1);
begin
  if not public.puede_cobrar(p_espacio) then
    raise exception 'Solo el dueño del espacio ve sus números';
  end if;

  return (
    with alumnos as (
      select p.id, p.estado, p.vencimiento, p.aviso_pago, p.profe_id, p.creado_en,
        (select max(s.fecha) from public.sesiones s where s.cliente_id = p.id) as ultima
      from public.perfiles p
      where p.espacio_id = p_espacio
        and not coalesce(p.es_profe, false) and not coalesce(p.es_admin, false)
    )
    select json_build_object(
      'cupos_total', public.cupos_totales(p_espacio),
      'cupos_usados', public.cupos_usados(p_espacio),
      'activos', count(*) filter (
        where estado = 'activo'
          and (vencimiento is null or vencimiento + public.dias_de_gracia() >= v_hoy)),
      'pendientes', count(*) filter (where estado = 'pendiente'),
      'avisaron_pago', count(*) filter (where coalesce(aviso_pago, false)),
      'en_gracia', count(*) filter (
        where estado = 'activo' and vencimiento < v_hoy
          and vencimiento + public.dias_de_gracia() >= v_hoy),
      'vencidos', count(*) filter (
        where estado = 'activo' and vencimiento + public.dias_de_gracia() < v_hoy),
      'sin_profe', count(*) filter (where estado = 'activo' and profe_id is null),
      'sin_entrenar', count(*) filter (
        where estado = 'activo'
          and (vencimiento is null or vencimiento + public.dias_de_gracia() >= v_hoy)
          and coalesce(ultima, creado_en::date) <= v_hoy - v_dias),
      'dias_sin_entrenar', v_dias,
      'alumnos_hasta', public.alumnos_entrenan_hasta(p_espacio)
    )
    from alumnos
  );
end;
$$;


--
-- Name: resumen_espacios(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.resumen_espacios() RETURNS TABLE(id uuid, tipo text, codigo text, nombre text, estado text, estado_real text, plan_drey text, plan_nombre text, plan_drey_pedido text, pedido_nombre text, cupos_extra integer, sin_costo boolean, cupos_sin_costo integer, profes_habilitan boolean, cupos_total integer, cupos_usados integer, prueba_hasta date, vencimiento date, aviso_pago boolean, aviso_pago_en timestamp with time zone, comprobante text, dueno text, dueno_email text, dueno_celular text, profes integer, creado_en timestamp with time zone)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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


--
-- Name: sacar_del_espacio(uuid, uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sacar_del_espacio(p_espacio uuid, p_profe uuid, p_destino uuid) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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


--
-- Name: salir_de_baja(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.salir_de_baja() RETURNS trigger
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
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


--
-- Name: salir_de_espacio(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.salir_de_espacio(p_espacio uuid) RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  if public.mi_rol_en_espacio(p_espacio) is distinct from 'profe' then
    raise exception 'Solo los profes del gimnasio pueden salir (el dueño no)';
  end if;
  return public.sacar_del_espacio(p_espacio, auth.uid(), null);
end;
$$;


--
-- Name: sincronizar_espacio_de_gimnasio(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sincronizar_espacio_de_gimnasio() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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


--
-- Name: sincronizar_espacios_de_profe(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sincronizar_espacios_de_profe() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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


--
-- Name: solicitar_baja(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.solicitar_baja() RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  if auth.uid() is null then
    raise exception 'Hay que iniciar sesión';
  end if;
  perform set_config('drey.sistema', 'on', true);
  update public.perfiles
  set baja_solicitada_en = coalesce(baja_solicitada_en, now())
  where id = auth.uid();
end;
$$;


--
-- Name: solicitar_profe(uuid, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.solicitar_profe(p_profe uuid, p_mensaje text DEFAULT NULL::text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_yo public.perfiles%rowtype;
  v_id uuid;
  v_mensaje text := nullif(left(trim(coalesce(p_mensaje, '')), 500), '');
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

  perform public.avisar_profes('profe-solicitud', v_yo.id, p_profe,
    jsonb_build_object('mensaje_personal', coalesce(left(v_mensaje, 120), '')),
    'solicitud:' || v_id);

  return v_id;
end;
$$;


--
-- Name: solicitudes_recibidas(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.solicitudes_recibidas() RETURNS TABLE(id uuid, cliente_id uuid, cliente_nombre text, plan text, objetivo text, mensaje text, estado text, respuesta text, creado_en timestamp with time zone, respondido_en timestamp with time zone, profe_id uuid, profe_nombre text)
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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


--
-- Name: soy_profe(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.soy_profe() RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select coalesce((select es_profe from public.perfiles where id = auth.uid()), false);
$$;


--
-- Name: sumar_profe_al_espacio(uuid, uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sumar_profe_al_espacio(p_espacio uuid, p_profe uuid) RETURNS void
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  perform public.poner_membresia(p_espacio, p_profe, 'profe');
end;
$$;


--
-- Name: tablero_espacio(uuid, integer); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.tablero_espacio(p_espacio uuid, p_dias_sin_venir integer DEFAULT 14) RETURNS json
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_hoy date := public.hoy_uy();
  v_dias int := greatest(coalesce(p_dias_sin_venir, 14), 1);
  v_lunes date := date_trunc('week', public.hoy_uy())::date;
  v_mes date := date_trunc('month', public.hoy_uy())::date;
begin
  if not public.puede_cobrar(p_espacio) then
    raise exception 'Solo el dueño del espacio ve su tablero';
  end if;

  return (
    with alumnos as (
      select p.id, p.nombre, p.apellido, p.celular, p.profe_id, p.creado_en,
        (select max(s.fecha) from public.sesiones s where s.cliente_id = p.id) as ultima,
        exists (
          select 1 from public.sesiones s where s.cliente_id = p.id and s.fecha >= v_lunes
        ) as entreno_semana
      from public.perfiles p
      where p.espacio_id = p_espacio
        and not coalesce(p.es_profe, false) and not coalesce(p.es_admin, false)
        and p.estado = 'activo'
        and (p.vencimiento is null or p.vencimiento + public.dias_de_gracia() >= v_hoy)
    ),
    marcados as (
      select a.*,
        (v_hoy - coalesce(a.ultima, a.creado_en::date)) as dias_sin_venir,
        coalesce(a.ultima, a.creado_en::date) <= v_hoy - v_dias as dejo_de_venir
      from alumnos a
    ),
    profes as (
      select m.perfil_id as id, m.rol, pr.nombre, pr.apellido
      from public.membresias m
      join public.perfiles pr on pr.id = m.perfil_id
      where m.espacio_id = p_espacio and m.estado = 'activa'
    )
    select json_build_object(
      'cupos_total', public.cupos_totales(p_espacio),
      'cupos_usados', public.cupos_usados(p_espacio),
      'activos', (select count(*) from marcados),
      'entrenaron_semana', (select count(*) from marcados where entreno_semana),
      'nuevos_mes', (select count(*) from marcados where creado_en::date >= v_mes),
      'dias_sin_venir', v_dias,
      'dejaron_de_venir', coalesce((
        select json_agg(json_build_object(
          'id', m.id,
          'nombre', m.nombre,
          'apellido', m.apellido,
          'celular', m.celular,
          'profe', trim(coalesce(pr.nombre, '') || ' ' || coalesce(pr.apellido, '')),
          'ultima', m.ultima,
          'dias', m.dias_sin_venir
        ) order by m.dias_sin_venir desc, m.nombre)
        from marcados m
        left join public.perfiles pr on pr.id = m.profe_id
        where m.dejo_de_venir
      ), '[]'::json),
      'profes', coalesce((
        select json_agg(fila order by (fila ->> 'activos')::int desc, fila ->> 'nombre')
        from (
          select json_build_object(
            'id', p.id,
            'nombre', trim(coalesce(p.nombre, '') || ' ' || coalesce(p.apellido, '')),
            'rol', p.rol,
            'activos', (select count(*) from marcados m where m.profe_id = p.id),
            'entrenaron_semana',
              (select count(*) from marcados m where m.profe_id = p.id and m.entreno_semana),
            'dejaron_de_venir',
              (select count(*) from marcados m where m.profe_id = p.id and m.dejo_de_venir)
          ) as fila
          from profes p
        ) filas
      ), '[]'::json),
      'sin_profe', (select count(*) from marcados where profe_id is null)
    )
  );
end;
$$;


--
-- Name: tarea_de_espacios(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.tarea_de_espacios() RETURNS integer
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  v_hoy date := public.hoy_uy();
  v_hora time := (now() at time zone 'America/Montevideo')::time;
  v_dias_aviso int := coalesce((select dias_aviso from public.ajustes where id = 1), 5);
  v_cambios int := 0;
  v_n int;
  fila record;
  v_tipo public.tipos_aviso%rowtype;
  v_sistema text;
begin
  v_sistema := current_setting('drey.sistema', true);
  perform set_config('drey.sistema', 'on', true);

  -- La prueba terminó: pendiente (tiene que elegir plan y pagar).
  update public.espacios
  set estado = 'pendiente', sin_servicio_desde = prueba_hasta + 1
  where estado = 'prueba' and not sin_costo and prueba_hasta is not null and prueba_hasta < v_hoy;
  get diagnostics v_n = row_count;
  v_cambios := v_cambios + v_n;

  -- Pasaron los días de gracia sin pagar: pausa.
  update public.espacios
  set estado = 'pausado', sin_servicio_desde = vencimiento + public.dias_de_gracia() + 1
  where estado = 'activo' and not sin_costo and vencimiento is not null
    and vencimiento + public.dias_de_gracia() < v_hoy;
  get diagnostics v_n = row_count;
  v_cambios := v_cambios + v_n;

  perform set_config('drey.sistema', coalesce(v_sistema, 'off'), true);

  -- Suscripción por vencer
  select * into v_tipo from public.tipos_aviso where clave = 'espacio-por-vencer';
  if v_tipo.activo and v_dias_aviso > 0 and public.en_hora(v_hora, v_tipo.hora) then
    for fila in
      select e.id, e.nombre, e.vencimiento from public.espacios e
      where e.estado = 'activo' and not e.sin_costo and not e.aviso_pago
        and e.vencimiento - v_hoy = v_dias_aviso
    loop
      perform public.avisar_duenos('espacio-por-vencer', fila.id,
        jsonb_build_object('espacio', fila.nombre, 'fecha', public.fecha_corta(fila.vencimiento)),
        'espacio-vence:' || fila.id || ':' || fila.vencimiento);
    end loop;
  end if;

  -- Prueba por terminar
  select * into v_tipo from public.tipos_aviso where clave = 'espacio-prueba-termina';
  if v_tipo.activo and public.en_hora(v_hora, v_tipo.hora) then
    for fila in
      select e.id, e.nombre, e.prueba_hasta from public.espacios e
      where e.estado = 'prueba' and not e.sin_costo and e.prueba_hasta is not null
        and e.prueba_hasta - v_hoy = greatest(coalesce(v_tipo.dias, 3), 0)
    loop
      perform public.avisar_duenos('espacio-prueba-termina', fila.id,
        jsonb_build_object('espacio', fila.nombre, 'fecha', public.fecha_corta(fila.prueba_hasta)),
        'espacio-prueba:' || fila.id || ':' || fila.prueba_hasta);
    end loop;
  end if;

  -- Espacio en pausa (al dueño y al Admin): el primer día sin servicio, o
  -- el día que se instala esto si ya estaba así (una vez por "corte").
  for fila in
    select e.id, e.nombre,
      public.espacio_sin_servicio_desde(e.id) as desde,
      public.alumnos_entrenan_hasta(e.id) as hasta
    from public.espacios e
    where e.estado in ('pendiente', 'pausado')
      and public.espacio_sin_servicio_desde(e.id) between v_hoy - 2 and v_hoy
      -- Solo los que tienen alumnos (o tuvieron): un profe que nunca
      -- arrancó no necesita la alarma.
      and exists (select 1 from public.perfiles p where p.espacio_id = e.id
                  and not coalesce(p.es_profe, false) and not coalesce(p.es_admin, false))
  loop
    select * into v_tipo from public.tipos_aviso where clave = 'espacio-en-pausa';
    if v_tipo.activo and public.en_hora(v_hora, v_tipo.hora) then
      perform public.avisar_duenos('espacio-en-pausa', fila.id,
        jsonb_build_object('espacio', fila.nombre, 'fecha', public.fecha_corta(fila.hasta - 1)),
        'espacio-pausa:' || fila.id || ':' || fila.desde);
    end if;
    select * into v_tipo from public.tipos_aviso where clave = 'admin-espacio-vencido';
    if v_tipo.activo and public.en_hora(v_hora, v_tipo.hora) then
      perform public.avisar_admins('admin-espacio-vencido',
        jsonb_build_object('espacio', fila.nombre, 'fecha', public.fecha_corta(fila.hasta - 1)),
        'admin-espacio-pausa:' || fila.id || ':' || fila.desde);
    end if;
  end loop;

  -- Cupos al 90 % (una vez por mes)
  select * into v_tipo from public.tipos_aviso where clave = 'espacio-cupo-90';
  if v_tipo.activo and public.en_hora(v_hora, v_tipo.hora) then
    for fila in
      select e.id, e.nombre, public.cupos_totales(e.id) as total, public.cupos_usados(e.id) as usados
      from public.espacios e
      where public.estado_espacio(e.id) in ('activo', 'prueba', 'sin_costo')
    loop
      if fila.total is not null and fila.total > 0 and fila.usados * 10 >= fila.total * 9 then
        perform public.avisar_duenos('espacio-cupo-90', fila.id,
          jsonb_build_object('espacio', fila.nombre, 'usados', fila.usados::text, 'cupos', fila.total::text),
          'espacio-cupo90:' || fila.id || ':' || to_char(v_hoy, 'YYYY-MM'));
      end if;
    end loop;
  end if;

  return v_cambios;
end;
$$;


--
-- Name: tipo_aviso_activo(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.tipo_aviso_activo(p_clave text) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select coalesce((select activo from public.tipos_aviso where clave = p_clave), false);
$$;


--
-- Name: tipos_de_aviso(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.tipos_de_aviso() RETURNS json
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
begin
  if not public.es_admin() then
    raise exception 'Solo el Admin puede ver esto';
  end if;
  return json_build_object(
    'tipos', (select coalesce(json_agg(t order by t.orden), '[]'::json) from public.tipos_aviso t),
    'dias_aviso', coalesce((select dias_aviso from public.ajustes limit 1), 5),
    'dias_gracia', public.dias_de_gracia(),
    'planes', (select coalesce(json_agg(json_build_object('id', id, 'nombre', nombre) order by orden), '[]'::json)
               from public.planes),
    'activados', json_build_object(
      'alumnos', (select count(distinct s.usuario_id) from public.push_suscripciones s
                  join public.perfiles p on p.id = s.usuario_id
                  where not coalesce(p.es_profe, false) and not coalesce(p.es_admin, false)),
      'profes', (select count(distinct s.usuario_id) from public.push_suscripciones s
                 join public.perfiles p on p.id = s.usuario_id
                 where coalesce(p.es_profe, false) or coalesce(p.es_admin, false)),
      'yo', (select count(*) from public.push_suscripciones where usuario_id = auth.uid())
    )
  );
end;
$$;


--
-- Name: ubicar_alumno_en_espacio(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.ubicar_alumno_en_espacio() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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


--
-- Name: ubicar_plan_del_alumno(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.ubicar_plan_del_alumno() RETURNS trigger
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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


--
-- Name: unirme_a_espacio(text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.unirme_a_espacio(p_codigo text, p_mensaje text DEFAULT NULL::text) RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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


--
-- Name: uso_de_ejercicio(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.uso_de_ejercicio(p_ejercicio uuid) RETURNS json
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select case when public.es_profe() then json_build_object(
    'rutinas', (
      select count(distinct re.rutina_id)
      from public.rutina_ejercicios re
      where re.ejercicio_id = p_ejercicio
    ),
    'clientes', (
      select count(distinct r.cliente_id)
      from public.rutina_ejercicios re
      join public.rutinas r on r.id = re.rutina_id
      where re.ejercicio_id = p_ejercicio
    ),
    'plantillas', (
      select count(distinct pe.plantilla_id)
      from public.plantilla_ejercicios pe
      where pe.ejercicio_id = p_ejercicio
    )
  ) end;
$$;


--
-- Name: validar_codigo(text, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.validar_codigo(p_codigo text, p_plan text) RETURNS json
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
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


--
-- Name: ajustes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ajustes (
    id integer DEFAULT 1 NOT NULL,
    transferencia_banco text,
    transferencia_titular text,
    transferencia_cuenta text,
    transferencia_moneda text,
    cobro_automatico boolean DEFAULT false NOT NULL,
    whatsapp_grupo_url text,
    dias_aviso integer DEFAULT 5 NOT NULL,
    dias_de_gracia integer DEFAULT 3 NOT NULL,
    actualizado_en timestamp with time zone DEFAULT now() NOT NULL,
    prueba_activa boolean DEFAULT true NOT NULL,
    prueba_dias integer DEFAULT 14 NOT NULL,
    prueba_cupos integer DEFAULT 3 NOT NULL,
    dias_aviso_alumnos_espacio integer DEFAULT 14 NOT NULL,
    drey_banco text,
    drey_titular text,
    drey_cuenta text,
    drey_moneda text,
    drey_link_mp text,
    espacios_corte_desde date,
    CONSTRAINT ajustes_dias_aviso_check CHECK (((dias_aviso >= 0) AND (dias_aviso <= 30))),
    CONSTRAINT ajustes_dias_de_gracia_check CHECK (((dias_de_gracia >= 0) AND (dias_de_gracia <= 30))),
    CONSTRAINT ajustes_id_check CHECK ((id = 1)),
    CONSTRAINT ajustes_prueba_rangos CHECK ((((prueba_dias >= 1) AND (prueba_dias <= 90)) AND ((prueba_cupos >= 0) AND (prueba_cupos <= 100)) AND ((dias_aviso_alumnos_espacio >= 0) AND (dias_aviso_alumnos_espacio <= 60))))
);


--
-- Name: ajustes_drive; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ajustes_drive (
    id integer DEFAULT 1 NOT NULL,
    url_script text,
    clave text,
    carpeta_url text,
    actualizado_en timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT ajustes_drive_id_check CHECK ((id = 1))
);


--
-- Name: ajustes_internos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ajustes_internos (
    clave text NOT NULL,
    valor text DEFAULT ''::text NOT NULL
);


--
-- Name: calendario_cliente; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.calendario_cliente (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    cliente_id uuid NOT NULL,
    dia text NOT NULL,
    rutina_id uuid
);


--
-- Name: datos_cobro; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.datos_cobro (
    espacio_id uuid NOT NULL,
    banco text,
    titular text,
    cuenta text,
    moneda text,
    alias text,
    link_mp text,
    actualizado_en timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT datos_cobro_alias_check CHECK (((alias IS NULL) OR (char_length(alias) <= 80))),
    CONSTRAINT datos_cobro_banco_check CHECK (((banco IS NULL) OR (char_length(banco) <= 80))),
    CONSTRAINT datos_cobro_cuenta_check CHECK (((cuenta IS NULL) OR (char_length(cuenta) <= 80))),
    CONSTRAINT datos_cobro_link_mp_check CHECK (((link_mp IS NULL) OR (link_mp ~ '^https://'::text))),
    CONSTRAINT datos_cobro_moneda_check CHECK (((moneda IS NULL) OR (char_length(moneda) <= 40))),
    CONSTRAINT datos_cobro_titular_check CHECK (((titular IS NULL) OR (char_length(titular) <= 120)))
);


--
-- Name: ejercicios; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ejercicios (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    nombre text NOT NULL,
    grupo_muscular text NOT NULL,
    video_url text,
    creado_en timestamp with time zone DEFAULT now() NOT NULL,
    imagen_url text,
    categorias text[] DEFAULT '{}'::text[] NOT NULL,
    origen text,
    archivado_en timestamp with time zone,
    creado_por uuid DEFAULT auth.uid(),
    CONSTRAINT ejercicios_video_https CHECK (((video_url IS NULL) OR (video_url ~* '^https://\S+$'::text)))
);


--
-- Name: espacios; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.espacios (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    tipo text NOT NULL,
    codigo text NOT NULL,
    nombre text NOT NULL,
    profe_id uuid,
    gimnasio_id uuid,
    plan_drey text,
    plan_drey_pedido text,
    cupos_extra integer DEFAULT 0 NOT NULL,
    sin_costo boolean DEFAULT false NOT NULL,
    cupos_sin_costo integer,
    profes_habilitan boolean DEFAULT false NOT NULL,
    estado text DEFAULT 'prueba'::text NOT NULL,
    prueba_hasta date,
    vencimiento date,
    aviso_pago boolean DEFAULT false NOT NULL,
    aviso_pago_en timestamp with time zone,
    comprobante text,
    creado_en timestamp with time zone DEFAULT now() NOT NULL,
    actualizado_en timestamp with time zone DEFAULT now() NOT NULL,
    sin_servicio_desde date,
    CONSTRAINT espacios_codigo_formato CHECK ((codigo ~ '^[A-Z0-9]{4,20}$'::text)),
    CONSTRAINT espacios_cupos_extra_check CHECK ((cupos_extra >= 0)),
    CONSTRAINT espacios_cupos_sin_costo_check CHECK ((cupos_sin_costo >= 0)),
    CONSTRAINT espacios_estado_check CHECK ((estado = ANY (ARRAY['prueba'::text, 'pendiente'::text, 'activo'::text, 'pausado'::text]))),
    CONSTRAINT espacios_tipo_check CHECK ((tipo = ANY (ARRAY['profe'::text, 'gimnasio'::text]))),
    CONSTRAINT espacios_tipo_coherente CHECK ((((tipo = 'profe'::text) AND (profe_id IS NOT NULL) AND (gimnasio_id IS NULL)) OR ((tipo = 'gimnasio'::text) AND (gimnasio_id IS NOT NULL) AND (profe_id IS NULL))))
);


--
-- Name: evaluaciones_anuales; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.evaluaciones_anuales (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    cliente_id uuid NOT NULL,
    anio integer NOT NULL,
    datos jsonb DEFAULT '{}'::jsonb NOT NULL,
    comentario_profe text,
    objetivos text,
    estado text DEFAULT 'borrador'::text NOT NULL,
    visto boolean DEFAULT false NOT NULL,
    creado_en timestamp with time zone DEFAULT now() NOT NULL,
    actualizado_en timestamp with time zone DEFAULT now() NOT NULL,
    publicado_en timestamp with time zone,
    CONSTRAINT evaluaciones_anuales_anio_check CHECK (((anio >= 2020) AND (anio <= 2100))),
    CONSTRAINT evaluaciones_anuales_estado_check CHECK ((estado = ANY (ARRAY['borrador'::text, 'publicado'::text])))
);


--
-- Name: gimnasios; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.gimnasios (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    nombre text NOT NULL,
    activo boolean DEFAULT true NOT NULL,
    creado_en timestamp with time zone DEFAULT now() NOT NULL,
    dueno_id uuid
);


--
-- Name: habilitaciones; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.habilitaciones (
    id bigint NOT NULL,
    espacio_id uuid NOT NULL,
    alumno_id uuid NOT NULL,
    por_id uuid,
    rol text,
    cupo integer,
    cupos integer,
    creado_en timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: habilitaciones_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.habilitaciones ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.habilitaciones_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: historial_admin; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.historial_admin (
    id bigint NOT NULL,
    creado_en timestamp with time zone DEFAULT now() NOT NULL,
    admin_id uuid,
    tipo text NOT NULL,
    detalle text NOT NULL
);


--
-- Name: historial_admin_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.historial_admin ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.historial_admin_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: intentos_de_codigo; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.intentos_de_codigo (
    id bigint NOT NULL,
    quien text NOT NULL,
    codigo_huella text NOT NULL,
    creado_en timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: intentos_de_codigo_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.intentos_de_codigo ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME public.intentos_de_codigo_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: invitaciones; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.invitaciones (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    espacio_id uuid NOT NULL,
    email text NOT NULL,
    estado text DEFAULT 'pendiente'::text NOT NULL,
    invitado_por uuid,
    creado_en timestamp with time zone DEFAULT now() NOT NULL,
    respondido_en timestamp with time zone,
    CONSTRAINT invitaciones_email_check CHECK (((email = lower(TRIM(BOTH FROM email))) AND (email ~ '^\S+@\S+\.\S+$'::text))),
    CONSTRAINT invitaciones_estado_check CHECK ((estado = ANY (ARRAY['pendiente'::text, 'aceptada'::text, 'rechazada'::text, 'cancelada'::text])))
);


--
-- Name: mediciones; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.mediciones (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    cliente_id uuid NOT NULL,
    fecha date DEFAULT public.hoy_uy() NOT NULL,
    tipo text DEFAULT 'control'::text NOT NULL,
    peso numeric,
    altura numeric,
    grasa numeric,
    cintura numeric,
    cadera numeric,
    pecho numeric,
    brazo numeric,
    muslo numeric,
    notas text,
    fotos jsonb DEFAULT '{}'::jsonb NOT NULL,
    cargado_por uuid DEFAULT auth.uid(),
    creado_en timestamp with time zone DEFAULT now() NOT NULL,
    masa_muscular numeric,
    grasa_visceral numeric,
    pl_triceps numeric,
    pl_espalda numeric,
    pl_oblicuo numeric,
    pl_abdomen numeric,
    pl_muslo numeric,
    pl_pantorrilla numeric,
    CONSTRAINT mediciones_altura_check CHECK (((altura IS NULL) OR ((altura > (50)::numeric) AND (altura < (250)::numeric)))),
    CONSTRAINT mediciones_grasa_check CHECK (((grasa IS NULL) OR ((grasa >= (0)::numeric) AND (grasa <= (70)::numeric)))),
    CONSTRAINT mediciones_grasa_visceral_check CHECK (((grasa_visceral IS NULL) OR ((grasa_visceral >= (0)::numeric) AND (grasa_visceral <= (60)::numeric)))),
    CONSTRAINT mediciones_masa_muscular_check CHECK (((masa_muscular IS NULL) OR ((masa_muscular >= (0)::numeric) AND (masa_muscular <= (80)::numeric)))),
    CONSTRAINT mediciones_peso_check CHECK (((peso IS NULL) OR ((peso > (0)::numeric) AND (peso < (400)::numeric)))),
    CONSTRAINT mediciones_pl_abdomen_check CHECK (((pl_abdomen IS NULL) OR ((pl_abdomen >= (0)::numeric) AND (pl_abdomen <= (100)::numeric)))),
    CONSTRAINT mediciones_pl_espalda_check CHECK (((pl_espalda IS NULL) OR ((pl_espalda >= (0)::numeric) AND (pl_espalda <= (100)::numeric)))),
    CONSTRAINT mediciones_pl_muslo_check CHECK (((pl_muslo IS NULL) OR ((pl_muslo >= (0)::numeric) AND (pl_muslo <= (100)::numeric)))),
    CONSTRAINT mediciones_pl_oblicuo_check CHECK (((pl_oblicuo IS NULL) OR ((pl_oblicuo >= (0)::numeric) AND (pl_oblicuo <= (100)::numeric)))),
    CONSTRAINT mediciones_pl_pantorrilla_check CHECK (((pl_pantorrilla IS NULL) OR ((pl_pantorrilla >= (0)::numeric) AND (pl_pantorrilla <= (100)::numeric)))),
    CONSTRAINT mediciones_pl_triceps_check CHECK (((pl_triceps IS NULL) OR ((pl_triceps >= (0)::numeric) AND (pl_triceps <= (100)::numeric)))),
    CONSTRAINT mediciones_tipo_check CHECK ((tipo = ANY (ARRAY['inicial'::text, 'control'::text])))
);


--
-- Name: membresias; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.membresias (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    espacio_id uuid NOT NULL,
    perfil_id uuid NOT NULL,
    rol text NOT NULL,
    estado text DEFAULT 'activa'::text NOT NULL,
    invitado_por uuid,
    creado_en timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT membresias_estado_check CHECK ((estado = ANY (ARRAY['pendiente'::text, 'activa'::text]))),
    CONSTRAINT membresias_rol_check CHECK ((rol = ANY (ARRAY['dueno'::text, 'profe'::text])))
);


--
-- Name: mensajes_profe; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.mensajes_profe (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    profe_id uuid DEFAULT auth.uid() NOT NULL,
    cliente_id uuid,
    texto text NOT NULL,
    desde date DEFAULT public.hoy_uy() NOT NULL,
    hasta date DEFAULT public.hoy_uy() NOT NULL,
    creado_en timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT mensajes_profe_check CHECK ((hasta >= desde)),
    CONSTRAINT mensajes_profe_texto_check CHECK (((char_length(btrim(texto)) >= 1) AND (char_length(btrim(texto)) <= 300)))
);


--
-- Name: pagina_inicio; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pagina_inicio (
    id integer DEFAULT 1 NOT NULL,
    textos jsonb DEFAULT '{}'::jsonb NOT NULL,
    secciones jsonb DEFAULT '{}'::jsonb NOT NULL,
    foto_fundador_url text,
    video_celular_url text,
    video_compu_url text,
    actualizado_en timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT pagina_inicio_id_check CHECK ((id = 1)),
    CONSTRAINT pagina_inicio_secciones_check CHECK ((jsonb_typeof(secciones) = 'object'::text)),
    CONSTRAINT pagina_inicio_textos_check CHECK (((jsonb_typeof(textos) = 'object'::text) AND (pg_column_size(textos) < 60000)))
);


--
-- Name: pagos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pagos (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    cliente_id uuid NOT NULL,
    plan text,
    monto_base integer DEFAULT 0 NOT NULL,
    monto integer DEFAULT 0 NOT NULL,
    primer_mes boolean DEFAULT false NOT NULL,
    codigo text,
    codigo_id uuid,
    metodo text DEFAULT 'mercadopago'::text NOT NULL,
    estado text DEFAULT 'pendiente'::text NOT NULL,
    mp_preference_id text,
    mp_payment_id text,
    detalle text,
    creado_en timestamp with time zone DEFAULT now() NOT NULL,
    aprobado_en timestamp with time zone,
    CONSTRAINT pagos_estado_check CHECK ((estado = ANY (ARRAY['pendiente'::text, 'aprobado'::text, 'rechazado'::text, 'cancelado'::text])))
);


--
-- Name: pagos_drey; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pagos_drey (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    espacio_id uuid,
    espacio_nombre text,
    plan text,
    cupos integer,
    monto integer DEFAULT 0 NOT NULL,
    primer_mes boolean DEFAULT false NOT NULL,
    metodo text DEFAULT 'transferencia'::text NOT NULL,
    estado text DEFAULT 'aprobado'::text NOT NULL,
    comprobante text,
    nota text,
    periodo_desde date,
    periodo_hasta date,
    registrado_por uuid,
    creado_en timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT pagos_drey_estado_check CHECK ((estado = ANY (ARRAY['aprobado'::text, 'anulado'::text]))),
    CONSTRAINT pagos_drey_metodo_check CHECK ((metodo = ANY (ARRAY['transferencia'::text, 'mercadopago'::text, 'efectivo'::text, 'otro'::text]))),
    CONSTRAINT pagos_drey_monto_check CHECK ((monto >= 0))
);


--
-- Name: perfiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.perfiles (
    id uuid NOT NULL,
    nombre text,
    apellido text,
    fecha_nacimiento date,
    peso numeric,
    celular text,
    objetivo text,
    lesiones text,
    plan text,
    codigo_descuento text,
    estado text DEFAULT 'pendiente'::text NOT NULL,
    vencimiento date,
    aviso_pago boolean DEFAULT false NOT NULL,
    comprobante_nombre text,
    es_profe boolean DEFAULT false NOT NULL,
    creado_en timestamp with time zone DEFAULT now() NOT NULL,
    gimnasio_id uuid,
    profe_id uuid,
    terminos_version text,
    terminos_aceptados_en timestamp with time zone,
    consentimiento_salud_en timestamp with time zone,
    baja_solicitada_en timestamp with time zone,
    es_admin boolean DEFAULT false NOT NULL,
    hora_recordatorio time without time zone,
    espacio_id uuid,
    cupo_hasta date,
    ultimo_espacio_id uuid,
    baja_en timestamp with time zone,
    baja_por uuid,
    CONSTRAINT perfiles_admin_no_es_profe CHECK ((NOT (COALESCE(es_admin, false) AND COALESCE(es_profe, false))))
);


--
-- Name: perfiles_profe; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.perfiles_profe (
    profe_id uuid NOT NULL,
    foto_url text,
    especialidades text[] DEFAULT '{}'::text[] NOT NULL,
    modalidades text[] DEFAULT '{}'::text[] NOT NULL,
    experiencia_anios integer,
    descripcion text,
    instagram text,
    acepta_alumnos boolean DEFAULT true NOT NULL,
    actualizado_en timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT perfiles_profe_descripcion_check CHECK (((descripcion IS NULL) OR (char_length(descripcion) <= 800))),
    CONSTRAINT perfiles_profe_especialidades_check CHECK ((COALESCE(array_length(especialidades, 1), 0) <= 8)),
    CONSTRAINT perfiles_profe_experiencia_anios_check CHECK (((experiencia_anios IS NULL) OR ((experiencia_anios >= 0) AND (experiencia_anios <= 60)))),
    CONSTRAINT perfiles_profe_foto_url_check CHECK (((foto_url IS NULL) OR (char_length(foto_url) <= 500))),
    CONSTRAINT perfiles_profe_instagram_check CHECK (((instagram IS NULL) OR (char_length(instagram) <= 60))),
    CONSTRAINT perfiles_profe_modalidades_check CHECK ((modalidades <@ ARRAY['presencial'::text, 'online'::text]))
);


--
-- Name: planes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.planes (
    id text NOT NULL,
    nombre text NOT NULL,
    precio_primer_mes integer NOT NULL,
    precio_mensual integer NOT NULL,
    activo boolean DEFAULT true NOT NULL,
    orden integer DEFAULT 0 NOT NULL,
    descripcion text,
    link_mp text,
    espacio_id uuid,
    CONSTRAINT planes_precio_mensual_check CHECK ((precio_mensual >= 0)),
    CONSTRAINT planes_precio_primer_mes_check CHECK ((precio_primer_mes >= 0))
);


--
-- Name: planes_drey; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.planes_drey (
    id text NOT NULL,
    nombre text NOT NULL,
    tipo text DEFAULT 'profe'::text NOT NULL,
    cupos integer NOT NULL,
    precio_mensual integer NOT NULL,
    precio_primer_mes integer,
    link_mp text,
    descripcion text,
    activo boolean DEFAULT true NOT NULL,
    orden integer DEFAULT 0 NOT NULL,
    creado_en timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT planes_drey_cupos_check CHECK ((cupos > 0)),
    CONSTRAINT planes_drey_precio_mensual_check CHECK ((precio_mensual >= 0)),
    CONSTRAINT planes_drey_precio_primer_mes_check CHECK ((precio_primer_mes >= 0)),
    CONSTRAINT planes_drey_tipo_check CHECK ((tipo = ANY (ARRAY['profe'::text, 'gimnasio'::text])))
);


--
-- Name: plantilla_ejercicios; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.plantilla_ejercicios (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    plantilla_id uuid NOT NULL,
    ejercicio_id uuid NOT NULL,
    orden integer DEFAULT 0 NOT NULL,
    series integer DEFAULT 4 NOT NULL,
    reps_objetivo text,
    kg_objetivo numeric,
    descansos jsonb DEFAULT '[30, 60, 90, 120]'::jsonb NOT NULL,
    metodo text DEFAULT 'normal'::text NOT NULL,
    grupo text,
    config jsonb DEFAULT '{}'::jsonb NOT NULL,
    rpe text,
    descanso_min integer,
    descanso_max integer,
    calentamiento jsonb,
    progresion jsonb DEFAULT '{}'::jsonb NOT NULL,
    semanas jsonb DEFAULT '[]'::jsonb NOT NULL,
    notas text,
    tempo text,
    por_tiempo boolean DEFAULT false NOT NULL,
    CONSTRAINT plantilla_ejercicios_notas_check CHECK (((notas IS NULL) OR (char_length(notas) <= 500))),
    CONSTRAINT plantilla_ejercicios_semanas_check CHECK ((jsonb_typeof(semanas) = 'array'::text)),
    CONSTRAINT plantilla_ejercicios_tempo_check CHECK (((tempo IS NULL) OR (char_length(tempo) <= 20)))
);


--
-- Name: plantillas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.plantillas (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    nombre text NOT NULL,
    patron text,
    musculos text,
    creado_en timestamp with time zone DEFAULT now() NOT NULL,
    descripcion text,
    grupos_musculares text[] DEFAULT '{}'::text[] NOT NULL,
    calentamiento jsonb DEFAULT '[]'::jsonb NOT NULL,
    pausa_min integer,
    pausa_max integer,
    vuelta_calma jsonb DEFAULT '[]'::jsonb NOT NULL,
    profe_id uuid DEFAULT auth.uid(),
    ciclo_semanas integer,
    CONSTRAINT plantillas_ciclo_semanas_check CHECK (((ciclo_semanas IS NULL) OR ((ciclo_semanas >= 1) AND (ciclo_semanas <= 16))))
);


--
-- Name: push_suscripciones; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.push_suscripciones (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    usuario_id uuid DEFAULT auth.uid() NOT NULL,
    endpoint text NOT NULL,
    p256dh text NOT NULL,
    auth text NOT NULL,
    dispositivo text,
    creado_en timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: resumenes_progreso; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.resumenes_progreso (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    cliente_id uuid NOT NULL,
    ciclo integer NOT NULL,
    desde date NOT NULL,
    hasta date NOT NULL,
    datos jsonb DEFAULT '{}'::jsonb NOT NULL,
    comentario_profe text,
    estado text DEFAULT 'borrador'::text NOT NULL,
    visto boolean DEFAULT false NOT NULL,
    creado_en timestamp with time zone DEFAULT now() NOT NULL,
    publicado_en timestamp with time zone,
    notas jsonb DEFAULT '{}'::jsonb NOT NULL,
    incluir_medidas boolean DEFAULT false NOT NULL,
    drive_url text,
    drive_carpeta_url text,
    drive_guardado_en timestamp with time zone,
    actualizado_en timestamp with time zone,
    CONSTRAINT resumenes_progreso_estado_check CHECK ((estado = ANY (ARRAY['borrador'::text, 'publicado'::text])))
);


--
-- Name: rutina_ejercicios; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.rutina_ejercicios (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    rutina_id uuid NOT NULL,
    ejercicio_id uuid NOT NULL,
    orden integer DEFAULT 0 NOT NULL,
    series integer DEFAULT 4 NOT NULL,
    reps_objetivo text,
    kg_objetivo numeric,
    descansos jsonb DEFAULT '[30, 60, 90, 120]'::jsonb NOT NULL,
    metodo text DEFAULT 'normal'::text NOT NULL,
    grupo text,
    config jsonb DEFAULT '{}'::jsonb NOT NULL,
    rpe text,
    descanso_min integer,
    descanso_max integer,
    calentamiento jsonb,
    progresion jsonb DEFAULT '{}'::jsonb NOT NULL,
    semanas jsonb DEFAULT '[]'::jsonb NOT NULL,
    notas text,
    tempo text,
    por_tiempo boolean DEFAULT false NOT NULL,
    CONSTRAINT rutina_ejercicios_notas_check CHECK (((notas IS NULL) OR (char_length(notas) <= 500))),
    CONSTRAINT rutina_ejercicios_semanas_check CHECK ((jsonb_typeof(semanas) = 'array'::text)),
    CONSTRAINT rutina_ejercicios_tempo_check CHECK (((tempo IS NULL) OR (char_length(tempo) <= 20)))
);


--
-- Name: rutinas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.rutinas (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    cliente_id uuid NOT NULL,
    nombre text NOT NULL,
    patron text,
    musculos text,
    orden integer DEFAULT 0 NOT NULL,
    creado_en timestamp with time zone DEFAULT now() NOT NULL,
    descripcion text,
    grupos_musculares text[] DEFAULT '{}'::text[] NOT NULL,
    calentamiento jsonb DEFAULT '[]'::jsonb NOT NULL,
    pausa_min integer,
    pausa_max integer,
    vuelta_calma jsonb DEFAULT '[]'::jsonb NOT NULL,
    publicada boolean DEFAULT true NOT NULL,
    ciclo_semanas integer,
    ciclo_inicio date,
    CONSTRAINT rutinas_ciclo_semanas_check CHECK (((ciclo_semanas IS NULL) OR ((ciclo_semanas >= 1) AND (ciclo_semanas <= 16))))
);


--
-- Name: sesiones; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sesiones (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    cliente_id uuid NOT NULL,
    rutina_id uuid,
    fecha date DEFAULT CURRENT_DATE NOT NULL,
    esfuerzo integer,
    comentario text,
    detalle jsonb,
    creado_en timestamp with time zone DEFAULT now() NOT NULL,
    editado_en timestamp with time zone,
    editado_por uuid,
    duracion_seg integer,
    CONSTRAINT sesiones_duracion_seg_check CHECK (((duracion_seg IS NULL) OR (duracion_seg >= 0)))
);


--
-- Name: solicitudes_membresia; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.solicitudes_membresia (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    espacio_id uuid NOT NULL,
    profe_id uuid NOT NULL,
    estado text DEFAULT 'pendiente'::text NOT NULL,
    mensaje text,
    creado_en timestamp with time zone DEFAULT now() NOT NULL,
    respondido_en timestamp with time zone,
    respondido_por uuid,
    CONSTRAINT solicitudes_membresia_estado_check CHECK ((estado = ANY (ARRAY['pendiente'::text, 'aceptada'::text, 'rechazada'::text, 'cancelada'::text]))),
    CONSTRAINT solicitudes_membresia_mensaje_check CHECK (((mensaje IS NULL) OR (char_length(mensaje) <= 300)))
);


--
-- Name: solicitudes_profe; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.solicitudes_profe (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    cliente_id uuid NOT NULL,
    profe_id uuid NOT NULL,
    mensaje text,
    estado text DEFAULT 'pendiente'::text NOT NULL,
    respuesta text,
    creado_en timestamp with time zone DEFAULT now() NOT NULL,
    respondido_en timestamp with time zone,
    respondido_por uuid,
    CONSTRAINT solicitudes_profe_estado_check CHECK ((estado = ANY (ARRAY['pendiente'::text, 'aceptada'::text, 'rechazada'::text, 'cancelada'::text]))),
    CONSTRAINT solicitudes_profe_mensaje_check CHECK (((mensaje IS NULL) OR (char_length(mensaje) <= 500))),
    CONSTRAINT solicitudes_profe_respuesta_check CHECK (((respuesta IS NULL) OR (char_length(respuesta) <= 300)))
);


--
-- Name: tipos_aviso; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tipos_aviso (
    clave text NOT NULL,
    orden integer DEFAULT 0 NOT NULL,
    grupo text NOT NULL,
    disparo text NOT NULL,
    nombre text NOT NULL,
    descripcion text NOT NULL,
    activo boolean DEFAULT true NOT NULL,
    titulo text NOT NULL,
    cuerpo text DEFAULT ''::text NOT NULL,
    titulo_original text NOT NULL,
    cuerpo_original text DEFAULT ''::text NOT NULL,
    url text DEFAULT '/'::text NOT NULL,
    hora time without time zone,
    hora_original time without time zone,
    dias integer,
    dias_original integer,
    dias_etiqueta text,
    destino text,
    destinos_posibles text[] DEFAULT '{}'::text[] NOT NULL,
    planes text[],
    variables jsonb DEFAULT '[]'::jsonb NOT NULL,
    requiere text,
    nota text,
    actualizado_en timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT tipos_aviso_disparo_check CHECK ((disparo = ANY (ARRAY['horario'::text, 'accion'::text, 'entrenando'::text]))),
    CONSTRAINT tipos_aviso_grupo_check CHECK ((grupo = ANY (ARRAY['alumno'::text, 'profe'::text])))
);


--
-- Name: ajustes_drive ajustes_drive_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ajustes_drive
    ADD CONSTRAINT ajustes_drive_pkey PRIMARY KEY (id);


--
-- Name: ajustes_internos ajustes_internos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ajustes_internos
    ADD CONSTRAINT ajustes_internos_pkey PRIMARY KEY (clave);


--
-- Name: ajustes ajustes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ajustes
    ADD CONSTRAINT ajustes_pkey PRIMARY KEY (id);


--
-- Name: avisos avisos_clave_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.avisos
    ADD CONSTRAINT avisos_clave_key UNIQUE (clave);


--
-- Name: avisos avisos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.avisos
    ADD CONSTRAINT avisos_pkey PRIMARY KEY (id);


--
-- Name: calendario_cliente calendario_cliente_cliente_id_dia_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.calendario_cliente
    ADD CONSTRAINT calendario_cliente_cliente_id_dia_key UNIQUE (cliente_id, dia);


--
-- Name: calendario_cliente calendario_cliente_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.calendario_cliente
    ADD CONSTRAINT calendario_cliente_pkey PRIMARY KEY (id);


--
-- Name: codigos_descuento codigos_descuento_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.codigos_descuento
    ADD CONSTRAINT codigos_descuento_pkey PRIMARY KEY (id);


--
-- Name: datos_cobro datos_cobro_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.datos_cobro
    ADD CONSTRAINT datos_cobro_pkey PRIMARY KEY (espacio_id);


--
-- Name: ejercicios ejercicios_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ejercicios
    ADD CONSTRAINT ejercicios_pkey PRIMARY KEY (id);


--
-- Name: espacios espacios_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.espacios
    ADD CONSTRAINT espacios_pkey PRIMARY KEY (id);


--
-- Name: evaluaciones_anuales evaluaciones_anuales_cliente_id_anio_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.evaluaciones_anuales
    ADD CONSTRAINT evaluaciones_anuales_cliente_id_anio_key UNIQUE (cliente_id, anio);


--
-- Name: evaluaciones_anuales evaluaciones_anuales_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.evaluaciones_anuales
    ADD CONSTRAINT evaluaciones_anuales_pkey PRIMARY KEY (id);


--
-- Name: gimnasios gimnasios_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gimnasios
    ADD CONSTRAINT gimnasios_pkey PRIMARY KEY (id);


--
-- Name: habilitaciones habilitaciones_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.habilitaciones
    ADD CONSTRAINT habilitaciones_pkey PRIMARY KEY (id);


--
-- Name: historial_admin historial_admin_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.historial_admin
    ADD CONSTRAINT historial_admin_pkey PRIMARY KEY (id);


--
-- Name: intentos_de_codigo intentos_de_codigo_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.intentos_de_codigo
    ADD CONSTRAINT intentos_de_codigo_pkey PRIMARY KEY (id);


--
-- Name: invitaciones invitaciones_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invitaciones
    ADD CONSTRAINT invitaciones_pkey PRIMARY KEY (id);


--
-- Name: mediciones mediciones_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mediciones
    ADD CONSTRAINT mediciones_pkey PRIMARY KEY (id);


--
-- Name: membresias membresias_espacio_id_perfil_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.membresias
    ADD CONSTRAINT membresias_espacio_id_perfil_id_key UNIQUE (espacio_id, perfil_id);


--
-- Name: membresias membresias_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.membresias
    ADD CONSTRAINT membresias_pkey PRIMARY KEY (id);


--
-- Name: mensajes_profe mensajes_profe_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mensajes_profe
    ADD CONSTRAINT mensajes_profe_pkey PRIMARY KEY (id);


--
-- Name: pagina_inicio pagina_inicio_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pagina_inicio
    ADD CONSTRAINT pagina_inicio_pkey PRIMARY KEY (id);


--
-- Name: pagos_drey pagos_drey_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pagos_drey
    ADD CONSTRAINT pagos_drey_pkey PRIMARY KEY (id);


--
-- Name: pagos pagos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pagos
    ADD CONSTRAINT pagos_pkey PRIMARY KEY (id);


--
-- Name: perfiles perfiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.perfiles
    ADD CONSTRAINT perfiles_pkey PRIMARY KEY (id);


--
-- Name: perfiles_profe perfiles_profe_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.perfiles_profe
    ADD CONSTRAINT perfiles_profe_pkey PRIMARY KEY (profe_id);


--
-- Name: planes_drey planes_drey_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.planes_drey
    ADD CONSTRAINT planes_drey_pkey PRIMARY KEY (id);


--
-- Name: planes planes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.planes
    ADD CONSTRAINT planes_pkey PRIMARY KEY (id);


--
-- Name: plantilla_ejercicios plantilla_ejercicios_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.plantilla_ejercicios
    ADD CONSTRAINT plantilla_ejercicios_pkey PRIMARY KEY (id);


--
-- Name: plantillas plantillas_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.plantillas
    ADD CONSTRAINT plantillas_pkey PRIMARY KEY (id);


--
-- Name: push_suscripciones push_suscripciones_endpoint_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.push_suscripciones
    ADD CONSTRAINT push_suscripciones_endpoint_key UNIQUE (endpoint);


--
-- Name: push_suscripciones push_suscripciones_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.push_suscripciones
    ADD CONSTRAINT push_suscripciones_pkey PRIMARY KEY (id);


--
-- Name: resumenes_progreso resumenes_progreso_cliente_id_ciclo_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.resumenes_progreso
    ADD CONSTRAINT resumenes_progreso_cliente_id_ciclo_key UNIQUE (cliente_id, ciclo);


--
-- Name: resumenes_progreso resumenes_progreso_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.resumenes_progreso
    ADD CONSTRAINT resumenes_progreso_pkey PRIMARY KEY (id);


--
-- Name: rutina_ejercicios rutina_ejercicios_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rutina_ejercicios
    ADD CONSTRAINT rutina_ejercicios_pkey PRIMARY KEY (id);


--
-- Name: rutinas rutinas_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rutinas
    ADD CONSTRAINT rutinas_pkey PRIMARY KEY (id);


--
-- Name: sesiones sesiones_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sesiones
    ADD CONSTRAINT sesiones_pkey PRIMARY KEY (id);


--
-- Name: solicitudes_membresia solicitudes_membresia_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.solicitudes_membresia
    ADD CONSTRAINT solicitudes_membresia_pkey PRIMARY KEY (id);


--
-- Name: solicitudes_profe solicitudes_profe_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.solicitudes_profe
    ADD CONSTRAINT solicitudes_profe_pkey PRIMARY KEY (id);


--
-- Name: tipos_aviso tipos_aviso_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tipos_aviso
    ADD CONSTRAINT tipos_aviso_pkey PRIMARY KEY (clave);


--
-- Name: avisos_pendientes_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX avisos_pendientes_idx ON public.avisos USING btree (creado_en) WHERE (enviado_en IS NULL);


--
-- Name: avisos_por_enviar_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX avisos_por_enviar_idx ON public.avisos USING btree (enviar_desde) WHERE (enviado_en IS NULL);


--
-- Name: calendario_cliente_rutina_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX calendario_cliente_rutina_idx ON public.calendario_cliente USING btree (rutina_id);


--
-- Name: codigos_descuento_espacio_codigo_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX codigos_descuento_espacio_codigo_idx ON public.codigos_descuento USING btree (COALESCE(espacio_id, '00000000-0000-0000-0000-000000000000'::uuid), upper(codigo));


--
-- Name: ejercicios_categorias_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ejercicios_categorias_idx ON public.ejercicios USING gin (categorias);


--
-- Name: ejercicios_origen_unico; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX ejercicios_origen_unico ON public.ejercicios USING btree (origen);


--
-- Name: espacios_codigo_unico; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX espacios_codigo_unico ON public.espacios USING btree (codigo);


--
-- Name: espacios_un_personal_por_profe; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX espacios_un_personal_por_profe ON public.espacios USING btree (profe_id) WHERE (tipo = 'profe'::text);


--
-- Name: espacios_uno_por_gimnasio; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX espacios_uno_por_gimnasio ON public.espacios USING btree (gimnasio_id) WHERE (tipo = 'gimnasio'::text);


--
-- Name: habilitaciones_espacio_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX habilitaciones_espacio_idx ON public.habilitaciones USING btree (espacio_id, creado_en DESC);


--
-- Name: historial_admin_fecha_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX historial_admin_fecha_idx ON public.historial_admin USING btree (creado_en DESC);


--
-- Name: intentos_de_codigo_fecha; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX intentos_de_codigo_fecha ON public.intentos_de_codigo USING btree (creado_en);


--
-- Name: intentos_de_codigo_quien_fecha; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX intentos_de_codigo_quien_fecha ON public.intentos_de_codigo USING btree (quien, creado_en);


--
-- Name: invitaciones_una_pendiente; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX invitaciones_una_pendiente ON public.invitaciones USING btree (espacio_id, email) WHERE (estado = 'pendiente'::text);


--
-- Name: mediciones_cliente_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX mediciones_cliente_idx ON public.mediciones USING btree (cliente_id, fecha);


--
-- Name: membresias_perfil_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX membresias_perfil_idx ON public.membresias USING btree (perfil_id);


--
-- Name: mensajes_profe_cliente_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX mensajes_profe_cliente_idx ON public.mensajes_profe USING btree (cliente_id, hasta);


--
-- Name: mensajes_profe_profe_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX mensajes_profe_profe_idx ON public.mensajes_profe USING btree (profe_id, hasta);


--
-- Name: pagos_cliente_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX pagos_cliente_idx ON public.pagos USING btree (cliente_id, creado_en DESC);


--
-- Name: pagos_drey_espacio_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX pagos_drey_espacio_idx ON public.pagos_drey USING btree (espacio_id, creado_en DESC);


--
-- Name: perfiles_espacio_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX perfiles_espacio_idx ON public.perfiles USING btree (espacio_id, estado);


--
-- Name: perfiles_estado_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX perfiles_estado_idx ON public.perfiles USING btree (es_profe, estado);


--
-- Name: perfiles_gimnasio_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX perfiles_gimnasio_id_idx ON public.perfiles USING btree (gimnasio_id);


--
-- Name: perfiles_profe_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX perfiles_profe_id_idx ON public.perfiles USING btree (profe_id);


--
-- Name: planes_espacio_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX planes_espacio_idx ON public.planes USING btree (espacio_id, orden);


--
-- Name: planes_espacio_nombre_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX planes_espacio_nombre_idx ON public.planes USING btree (espacio_id, lower(TRIM(BOTH FROM nombre)));


--
-- Name: push_suscripciones_usuario_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX push_suscripciones_usuario_idx ON public.push_suscripciones USING btree (usuario_id);


--
-- Name: resumenes_progreso_estado_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX resumenes_progreso_estado_idx ON public.resumenes_progreso USING btree (estado, cliente_id);


--
-- Name: rutina_ejercicios_ejercicio_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX rutina_ejercicios_ejercicio_idx ON public.rutina_ejercicios USING btree (ejercicio_id);


--
-- Name: rutina_ejercicios_rutina_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX rutina_ejercicios_rutina_idx ON public.rutina_ejercicios USING btree (rutina_id, orden);


--
-- Name: rutinas_cliente_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX rutinas_cliente_idx ON public.rutinas USING btree (cliente_id, orden);


--
-- Name: sesiones_cliente_creado_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX sesiones_cliente_creado_idx ON public.sesiones USING btree (cliente_id, creado_en);


--
-- Name: sesiones_cliente_fecha_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX sesiones_cliente_fecha_idx ON public.sesiones USING btree (cliente_id, fecha);


--
-- Name: solicitudes_membresia_una_pendiente; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX solicitudes_membresia_una_pendiente ON public.solicitudes_membresia USING btree (espacio_id, profe_id) WHERE (estado = 'pendiente'::text);


--
-- Name: solicitudes_profe_profe_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX solicitudes_profe_profe_idx ON public.solicitudes_profe USING btree (profe_id, estado);


--
-- Name: solicitudes_profe_una_pendiente; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX solicitudes_profe_una_pendiente ON public.solicitudes_profe USING btree (cliente_id) WHERE (estado = 'pendiente'::text);


--
-- Name: ajustes ajustes_actualizados; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER ajustes_actualizados BEFORE UPDATE ON public.ajustes FOR EACH ROW EXECUTE FUNCTION public.marcar_ajustes_actualizados();


--
-- Name: ajustes_drive ajustes_drive_historial; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER ajustes_drive_historial BEFORE UPDATE ON public.ajustes_drive FOR EACH ROW EXECUTE FUNCTION public.historial_ajustes_drive();


--
-- Name: ajustes ajustes_historial; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER ajustes_historial AFTER UPDATE ON public.ajustes FOR EACH ROW EXECUTE FUNCTION public.historial_ajustes();


--
-- Name: ejercicios ejercicios_historial; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER ejercicios_historial AFTER DELETE OR UPDATE OF archivado_en ON public.ejercicios FOR EACH ROW EXECUTE FUNCTION public.historial_ejercicios();


--
-- Name: espacios espacios_actualizado; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER espacios_actualizado BEFORE UPDATE ON public.espacios FOR EACH ROW EXECUTE FUNCTION public.marcar_espacio_actualizado();


--
-- Name: espacios espacios_historial; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER espacios_historial AFTER DELETE OR UPDATE ON public.espacios FOR EACH ROW EXECUTE FUNCTION public.historial_espacios();


--
-- Name: espacios espacios_marcar_sin_servicio; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER espacios_marcar_sin_servicio BEFORE UPDATE OF estado, sin_servicio_desde ON public.espacios FOR EACH ROW EXECUTE FUNCTION public.marcar_sin_servicio_de_espacio();


--
-- Name: gimnasios gimnasios_espacio; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER gimnasios_espacio AFTER INSERT OR UPDATE OF nombre, dueno_id ON public.gimnasios FOR EACH ROW EXECUTE FUNCTION public.sincronizar_espacio_de_gimnasio();


--
-- Name: gimnasios gimnasios_historial; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER gimnasios_historial AFTER INSERT OR UPDATE ON public.gimnasios FOR EACH ROW EXECUTE FUNCTION public.historial_gimnasios();


--
-- Name: pagina_inicio pagina_inicio_actualizada; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER pagina_inicio_actualizada BEFORE UPDATE ON public.pagina_inicio FOR EACH ROW EXECUTE FUNCTION public.marcar_ajustes_actualizados();


--
-- Name: pagina_inicio pagina_inicio_historial; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER pagina_inicio_historial AFTER UPDATE ON public.pagina_inicio FOR EACH ROW EXECUTE FUNCTION public.historial_pagina_inicio();


--
-- Name: pagos_drey pagos_drey_historial; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER pagos_drey_historial AFTER INSERT ON public.pagos_drey FOR EACH ROW EXECUTE FUNCTION public.historial_pagos_drey();


--
-- Name: pagos pagos_historial; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER pagos_historial AFTER INSERT ON public.pagos FOR EACH ROW EXECUTE FUNCTION public.historial_pagos();


--
-- Name: perfiles perfiles_asignar_profe; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER perfiles_asignar_profe BEFORE INSERT ON public.perfiles FOR EACH ROW EXECUTE FUNCTION public.asignar_profe_al_registrarse();


--
-- Name: perfiles perfiles_aviso_al_profe; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER perfiles_aviso_al_profe AFTER INSERT OR UPDATE OF aviso_pago ON public.perfiles FOR EACH ROW EXECUTE FUNCTION public.aviso_al_profe_de_cuenta();


--
-- Name: perfiles perfiles_aviso_cuenta_alumno; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER perfiles_aviso_cuenta_alumno AFTER UPDATE OF estado, vencimiento ON public.perfiles FOR EACH ROW EXECUTE FUNCTION public.aviso_cuenta_del_alumno();


--
-- Name: perfiles perfiles_cambio_de_profe; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER perfiles_cambio_de_profe AFTER UPDATE OF profe_id ON public.perfiles FOR EACH ROW EXECUTE FUNCTION public.al_cambiar_profe_de_alumno();


--
-- Name: perfiles perfiles_espacios_de_profe; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER perfiles_espacios_de_profe AFTER INSERT OR UPDATE OF es_profe, gimnasio_id ON public.perfiles FOR EACH ROW EXECUTE FUNCTION public.sincronizar_espacios_de_profe();


--
-- Name: perfiles perfiles_guardar_consentimiento; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER perfiles_guardar_consentimiento BEFORE INSERT ON public.perfiles FOR EACH ROW EXECUTE FUNCTION public.guardar_consentimiento_al_registrarse();


--
-- Name: perfiles perfiles_historial; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER perfiles_historial AFTER UPDATE OF es_profe, gimnasio_id, profe_id ON public.perfiles FOR EACH ROW EXECUTE FUNCTION public.historial_perfiles();


--
-- Name: perfiles_profe perfiles_profe_actualizado; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER perfiles_profe_actualizado BEFORE UPDATE ON public.perfiles_profe FOR EACH ROW EXECUTE FUNCTION public.marcar_perfil_profe_actualizado();


--
-- Name: perfiles perfiles_proteger_campos; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER perfiles_proteger_campos BEFORE UPDATE ON public.perfiles FOR EACH ROW EXECUTE FUNCTION public.proteger_campos_de_perfil();


--
-- Name: perfiles perfiles_proteger_gimnasio; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER perfiles_proteger_gimnasio BEFORE UPDATE ON public.perfiles FOR EACH ROW EXECUTE FUNCTION public.proteger_gimnasio_de_profe();


--
-- Name: perfiles perfiles_registro_tipo; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER perfiles_registro_tipo BEFORE INSERT ON public.perfiles FOR EACH ROW EXECUTE FUNCTION public.registro_por_tipo();


--
-- Name: perfiles perfiles_registro_tipo_despues; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER perfiles_registro_tipo_despues AFTER INSERT ON public.perfiles FOR EACH ROW EXECUTE FUNCTION public.registro_de_profe_despues();


--
-- Name: perfiles perfiles_salir_de_baja; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER perfiles_salir_de_baja BEFORE UPDATE ON public.perfiles FOR EACH ROW EXECUTE FUNCTION public.salir_de_baja();


--
-- Name: perfiles perfiles_ubicar_en_espacio; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER perfiles_ubicar_en_espacio BEFORE INSERT OR UPDATE ON public.perfiles FOR EACH ROW EXECUTE FUNCTION public.ubicar_alumno_en_espacio();


--
-- Name: perfiles perfiles_ubicar_plan; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER perfiles_ubicar_plan BEFORE INSERT OR UPDATE ON public.perfiles FOR EACH ROW EXECUTE FUNCTION public.ubicar_plan_del_alumno();


--
-- Name: perfiles perfiles_vigilar_cupo; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER perfiles_vigilar_cupo BEFORE INSERT OR UPDATE ON public.perfiles FOR EACH ROW EXECUTE FUNCTION public.controlar_cupo();


--
-- Name: planes_drey planes_drey_historial; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER planes_drey_historial AFTER INSERT OR UPDATE ON public.planes_drey FOR EACH ROW EXECUTE FUNCTION public.historial_planes_drey();


--
-- Name: planes planes_historial; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER planes_historial AFTER INSERT OR UPDATE ON public.planes FOR EACH ROW EXECUTE FUNCTION public.historial_planes();


--
-- Name: resumenes_progreso resumenes_aviso_publicado; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER resumenes_aviso_publicado AFTER UPDATE OF estado ON public.resumenes_progreso FOR EACH ROW EXECUTE FUNCTION public.aviso_resumen_publicado();


--
-- Name: rutina_ejercicios rutina_ejercicios_aviso_editada; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER rutina_ejercicios_aviso_editada AFTER INSERT OR DELETE OR UPDATE ON public.rutina_ejercicios FOR EACH ROW EXECUTE FUNCTION public.aviso_ejercicios_de_rutina_cambiaron();


--
-- Name: rutinas rutinas_aviso_editada; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER rutinas_aviso_editada AFTER UPDATE ON public.rutinas FOR EACH ROW EXECUTE FUNCTION public.aviso_rutina_cambio();


--
-- Name: rutinas rutinas_aviso_nueva; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER rutinas_aviso_nueva AFTER INSERT OR UPDATE OF publicada ON public.rutinas FOR EACH ROW EXECUTE FUNCTION public.aviso_rutina_nueva();


--
-- Name: sesiones sesiones_aviso_al_profe; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER sesiones_aviso_al_profe AFTER INSERT ON public.sesiones FOR EACH ROW EXECUTE FUNCTION public.aviso_entrenamiento_al_profe();


--
-- Name: sesiones sesiones_proteger_correccion; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER sesiones_proteger_correccion BEFORE UPDATE ON public.sesiones FOR EACH ROW EXECUTE FUNCTION public.proteger_sesion_corregida();


--
-- Name: sesiones sesiones_rehacer_resumen; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER sesiones_rehacer_resumen AFTER UPDATE OF detalle ON public.sesiones FOR EACH ROW EXECUTE FUNCTION public.rehacer_resumen_al_corregir();


--
-- Name: sesiones sesiones_rehacer_resumen_al_borrar; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER sesiones_rehacer_resumen_al_borrar AFTER DELETE ON public.sesiones FOR EACH ROW EXECUTE FUNCTION public.rehacer_resumen_al_borrar();


--
-- Name: avisos avisos_usuario_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.avisos
    ADD CONSTRAINT avisos_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES public.perfiles(id) ON DELETE CASCADE;


--
-- Name: calendario_cliente calendario_cliente_cliente_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.calendario_cliente
    ADD CONSTRAINT calendario_cliente_cliente_id_fkey FOREIGN KEY (cliente_id) REFERENCES public.perfiles(id) ON DELETE CASCADE;


--
-- Name: calendario_cliente calendario_cliente_rutina_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.calendario_cliente
    ADD CONSTRAINT calendario_cliente_rutina_id_fkey FOREIGN KEY (rutina_id) REFERENCES public.rutinas(id) ON DELETE SET NULL;


--
-- Name: codigos_descuento codigos_descuento_espacio_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.codigos_descuento
    ADD CONSTRAINT codigos_descuento_espacio_id_fkey FOREIGN KEY (espacio_id) REFERENCES public.espacios(id) ON DELETE CASCADE;


--
-- Name: codigos_descuento codigos_descuento_profe_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.codigos_descuento
    ADD CONSTRAINT codigos_descuento_profe_id_fkey FOREIGN KEY (profe_id) REFERENCES public.perfiles(id) ON DELETE SET NULL;


--
-- Name: datos_cobro datos_cobro_espacio_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.datos_cobro
    ADD CONSTRAINT datos_cobro_espacio_id_fkey FOREIGN KEY (espacio_id) REFERENCES public.espacios(id) ON DELETE CASCADE;


--
-- Name: ejercicios ejercicios_creado_por_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ejercicios
    ADD CONSTRAINT ejercicios_creado_por_fkey FOREIGN KEY (creado_por) REFERENCES public.perfiles(id) ON DELETE SET NULL;


--
-- Name: espacios espacios_gimnasio_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.espacios
    ADD CONSTRAINT espacios_gimnasio_id_fkey FOREIGN KEY (gimnasio_id) REFERENCES public.gimnasios(id) ON DELETE CASCADE;


--
-- Name: espacios espacios_plan_drey_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.espacios
    ADD CONSTRAINT espacios_plan_drey_fkey FOREIGN KEY (plan_drey) REFERENCES public.planes_drey(id) ON UPDATE CASCADE;


--
-- Name: espacios espacios_plan_drey_pedido_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.espacios
    ADD CONSTRAINT espacios_plan_drey_pedido_fkey FOREIGN KEY (plan_drey_pedido) REFERENCES public.planes_drey(id) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: espacios espacios_profe_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.espacios
    ADD CONSTRAINT espacios_profe_id_fkey FOREIGN KEY (profe_id) REFERENCES public.perfiles(id) ON DELETE CASCADE;


--
-- Name: evaluaciones_anuales evaluaciones_anuales_cliente_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.evaluaciones_anuales
    ADD CONSTRAINT evaluaciones_anuales_cliente_id_fkey FOREIGN KEY (cliente_id) REFERENCES public.perfiles(id) ON DELETE CASCADE;


--
-- Name: gimnasios gimnasios_dueno_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.gimnasios
    ADD CONSTRAINT gimnasios_dueno_id_fkey FOREIGN KEY (dueno_id) REFERENCES public.perfiles(id) ON DELETE SET NULL;


--
-- Name: habilitaciones habilitaciones_alumno_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.habilitaciones
    ADD CONSTRAINT habilitaciones_alumno_id_fkey FOREIGN KEY (alumno_id) REFERENCES public.perfiles(id) ON DELETE CASCADE;


--
-- Name: habilitaciones habilitaciones_espacio_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.habilitaciones
    ADD CONSTRAINT habilitaciones_espacio_id_fkey FOREIGN KEY (espacio_id) REFERENCES public.espacios(id) ON DELETE CASCADE;


--
-- Name: habilitaciones habilitaciones_por_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.habilitaciones
    ADD CONSTRAINT habilitaciones_por_id_fkey FOREIGN KEY (por_id) REFERENCES public.perfiles(id) ON DELETE SET NULL;


--
-- Name: historial_admin historial_admin_admin_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.historial_admin
    ADD CONSTRAINT historial_admin_admin_id_fkey FOREIGN KEY (admin_id) REFERENCES public.perfiles(id) ON DELETE SET NULL;


--
-- Name: invitaciones invitaciones_espacio_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invitaciones
    ADD CONSTRAINT invitaciones_espacio_id_fkey FOREIGN KEY (espacio_id) REFERENCES public.espacios(id) ON DELETE CASCADE;


--
-- Name: invitaciones invitaciones_invitado_por_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invitaciones
    ADD CONSTRAINT invitaciones_invitado_por_fkey FOREIGN KEY (invitado_por) REFERENCES public.perfiles(id) ON DELETE SET NULL;


--
-- Name: mediciones mediciones_cargado_por_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mediciones
    ADD CONSTRAINT mediciones_cargado_por_fkey FOREIGN KEY (cargado_por) REFERENCES public.perfiles(id) ON DELETE SET NULL;


--
-- Name: mediciones mediciones_cliente_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mediciones
    ADD CONSTRAINT mediciones_cliente_id_fkey FOREIGN KEY (cliente_id) REFERENCES public.perfiles(id) ON DELETE CASCADE;


--
-- Name: membresias membresias_espacio_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.membresias
    ADD CONSTRAINT membresias_espacio_id_fkey FOREIGN KEY (espacio_id) REFERENCES public.espacios(id) ON DELETE CASCADE;


--
-- Name: membresias membresias_invitado_por_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.membresias
    ADD CONSTRAINT membresias_invitado_por_fkey FOREIGN KEY (invitado_por) REFERENCES public.perfiles(id) ON DELETE SET NULL;


--
-- Name: membresias membresias_perfil_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.membresias
    ADD CONSTRAINT membresias_perfil_id_fkey FOREIGN KEY (perfil_id) REFERENCES public.perfiles(id) ON DELETE CASCADE;


--
-- Name: mensajes_profe mensajes_profe_cliente_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mensajes_profe
    ADD CONSTRAINT mensajes_profe_cliente_id_fkey FOREIGN KEY (cliente_id) REFERENCES public.perfiles(id) ON DELETE CASCADE;


--
-- Name: mensajes_profe mensajes_profe_profe_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.mensajes_profe
    ADD CONSTRAINT mensajes_profe_profe_id_fkey FOREIGN KEY (profe_id) REFERENCES public.perfiles(id) ON DELETE CASCADE;


--
-- Name: pagos pagos_cliente_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pagos
    ADD CONSTRAINT pagos_cliente_id_fkey FOREIGN KEY (cliente_id) REFERENCES public.perfiles(id) ON DELETE CASCADE;


--
-- Name: pagos pagos_codigo_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pagos
    ADD CONSTRAINT pagos_codigo_id_fkey FOREIGN KEY (codigo_id) REFERENCES public.codigos_descuento(id) ON DELETE SET NULL;


--
-- Name: pagos_drey pagos_drey_espacio_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pagos_drey
    ADD CONSTRAINT pagos_drey_espacio_id_fkey FOREIGN KEY (espacio_id) REFERENCES public.espacios(id) ON DELETE SET NULL;


--
-- Name: pagos_drey pagos_drey_registrado_por_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pagos_drey
    ADD CONSTRAINT pagos_drey_registrado_por_fkey FOREIGN KEY (registrado_por) REFERENCES public.perfiles(id) ON DELETE SET NULL;


--
-- Name: perfiles perfiles_baja_por_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.perfiles
    ADD CONSTRAINT perfiles_baja_por_fkey FOREIGN KEY (baja_por) REFERENCES public.perfiles(id) ON DELETE SET NULL;


--
-- Name: perfiles perfiles_espacio_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.perfiles
    ADD CONSTRAINT perfiles_espacio_id_fkey FOREIGN KEY (espacio_id) REFERENCES public.espacios(id) ON DELETE SET NULL;


--
-- Name: perfiles perfiles_gimnasio_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.perfiles
    ADD CONSTRAINT perfiles_gimnasio_id_fkey FOREIGN KEY (gimnasio_id) REFERENCES public.gimnasios(id) ON DELETE SET NULL;


--
-- Name: perfiles perfiles_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.perfiles
    ADD CONSTRAINT perfiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: perfiles perfiles_profe_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.perfiles
    ADD CONSTRAINT perfiles_profe_id_fkey FOREIGN KEY (profe_id) REFERENCES public.perfiles(id) ON DELETE SET NULL;


--
-- Name: perfiles_profe perfiles_profe_profe_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.perfiles_profe
    ADD CONSTRAINT perfiles_profe_profe_id_fkey FOREIGN KEY (profe_id) REFERENCES public.perfiles(id) ON DELETE CASCADE;


--
-- Name: perfiles perfiles_ultimo_espacio_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.perfiles
    ADD CONSTRAINT perfiles_ultimo_espacio_id_fkey FOREIGN KEY (ultimo_espacio_id) REFERENCES public.espacios(id) ON DELETE SET NULL;


--
-- Name: planes planes_espacio_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.planes
    ADD CONSTRAINT planes_espacio_id_fkey FOREIGN KEY (espacio_id) REFERENCES public.espacios(id) ON DELETE CASCADE;


--
-- Name: plantilla_ejercicios plantilla_ejercicios_ejercicio_protegido; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.plantilla_ejercicios
    ADD CONSTRAINT plantilla_ejercicios_ejercicio_protegido FOREIGN KEY (ejercicio_id) REFERENCES public.ejercicios(id) ON DELETE RESTRICT;


--
-- Name: plantilla_ejercicios plantilla_ejercicios_plantilla_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.plantilla_ejercicios
    ADD CONSTRAINT plantilla_ejercicios_plantilla_id_fkey FOREIGN KEY (plantilla_id) REFERENCES public.plantillas(id) ON DELETE CASCADE;


--
-- Name: plantillas plantillas_profe_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.plantillas
    ADD CONSTRAINT plantillas_profe_id_fkey FOREIGN KEY (profe_id) REFERENCES public.perfiles(id) ON DELETE SET NULL;


--
-- Name: push_suscripciones push_suscripciones_usuario_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.push_suscripciones
    ADD CONSTRAINT push_suscripciones_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES public.perfiles(id) ON DELETE CASCADE;


--
-- Name: resumenes_progreso resumenes_progreso_cliente_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.resumenes_progreso
    ADD CONSTRAINT resumenes_progreso_cliente_id_fkey FOREIGN KEY (cliente_id) REFERENCES public.perfiles(id) ON DELETE CASCADE;


--
-- Name: rutina_ejercicios rutina_ejercicios_ejercicio_protegido; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rutina_ejercicios
    ADD CONSTRAINT rutina_ejercicios_ejercicio_protegido FOREIGN KEY (ejercicio_id) REFERENCES public.ejercicios(id) ON DELETE RESTRICT;


--
-- Name: rutina_ejercicios rutina_ejercicios_rutina_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rutina_ejercicios
    ADD CONSTRAINT rutina_ejercicios_rutina_id_fkey FOREIGN KEY (rutina_id) REFERENCES public.rutinas(id) ON DELETE CASCADE;


--
-- Name: rutinas rutinas_cliente_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rutinas
    ADD CONSTRAINT rutinas_cliente_id_fkey FOREIGN KEY (cliente_id) REFERENCES public.perfiles(id) ON DELETE CASCADE;


--
-- Name: sesiones sesiones_cliente_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sesiones
    ADD CONSTRAINT sesiones_cliente_id_fkey FOREIGN KEY (cliente_id) REFERENCES public.perfiles(id) ON DELETE CASCADE;


--
-- Name: sesiones sesiones_editado_por_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sesiones
    ADD CONSTRAINT sesiones_editado_por_fkey FOREIGN KEY (editado_por) REFERENCES public.perfiles(id) ON DELETE SET NULL;


--
-- Name: sesiones sesiones_rutina_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sesiones
    ADD CONSTRAINT sesiones_rutina_id_fkey FOREIGN KEY (rutina_id) REFERENCES public.rutinas(id) ON DELETE SET NULL;


--
-- Name: solicitudes_membresia solicitudes_membresia_espacio_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.solicitudes_membresia
    ADD CONSTRAINT solicitudes_membresia_espacio_id_fkey FOREIGN KEY (espacio_id) REFERENCES public.espacios(id) ON DELETE CASCADE;


--
-- Name: solicitudes_membresia solicitudes_membresia_profe_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.solicitudes_membresia
    ADD CONSTRAINT solicitudes_membresia_profe_id_fkey FOREIGN KEY (profe_id) REFERENCES public.perfiles(id) ON DELETE CASCADE;


--
-- Name: solicitudes_membresia solicitudes_membresia_respondido_por_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.solicitudes_membresia
    ADD CONSTRAINT solicitudes_membresia_respondido_por_fkey FOREIGN KEY (respondido_por) REFERENCES public.perfiles(id) ON DELETE SET NULL;


--
-- Name: solicitudes_profe solicitudes_profe_cliente_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.solicitudes_profe
    ADD CONSTRAINT solicitudes_profe_cliente_id_fkey FOREIGN KEY (cliente_id) REFERENCES public.perfiles(id) ON DELETE CASCADE;


--
-- Name: solicitudes_profe solicitudes_profe_profe_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.solicitudes_profe
    ADD CONSTRAINT solicitudes_profe_profe_id_fkey FOREIGN KEY (profe_id) REFERENCES public.perfiles(id) ON DELETE CASCADE;


--
-- Name: solicitudes_profe solicitudes_profe_respondido_por_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.solicitudes_profe
    ADD CONSTRAINT solicitudes_profe_respondido_por_fkey FOREIGN KEY (respondido_por) REFERENCES public.perfiles(id) ON DELETE SET NULL;


--
-- Name: ajustes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.ajustes ENABLE ROW LEVEL SECURITY;

--
-- Name: ajustes ajustes: solo el Admin los cambia; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "ajustes: solo el Admin los cambia" ON public.ajustes FOR UPDATE TO authenticated USING (public.es_admin()) WITH CHECK (public.es_admin());


--
-- Name: ajustes ajustes: solo el Admin los lee; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "ajustes: solo el Admin los lee" ON public.ajustes FOR SELECT TO authenticated USING (public.es_admin());


--
-- Name: ajustes_drive; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.ajustes_drive ENABLE ROW LEVEL SECURITY;

--
-- Name: ajustes_drive ajustes_drive: lo lee el panel; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "ajustes_drive: lo lee el panel" ON public.ajustes_drive FOR SELECT TO authenticated USING ((public.es_admin() OR public.profe_de_confianza()));


--
-- Name: ajustes_drive ajustes_drive: solo el Admin lo cambia; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "ajustes_drive: solo el Admin lo cambia" ON public.ajustes_drive FOR UPDATE TO authenticated USING (public.es_admin()) WITH CHECK (public.es_admin());


--
-- Name: ajustes_internos; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.ajustes_internos ENABLE ROW LEVEL SECURITY;

--
-- Name: avisos; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.avisos ENABLE ROW LEVEL SECURITY;

--
-- Name: avisos avisos: cada uno ve los suyos; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "avisos: cada uno ve los suyos" ON public.avisos FOR SELECT TO authenticated USING ((usuario_id = auth.uid()));


--
-- Name: calendario_cliente calendario: el cliente o su profe lo ven; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "calendario: el cliente o su profe lo ven" ON public.calendario_cliente FOR SELECT TO authenticated USING (((cliente_id = auth.uid()) OR public.puede_ver_cliente(cliente_id)));


--
-- Name: calendario_cliente calendario: el profe del cliente lo borra; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "calendario: el profe del cliente lo borra" ON public.calendario_cliente FOR DELETE TO authenticated USING (public.puede_ver_cliente(cliente_id));


--
-- Name: calendario_cliente calendario: el profe del cliente lo crea; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "calendario: el profe del cliente lo crea" ON public.calendario_cliente FOR INSERT TO authenticated WITH CHECK (public.puede_ver_cliente(cliente_id));


--
-- Name: calendario_cliente calendario: el profe del cliente lo edita; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "calendario: el profe del cliente lo edita" ON public.calendario_cliente FOR UPDATE TO authenticated USING (public.puede_ver_cliente(cliente_id)) WITH CHECK (public.puede_ver_cliente(cliente_id));


--
-- Name: calendario_cliente; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.calendario_cliente ENABLE ROW LEVEL SECURITY;

--
-- Name: codigos_descuento codigos: el profe borra los suyos; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "codigos: el profe borra los suyos" ON public.codigos_descuento FOR DELETE TO authenticated USING (public.puede_manejar_codigo(tipo, espacio_id));


--
-- Name: codigos_descuento codigos: el profe crea los suyos; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "codigos: el profe crea los suyos" ON public.codigos_descuento FOR INSERT TO authenticated WITH CHECK (public.puede_manejar_codigo(tipo, espacio_id));


--
-- Name: codigos_descuento codigos: el profe edita los suyos; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "codigos: el profe edita los suyos" ON public.codigos_descuento FOR UPDATE TO authenticated USING (public.puede_manejar_codigo(tipo, espacio_id)) WITH CHECK (public.puede_manejar_codigo(tipo, espacio_id));


--
-- Name: codigos_descuento codigos: el profe ve los suyos y los clientes los de ropa; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "codigos: el profe ve los suyos y los clientes los de ropa" ON public.codigos_descuento FOR SELECT TO authenticated USING ((public.es_admin() OR ((tipo = 'plan'::text) AND (espacio_id IS NOT NULL) AND COALESCE((public.mi_rol_en_espacio(espacio_id) = 'dueno'::text), false)) OR ((tipo = 'ropa'::text) AND public.profe_de_confianza()) OR ((tipo = 'ropa'::text) AND activo AND ( SELECT public.acceso_vigente(auth.uid()) AS acceso_vigente))));


--
-- Name: codigos_descuento; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.codigos_descuento ENABLE ROW LEVEL SECURITY;

--
-- Name: datos_cobro; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.datos_cobro ENABLE ROW LEVEL SECURITY;

--
-- Name: datos_cobro datos_cobro: el Admin y los del espacio; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "datos_cobro: el Admin y los del espacio" ON public.datos_cobro FOR SELECT TO authenticated USING ((public.es_admin() OR (public.mi_rol_en_espacio(espacio_id) IS NOT NULL)));


--
-- Name: ejercicios; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.ejercicios ENABLE ROW LEVEL SECURITY;

--
-- Name: ejercicios ejercicios: cualquier usuario logueado puede ver; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "ejercicios: cualquier usuario logueado puede ver" ON public.ejercicios FOR SELECT TO authenticated USING (true);


--
-- Name: ejercicios ejercicios: los edita quien los creó o un profe de confianza; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "ejercicios: los edita quien los creó o un profe de confianza" ON public.ejercicios FOR UPDATE TO authenticated USING ((public.es_profe() AND ((creado_por = auth.uid()) OR public.profe_de_confianza()))) WITH CHECK ((public.es_profe() AND ((creado_por = auth.uid()) OR public.profe_de_confianza())));


--
-- Name: ejercicios ejercicios: solo el Admin los borra; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "ejercicios: solo el Admin los borra" ON public.ejercicios FOR DELETE TO authenticated USING (public.es_admin());


--
-- Name: ejercicios ejercicios: solo el profe los crea; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "ejercicios: solo el profe los crea" ON public.ejercicios FOR INSERT TO authenticated WITH CHECK (public.es_profe());


--
-- Name: espacios; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.espacios ENABLE ROW LEVEL SECURITY;

--
-- Name: espacios espacios: el Admin los borra; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "espacios: el Admin los borra" ON public.espacios FOR DELETE TO authenticated USING (public.es_admin());


--
-- Name: espacios espacios: el Admin los cambia; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "espacios: el Admin los cambia" ON public.espacios FOR UPDATE TO authenticated USING (public.es_admin()) WITH CHECK (public.es_admin());


--
-- Name: espacios espacios: el Admin y sus miembros los ven; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "espacios: el Admin y sus miembros los ven" ON public.espacios FOR SELECT TO authenticated USING ((public.es_admin() OR (public.mi_rol_en_espacio(id) IS NOT NULL)));


--
-- Name: evaluaciones_anuales; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.evaluaciones_anuales ENABLE ROW LEVEL SECURITY;

--
-- Name: evaluaciones_anuales evaluaciones_anuales: el profe la borra; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "evaluaciones_anuales: el profe la borra" ON public.evaluaciones_anuales FOR DELETE TO authenticated USING (public.puede_ver_cliente(cliente_id));


--
-- Name: evaluaciones_anuales evaluaciones_anuales: el profe la cambia; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "evaluaciones_anuales: el profe la cambia" ON public.evaluaciones_anuales FOR UPDATE TO authenticated USING (public.puede_ver_cliente(cliente_id)) WITH CHECK (public.puede_ver_cliente(cliente_id));


--
-- Name: evaluaciones_anuales evaluaciones_anuales: el profe la crea; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "evaluaciones_anuales: el profe la crea" ON public.evaluaciones_anuales FOR INSERT TO authenticated WITH CHECK (public.puede_ver_cliente(cliente_id));


--
-- Name: evaluaciones_anuales evaluaciones_anuales: el profe y el alumno la ven; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "evaluaciones_anuales: el profe y el alumno la ven" ON public.evaluaciones_anuales FOR SELECT TO authenticated USING ((public.puede_ver_cliente(cliente_id) OR ((cliente_id = auth.uid()) AND (estado = 'publicado'::text))));


--
-- Name: gimnasios; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.gimnasios ENABLE ROW LEVEL SECURITY;

--
-- Name: gimnasios gimnasios: el administrador o el dueño los editan; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "gimnasios: el administrador o el dueño los editan" ON public.gimnasios FOR UPDATE TO authenticated USING ((public.es_admin() OR (dueno_id = auth.uid()))) WITH CHECK ((public.es_admin() OR (dueno_id = auth.uid())));


--
-- Name: gimnasios gimnasios: se ven los activos; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "gimnasios: se ven los activos" ON public.gimnasios FOR SELECT TO anon, authenticated USING ((activo OR public.es_profe()));


--
-- Name: gimnasios gimnasios: solo el administrador los borra; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "gimnasios: solo el administrador los borra" ON public.gimnasios FOR DELETE TO authenticated USING (public.es_admin());


--
-- Name: gimnasios gimnasios: solo el administrador los crea; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "gimnasios: solo el administrador los crea" ON public.gimnasios FOR INSERT TO authenticated WITH CHECK (public.es_admin());


--
-- Name: habilitaciones; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.habilitaciones ENABLE ROW LEVEL SECURITY;

--
-- Name: habilitaciones habilitaciones: el Admin y el dueño las ven; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "habilitaciones: el Admin y el dueño las ven" ON public.habilitaciones FOR SELECT TO authenticated USING ((public.es_admin() OR (public.mi_rol_en_espacio(espacio_id) = 'dueno'::text)));


--
-- Name: historial_admin historial: solo el Admin lo ve; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "historial: solo el Admin lo ve" ON public.historial_admin FOR SELECT TO authenticated USING (public.es_admin());


--
-- Name: historial_admin; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.historial_admin ENABLE ROW LEVEL SECURITY;

--
-- Name: intentos_de_codigo; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.intentos_de_codigo ENABLE ROW LEVEL SECURITY;

--
-- Name: invitaciones; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.invitaciones ENABLE ROW LEVEL SECURITY;

--
-- Name: invitaciones invitaciones: quién las ve; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "invitaciones: quién las ve" ON public.invitaciones FOR SELECT TO authenticated USING ((public.es_admin() OR (public.mi_rol_en_espacio(espacio_id) = 'dueno'::text) OR (email = public.mi_email())));


--
-- Name: mediciones; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.mediciones ENABLE ROW LEVEL SECURITY;

--
-- Name: mediciones mediciones: el cliente o su profe las borran; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "mediciones: el cliente o su profe las borran" ON public.mediciones FOR DELETE TO authenticated USING (((cliente_id = auth.uid()) OR public.puede_ver_cliente(cliente_id)));


--
-- Name: mediciones mediciones: el cliente o su profe las cargan; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "mediciones: el cliente o su profe las cargan" ON public.mediciones FOR INSERT TO authenticated WITH CHECK (((cliente_id = auth.uid()) OR public.puede_ver_cliente(cliente_id)));


--
-- Name: mediciones mediciones: el cliente o su profe las corrigen; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "mediciones: el cliente o su profe las corrigen" ON public.mediciones FOR UPDATE TO authenticated USING (((cliente_id = auth.uid()) OR public.puede_ver_cliente(cliente_id))) WITH CHECK (((cliente_id = auth.uid()) OR public.puede_ver_cliente(cliente_id)));


--
-- Name: mediciones mediciones: el cliente o su profe las ven; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "mediciones: el cliente o su profe las ven" ON public.mediciones FOR SELECT TO authenticated USING (((cliente_id = auth.uid()) OR public.puede_ver_cliente(cliente_id)));


--
-- Name: membresias; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.membresias ENABLE ROW LEVEL SECURITY;

--
-- Name: membresias membresias: quién las ve; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "membresias: quién las ve" ON public.membresias FOR SELECT TO authenticated USING ((public.es_admin() OR (perfil_id = auth.uid()) OR (public.mi_rol_en_espacio(espacio_id) = 'dueno'::text)));


--
-- Name: mensajes_profe; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.mensajes_profe ENABLE ROW LEVEL SECURITY;

--
-- Name: mensajes_profe mensajes_profe: el profe borra los suyos; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "mensajes_profe: el profe borra los suyos" ON public.mensajes_profe FOR DELETE TO authenticated USING (((profe_id = auth.uid()) OR public.es_admin()));


--
-- Name: mensajes_profe mensajes_profe: el profe cambia los suyos; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "mensajes_profe: el profe cambia los suyos" ON public.mensajes_profe FOR UPDATE TO authenticated USING (((profe_id = auth.uid()) OR public.es_admin())) WITH CHECK ((((profe_id = auth.uid()) OR public.es_admin()) AND ((cliente_id IS NULL) OR public.puede_ver_cliente(cliente_id))));


--
-- Name: mensajes_profe mensajes_profe: el profe crea los suyos; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "mensajes_profe: el profe crea los suyos" ON public.mensajes_profe FOR INSERT TO authenticated WITH CHECK (((profe_id = auth.uid()) AND public.es_profe() AND ((cliente_id IS NULL) OR public.puede_ver_cliente(cliente_id))));


--
-- Name: mensajes_profe mensajes_profe: el profe ve los suyos; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "mensajes_profe: el profe ve los suyos" ON public.mensajes_profe FOR SELECT TO authenticated USING (((profe_id = auth.uid()) OR public.es_admin()));


--
-- Name: pagina_inicio; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.pagina_inicio ENABLE ROW LEVEL SECURITY;

--
-- Name: pagina_inicio pagina_inicio: solo el Admin la cambia; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "pagina_inicio: solo el Admin la cambia" ON public.pagina_inicio FOR UPDATE TO authenticated USING (public.es_admin()) WITH CHECK (public.es_admin());


--
-- Name: pagina_inicio pagina_inicio: todos la leen; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "pagina_inicio: todos la leen" ON public.pagina_inicio FOR SELECT TO anon, authenticated USING (true);


--
-- Name: pagos; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.pagos ENABLE ROW LEVEL SECURITY;

--
-- Name: pagos pagos: el cliente o su profe los ven; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "pagos: el cliente o su profe los ven" ON public.pagos FOR SELECT TO authenticated USING (((cliente_id = auth.uid()) OR public.puede_ver_cliente(cliente_id)));


--
-- Name: pagos_drey; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.pagos_drey ENABLE ROW LEVEL SECURITY;

--
-- Name: pagos_drey pagos_drey: el Admin y el dueño los ven; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "pagos_drey: el Admin y el dueño los ven" ON public.pagos_drey FOR SELECT TO authenticated USING ((public.es_admin() OR (public.mi_rol_en_espacio(espacio_id) = 'dueno'::text)));


--
-- Name: perfiles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.perfiles ENABLE ROW LEVEL SECURITY;

--
-- Name: perfiles perfiles: el propio usuario o su profe editan; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "perfiles: el propio usuario o su profe editan" ON public.perfiles FOR UPDATE TO authenticated USING (((id = auth.uid()) OR public.puede_ver_cliente(id) OR public.es_admin())) WITH CHECK (((id = auth.uid()) OR public.puede_ver_cliente(id) OR public.es_admin()));


--
-- Name: perfiles perfiles: el propio usuario o su profe ven; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "perfiles: el propio usuario o su profe ven" ON public.perfiles FOR SELECT TO authenticated USING (((id = auth.uid()) OR public.puede_ver_cliente(id) OR public.puede_ver_profe(id)));


--
-- Name: perfiles perfiles: solo el administrador borra; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "perfiles: solo el administrador borra" ON public.perfiles FOR DELETE TO authenticated USING (public.es_admin());


--
-- Name: perfiles_profe; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.perfiles_profe ENABLE ROW LEVEL SECURITY;

--
-- Name: perfiles_profe perfiles_profe: el profe crea el suyo; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "perfiles_profe: el profe crea el suyo" ON public.perfiles_profe FOR INSERT TO authenticated WITH CHECK ((((profe_id = auth.uid()) AND public.soy_profe()) OR public.es_admin()));


--
-- Name: perfiles_profe perfiles_profe: el profe edita el suyo; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "perfiles_profe: el profe edita el suyo" ON public.perfiles_profe FOR UPDATE TO authenticated USING ((((profe_id = auth.uid()) AND public.soy_profe()) OR public.es_admin())) WITH CHECK ((((profe_id = auth.uid()) AND public.soy_profe()) OR public.es_admin()));


--
-- Name: perfiles_profe perfiles_profe: el profe y el Admin lo ven; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "perfiles_profe: el profe y el Admin lo ven" ON public.perfiles_profe FOR SELECT TO authenticated USING (((profe_id = auth.uid()) OR public.es_admin()));


--
-- Name: perfiles_profe perfiles_profe: solo el Admin borra; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "perfiles_profe: solo el Admin borra" ON public.perfiles_profe FOR DELETE TO authenticated USING (public.es_admin());


--
-- Name: planes; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.planes ENABLE ROW LEVEL SECURITY;

--
-- Name: planes planes: el Admin, los del espacio y quien lo tiene; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "planes: el Admin, los del espacio y quien lo tiene" ON public.planes FOR SELECT TO authenticated USING ((public.es_admin() OR (public.mi_rol_en_espacio(espacio_id) IS NOT NULL) OR (id = ( SELECT p.plan
   FROM public.perfiles p
  WHERE (p.id = auth.uid())))));


--
-- Name: planes planes: solo el Admin los cambia; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "planes: solo el Admin los cambia" ON public.planes FOR UPDATE TO authenticated USING (public.es_admin()) WITH CHECK (public.es_admin());


--
-- Name: planes planes: solo el Admin los crea; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "planes: solo el Admin los crea" ON public.planes FOR INSERT TO authenticated WITH CHECK (public.es_admin());


--
-- Name: planes_drey; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.planes_drey ENABLE ROW LEVEL SECURITY;

--
-- Name: planes_drey planes_drey: el Admin los cambia; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "planes_drey: el Admin los cambia" ON public.planes_drey FOR UPDATE TO authenticated USING (public.es_admin()) WITH CHECK (public.es_admin());


--
-- Name: planes_drey planes_drey: el Admin los crea; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "planes_drey: el Admin los crea" ON public.planes_drey FOR INSERT TO authenticated WITH CHECK (public.es_admin());


--
-- Name: planes_drey planes_drey: el Admin ve todos; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "planes_drey: el Admin ve todos" ON public.planes_drey FOR SELECT TO authenticated USING (public.es_admin());


--
-- Name: planes_drey planes_drey: se ven los visibles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "planes_drey: se ven los visibles" ON public.planes_drey FOR SELECT TO anon, authenticated USING (activo);


--
-- Name: plantilla_ejercicios; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.plantilla_ejercicios ENABLE ROW LEVEL SECURITY;

--
-- Name: plantilla_ejercicios plantilla_ejercicios: el profe borra los suyos; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "plantilla_ejercicios: el profe borra los suyos" ON public.plantilla_ejercicios FOR DELETE TO authenticated USING (public.puede_editar_plantilla(plantilla_id));


--
-- Name: plantilla_ejercicios plantilla_ejercicios: el profe crea los suyos; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "plantilla_ejercicios: el profe crea los suyos" ON public.plantilla_ejercicios FOR INSERT TO authenticated WITH CHECK (public.puede_editar_plantilla(plantilla_id));


--
-- Name: plantilla_ejercicios plantilla_ejercicios: el profe edita los suyos; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "plantilla_ejercicios: el profe edita los suyos" ON public.plantilla_ejercicios FOR UPDATE TO authenticated USING (public.puede_editar_plantilla(plantilla_id)) WITH CHECK (public.puede_editar_plantilla(plantilla_id));


--
-- Name: plantilla_ejercicios plantilla_ejercicios: el profe ve los suyos; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "plantilla_ejercicios: el profe ve los suyos" ON public.plantilla_ejercicios FOR SELECT TO authenticated USING (public.puede_ver_plantilla(plantilla_id));


--
-- Name: plantillas; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.plantillas ENABLE ROW LEVEL SECURITY;

--
-- Name: plantillas plantillas: el profe borra las suyas; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "plantillas: el profe borra las suyas" ON public.plantillas FOR DELETE TO authenticated USING (public.puede_editar_plantilla(id));


--
-- Name: plantillas plantillas: el profe crea las suyas; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "plantillas: el profe crea las suyas" ON public.plantillas FOR INSERT TO authenticated WITH CHECK ((public.es_profe() AND ((profe_id = auth.uid()) OR public.es_admin())));


--
-- Name: plantillas plantillas: el profe edita las suyas; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "plantillas: el profe edita las suyas" ON public.plantillas FOR UPDATE TO authenticated USING (public.puede_editar_plantilla(id)) WITH CHECK (public.es_profe());


--
-- Name: plantillas plantillas: el profe ve las suyas; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "plantillas: el profe ve las suyas" ON public.plantillas FOR SELECT TO authenticated USING (public.puede_ver_plantilla(id));


--
-- Name: push_suscripciones push: cada uno actualiza los suyos; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "push: cada uno actualiza los suyos" ON public.push_suscripciones FOR UPDATE TO authenticated USING ((usuario_id = auth.uid())) WITH CHECK ((usuario_id = auth.uid()));


--
-- Name: push_suscripciones push: cada uno agrega los suyos; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "push: cada uno agrega los suyos" ON public.push_suscripciones FOR INSERT TO authenticated WITH CHECK ((usuario_id = auth.uid()));


--
-- Name: push_suscripciones push: cada uno borra los suyos; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "push: cada uno borra los suyos" ON public.push_suscripciones FOR DELETE TO authenticated USING ((usuario_id = auth.uid()));


--
-- Name: push_suscripciones push: cada uno ve los suyos; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "push: cada uno ve los suyos" ON public.push_suscripciones FOR SELECT TO authenticated USING ((usuario_id = auth.uid()));


--
-- Name: push_suscripciones; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.push_suscripciones ENABLE ROW LEVEL SECURITY;

--
-- Name: resumenes_progreso resumenes: el profe del cliente los borra; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "resumenes: el profe del cliente los borra" ON public.resumenes_progreso FOR DELETE TO authenticated USING (public.puede_ver_cliente(cliente_id));


--
-- Name: resumenes_progreso resumenes: el profe del cliente los crea; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "resumenes: el profe del cliente los crea" ON public.resumenes_progreso FOR INSERT TO authenticated WITH CHECK (public.puede_ver_cliente(cliente_id));


--
-- Name: resumenes_progreso resumenes: el profe del cliente los edita; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "resumenes: el profe del cliente los edita" ON public.resumenes_progreso FOR UPDATE TO authenticated USING (public.puede_ver_cliente(cliente_id)) WITH CHECK (public.puede_ver_cliente(cliente_id));


--
-- Name: resumenes_progreso resumenes: el profe del cliente o el cliente si está publicado; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "resumenes: el profe del cliente o el cliente si está publicado" ON public.resumenes_progreso FOR SELECT TO authenticated USING ((public.puede_ver_cliente(cliente_id) OR ((cliente_id = auth.uid()) AND (estado = 'publicado'::text))));


--
-- Name: resumenes_progreso; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.resumenes_progreso ENABLE ROW LEVEL SECURITY;

--
-- Name: rutina_ejercicios; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.rutina_ejercicios ENABLE ROW LEVEL SECURITY;

--
-- Name: rutina_ejercicios rutina_ejercicios: el cliente ve los de sus rutinas; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "rutina_ejercicios: el cliente ve los de sus rutinas" ON public.rutina_ejercicios FOR SELECT TO authenticated USING ((( SELECT public.acceso_vigente(auth.uid()) AS acceso_vigente) AND (EXISTS ( SELECT 1
   FROM public.rutinas r
  WHERE ((r.id = rutina_ejercicios.rutina_id) AND (r.cliente_id = auth.uid()) AND r.publicada)))));


--
-- Name: rutina_ejercicios rutina_ejercicios: el profe del cliente los borra; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "rutina_ejercicios: el profe del cliente los borra" ON public.rutina_ejercicios FOR DELETE TO authenticated USING (public.puede_ver_rutina(rutina_id));


--
-- Name: rutina_ejercicios rutina_ejercicios: el profe del cliente los crea; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "rutina_ejercicios: el profe del cliente los crea" ON public.rutina_ejercicios FOR INSERT TO authenticated WITH CHECK (public.puede_ver_rutina(rutina_id));


--
-- Name: rutina_ejercicios rutina_ejercicios: el profe del cliente los edita; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "rutina_ejercicios: el profe del cliente los edita" ON public.rutina_ejercicios FOR UPDATE TO authenticated USING (public.puede_ver_rutina(rutina_id)) WITH CHECK (public.puede_ver_rutina(rutina_id));


--
-- Name: rutina_ejercicios rutina_ejercicios: el profe del cliente los ve; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "rutina_ejercicios: el profe del cliente los ve" ON public.rutina_ejercicios FOR SELECT TO authenticated USING (public.puede_ver_rutina(rutina_id));


--
-- Name: rutinas; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.rutinas ENABLE ROW LEVEL SECURITY;

--
-- Name: rutinas rutinas: el cliente ve las suyas guardadas; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "rutinas: el cliente ve las suyas guardadas" ON public.rutinas FOR SELECT TO authenticated USING (((cliente_id = auth.uid()) AND publicada AND ( SELECT public.acceso_vigente(auth.uid()) AS acceso_vigente)));


--
-- Name: rutinas rutinas: el profe del cliente las borra; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "rutinas: el profe del cliente las borra" ON public.rutinas FOR DELETE TO authenticated USING (public.puede_ver_cliente(cliente_id));


--
-- Name: rutinas rutinas: el profe del cliente las crea; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "rutinas: el profe del cliente las crea" ON public.rutinas FOR INSERT TO authenticated WITH CHECK (public.puede_ver_cliente(cliente_id));


--
-- Name: rutinas rutinas: el profe del cliente las edita; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "rutinas: el profe del cliente las edita" ON public.rutinas FOR UPDATE TO authenticated USING (public.puede_ver_cliente(cliente_id)) WITH CHECK (public.puede_ver_cliente(cliente_id));


--
-- Name: rutinas rutinas: el profe del cliente las ve; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "rutinas: el profe del cliente las ve" ON public.rutinas FOR SELECT TO authenticated USING (public.puede_ver_cliente(cliente_id));


--
-- Name: sesiones; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.sesiones ENABLE ROW LEVEL SECURITY;

--
-- Name: sesiones sesiones: el cliente o su profe las borran; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "sesiones: el cliente o su profe las borran" ON public.sesiones FOR DELETE TO authenticated USING (((cliente_id = auth.uid()) OR public.puede_ver_cliente(cliente_id)));


--
-- Name: sesiones sesiones: el cliente o su profe las corrigen; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "sesiones: el cliente o su profe las corrigen" ON public.sesiones FOR UPDATE TO authenticated USING (((cliente_id = auth.uid()) OR public.puede_ver_cliente(cliente_id))) WITH CHECK (((cliente_id = auth.uid()) OR public.puede_ver_cliente(cliente_id)));


--
-- Name: sesiones sesiones: el cliente o su profe las ven; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "sesiones: el cliente o su profe las ven" ON public.sesiones FOR SELECT TO authenticated USING (((cliente_id = auth.uid()) OR public.puede_ver_cliente(cliente_id)));


--
-- Name: sesiones sesiones: el cliente registra las suyas; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "sesiones: el cliente registra las suyas" ON public.sesiones FOR INSERT TO authenticated WITH CHECK ((cliente_id = auth.uid()));


--
-- Name: solicitudes_profe solicitudes: las ven el alumno, el profe y el Admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "solicitudes: las ven el alumno, el profe y el Admin" ON public.solicitudes_profe FOR SELECT TO authenticated USING (((cliente_id = auth.uid()) OR (profe_id = auth.uid()) OR public.es_admin()));


--
-- Name: solicitudes_membresia; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.solicitudes_membresia ENABLE ROW LEVEL SECURITY;

--
-- Name: solicitudes_membresia solicitudes_membresia: quién las ve; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "solicitudes_membresia: quién las ve" ON public.solicitudes_membresia FOR SELECT TO authenticated USING ((public.es_admin() OR (profe_id = auth.uid()) OR (public.mi_rol_en_espacio(espacio_id) = 'dueno'::text)));


--
-- Name: solicitudes_profe; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.solicitudes_profe ENABLE ROW LEVEL SECURITY;

--
-- Name: tipos_aviso; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.tipos_aviso ENABLE ROW LEVEL SECURITY;

--
-- Name: tipos_aviso tipos_aviso: solo el Admin; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "tipos_aviso: solo el Admin" ON public.tipos_aviso FOR SELECT TO authenticated USING (public.es_admin());


--
-- Name: SCHEMA public; Type: ACL; Schema: -; Owner: -
--

GRANT USAGE ON SCHEMA public TO anon;
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT USAGE ON SCHEMA public TO service_role;


--
-- Name: FUNCTION acceso_vigente(p_usuario uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.acceso_vigente(p_usuario uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.acceso_vigente(p_usuario uuid) TO authenticated;


--
-- Name: FUNCTION aceptar_terminos(p_version text, p_salud boolean); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.aceptar_terminos(p_version text, p_salud boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION public.aceptar_terminos(p_version text, p_salud boolean) TO authenticated;


--
-- Name: FUNCTION actividad_clientes(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.actividad_clientes() FROM PUBLIC;
GRANT ALL ON FUNCTION public.actividad_clientes() TO authenticated;


--
-- Name: FUNCTION alumno_bloqueado_por_espacio(p_usuario uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.alumno_bloqueado_por_espacio(p_usuario uuid) FROM PUBLIC;


--
-- Name: FUNCTION alumnos_entrenan_hasta(p_espacio uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.alumnos_entrenan_hasta(p_espacio uuid) FROM PUBLIC;


--
-- Name: FUNCTION anotar_codigo_equivocado(p_codigo text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.anotar_codigo_equivocado(p_codigo text) FROM PUBLIC;


--
-- Name: FUNCTION anotar_historial(p_tipo text, p_detalle text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.anotar_historial(p_tipo text, p_detalle text) FROM PUBLIC;


--
-- Name: FUNCTION avisar(p_tipo text, p_usuario uuid, p_vars jsonb, p_clave text, p_enviar_desde timestamp with time zone); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.avisar(p_tipo text, p_usuario uuid, p_vars jsonb, p_clave text, p_enviar_desde timestamp with time zone) FROM PUBLIC;


--
-- Name: FUNCTION avisar_admins(p_tipo text, p_vars jsonb, p_clave text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.avisar_admins(p_tipo text, p_vars jsonb, p_clave text) FROM PUBLIC;


--
-- Name: FUNCTION avisar_duenos(p_tipo text, p_espacio uuid, p_vars jsonb, p_clave text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.avisar_duenos(p_tipo text, p_espacio uuid, p_vars jsonb, p_clave text) FROM PUBLIC;


--
-- Name: FUNCTION avisar_pago_drey(p_espacio uuid, p_comprobante text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.avisar_pago_drey(p_espacio uuid, p_comprobante text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.avisar_pago_drey(p_espacio uuid, p_comprobante text) TO authenticated;


--
-- Name: FUNCTION avisar_profes(p_tipo text, p_cliente uuid, p_profe uuid, p_vars jsonb, p_clave text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.avisar_profes(p_tipo text, p_cliente uuid, p_profe uuid, p_vars jsonb, p_clave text) FROM PUBLIC;


--
-- Name: FUNCTION aviso_rutina_editada(p_rutina uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.aviso_rutina_editada(p_rutina uuid) FROM PUBLIC;


--
-- Name: FUNCTION avisos_listos_para_enviar(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.avisos_listos_para_enviar() FROM PUBLIC;


--
-- Name: FUNCTION buscar_codigo_valido(p_codigo text, p_plan text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.buscar_codigo_valido(p_codigo text, p_plan text) FROM PUBLIC;


--
-- Name: FUNCTION buscar_cuenta_por_email(p_email text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.buscar_cuenta_por_email(p_email text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.buscar_cuenta_por_email(p_email text) TO authenticated;


--
-- Name: FUNCTION buscar_espacio_por_codigo(p_codigo text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.buscar_espacio_por_codigo(p_codigo text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.buscar_espacio_por_codigo(p_codigo text) TO anon;
GRANT ALL ON FUNCTION public.buscar_espacio_por_codigo(p_codigo text) TO authenticated;


--
-- Name: FUNCTION calcular_precio(p_cliente uuid, p_codigo text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.calcular_precio(p_cliente uuid, p_codigo text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.calcular_precio(p_cliente uuid, p_codigo text) TO service_role;


--
-- Name: FUNCTION cambiar_codigo_espacio(p_espacio uuid, p_codigo text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.cambiar_codigo_espacio(p_espacio uuid, p_codigo text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.cambiar_codigo_espacio(p_espacio uuid, p_codigo text) TO authenticated;


--
-- Name: FUNCTION cambiar_profes_habilitan(p_espacio uuid, p_valor boolean); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.cambiar_profes_habilitan(p_espacio uuid, p_valor boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION public.cambiar_profes_habilitan(p_espacio uuid, p_valor boolean) TO authenticated;


--
-- Name: FUNCTION cancelar_aviso_descanso(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.cancelar_aviso_descanso() FROM PUBLIC;
GRANT ALL ON FUNCTION public.cancelar_aviso_descanso() TO authenticated;


--
-- Name: FUNCTION cancelar_invitacion(p_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.cancelar_invitacion(p_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.cancelar_invitacion(p_id uuid) TO authenticated;


--
-- Name: FUNCTION cancelar_solicitud_membresia(p_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.cancelar_solicitud_membresia(p_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.cancelar_solicitud_membresia(p_id uuid) TO authenticated;


--
-- Name: FUNCTION cancelar_solicitud_profe(p_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.cancelar_solicitud_profe(p_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.cancelar_solicitud_profe(p_id uuid) TO authenticated;


--
-- Name: FUNCTION codigo_disponible(p_codigo text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.codigo_disponible(p_codigo text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.codigo_disponible(p_codigo text) TO anon;
GRANT ALL ON FUNCTION public.codigo_disponible(p_codigo text) TO authenticated;


--
-- Name: FUNCTION codigo_libre(p_base text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.codigo_libre(p_base text) FROM PUBLIC;


--
-- Name: FUNCTION convertir_en_admin(p_email text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.convertir_en_admin(p_email text) FROM PUBLIC;


--
-- Name: FUNCTION crear_espacio(p_tipo text, p_nombre text, p_profe uuid, p_gimnasio uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.crear_espacio(p_tipo text, p_nombre text, p_profe uuid, p_gimnasio uuid) FROM PUBLIC;


--
-- Name: FUNCTION cupos_de(p_espacio uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.cupos_de(p_espacio uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.cupos_de(p_espacio uuid) TO authenticated;


--
-- Name: FUNCTION cupos_totales(p_espacio uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.cupos_totales(p_espacio uuid) FROM PUBLIC;


--
-- Name: FUNCTION cupos_usados(p_espacio uuid, p_sin uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.cupos_usados(p_espacio uuid, p_sin uuid) FROM PUBLIC;


--
-- Name: FUNCTION dar_de_baja_alumno(p_cliente uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.dar_de_baja_alumno(p_cliente uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.dar_de_baja_alumno(p_cliente uuid) TO authenticated;


--
-- Name: FUNCTION datos_cobro_de_espacio(p_codigo text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.datos_cobro_de_espacio(p_codigo text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.datos_cobro_de_espacio(p_codigo text) TO anon;
GRANT ALL ON FUNCTION public.datos_cobro_de_espacio(p_codigo text) TO authenticated;


--
-- Name: FUNCTION destinatarios_de_profe(p_tipo text, p_cliente uuid, p_profe uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.destinatarios_de_profe(p_tipo text, p_cliente uuid, p_profe uuid) FROM PUBLIC;


--
-- Name: FUNCTION dias_alumnos_de_espacio(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.dias_alumnos_de_espacio() FROM PUBLIC;


--
-- Name: FUNCTION disparar_envio_de_avisos(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.disparar_envio_de_avisos() FROM PUBLIC;


--
-- Name: FUNCTION elegir_espacio(p_espacio uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.elegir_espacio(p_espacio uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.elegir_espacio(p_espacio uuid) TO authenticated;


--
-- Name: FUNCTION elegir_plan_drey(p_espacio uuid, p_plan text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.elegir_plan_drey(p_espacio uuid, p_plan text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.elegir_plan_drey(p_espacio uuid, p_plan text) TO authenticated;


--
-- Name: FUNCTION encolar_aviso(p_usuario uuid, p_tipo text, p_titulo text, p_cuerpo text, p_url text, p_clave text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.encolar_aviso(p_usuario uuid, p_tipo text, p_titulo text, p_cuerpo text, p_url text, p_clave text) FROM PUBLIC;


--
-- Name: FUNCTION encolar_aviso_en(p_usuario uuid, p_tipo text, p_titulo text, p_cuerpo text, p_url text, p_clave text, p_enviar_desde timestamp with time zone); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.encolar_aviso_en(p_usuario uuid, p_tipo text, p_titulo text, p_cuerpo text, p_url text, p_clave text, p_enviar_desde timestamp with time zone) FROM PUBLIC;


--
-- Name: FUNCTION equipo_de_espacio(p_espacio uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.equipo_de_espacio(p_espacio uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.equipo_de_espacio(p_espacio uuid) TO authenticated;


--
-- Name: FUNCTION es_admin(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.es_admin() FROM PUBLIC;
GRANT ALL ON FUNCTION public.es_admin() TO authenticated;


--
-- Name: FUNCTION es_profe(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.es_profe() TO anon;
GRANT ALL ON FUNCTION public.es_profe() TO authenticated;


--
-- Name: FUNCTION espacio_que_corresponde(p_actual uuid, p_profe uuid, p_gimnasio uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.espacio_que_corresponde(p_actual uuid, p_profe uuid, p_gimnasio uuid) FROM PUBLIC;


--
-- Name: FUNCTION espacio_sin_servicio_desde(p_espacio uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.espacio_sin_servicio_desde(p_espacio uuid) FROM PUBLIC;


--
-- Name: FUNCTION espacios_para_alumnos(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.espacios_para_alumnos() TO anon;
GRANT ALL ON FUNCTION public.espacios_para_alumnos() TO authenticated;


--
-- Name: FUNCTION estado_espacio(p_espacio uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.estado_espacio(p_espacio uuid) FROM PUBLIC;


--
-- Name: FUNCTION fin_de_periodo(p_espacio uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.fin_de_periodo(p_espacio uuid) FROM PUBLIC;


--
-- Name: FUNCTION frenar_si_prueba_demasiados_codigos(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.frenar_si_prueba_demasiados_codigos() FROM PUBLIC;


--
-- Name: FUNCTION generar_avisos_del_dia(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.generar_avisos_del_dia() FROM PUBLIC;


--
-- Name: FUNCTION generar_avisos_programados(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.generar_avisos_programados() FROM PUBLIC;


--
-- Name: FUNCTION guardar_datos_cobro(p_espacio uuid, p_banco text, p_titular text, p_cuenta text, p_moneda text, p_alias text, p_link_mp text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.guardar_datos_cobro(p_espacio uuid, p_banco text, p_titular text, p_cuenta text, p_moneda text, p_alias text, p_link_mp text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.guardar_datos_cobro(p_espacio uuid, p_banco text, p_titular text, p_cuenta text, p_moneda text, p_alias text, p_link_mp text) TO authenticated;


--
-- Name: FUNCTION guardar_mi_recordatorio(p_hora time without time zone); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.guardar_mi_recordatorio(p_hora time without time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION public.guardar_mi_recordatorio(p_hora time without time zone) TO authenticated;


--
-- Name: FUNCTION guardar_pagina_inicio(p_textos jsonb, p_secciones jsonb); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.guardar_pagina_inicio(p_textos jsonb, p_secciones jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.guardar_pagina_inicio(p_textos jsonb, p_secciones jsonb) TO authenticated;


--
-- Name: FUNCTION guardar_plan_espacio(p_espacio uuid, p_id text, p_nombre text, p_descripcion text, p_precio_primer_mes integer, p_precio_mensual integer, p_link_mp text, p_activo boolean); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.guardar_plan_espacio(p_espacio uuid, p_id text, p_nombre text, p_descripcion text, p_precio_primer_mes integer, p_precio_mensual integer, p_link_mp text, p_activo boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION public.guardar_plan_espacio(p_espacio uuid, p_id text, p_nombre text, p_descripcion text, p_precio_primer_mes integer, p_precio_mensual integer, p_link_mp text, p_activo boolean) TO authenticated;


--
-- Name: FUNCTION guardar_suscripcion_push(p_endpoint text, p_p256dh text, p_auth text, p_dispositivo text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.guardar_suscripcion_push(p_endpoint text, p_p256dh text, p_auth text, p_dispositivo text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.guardar_suscripcion_push(p_endpoint text, p_p256dh text, p_auth text, p_dispositivo text) TO authenticated;


--
-- Name: FUNCTION guardar_tipo_aviso(p_clave text, p_activo boolean, p_titulo text, p_cuerpo text, p_hora time without time zone, p_dias integer, p_destino text, p_planes text[]); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.guardar_tipo_aviso(p_clave text, p_activo boolean, p_titulo text, p_cuerpo text, p_hora time without time zone, p_dias integer, p_destino text, p_planes text[]) FROM PUBLIC;
GRANT ALL ON FUNCTION public.guardar_tipo_aviso(p_clave text, p_activo boolean, p_titulo text, p_cuerpo text, p_hora time without time zone, p_dias integer, p_destino text, p_planes text[]) TO authenticated;


--
-- Name: FUNCTION historial_ajustes_drive(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.historial_ajustes_drive() FROM PUBLIC;


--
-- Name: FUNCTION historial_avisos(p_limite integer); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.historial_avisos(p_limite integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.historial_avisos(p_limite integer) TO authenticated;


--
-- Name: FUNCTION historial_ejercicios(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.historial_ejercicios() FROM PUBLIC;


--
-- Name: FUNCTION historial_habilitaciones(p_espacio uuid, p_limite integer); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.historial_habilitaciones(p_espacio uuid, p_limite integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.historial_habilitaciones(p_espacio uuid, p_limite integer) TO authenticated;


--
-- Name: FUNCTION invitar_profe(p_espacio uuid, p_email text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.invitar_profe(p_espacio uuid, p_email text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.invitar_profe(p_espacio uuid, p_email text) TO authenticated;


--
-- Name: FUNCTION limite_intentos_de_codigo(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.limite_intentos_de_codigo() FROM PUBLIC;


--
-- Name: FUNCTION marcar_evaluacion_anual_vista(p_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.marcar_evaluacion_anual_vista(p_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.marcar_evaluacion_anual_vista(p_id uuid) TO authenticated;


--
-- Name: FUNCTION marcar_resumen_visto(p_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.marcar_resumen_visto(p_id uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.marcar_resumen_visto(p_id uuid) TO authenticated;


--
-- Name: FUNCTION mensajes_para_mi(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.mensajes_para_mi() FROM PUBLIC;
GRANT ALL ON FUNCTION public.mensajes_para_mi() TO authenticated;


--
-- Name: FUNCTION mi_acceso(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.mi_acceso() FROM PUBLIC;
GRANT ALL ON FUNCTION public.mi_acceso() TO authenticated;


--
-- Name: FUNCTION mi_cobro(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.mi_cobro() FROM PUBLIC;
GRANT ALL ON FUNCTION public.mi_cobro() TO authenticated;


--
-- Name: FUNCTION mi_email(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.mi_email() FROM PUBLIC;
GRANT ALL ON FUNCTION public.mi_email() TO authenticated;


--
-- Name: FUNCTION mi_profe(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.mi_profe() FROM PUBLIC;
GRANT ALL ON FUNCTION public.mi_profe() TO authenticated;


--
-- Name: FUNCTION mi_recordatorio(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.mi_recordatorio() FROM PUBLIC;
GRANT ALL ON FUNCTION public.mi_recordatorio() TO authenticated;


--
-- Name: FUNCTION mi_rol(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.mi_rol() FROM PUBLIC;
GRANT ALL ON FUNCTION public.mi_rol() TO authenticated;


--
-- Name: FUNCTION mi_rol_en_espacio(p_espacio uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.mi_rol_en_espacio(p_espacio uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.mi_rol_en_espacio(p_espacio uuid) TO authenticated;


--
-- Name: FUNCTION mis_ajustes(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.mis_ajustes() FROM PUBLIC;
GRANT ALL ON FUNCTION public.mis_ajustes() TO anon;
GRANT ALL ON FUNCTION public.mis_ajustes() TO authenticated;


--
-- Name: FUNCTION mis_espacios(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.mis_espacios() FROM PUBLIC;
GRANT ALL ON FUNCTION public.mis_espacios() TO authenticated;


--
-- Name: FUNCTION mis_invitaciones(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.mis_invitaciones() FROM PUBLIC;
GRANT ALL ON FUNCTION public.mis_invitaciones() TO authenticated;


--
-- Name: FUNCTION mis_solicitudes_membresia(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.mis_solicitudes_membresia() FROM PUBLIC;
GRANT ALL ON FUNCTION public.mis_solicitudes_membresia() TO authenticated;


--
-- Name: FUNCTION nombre_de(p_id uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.nombre_de(p_id uuid) FROM PUBLIC;


--
-- Name: FUNCTION nombre_de_espacio(p_espacio uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.nombre_de_espacio(p_espacio uuid) FROM PUBLIC;


--
-- Name: FUNCTION ocupa_cupo(p_estado text, p_vencimiento date, p_cupo_hasta date); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.ocupa_cupo(p_estado text, p_vencimiento date, p_cupo_hasta date) FROM PUBLIC;


--
-- Name: FUNCTION opciones_de_profe(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.opciones_de_profe() FROM PUBLIC;
GRANT ALL ON FUNCTION public.opciones_de_profe() TO anon;
GRANT ALL ON FUNCTION public.opciones_de_profe() TO authenticated;


--
-- Name: FUNCTION pendientes_de_equipo(p_espacio uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.pendientes_de_equipo(p_espacio uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.pendientes_de_equipo(p_espacio uuid) TO authenticated;


--
-- Name: FUNCTION plan_del_espacio(p_plan text, p_espacio uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.plan_del_espacio(p_plan text, p_espacio uuid) FROM PUBLIC;


--
-- Name: FUNCTION planes_de_espacio(p_codigo text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.planes_de_espacio(p_codigo text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.planes_de_espacio(p_codigo text) TO anon;
GRANT ALL ON FUNCTION public.planes_de_espacio(p_codigo text) TO authenticated;


--
-- Name: FUNCTION poner_membresia(p_espacio uuid, p_perfil uuid, p_rol text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.poner_membresia(p_espacio uuid, p_perfil uuid, p_rol text) FROM PUBLIC;


--
-- Name: FUNCTION probar_tipo_aviso(p_clave text, p_titulo text, p_cuerpo text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.probar_tipo_aviso(p_clave text, p_titulo text, p_cuerpo text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.probar_tipo_aviso(p_clave text, p_titulo text, p_cuerpo text) TO authenticated;


--
-- Name: FUNCTION profe_de_confianza(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.profe_de_confianza() FROM PUBLIC;
GRANT ALL ON FUNCTION public.profe_de_confianza() TO authenticated;


--
-- Name: FUNCTION profe_de_mis_gimnasios(p_profe uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.profe_de_mis_gimnasios(p_profe uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.profe_de_mis_gimnasios(p_profe uuid) TO authenticated;


--
-- Name: FUNCTION profes_a_avisar(p_cliente uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.profes_a_avisar(p_cliente uuid) FROM PUBLIC;


--
-- Name: FUNCTION profes_disponibles(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.profes_disponibles() FROM PUBLIC;
GRANT ALL ON FUNCTION public.profes_disponibles() TO anon;
GRANT ALL ON FUNCTION public.profes_disponibles() TO authenticated;


--
-- Name: FUNCTION programar_aviso_descanso(p_segundos integer, p_siguiente text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.programar_aviso_descanso(p_segundos integer, p_siguiente text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.programar_aviso_descanso(p_segundos integer, p_siguiente text) TO authenticated;


--
-- Name: FUNCTION puede_cobrar(p_espacio uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.puede_cobrar(p_espacio uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.puede_cobrar(p_espacio uuid) TO authenticated;


--
-- Name: FUNCTION puede_dar_de_baja(p_cliente uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.puede_dar_de_baja(p_cliente uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.puede_dar_de_baja(p_cliente uuid) TO authenticated;


--
-- Name: FUNCTION puede_editar_plantilla(p_plantilla uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.puede_editar_plantilla(p_plantilla uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.puede_editar_plantilla(p_plantilla uuid) TO authenticated;


--
-- Name: FUNCTION puede_habilitar(p_espacio uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.puede_habilitar(p_espacio uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.puede_habilitar(p_espacio uuid) TO authenticated;


--
-- Name: FUNCTION puede_manejar_codigo(p_tipo text, p_espacio uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.puede_manejar_codigo(p_tipo text, p_espacio uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.puede_manejar_codigo(p_tipo text, p_espacio uuid) TO authenticated;


--
-- Name: FUNCTION puede_ver_cliente(p_cliente uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.puede_ver_cliente(p_cliente uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.puede_ver_cliente(p_cliente uuid) TO authenticated;


--
-- Name: FUNCTION puede_ver_plantilla(p_plantilla uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.puede_ver_plantilla(p_plantilla uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.puede_ver_plantilla(p_plantilla uuid) TO authenticated;


--
-- Name: FUNCTION puede_ver_profe(p_profe uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.puede_ver_profe(p_profe uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.puede_ver_profe(p_profe uuid) TO authenticated;


--
-- Name: FUNCTION puede_ver_rutina(p_rutina uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.puede_ver_rutina(p_rutina uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.puede_ver_rutina(p_rutina uuid) TO authenticated;


--
-- Name: FUNCTION puedo_manejar_equipo(p_espacio uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.puedo_manejar_equipo(p_espacio uuid) FROM PUBLIC;


--
-- Name: FUNCTION quien_prueba_codigos(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.quien_prueba_codigos() FROM PUBLIC;


--
-- Name: FUNCTION quitar_profe_de_espacio(p_espacio uuid, p_profe uuid, p_destino uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.quitar_profe_de_espacio(p_espacio uuid, p_profe uuid, p_destino uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.quitar_profe_de_espacio(p_espacio uuid, p_profe uuid, p_destino uuid) TO authenticated;


--
-- Name: FUNCTION reactivar_alumno(p_cliente uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.reactivar_alumno(p_cliente uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.reactivar_alumno(p_cliente uuid) TO authenticated;


--
-- Name: FUNCTION reclamar_avisos(p_limite integer); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.reclamar_avisos(p_limite integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.reclamar_avisos(p_limite integer) TO service_role;


--
-- Name: FUNCTION registrar_pago_drey(p_espacio uuid, p_monto integer, p_metodo text, p_nota text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.registrar_pago_drey(p_espacio uuid, p_monto integer, p_metodo text, p_nota text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.registrar_pago_drey(p_espacio uuid, p_monto integer, p_metodo text, p_nota text) TO authenticated;


--
-- Name: FUNCTION registrar_pago_manual(p_cliente uuid, p_monto integer, p_espacio uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.registrar_pago_manual(p_cliente uuid, p_monto integer, p_espacio uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.registrar_pago_manual(p_cliente uuid, p_monto integer, p_espacio uuid) TO authenticated;


--
-- Name: FUNCTION rehacer_resumen_al_borrar(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.rehacer_resumen_al_borrar() FROM PUBLIC;


--
-- Name: FUNCTION rehacer_resumen_al_corregir(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.rehacer_resumen_al_corregir() FROM PUBLIC;


--
-- Name: FUNCTION responder_invitacion(p_id uuid, p_aceptar boolean); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.responder_invitacion(p_id uuid, p_aceptar boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION public.responder_invitacion(p_id uuid, p_aceptar boolean) TO authenticated;


--
-- Name: FUNCTION responder_solicitud_membresia(p_id uuid, p_aceptar boolean); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.responder_solicitud_membresia(p_id uuid, p_aceptar boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION public.responder_solicitud_membresia(p_id uuid, p_aceptar boolean) TO authenticated;


--
-- Name: FUNCTION responder_solicitud_profe(p_id uuid, p_aceptar boolean, p_respuesta text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.responder_solicitud_profe(p_id uuid, p_aceptar boolean, p_respuesta text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.responder_solicitud_profe(p_id uuid, p_aceptar boolean, p_respuesta text) TO authenticated;


--
-- Name: FUNCTION resumen_espacio(p_espacio uuid, p_dias_sin_entrenar integer); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.resumen_espacio(p_espacio uuid, p_dias_sin_entrenar integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.resumen_espacio(p_espacio uuid, p_dias_sin_entrenar integer) TO authenticated;


--
-- Name: FUNCTION resumen_espacios(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.resumen_espacios() FROM PUBLIC;
GRANT ALL ON FUNCTION public.resumen_espacios() TO authenticated;


--
-- Name: FUNCTION sacar_del_espacio(p_espacio uuid, p_profe uuid, p_destino uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.sacar_del_espacio(p_espacio uuid, p_profe uuid, p_destino uuid) FROM PUBLIC;


--
-- Name: FUNCTION salir_de_espacio(p_espacio uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.salir_de_espacio(p_espacio uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.salir_de_espacio(p_espacio uuid) TO authenticated;


--
-- Name: FUNCTION solicitar_baja(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.solicitar_baja() FROM PUBLIC;
GRANT ALL ON FUNCTION public.solicitar_baja() TO authenticated;


--
-- Name: FUNCTION solicitar_profe(p_profe uuid, p_mensaje text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.solicitar_profe(p_profe uuid, p_mensaje text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.solicitar_profe(p_profe uuid, p_mensaje text) TO authenticated;


--
-- Name: FUNCTION solicitudes_recibidas(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.solicitudes_recibidas() FROM PUBLIC;
GRANT ALL ON FUNCTION public.solicitudes_recibidas() TO authenticated;


--
-- Name: FUNCTION soy_profe(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.soy_profe() FROM PUBLIC;
GRANT ALL ON FUNCTION public.soy_profe() TO authenticated;


--
-- Name: FUNCTION sumar_profe_al_espacio(p_espacio uuid, p_profe uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.sumar_profe_al_espacio(p_espacio uuid, p_profe uuid) FROM PUBLIC;


--
-- Name: FUNCTION tablero_espacio(p_espacio uuid, p_dias_sin_venir integer); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.tablero_espacio(p_espacio uuid, p_dias_sin_venir integer) FROM PUBLIC;
GRANT ALL ON FUNCTION public.tablero_espacio(p_espacio uuid, p_dias_sin_venir integer) TO authenticated;


--
-- Name: FUNCTION tarea_de_espacios(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.tarea_de_espacios() FROM PUBLIC;


--
-- Name: FUNCTION tipo_aviso_activo(p_clave text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.tipo_aviso_activo(p_clave text) FROM PUBLIC;


--
-- Name: FUNCTION tipos_de_aviso(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.tipos_de_aviso() FROM PUBLIC;
GRANT ALL ON FUNCTION public.tipos_de_aviso() TO authenticated;


--
-- Name: FUNCTION unirme_a_espacio(p_codigo text, p_mensaje text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.unirme_a_espacio(p_codigo text, p_mensaje text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.unirme_a_espacio(p_codigo text, p_mensaje text) TO authenticated;


--
-- Name: FUNCTION uso_de_ejercicio(p_ejercicio uuid); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.uso_de_ejercicio(p_ejercicio uuid) FROM PUBLIC;
GRANT ALL ON FUNCTION public.uso_de_ejercicio(p_ejercicio uuid) TO authenticated;


--
-- Name: FUNCTION validar_codigo(p_codigo text, p_plan text); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.validar_codigo(p_codigo text, p_plan text) FROM PUBLIC;
GRANT ALL ON FUNCTION public.validar_codigo(p_codigo text, p_plan text) TO anon;
GRANT ALL ON FUNCTION public.validar_codigo(p_codigo text, p_plan text) TO authenticated;


--
-- Name: TABLE ajustes; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,UPDATE ON TABLE public.ajustes TO authenticated;


--
-- Name: TABLE ajustes_drive; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,UPDATE ON TABLE public.ajustes_drive TO authenticated;


--
-- Name: TABLE datos_cobro; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.datos_cobro TO authenticated;


--
-- Name: TABLE espacios; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,DELETE,UPDATE ON TABLE public.espacios TO authenticated;


--
-- Name: TABLE evaluaciones_anuales; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.evaluaciones_anuales TO authenticated;


--
-- Name: TABLE habilitaciones; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.habilitaciones TO authenticated;


--
-- Name: TABLE historial_admin; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.historial_admin TO authenticated;


--
-- Name: TABLE invitaciones; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.invitaciones TO authenticated;


--
-- Name: TABLE membresias; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.membresias TO authenticated;


--
-- Name: TABLE mensajes_profe; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE public.mensajes_profe TO authenticated;


--
-- Name: TABLE pagina_inicio; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.pagina_inicio TO anon;
GRANT SELECT,UPDATE ON TABLE public.pagina_inicio TO authenticated;


--
-- Name: TABLE pagos_drey; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.pagos_drey TO authenticated;


--
-- Name: TABLE planes; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.planes TO anon;
GRANT SELECT,INSERT,UPDATE ON TABLE public.planes TO authenticated;


--
-- Name: TABLE planes_drey; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.planes_drey TO anon;
GRANT SELECT,INSERT,UPDATE ON TABLE public.planes_drey TO authenticated;


--
-- Name: TABLE sesiones; Type: ACL; Schema: public; Owner: -
--

GRANT DELETE,UPDATE ON TABLE public.sesiones TO authenticated;


--
-- Name: TABLE solicitudes_membresia; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.solicitudes_membresia TO authenticated;


--
-- Name: TABLE tipos_aviso; Type: ACL; Schema: public; Owner: -
--

GRANT SELECT ON TABLE public.tipos_aviso TO authenticated;


--
-- PostgreSQL database dump complete
--



-- (Lo que sigue usa las funciones de arriba por su nombre corto.)
set search_path = public, extensions;

-- Registro automático de cada cuenta nueva (SQL 001) ----------------------------
drop trigger if exists on_auth_user_created on auth.users;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Buckets de archivos (fotos, comprobantes...) --------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values ('comprobantes', 'comprobantes', 'f', 10485760, '{image/*,application/pdf}') on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values ('ejercicios-fotos', 'ejercicios-fotos', 't', null, NULL) on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values ('fotos-profes', 'fotos-profes', 't', null, NULL) on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values ('fotos-progreso', 'fotos-progreso', 'f', 10485760, '{image/*}') on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values ('pagina-inicio', 'pagina-inicio', 't', 31457280, '{image/jpeg,image/png,image/webp,video/mp4,video/webm}') on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- Quién puede ver y subir archivos en cada bucket -----------------------------------
drop policy if exists "comprobantes: el Admin los ve todos" on storage.objects;
create policy "comprobantes: el Admin los ve todos" on storage.objects as PERMISSIVE for SELECT to authenticated
  using (((bucket_id = 'comprobantes'::text) AND es_admin()));
drop policy if exists "comprobantes: el dueño o el profe lo ven" on storage.objects;
create policy "comprobantes: el dueño o el profe lo ven" on storage.objects as PERMISSIVE for SELECT to authenticated
  using (((bucket_id = 'comprobantes'::text) AND (((storage.foldername(name))[1] = (auth.uid())::text) OR (EXISTS ( SELECT 1
   FROM perfiles c
  WHERE (((c.id)::text = (storage.foldername(objects.name))[1]) AND puede_ver_cliente(c.id)))))));
drop policy if exists "comprobantes: el dueño sube el suyo" on storage.objects;
create policy "comprobantes: el dueño sube el suyo" on storage.objects as PERMISSIVE for INSERT to authenticated
  with check (((bucket_id = 'comprobantes'::text) AND ((storage.foldername(name))[1] = (auth.uid())::text)));
drop policy if exists "ejercicios-fotos: borra quien la subió" on storage.objects;
create policy "ejercicios-fotos: borra quien la subió" on storage.objects as PERMISSIVE for DELETE to authenticated
  using (((bucket_id = 'ejercicios-fotos'::text) AND es_profe() AND ((owner = auth.uid()) OR profe_de_confianza())));
drop policy if exists "ejercicios-fotos: el profe las ve" on storage.objects;
create policy "ejercicios-fotos: el profe las ve" on storage.objects as PERMISSIVE for SELECT to authenticated
  using (((bucket_id = 'ejercicios-fotos'::text) AND es_profe()));
drop policy if exists "ejercicios-fotos: reemplaza quien la subió" on storage.objects;
create policy "ejercicios-fotos: reemplaza quien la subió" on storage.objects as PERMISSIVE for UPDATE to authenticated
  using (((bucket_id = 'ejercicios-fotos'::text) AND es_profe() AND ((owner = auth.uid()) OR profe_de_confianza())))
  with check (((bucket_id = 'ejercicios-fotos'::text) AND es_profe()));
drop policy if exists "ejercicios-fotos: solo el profe sube" on storage.objects;
create policy "ejercicios-fotos: solo el profe sube" on storage.objects as PERMISSIVE for INSERT to authenticated
  with check (((bucket_id = 'ejercicios-fotos'::text) AND es_profe()));
drop policy if exists "fotos-profes: el profe borra la suya" on storage.objects;
create policy "fotos-profes: el profe borra la suya" on storage.objects as PERMISSIVE for DELETE to authenticated
  using (((bucket_id = 'fotos-profes'::text) AND (((storage.foldername(name))[1] = (auth.uid())::text) OR es_admin())));
drop policy if exists "fotos-profes: el profe reemplaza la suya" on storage.objects;
create policy "fotos-profes: el profe reemplaza la suya" on storage.objects as PERMISSIVE for UPDATE to authenticated
  using (((bucket_id = 'fotos-profes'::text) AND (((storage.foldername(name))[1] = (auth.uid())::text) OR es_admin())))
  with check (((bucket_id = 'fotos-profes'::text) AND (((storage.foldername(name))[1] = (auth.uid())::text) OR es_admin())));
drop policy if exists "fotos-profes: el profe sube la suya" on storage.objects;
create policy "fotos-profes: el profe sube la suya" on storage.objects as PERMISSIVE for INSERT to authenticated
  with check (((bucket_id = 'fotos-profes'::text) AND (((storage.foldername(name))[1] = (auth.uid())::text) OR es_admin()) AND es_profe()));
drop policy if exists "fotos-profes: el profe ve la suya" on storage.objects;
create policy "fotos-profes: el profe ve la suya" on storage.objects as PERMISSIVE for SELECT to authenticated
  using (((bucket_id = 'fotos-profes'::text) AND (((storage.foldername(name))[1] = (auth.uid())::text) OR es_admin())));
drop policy if exists "fotos-progreso: el cliente o su profe borran" on storage.objects;
create policy "fotos-progreso: el cliente o su profe borran" on storage.objects as PERMISSIVE for DELETE to authenticated
  using (((bucket_id = 'fotos-progreso'::text) AND (((storage.foldername(name))[1] = (auth.uid())::text) OR (EXISTS ( SELECT 1
   FROM perfiles c
  WHERE (((c.id)::text = (storage.foldername(objects.name))[1]) AND puede_ver_cliente(c.id)))))));
drop policy if exists "fotos-progreso: el cliente o su profe suben" on storage.objects;
create policy "fotos-progreso: el cliente o su profe suben" on storage.objects as PERMISSIVE for INSERT to authenticated
  with check (((bucket_id = 'fotos-progreso'::text) AND (((storage.foldername(name))[1] = (auth.uid())::text) OR (EXISTS ( SELECT 1
   FROM perfiles c
  WHERE (((c.id)::text = (storage.foldername(objects.name))[1]) AND puede_ver_cliente(c.id)))))));
drop policy if exists "fotos-progreso: el cliente o su profe ven" on storage.objects;
create policy "fotos-progreso: el cliente o su profe ven" on storage.objects as PERMISSIVE for SELECT to authenticated
  using (((bucket_id = 'fotos-progreso'::text) AND (((storage.foldername(name))[1] = (auth.uid())::text) OR (EXISTS ( SELECT 1
   FROM perfiles c
  WHERE (((c.id)::text = (storage.foldername(objects.name))[1]) AND puede_ver_cliente(c.id)))))));
drop policy if exists "pagina-inicio: el Admin borra" on storage.objects;
create policy "pagina-inicio: el Admin borra" on storage.objects as PERMISSIVE for DELETE to authenticated
  using (((bucket_id = 'pagina-inicio'::text) AND es_admin()));
drop policy if exists "pagina-inicio: el Admin los ve" on storage.objects;
create policy "pagina-inicio: el Admin los ve" on storage.objects as PERMISSIVE for SELECT to authenticated
  using (((bucket_id = 'pagina-inicio'::text) AND es_admin()));
drop policy if exists "pagina-inicio: el Admin reemplaza" on storage.objects;
create policy "pagina-inicio: el Admin reemplaza" on storage.objects as PERMISSIVE for UPDATE to authenticated
  using (((bucket_id = 'pagina-inicio'::text) AND es_admin()))
  with check (((bucket_id = 'pagina-inicio'::text) AND es_admin()));
drop policy if exists "pagina-inicio: el Admin sube" on storage.objects;
create policy "pagina-inicio: el Admin sube" on storage.objects as PERMISSIVE for INSERT to authenticated
  with check (((bucket_id = 'pagina-inicio'::text) AND es_admin()));

-- Datos iniciales ------------------------------------------------------------------
--
-- PostgreSQL database dump
--


-- Dumped from database version 16.15 (Ubuntu 16.15-0ubuntu0.24.04.1)
-- Dumped by pg_dump version 16.15 (Ubuntu 16.15-0ubuntu0.24.04.1)


--
-- Data for Name: ajustes; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.ajustes (id, transferencia_banco, transferencia_titular, transferencia_cuenta, transferencia_moneda, cobro_automatico, whatsapp_grupo_url, dias_aviso, dias_de_gracia, actualizado_en, prueba_activa, prueba_dias, prueba_cupos, dias_aviso_alumnos_espacio, drey_banco, drey_titular, drey_cuenta, drey_moneda, drey_link_mp, espacios_corte_desde) VALUES (1, NULL, NULL, NULL, NULL, false, NULL, 5, 3, '2026-11-24 21:51:59.810609-03', true, 14, 3, 14, NULL, NULL, NULL, NULL, NULL, '2026-11-24') ON CONFLICT DO NOTHING;


--
-- Data for Name: ajustes_drive; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.ajustes_drive (id, url_script, clave, carpeta_url, actualizado_en) VALUES (1, NULL, NULL, NULL, '2026-11-24 21:51:59.541352-03') ON CONFLICT DO NOTHING;


--
-- Data for Name: ejercicios; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('02d490f8-9e39-460a-a65a-02ce64339f8f', 'Curl femoral sentado', 'Piernas', NULL, '2026-11-24 21:51:58.44469-03', NULL, '{Piernas}', NULL, NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('94e68c6e-41af-49e1-ade7-547c7b7ddd87', 'Hip thrust con barra', 'Glúteos', NULL, '2026-11-24 21:51:58.44469-03', '/ejercicios/fitcron-133.webp', '{Piernas}', 'fitcron-133', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('e9244753-bc87-44a3-a1aa-57fb9e850b50', 'Press Arnold', 'Hombros', NULL, '2026-11-24 21:51:58.44469-03', '/ejercicios/fitcron-350.webp', '{Empuje}', NULL, NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('95c3a534-1c5a-4c08-a63b-b4eea3331ae6', 'Peso muerto convencional', 'Piernas', NULL, '2026-11-24 21:51:58.44469-03', '/ejercicios/fitcron-135.webp', '{Piernas}', NULL, NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('52497a32-6292-43bd-bebc-67abd0c7d7ba', 'Abducción de cadera en máquina', 'Glúteos', NULL, '2026-11-24 21:51:58.44469-03', '/ejercicios/fitcron-159.webp', '{Piernas}', NULL, NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('676df178-47eb-49d4-ae57-e3571b4c5749', 'Rueda abdominal', 'Abdominales', NULL, '2026-11-24 21:51:58.44469-03', '/ejercicios/fitcron-31.webp', '{"Zona media"}', NULL, NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('f829b2dc-15d7-4ae2-af28-961bfe89a823', 'Press unilateral en polea', 'Hombros', NULL, '2026-11-24 21:51:58.44469-03', NULL, '{Empuje}', NULL, NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('ca7f3de8-0174-4934-a297-490513cd42f5', 'Press inclinado con mancuernas', 'Pectorales', NULL, '2026-11-24 21:51:58.44469-03', NULL, '{Empuje}', NULL, NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('4aadc35b-a29a-4e32-86ef-b57513f6661b', 'Remo Pendlay', 'Espalda', NULL, '2026-11-24 21:51:58.44469-03', NULL, '{Tracción}', NULL, NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('e2aea823-d60e-4cd8-b567-72f9ab064192', 'Pull-through en polea', 'Glúteos', NULL, '2026-11-24 21:51:58.44469-03', NULL, '{Piernas}', NULL, NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('d30f6364-4fd7-4c69-9a06-555c439fd8df', 'Sentadilla frontal', 'Piernas', NULL, '2026-11-24 21:51:58.44469-03', NULL, '{Piernas}', NULL, NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('91380988-300a-4914-9013-047ffbf57d70', 'Curl de muñeca', 'Antebrazo', NULL, '2026-11-24 21:51:58.44469-03', NULL, '{Brazos}', NULL, NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('c42dfff7-d91c-48a2-9bc4-e27e914b1c42', 'Press horizontal en máquina', 'Pectorales', NULL, '2026-11-24 21:51:58.44469-03', NULL, '{Empuje}', NULL, NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('b0a92168-6d2c-4c02-9cfc-1ade0dac00bb', 'Pullover en polea', 'Espalda', NULL, '2026-11-24 21:51:58.44469-03', NULL, '{Tracción}', NULL, NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('a11ab456-ca1e-4ad2-961f-4acaa8d9a73c', 'Hack squat', 'Piernas', NULL, '2026-11-24 21:51:58.44469-03', NULL, '{Piernas}', NULL, NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('f4d8aad1-2348-4dd4-9fac-bc309bfdb551', 'Extensión de tríceps por encima de la cabeza', 'Tríceps', NULL, '2026-11-24 21:51:58.44469-03', NULL, '{Empuje,Brazos}', NULL, NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('d7dcaf2f-7311-4641-951f-2a94c7ca9651', 'Crunch en máquina', 'Abdominales', NULL, '2026-11-24 21:51:58.44469-03', NULL, '{"Zona media"}', NULL, NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('8375245b-0307-4bfc-94d3-5224402e59a7', 'Face pull', 'Hombros', NULL, '2026-11-24 21:51:58.44469-03', NULL, '{Empuje}', NULL, NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('4b36825d-664a-4f68-a162-2fa1da15a85f', 'Extensión de muñeca', 'Antebrazo', NULL, '2026-11-24 21:51:58.44469-03', NULL, '{Brazos}', NULL, NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('4731c25d-41b4-4cf0-a4fb-5269ab8e5a76', 'Hip thrust en máquina', 'Glúteos', NULL, '2026-11-24 21:51:58.44469-03', NULL, '{Piernas}', NULL, NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('1432d7ce-cc44-4768-8112-db5ffa7370bd', 'Press en máquina convergente', 'Pectorales', NULL, '2026-11-24 21:51:58.44469-03', NULL, '{Empuje}', NULL, NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('bb99f788-2715-41a4-ab74-4db8a7954b33', 'Press banca plano con barra', 'Pectorales', NULL, '2026-11-24 21:51:58.44469-03', '/ejercicios/fitcron-649.webp', '{Empuje}', NULL, NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('df23b0ab-ef5b-4c39-b199-c7fc14fb6db2', 'Press banca inclinado con barra', 'Pectorales', NULL, '2026-11-24 21:51:58.44469-03', '/ejercicios/fitcron-648.webp', '{Empuje}', NULL, NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('cb7c6a5c-bc88-48b7-abb7-deec9b8cdcde', 'Press banca plano con mancuernas', 'Pectorales', NULL, '2026-11-24 21:51:58.44469-03', '/ejercicios/fitcron-601.webp', '{Empuje}', NULL, NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('40b05966-598c-497e-b62e-9610e863629c', 'Fondos en paralelas inclinados', 'Pectorales', NULL, '2026-11-24 21:51:58.44469-03', '/ejercicios/fitcron-626.webp', '{Empuje}', NULL, NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('96c0d12d-0d89-403d-9b09-bbb7741240ce', 'Pallof press', 'Abdominales', NULL, '2026-11-24 21:51:58.44469-03', NULL, '{"Zona media"}', NULL, NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('49d8792a-92ce-4274-8624-0275824b698d', 'Pike push-up', 'Hombros', NULL, '2026-11-24 21:51:58.44469-03', NULL, '{Empuje}', NULL, NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('d25d38b6-2979-4654-b4d8-cd1975d86ce5', 'Fondos para tríceps', 'Tríceps', NULL, '2026-11-24 21:51:58.44469-03', NULL, '{Empuje,Brazos}', NULL, NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('2fc87ff9-2334-4cc7-b15b-1901ae0a40c8', 'Nordic hamstring curl', 'Piernas', NULL, '2026-11-24 21:51:58.44469-03', NULL, '{Piernas}', NULL, NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('10a9e5b0-bf5f-457d-afbd-db3183175389', 'Encogimientos con mancuernas', 'Espalda', NULL, '2026-11-24 21:51:58.44469-03', '/ejercicios/fitcron-349.webp', '{Tracción}', 'fitcron-349', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('6908970b-7a2c-4633-a986-3e87e504daf2', 'Press militar con barra', 'Hombros', NULL, '2026-11-24 21:51:58.44469-03', '/ejercicios/fitcron-372.webp', '{Empuje}', 'fitcron-372', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('35e10b3c-897b-4095-ae03-764ddd2c48a9', 'Aperturas con mancuernas', 'Pectorales', NULL, '2026-11-24 21:51:58.44469-03', '/ejercicios/fitcron-609.webp', '{Empuje}', 'fitcron-609', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('e16ac0d9-7364-4097-afcb-074c6b58ee36', 'Peso muerto rumano con mancuernas', 'Piernas', NULL, '2026-11-24 21:51:58.44469-03', '/ejercicios/fitcron-122.webp', '{Piernas}', 'fitcron-122', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('1ac72f72-ec82-471d-9f27-cfb215b35b2d', 'Plancha', 'Abdominales', NULL, '2026-11-24 21:51:58.44469-03', '/ejercicios/fitcron-65.webp', '{"Zona media"}', 'fitcron-65', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('2e4fb194-92c5-4493-b1e7-660c4d2780d1', 'Cruce de poleas', 'Pectorales', NULL, '2026-11-24 21:51:58.44469-03', '/ejercicios/fitcron-656.webp', '{Empuje}', 'fitcron-656', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('f64ff969-4e1a-458e-aea6-bb9d34ead929', 'Crunch Inferior en círculos', 'Abdominales', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-1.webp', '{"Zona media"}', 'fitcron-1', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('ef383352-436d-4442-ab23-457d661f2c23', 'Crunch Superior Concentrado Elevado', 'Abdominales', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-2.webp', '{"Zona media"}', 'fitcron-2', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('f4bc0d08-49ee-445a-a8da-6bae7551302c', 'Crunch Cruzado estirado', 'Abdominales', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-3.webp', '{"Zona media"}', 'fitcron-3', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('e1ca673e-da53-4ec3-b10f-544883f4de44', 'Crunch Inferior con flexión y extensión', 'Abdominales', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-4.webp', '{"Zona media"}', 'fitcron-4', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('e521ee88-f35f-41ea-a347-989046ac2f63', 'Crunch Inferior Cruzado', 'Abdominales', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-5.webp', '{"Zona media"}', 'fitcron-5', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('cce5966b-2baf-47aa-b1f0-336411a0a9d5', 'Elevación de Cadera con piernas estiradas v2', 'Abdominales', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-6.webp', '{"Zona media"}', 'fitcron-6', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('f0efa72e-14f9-413e-ad20-419b89e094c3', 'Marcha Horizontal Alterna', 'Abdominales', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-7.webp', '{"Zona media"}', 'fitcron-7', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('55c0bd99-bff9-4fbe-bd35-0e0ccb7f08cc', 'Marcha Horizontal Alterna con palmada', 'Abdominales', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-8.webp', '{"Zona media"}', 'fitcron-8', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('54539eab-5ef8-49fc-baf8-8778a95cfe53', 'Crunch Superior', 'Abdominales', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-9.webp', '{"Zona media"}', 'fitcron-9', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('391b87fe-4c81-4516-b887-ac648c7f84f6', 'Crunch Frog', 'Abdominales', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-10.webp', '{"Zona media"}', 'fitcron-10', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('82a73d55-b051-4079-a3bf-bd16ea1ea696', 'Crunch Inferior sentado', 'Abdominales', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-11.webp', '{"Zona media"}', 'fitcron-11', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('b36b0dd2-e822-4781-acee-2c6c64358184', 'Marcha Horizontal Aislada con pierna extendida', 'Abdominales', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-12.webp', '{"Zona media"}', 'fitcron-12', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('a50b27d7-5429-4d8d-8773-c2dd6dd2d679', 'Crunch Superior Cruzado', 'Abdominales', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-13.webp', '{"Zona media"}', 'fitcron-13', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('3df05d12-7fb9-4bea-83f1-24b84129b6fc', 'Pulse Up', 'Abdominales', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-14.webp', '{"Zona media"}', 'fitcron-14', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('0920135b-5e9c-47d6-8329-6082b25f3d31', 'Crunch Horizontal en Silla Romana', 'Abdominales', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-15.webp', '{"Zona media"}', 'fitcron-15', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('9cdd582b-12c3-4498-a420-453a61d183a4', 'Elevación de Piernas con torsión en soporte', 'Abdominales', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-16.webp', '{"Zona media"}', 'fitcron-16', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('584667d3-8c70-481d-b642-1f1b426a8aee', 'Giros Superiores Sentado con peso', 'Abdominales', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-17.webp', '{"Zona media"}', 'fitcron-17', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('bb6e9ade-ee15-4ce5-b81c-640a21372d21', 'Giros Superiores Sentado', 'Abdominales', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-18.webp', '{"Zona media"}', 'fitcron-18', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('5d0d10f0-a29a-4ac5-b846-4d6cd725a46d', 'Crunch Superior Cruzado Concentrado', 'Abdominales', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-19.webp', '{"Zona media"}', 'fitcron-19', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('293dc9ac-3126-4b56-8197-c565e7f67ac6', 'Roll Reverse Crunch', 'Abdominales', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-20.webp', '{"Zona media"}', 'fitcron-20', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('7c8a97a4-ff91-4286-a058-7c301315be01', 'Crunch Superior Declinado', 'Abdominales', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-21.webp', '{"Zona media"}', 'fitcron-21', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('4a3c240f-3d26-4079-b422-d260117dca47', 'Puente Lateral con Abducción de Cadera', 'Abdominales', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-22.webp', '{"Zona media"}', 'fitcron-22', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('6f446ea3-ce8b-4c1a-a569-bfa2c1c2fb79', 'Crunch en Decúbito Lateral con curl de bíceps', 'Abdominales', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-23.webp', '{"Zona media"}', 'fitcron-23', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('775c7fd2-0fc4-42ef-99bf-a4f929a177c9', 'Crunch Superior Cruzado Concentrado Elevado', 'Abdominales', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-24.webp', '{"Zona media"}', 'fitcron-24', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('a8e0fab6-bf7b-4745-8d91-b02274a5a8b9', 'Half Wipers con piernas estiradas', 'Abdominales', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-25.webp', '{"Zona media"}', 'fitcron-25', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('af6539bc-50d6-4f97-914f-e015795096ab', 'Half Wipers con piernas flexionadas', 'Abdominales', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-26.webp', '{"Zona media"}', 'fitcron-26', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('1783359f-f1d8-43fe-b8f7-06a783257a24', 'Hollow Hold', 'Abdominales', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-27.webp', '{"Zona media"}', 'fitcron-27', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('6b3f8659-213c-4847-9001-5e888a961215', 'Crunch Superior Cruzado Declinado', 'Abdominales', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-28.webp', '{"Zona media"}', 'fitcron-28', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('dbf8132d-64de-4248-bb7b-b9d18c298994', 'Press banca declinado con barra', 'Pectorales', NULL, '2026-11-24 21:51:58.44469-03', '/ejercicios/fitcron-638.webp', '{Empuje}', NULL, NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('c9c3a82f-ae5a-4481-8f35-36bfcfc24fee', 'Elevación de Cadera con piernas estiradas', 'Abdominales', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-29.webp', '{"Zona media"}', 'fitcron-29', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('979b420b-a51b-4abe-95e8-0601e1fc233c', 'Elevación de Cadera con flexión de rodillas v2', 'Abdominales', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-30.webp', '{"Zona media"}', 'fitcron-30', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('b395f6b8-298a-4c56-8d08-98dc392b3f62', 'Wheel Rollout de rodillas', 'Abdominales', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-31.webp', '{"Zona media"}', 'fitcron-31', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('24944a14-7f74-4037-9240-445226c54ce9', 'Wheel Rollout de pie', 'Abdominales', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-32.webp', '{"Zona media"}', 'fitcron-32', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('42a38d3b-168d-41f5-91cd-06f787368915', 'Puente Lateral', 'Abdominales', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-33.webp', '{"Zona media"}', 'fitcron-33', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('b5c7098b-229b-4a68-a401-58147724927f', 'Crunch Inferior sentado en banco', 'Abdominales', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-34.webp', '{"Zona media"}', 'fitcron-34', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('85c3b842-65f3-4659-ab95-cc86cca38b5f', 'Russian Twist', 'Abdominales', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-35.webp', '{"Zona media"}', 'fitcron-35', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('6a7f0893-dcd9-4442-bed0-016a53d810a5', 'Crunch Lateral Horizontal Concentrado', 'Abdominales', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-36.webp', '{"Zona media"}', 'fitcron-36', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('fbd9b950-8ef1-4b32-94a8-bb57f829b94b', 'Elevación de Cadera con flexión de rodillas v1', 'Abdominales', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-37.webp', '{"Zona media"}', 'fitcron-37', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('620ef9c1-3763-4bdb-8bb4-cc31bd753147', 'Janda Sit-up', 'Abdominales', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-38.webp', '{"Zona media"}', 'fitcron-38', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('404096a2-31c1-4dfe-9ddf-99f77be6b360', 'Jackknife Sit-Up', 'Abdominales', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-39.webp', '{"Zona media"}', 'fitcron-39', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('8690fc20-c8ff-447f-928a-c60d36ec76e7', 'Crunch Inferior Inclinado con piernas estiradas', 'Abdominales', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-40.webp', '{"Zona media"}', 'fitcron-40', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('1c39be85-fce6-4d7c-9aef-944e8f46d379', 'Elevación de Cadera con piernas flexionadas', 'Abdominales', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-41.webp', '{"Zona media"}', 'fitcron-41', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('60d2ed2c-61b2-4b75-9554-7a6080909f28', 'Crunch Inferior Cruzado Alterno', 'Abdominales', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-42.webp', '{"Zona media"}', 'fitcron-42', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('1189f325-065a-490f-a822-52d348a19da1', 'Crunch Cruzado', 'Abdominales', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-43.webp', '{"Zona media"}', 'fitcron-43', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('ea92d566-214b-4312-b7b5-e5fd950ef8fa', 'Cocoons', 'Abdominales', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-44.webp', '{"Zona media"}', 'fitcron-44', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('53c77581-bf6f-48b9-9352-a03b0823b74c', 'Crunch Inferior con Rodillas Flexionadas', 'Abdominales', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-45.webp', '{"Zona media"}', 'fitcron-45', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('7ea299fe-4cd3-437b-b764-08b947a8fe2d', 'Crunch Lateral Horizontal Alterno', 'Abdominales', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-46.webp', '{"Zona media"}', 'fitcron-46', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('ac1144e4-ab3d-4848-9651-da793ac1e2d6', 'Crunch Cruzado con piernas elevadas', 'Abdominales', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-47.webp', '{"Zona media"}', 'fitcron-47', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('f3af3124-c84f-4ced-a1fc-4ac464fd1d36', 'Crunch Lateral Inclinado', 'Abdominales', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-48.webp', '{"Zona media"}', 'fitcron-48', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('9a76a390-9cff-4d6c-8c70-5c179ce94d0d', 'Crunch Lateral de pie con Banda', 'Abdominales', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-49.webp', '{"Zona media"}', 'fitcron-49', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('d9d55038-1fc9-4ade-9f0e-5edc83b48622', 'Crunch Inferior en Máquina Smith', 'Abdominales', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-50.webp', '{"Zona media"}', 'fitcron-50', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('a5330e45-b6d2-44fa-84de-5c06cc15c881', 'Crunch Doble Vertical en Máquina', 'Abdominales', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-51.webp', '{"Zona media"}', 'fitcron-51', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('575acde6-4ae5-4e18-a5b4-20bbfc8a4d12', 'Sit Up en Máquina', 'Abdominales', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-52.webp', '{"Zona media"}', 'fitcron-52', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('ae7d293a-de01-4455-ab97-de3733bc7fad', 'Crunch Inferior Horizontal en Máquina', 'Abdominales', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-53.webp', '{"Zona media"}', 'fitcron-53', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('5c56e50e-bcb0-4791-81d8-c5ca57c23a71', 'Crunch Superior Horizontal en Máquina', 'Abdominales', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-54.webp', '{"Zona media"}', 'fitcron-54', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('78a39172-06f1-4b19-8940-71c5c50e3ac7', 'Giros Inferiores de Oblicuos en Máquina', 'Abdominales', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-55.webp', '{"Zona media"}', 'fitcron-55', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('26cc37e7-5d69-4c7b-a177-b500bdfa975d', 'Crunch Superior Vertical Amplio en Máquina', 'Abdominales', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-56.webp', '{"Zona media"}', 'fitcron-56', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('e2e37048-148c-47f3-9d66-0ec6385dac20', 'Crunch Superior Vertical en Máquina', 'Abdominales', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-57.webp', '{"Zona media"}', 'fitcron-57', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('3dd30677-0c92-4649-949f-e11643f9f52b', 'Giros Superiores de Oblicuos en Máquina', 'Abdominales', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-58.webp', '{"Zona media"}', 'fitcron-58', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('821e0893-39b1-4e74-b78d-22b087b97c07', 'Puente Lateral Declinado Aislada', 'Abdominales', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-59.webp', '{"Zona media"}', 'fitcron-59', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('33b6e659-9a01-405d-976f-7f997eec8078', 'Puente Lateral Declinado', 'Abdominales', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-60.webp', '{"Zona media"}', 'fitcron-60', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('86293bde-c783-430c-81de-edd55bb5eec2', 'Plancha Lateral Inclinada', 'Abdominales', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-61.webp', '{"Zona media"}', 'fitcron-61', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('096be452-b58e-4be4-9daf-658779b2b342', 'Crunch en Plancha Lateral', 'Abdominales', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-62.webp', '{"Zona media"}', 'fitcron-62', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('a5af02f7-3123-4ee1-bed1-de7c2955fa55', 'Plancha Lateral', 'Abdominales', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-63.webp', '{"Zona media"}', 'fitcron-63', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('3fcaa51d-ed5b-493d-a8a6-7bbe34c2ce1e', 'Plancha con rodillas', 'Abdominales', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-64.webp', '{"Zona media"}', 'fitcron-64', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('e278d3fd-742f-4d7e-bdfb-11a329b478c7', 'Crunch Lateral en soporte', 'Abdominales', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-66.webp', '{"Zona media"}', 'fitcron-66', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('c7252491-898d-4cce-ad3c-e4613c84f44c', 'Elevación de piernas flexionadas en soporte', 'Abdominales', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-67.webp', '{"Zona media"}', 'fitcron-67', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('a74e44b4-57a5-4763-a17c-82b8f2f4aaff', 'Elevación de piernas estiradas en soporte', 'Abdominales', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-68.webp', '{"Zona media"}', 'fitcron-68', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('96ed30c5-18c4-4df8-99f6-c018518dca92', 'Elevación de piernas alternas Colgado', 'Abdominales', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-69.webp', '{"Zona media"}', 'fitcron-69', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('f31547eb-fe26-491a-9662-63c3bde18deb', 'Elevación de piernas laterales Colgado', 'Abdominales', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-70.webp', '{"Zona media"}', 'fitcron-70', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('7770b5c7-79de-4ccf-a141-001d2acab8f9', 'Elevación de piernas flexionadas Colgado', 'Abdominales', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-71.webp', '{"Zona media"}', 'fitcron-71', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('f580cc09-3f83-403d-9d11-97cdfbde1d26', 'Elevación de piernas estiradas Colgado', 'Abdominales', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-72.webp', '{"Zona media"}', 'fitcron-72', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('b8165452-a08a-4b53-8480-8030cf464e7b', 'Elevación Total Colgado', 'Abdominales', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-73.webp', '{"Zona media"}', 'fitcron-73', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('3e2d40ec-ef44-4ec3-95c9-69c9049734ad', 'Giros de cintura de pie con Banda', 'Abdominales', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-74.webp', '{"Zona media"}', 'fitcron-74', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('abbfd90e-3e56-487b-a8e4-7b586315392e', 'Elevación de piernas con Bandas', 'Abdominales', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-75.webp', '{"Zona media"}', 'fitcron-75', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('ebabae70-59b2-4d03-9c2b-82951b50c554', 'Sit Up con Bandas', 'Abdominales', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-76.webp', '{"Zona media"}', 'fitcron-76', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('ff660399-1266-4377-a65b-a8824d1ad4ee', 'Pliegue completo con Bandas', 'Abdominales', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-77.webp', '{"Zona media"}', 'fitcron-77', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('5055cd4d-a06d-49c7-aff1-642be18124f8', 'Crunch Cruzado con Bandas', 'Abdominales', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-78.webp', '{"Zona media"}', 'fitcron-78', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('6fc5b6bd-724b-4502-b7b7-b2e059a58fa8', 'Crunch Superior de pie con Bandas', 'Abdominales', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-79.webp', '{"Zona media"}', 'fitcron-79', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('3e02af88-2c5e-4c0f-a472-2a8bbda8064c', 'Crunch Diagonal de pie con Bandas', 'Abdominales', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-80.webp', '{"Zona media"}', 'fitcron-80', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('c4d75ea4-dbda-4930-bf54-9798e0d9b6e3', 'Crunch Diagonal de rodillas con Bandas', 'Abdominales', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-81.webp', '{"Zona media"}', 'fitcron-81', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('196c6491-0f45-44d5-98f5-d60590f893ca', 'Crunch Diagonal en Polea', 'Abdominales', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-82.webp', '{"Zona media"}', 'fitcron-82', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('a5d1a07f-3448-4d62-8247-b0a22f2af60a', 'Giros de cintura sentado con Polea', 'Abdominales', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-83.webp', '{"Zona media"}', 'fitcron-83', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('2e5de64d-7c8c-4512-8137-08b931db0839', 'Crunch Lateral de pie en Polea Baja', 'Abdominales', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-84.webp', '{"Zona media"}', 'fitcron-84', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('bf6bdc4c-fdbf-4393-86d5-090beee4de76', 'Elevación de piernas colgado con Polea', 'Abdominales', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-85.webp', '{"Zona media"}', 'fitcron-85', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('84e94c64-65e6-4bf8-bf0e-292a5c18fe0f', 'Crunch Superior de rodillas con Polea', 'Abdominales', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-86.webp', '{"Zona media"}', 'fitcron-86', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('aa93eb1d-930c-4775-be4b-648d6cf1a3cd', 'Crunch Inferior en Polea', 'Abdominales', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-87.webp', '{"Zona media"}', 'fitcron-87', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('4deaff4b-a2ce-4140-9115-77d3cdb6f0a7', 'Pliegue completo entre Poleas', 'Abdominales', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-88.webp', '{"Zona media"}', 'fitcron-88', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('9c255270-f9b1-45aa-b8f6-85a8ba8df9c7', 'Inclinación diagonal en Polea', 'Abdominales', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-89.webp', '{"Zona media"}', 'fitcron-89', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('e005da9c-f042-4056-91c4-57958ccd24ea', 'Crunch Superior de pie con Polea delante', 'Abdominales', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-90.webp', '{"Zona media"}', 'fitcron-90', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('52e5f3a0-4812-4dfb-8aea-aff8fc1ede89', 'Crunch Lateral de pie en Polea Alta', 'Abdominales', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-91.webp', '{"Zona media"}', 'fitcron-91', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('dcb01b49-21f4-4170-8a17-88d12e02d380', 'Crunch Superior sentado con Polea', 'Abdominales', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-92.webp', '{"Zona media"}', 'fitcron-92', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('c7c853b4-0cc2-4d23-8d6e-943fe3def6bf', 'Russian Twist en Fitball con Polea', 'Abdominales', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-93.webp', '{"Zona media"}', 'fitcron-93', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('b9270480-4b99-4373-9759-3eb5f2e1eff5', 'Crunch Lateral con Barra', 'Abdominales', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-94.webp', '{"Zona media"}', 'fitcron-94', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('9f280f3a-186e-454f-994c-736f1f7a5cdd', 'Giros de cintura doblado con Barra', 'Abdominales', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-95.webp', '{"Zona media"}', 'fitcron-95', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('9ae2796f-5015-4ac6-9036-ac1aaa13a8d7', 'Giros de cintura sentado con Barra', 'Abdominales', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-96.webp', '{"Zona media"}', 'fitcron-96', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('4ed41c9a-85db-4baa-a4fa-a179661be1c3', 'Crunch Lateral con Mancuerna', 'Abdominales', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-97.webp', '{"Zona media"}', 'fitcron-97', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('433e6030-ba92-47fb-8558-dc4236ebdff0', 'Russian Twist con Mancuerna', 'Abdominales', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-98.webp', '{"Zona media"}', 'fitcron-98', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('2bc72f0f-5456-4575-abe1-33bef390e54e', 'Abdominales en V con Mancuerna', 'Abdominales', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-99.webp', '{"Zona media"}', 'fitcron-99', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('cc1a60a2-6699-40ce-9313-19ed0475d5e9', 'Puente Lateral con Mancuerna', 'Abdominales', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-100.webp', '{"Zona media"}', 'fitcron-100', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('e01feb1b-66aa-4772-8cb0-e3c6b1fb65af', 'Giros sentado en Fitball', 'Abdominales', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-101.webp', '{"Zona media"}', 'fitcron-101', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('2507f466-c646-40f5-83f1-ce37b92784aa', 'Sit Up en Fitball', 'Abdominales', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-102.webp', '{"Zona media"}', 'fitcron-102', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('b79c75bd-172c-40d0-8caa-02e679b6445a', 'Elevación de piernas en Fitball', 'Abdominales', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-103.webp', '{"Zona media"}', 'fitcron-103', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('56ad1f0a-ff1b-4823-a7fc-98560b44d840', 'Crunch Superior en Fitball', 'Abdominales', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-104.webp', '{"Zona media"}', 'fitcron-104', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('96fa8082-1bbd-4a10-9378-eef2664ef4dd', 'Step Up con Mancuernas', 'Cuádriceps', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-105.webp', '{Piernas}', 'fitcron-105', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('6fb9a5f2-2802-4e8a-91a9-f01342051143', 'Extensión de Gemelo Aislado sentado con Mancuerna', 'Gemelos', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-106.webp', '{Piernas}', 'fitcron-106', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('6369fc19-24b4-4095-b987-f56dd57ebd7b', 'Peso Muerto Rígido con Mancuernas', 'Isquiotibiales', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-107.webp', '{Piernas}', 'fitcron-107', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('925f6c39-d001-4631-8213-f4cef531c33a', 'Extensión de Gemelos de pie con Mancuernas', 'Gemelos', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-108.webp', '{Piernas}', 'fitcron-108', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('742ebc09-643b-42ad-8ca0-b346c6789f52', 'Cuarto de Sentadilla con Mancuernas', 'Cuádriceps', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-109.webp', '{Piernas}', 'fitcron-109', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('237d2849-f302-4d77-9a57-318896a90277', 'Sentadilla a una pierna con Mancuerna', 'Cuádriceps', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-110.webp', '{Piernas}', 'fitcron-110', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('83230f16-f549-431d-b954-77b284546f21', 'Zancada Trasera con Mancuernas', 'Cuádriceps', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-111.webp', '{Piernas}', 'fitcron-111', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('3bbc67c2-92b0-4ea1-b43f-e4fc78706a81', 'Sentadilla Sumo con Mancuerna', 'Cuádriceps', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-112.webp', '{Piernas}', 'fitcron-112', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('453cbb52-d1d3-48a5-801d-3de9cee1dce7', 'Zancada Delantera con Mancuernas', 'Cuádriceps', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-113.webp', '{Piernas}', 'fitcron-113', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('720b3b30-515f-4f66-b9ed-7e52452904a7', 'Peso Muerto con Mancuernas', 'Isquiotibiales', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-114.webp', '{Piernas,Multiarticulares}', 'fitcron-114', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('42c23f0f-a77c-4fc5-bf93-c0315679dad2', 'Media Sentadilla con Mancuernas', 'Cuádriceps', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-115.webp', '{Piernas}', 'fitcron-115', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('f55dfd47-4875-4755-9084-779036a8f00a', 'Zancada Lateral Cruzada con Mancuerna', 'Cuádriceps', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-116.webp', '{Piernas}', 'fitcron-116', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('e3f46a40-360d-4ca1-b86e-7a5e05511082', 'Zancada Lateral con Mancuerna', 'Cuádriceps', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-117.webp', '{Piernas}', 'fitcron-117', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('d4850029-1e2b-4be2-aa70-73f6de98410a', 'Hip Thrust con Mancuerna', 'Glúteos', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-118.webp', '{Piernas}', 'fitcron-118', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('f0d20d24-8aa0-4c8a-a01a-187ee4db3364', 'Sentadilla Asistida con Mancuerna', 'Cuádriceps', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-119.webp', '{Piernas}', 'fitcron-119', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('f7584899-64c8-4c31-b495-7ba3e44420f4', 'Peso Muerto Abierto con Mancuerna', 'Isquiotibiales', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-120.webp', '{Piernas,Multiarticulares}', 'fitcron-120', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('842a5d79-8cc8-4cba-8649-cfc3b46c108a', 'Sentadilla Abierta con Mancuerna', 'Cuádriceps', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-121.webp', '{Piernas}', 'fitcron-121', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('3df4b09f-1dad-41d2-b10e-f24eb5bd9d5a', 'Peso Muerto a una pierna con Mancuernas', 'Isquiotibiales', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-123.webp', '{Piernas}', 'fitcron-123', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('d60c910c-af84-441a-b607-7b426ef61431', 'Zancadas con salto', 'Cuádriceps', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-124.webp', '{Piernas}', 'fitcron-124', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('79cc5b33-d45e-47b6-ac4f-846b832e52cb', 'Sentadilla con Mancuernas', 'Cuádriceps', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-125.webp', '{Piernas}', 'fitcron-125', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('baba4411-9f07-483e-80dc-99bd95b6af58', 'Sentadilla en Pared con Mancuernas', 'Cuádriceps', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-126.webp', '{Piernas}', 'fitcron-126', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('1f2c1aa8-d43f-45ac-95b8-4145df35f56f', 'Sentadilla en zancada inclinada con Mancuernas', 'Cuádriceps', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-127.webp', '{Piernas}', 'fitcron-127', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('01bd8f59-a684-43aa-80a4-5ac2986d9448', 'Sentadilla con salto con Mancuernas', 'Cuádriceps', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-128.webp', '{Piernas}', 'fitcron-128', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('a343301b-0ae3-4cd6-a83e-f958b9d68588', 'Step Up con Barra', 'Cuádriceps', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-129.webp', '{Piernas}', 'fitcron-129', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('3a3588cb-ab64-40ef-8ce3-cc8307aae828', 'Zancada Lateral Cruzada con Barra', 'Cuádriceps', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-130.webp', '{Piernas}', 'fitcron-130', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('d20d036d-178c-4cf5-9bb9-52eb3b35997c', 'Peso Muerto Asistido con Barra', 'Isquiotibiales', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-131.webp', '{Piernas,Multiarticulares}', 'fitcron-131', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('36e5a66a-36df-4b15-a837-144e37f0659f', 'Sentadilla en zancada con Barra', 'Cuádriceps', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-132.webp', '{Piernas}', 'fitcron-132', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('26f16f4d-bcf3-410e-a1e0-eb8c3ff7e0c8', 'Hip Thrust Declinado con Barra', 'Glúteos', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-134.webp', '{Piernas}', 'fitcron-134', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('0f57fd6e-a80e-4d30-a5e2-4f643fac5741', 'Peso Muerto con Barra', 'Isquiotibiales', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-135.webp', '{Piernas,Multiarticulares}', 'fitcron-135', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('d663f22b-91da-4d9d-9de9-1238ca820c10', 'Peso Muerto Sumo con Barra', 'Isquiotibiales', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-136.webp', '{Piernas,Multiarticulares}', 'fitcron-136', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('713122a4-f640-43e3-b8d8-7a156ad79cee', 'Peso Muerto a una pierna con Barra', 'Isquiotibiales', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-137.webp', '{Piernas}', 'fitcron-137', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('c8c9e9c0-1a75-4744-ae54-3efc0ac53e5e', 'Cuarto de Sentadilla con Barra', 'Cuádriceps', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-138.webp', '{Piernas}', 'fitcron-138', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('4d7721a8-a7a9-4e6b-b80d-49e91a1233d2', 'Sentadilla en zancada inclinada con Barra', 'Cuádriceps', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-139.webp', '{Piernas}', 'fitcron-139', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('e150a31a-a681-4572-b504-81b931150f85', 'Zancada Lateral con Barra', 'Cuádriceps', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-140.webp', '{Piernas}', 'fitcron-140', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('40373b34-ffde-4162-b2f6-9dae8f10229d', 'Saltos rodillas en cuclillas con Barra', 'Cuádriceps', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-141.webp', '{Piernas}', 'fitcron-141', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('97a4c326-86aa-4263-a04c-4ae650c8a83e', 'Sentadilla con salto con Barra', 'Cuádriceps', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-142.webp', '{Piernas}', 'fitcron-142', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('55b1f0a7-9eba-49d6-b6d9-c88f33f9f5ec', 'Hip Thrust Aislado con Barra', 'Glúteos', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-143.webp', '{Piernas}', 'fitcron-143', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('3e3559d9-aabf-4a02-8a08-da2fb47ca260', 'Hip Thrust Inclinado con Barra', 'Glúteos', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-144.webp', '{Piernas}', 'fitcron-144', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('6ed73450-d2a0-4cf4-adad-b96a7a57115c', 'Extensión de Cuádriceps con Barra', 'Cuádriceps', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-145.webp', '{Piernas}', 'fitcron-145', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('a6391577-2d32-4113-ba52-f8b75e9c038d', 'Extensión de Gemelos sentado con Barra', 'Gemelos', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-146.webp', '{Piernas}', 'fitcron-146', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('6e86d0cc-6ad2-4a72-bb26-e77d9dcb02d1', 'Sentadilla Sumo con Barra', 'Cuádriceps', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-147.webp', '{Piernas}', 'fitcron-147', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('9a9833b3-5e92-4faa-8d80-55207fecea49', 'Extensión de Gemelos de pie con Barra', 'Gemelos', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-148.webp', '{Piernas}', 'fitcron-148', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('6f5ea3d1-70ca-4732-a5e1-b7605b13d6a1', 'Peso Muerto Rumano con Barra', 'Isquiotibiales', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-149.webp', '{Piernas}', 'fitcron-149', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('a4d53fbf-89ff-4a88-a123-c8d9f228e1a1', 'Zancada Trasera con Barra', 'Cuádriceps', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-150.webp', '{Piernas}', 'fitcron-150', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('f96098c0-38dc-4d94-8832-23e02332608d', 'Sentadilla a una pierna con Barra', 'Cuádriceps', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-151.webp', '{Piernas}', 'fitcron-151', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('0678dbd5-c409-49df-93c3-9ff9fba96983', 'Sentadilla con Barra', 'Cuádriceps', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-152.webp', '{Piernas}', 'fitcron-152', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('f7fb8a41-951f-4302-a6ce-c2b014e8a235', 'Buenos días con Barra', 'Isquiotibiales', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-153.webp', '{Piernas}', 'fitcron-153', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('509770b0-24ea-411f-bb5d-fbbc18e0a8f6', 'Sentadilla Profunda con Barra', 'Cuádriceps', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-154.webp', '{Piernas}', 'fitcron-154', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('10dbfc45-0844-4262-bf7d-e2412ad9df39', 'Media Sentadilla con Barra', 'Cuádriceps', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-155.webp', '{Piernas}', 'fitcron-155', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('2a5051b2-43e1-4f72-aadf-725b38055648', 'Peso Muerto en Punta', 'Isquiotibiales', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-156.webp', '{Piernas,Multiarticulares}', 'fitcron-156', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('cb58f599-a9d1-453c-bcd4-3b031226d13c', 'Sentadilla en Punta', 'Cuádriceps', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-157.webp', '{Piernas}', 'fitcron-157', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('dcf58028-ac70-4953-b813-3a0693ae4759', 'Zancada Trasera en Punta', 'Cuádriceps', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-158.webp', '{Piernas}', 'fitcron-158', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('062c4876-1f09-4991-b380-ee5196be2a5b', 'Aductor Externo en Máquina', 'Abductores', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-159.webp', '{Piernas}', 'fitcron-159', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('4b44c57b-c56c-48af-9347-8ba2d8b6d03e', 'Extensión de Gemelos sentado en Máquina', 'Gemelos', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-160.webp', '{Piernas}', 'fitcron-160', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('15440f28-e393-4676-8189-8fb946ffb5f0', 'Curl Femoral Vertical en Máquina', 'Isquiotibiales', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-161.webp', '{Piernas}', 'fitcron-161', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('1826a27a-45a2-4311-b1c4-7693ec83d68d', 'Curl Femoral Aislado en Máquina', 'Isquiotibiales', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-162.webp', '{Piernas}', 'fitcron-162', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('39b32c64-6927-4c5c-aacc-284e702215a5', 'Sentadilla Sumo Inclinada en Máquina', 'Cuádriceps', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-163.webp', '{Piernas}', 'fitcron-163', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('0c623339-2cf2-49d6-baa0-d5432465d9b9', 'Sentadilla Cerrada Inclinada en Máquina', 'Cuádriceps', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-164.webp', '{Piernas}', 'fitcron-164', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('6431dd71-0144-4d6c-8cdc-b8d5d3d27009', 'Extensión de Gemelos Inclinada en Máquina', 'Gemelos', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-165.webp', '{Piernas}', 'fitcron-165', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('cb706418-eab8-48c3-b44f-f96220a3ff87', 'Extensión de Gemelos en Prensa', 'Gemelos', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-166.webp', '{Piernas}', 'fitcron-166', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('8b84494f-1112-4a82-b20c-b87474647153', 'Extensión de Gemelos Concentrada en Máquina', 'Gemelos', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-167.webp', '{Piernas}', 'fitcron-167', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('75fe03f3-649c-49de-8ff1-7fbbf5b8fb03', 'Prensa Inclinada Cerrada', 'Cuádriceps', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-168.webp', '{Piernas}', 'fitcron-168', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('a03fd2e6-dafd-461f-a5d5-e1a0657d89e1', 'Prensa Inclinada', 'Cuádriceps', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-169.webp', '{Piernas}', 'fitcron-169', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('863d6b46-5aec-4175-bfa6-8f9d83ea58a4', 'Curl Femoral Horizontal en Máquina', 'Isquiotibiales', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-170.webp', '{Piernas}', 'fitcron-170', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('e0a20827-7688-49b8-992b-fc4543dd4150', 'Extensión de Gemelos en Máquina con carga Inferior', 'Gemelos', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-171.webp', '{Piernas}', 'fitcron-171', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('56493566-df70-4720-9872-3ba017876d36', 'Extensión Trasera en Máquina', 'Glúteos', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-172.webp', '{Piernas}', 'fitcron-172', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('617434d9-d669-4430-8309-0d083794685c', 'Extensión Frontal en Máquina', 'Cuádriceps', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-173.webp', '{Piernas}', 'fitcron-173', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('3a90df58-581e-4fd6-9046-e17c6feb78ab', 'Aductor Interno Aislado en Máquina', 'Aductores', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-174.webp', '{Piernas}', 'fitcron-174', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('1772f6ce-6d5e-4f82-91de-1fb26ceb7831', 'Aductor Externo Aislado en Máquina', 'Abductores', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-175.webp', '{Piernas}', 'fitcron-175', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('a97fd1af-a85f-4bc2-814a-25ab1fb6a44c', 'Extensión de Gemelos Declinada en Máquina', 'Gemelos', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-176.webp', '{Piernas}', 'fitcron-176', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('e8d0a97b-1e5c-4d57-9c2e-df86309b0a55', 'Extensión de Gemelos en Máquina con carga Superior', 'Gemelos', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-177.webp', '{Piernas}', 'fitcron-177', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('ec9a843c-02c9-421f-b9bd-00c51599282e', 'Aductor Interno en Máquina', 'Aductores', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-178.webp', '{Piernas}', 'fitcron-178', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('b65bcd4a-d3a1-431b-9064-506aff0bca01', 'Extensión de Cuádriceps en Máquina', 'Cuádriceps', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-179.webp', '{Piernas}', 'fitcron-179', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('22ec020a-3d6e-487c-bd9f-eaeb1e85e82d', 'Sentadilla en Máquina', 'Cuádriceps', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-180.webp', '{Piernas}', 'fitcron-180', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('6d752a11-84d8-4c64-984c-5ea5ebdba25c', 'Remo en Supinación en Máquina Smith', 'Espalda', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-181.webp', '{Tracción}', 'fitcron-181', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('717eca55-6877-4e3f-a856-6e275f3af19c', 'Remo Aislado en Pronación en Máquina Smith', 'Espalda', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-182.webp', '{Tracción}', 'fitcron-182', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('03f1df98-02e6-4c2c-8df5-406c1161e222', 'Hiperextensiones en Máquina', 'Lumbar', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-183.webp', '{"Zona media"}', 'fitcron-183', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('4136b3e9-72c7-402b-9ab4-91909500aa30', 'Curl Femoral Libre', 'Isquiotibiales', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-184.webp', '{Piernas}', 'fitcron-184', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('2070cd04-f5b1-40f1-bb5f-edb2de577721', 'Step Up Lateral', 'Cuádriceps', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-185.webp', '{Piernas}', 'fitcron-185', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('d3132dfd-ff88-4454-8f65-6d4126cd254d', 'Extensión de Gemelos sentado con Mancuerna', 'Gemelos', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-186.webp', '{Piernas}', 'fitcron-186', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('df9428cd-0b3e-4dae-98e3-4528d7895069', 'Extensión de Gemelos de pie', 'Gemelos', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-187.webp', '{Piernas}', 'fitcron-187', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('73d647a4-56c5-42a1-b98d-fb28a2f9c789', 'Sentadilla a una pierna con Banda Delante', 'Cuádriceps', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-188.webp', '{Piernas}', 'fitcron-188', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('9579026d-8ad9-4d2f-b0d5-2e4962c627ec', 'Peso Muerto con Bandas', 'Isquiotibiales', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-189.webp', '{Piernas,Multiarticulares}', 'fitcron-189', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('2c780baf-85e2-4a6e-86e4-e2afa0fd3143', 'Rotación de Cadera Interna con Banda', 'Glúteos', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-190.webp', '{Piernas}', 'fitcron-190', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('950fe167-59ce-44fd-860b-4454f68b1c33', 'Rotación de Cadera Externa con Banda', 'Glúteos', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-191.webp', '{Piernas}', 'fitcron-191', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('119c8945-0999-4ffc-b976-a312abbaf289', 'Extensión de Gemelo Aislado con Banda', 'Gemelos', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-192.webp', '{Piernas}', 'fitcron-192', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('d48d1f68-1aaf-4e8c-b073-e9014818d5a7', 'Extensión de Gemelo Aislado Delantero con Banda', 'Gemelos', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-193.webp', '{Piernas}', 'fitcron-193', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('c187c0a4-343e-422e-a02f-149089db8b71', 'Sentadilla a una pierna con Banda Debajo', 'Cuádriceps', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-194.webp', '{Piernas}', 'fitcron-194', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('34864d3e-8dae-439e-973b-ae5ae5121e8b', 'Sentadilla con Banda', 'Cuádriceps', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-195.webp', '{Piernas}', 'fitcron-195', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('dcfe2396-e7e7-4d2a-8f59-ba8e57950c1d', 'Step Up con Banda', 'Cuádriceps', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-196.webp', '{Piernas}', 'fitcron-196', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('aee0d4e2-6f4f-4cb1-89fc-eaca269bd448', 'Peso Muerto con Banda', 'Isquiotibiales', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-197.webp', '{Piernas,Multiarticulares}', 'fitcron-197', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('a5686f1b-5b9e-4421-a092-37ab19f70d97', 'Rotación de Aductor Interna con Banda', 'Aductores', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-198.webp', '{Piernas}', 'fitcron-198', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('ab187a83-92e0-4074-918f-ccdb018ea528', 'Rotación de Aductor Externa con Banda', 'Aductores', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-199.webp', '{Piernas}', 'fitcron-199', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('8ee0fc9c-7c90-432a-bd35-382746bc03a6', 'Hip Thrust con Banda', 'Glúteos', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-200.webp', '{Piernas}', 'fitcron-200', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('42d1ae9e-50a1-42b3-974e-2bc8e6957cdc', 'Extensión Frontal Aislada con Banda', 'Cuádriceps', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-201.webp', '{Piernas}', 'fitcron-201', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('c820e75f-ef10-4835-81f4-99c9fc22dd7b', 'Extensión de Gemelos con Banda', 'Gemelos', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-202.webp', '{Piernas}', 'fitcron-202', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('9183bf67-b17d-495d-9cf8-78dec8d722d1', 'Extensión de Cuádriceps Aislada con Banda', 'Cuádriceps', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-203.webp', '{Piernas}', 'fitcron-203', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('0ad92882-34a5-4fa6-ba00-9f30cbbe956d', 'Sentadilla Aislada Asistida con Cuerda', 'Cuádriceps', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-204.webp', '{Piernas}', 'fitcron-204', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('3e5a9a24-f99a-4701-aa59-4499865f892e', 'Extensión Trasera Aislada en Polea Baja', 'Glúteos', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-205.webp', '{Piernas}', 'fitcron-205', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('2739e6ac-c644-4dd9-a980-af1f8d34c6b5', 'Peso Muerto en Polea', 'Isquiotibiales', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-206.webp', '{Piernas,Multiarticulares}', 'fitcron-206', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('21344aa1-c2b6-4cd6-aaec-48bd1499a495', 'Extensión de Gemelo Aislado en Polea', 'Gemelos', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-207.webp', '{Piernas}', 'fitcron-207', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('74ef6f38-8371-4096-aac9-376239e13315', 'Extensión de Gemelos en Polea', 'Gemelos', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-208.webp', '{Piernas}', 'fitcron-208', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('1bd89097-6fc1-4a53-8510-0990f35f6e25', 'Curl Femoral Vertical en Polea', 'Isquiotibiales', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-209.webp', '{Piernas}', 'fitcron-209', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('2ac8a4d7-23b9-401b-b7ed-3ab880d0f39c', 'Aductor Externo en Polea', 'Abductores', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-210.webp', '{Piernas}', 'fitcron-210', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('c444fb5e-9a90-4433-a3e3-8731ac66bf52', 'Curl Femoral Libre Asistido con Polea', 'Isquiotibiales', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-211.webp', '{Piernas}', 'fitcron-211', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('51cf2a54-6444-4e81-9977-145451900965', 'Zancada Delantera en Polea', 'Cuádriceps', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-212.webp', '{Piernas}', 'fitcron-212', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('46bb9cba-14b5-4e62-8405-6ecfef601da0', 'Zancada Lateral en Polea', 'Cuádriceps', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-213.webp', '{Piernas}', 'fitcron-213', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('4ec036cd-b15a-431b-b1bc-14d0921d8455', 'Extensión de Glúteos en Polea', 'Glúteos', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-214.webp', '{Piernas}', 'fitcron-214', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('68befa9b-6699-4ede-bf34-0d8624d94c13', 'Zancada Trasera en Polea', 'Cuádriceps', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-215.webp', '{Piernas}', 'fitcron-215', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('0ebde578-d75a-4db9-a47d-158d5ae9a14e', 'Sentadilla con Poleas', 'Cuádriceps', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-216.webp', '{Piernas}', 'fitcron-216', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('9b2e7818-ad5c-4422-b40b-46c6edee5b8a', 'Aductor Interno en Polea Baja', 'Aductores', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-217.webp', '{Piernas}', 'fitcron-217', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('f6297102-bd68-41ea-9296-6bd9c0b5dddb', 'Remo Declinado en Pronación en Polea', 'Espalda', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-218.webp', '{Tracción}', 'fitcron-218', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('830bda6a-ac57-40ed-b5d9-9add680843fe', 'Remo Declinado Neutro en Pronación en Polea', 'Espalda', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-219.webp', '{Tracción}', 'fitcron-219', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('8ae34288-60f3-4ff8-bf54-7e1e7c5cb737', 'Remo Horizontal Cerrado Neutro Amplio en Polea', 'Espalda', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-220.webp', '{Tracción}', 'fitcron-220', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('cd5cfe99-1303-4ca8-a636-b5b7aa8a663b', 'Extensiones Cruzadas en Polea Alta', 'Espalda', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-221.webp', '{Tracción}', 'fitcron-221', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('0a3b3551-cc65-465e-9907-f2dba2ebcea2', 'Serratos con giro en Polea', 'Espalda', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-222.webp', '{Tracción}', 'fitcron-222', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('3b5163e8-008d-440a-8b94-115b83e38597', 'Jalón Cerrado Neutro en Polea Alta', 'Espalda', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-223.webp', '{Tracción}', 'fitcron-223', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('363a48a4-22c0-489a-9b5b-66f89aab6c77', 'Remo Horizontal Cerrado Neutro en Polea', 'Espalda', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-224.webp', '{Tracción}', 'fitcron-224', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('58ff6f36-4359-476f-a835-232235044456', 'Remo Inferior Aislado en Polea Baja', 'Espalda', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-225.webp', '{Tracción}', 'fitcron-225', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('602b7e02-7216-41e4-9a4f-1ecda6869e61', 'Serratos Aislados en Polea', 'Espalda', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-226.webp', '{Tracción}', 'fitcron-226', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('07c47c67-d902-4333-acf9-ce5e81a0533d', 'Remo Superior en Pronación en Polea', 'Espalda', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-227.webp', '{Tracción}', 'fitcron-227', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('c185e169-dc3e-4217-b433-b85e6c573d08', 'Jalón Abierto Doble Neutro en Polea Alta', 'Espalda', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-228.webp', '{Tracción}', 'fitcron-228', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('d6b5035c-18aa-4cd4-913e-ebc6b47ab0af', 'Remo Inferior en Pronación en Polea Baja', 'Espalda', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-229.webp', '{Tracción}', 'fitcron-229', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('46035e49-ec6f-46f6-a687-3e9bc4d91d95', 'Serratos Inclinados con Barra en Polea', 'Espalda', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-230.webp', '{Tracción}', 'fitcron-230', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('7e353b84-cbcd-4f1d-abf8-d83e22f1f150', 'Rotación Vertical Aislada en Polea', 'Espalda', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-231.webp', '{Tracción}', 'fitcron-231', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('07ab0dc1-f3b2-4842-beb9-751e7bcf271a', 'Jalón Abierto Neutro en Polea Alta', 'Espalda', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-232.webp', '{Tracción}', 'fitcron-232', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('2e2b7847-bc1b-412b-b0fc-b0606050e9b2', 'Remo Cruzado en Polea Alta', 'Espalda', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-233.webp', '{Tracción}', 'fitcron-233', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('bcdf0049-a26f-45fd-8f2f-028f8329f0ec', 'Remo Declinado Abierto en Pronación en Polea', 'Espalda', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-234.webp', '{Tracción}', 'fitcron-234', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('e40f8138-0337-47cf-9fc0-6bfb1137f484', 'Remo Superior con Cuerda en Polea', 'Espalda', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-235.webp', '{Tracción}', 'fitcron-235', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('3c738a8a-0c6a-475d-8b3b-155a3fa75136', 'Serratos Inclinados Cerrados con Barra en Polea', 'Espalda', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-236.webp', '{Tracción}', 'fitcron-236', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('3467dbb5-064f-42d6-b42f-50deffdd3094', 'Jalón Cerrado con Cuerda en Polea Alta', 'Espalda', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-237.webp', '{Tracción}', 'fitcron-237', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('18a54e8b-bb70-4d81-bc57-53728f07dc85', 'Remo Horizontal en Pronación en Polea', 'Espalda', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-238.webp', '{Tracción}', 'fitcron-238', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('9c5aea74-3190-464a-8b8b-ec386cea21ec', 'Jalón Aislado Prono-Supino en Polea Alta', 'Espalda', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-239.webp', '{Tracción}', 'fitcron-239', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('0bc89fd0-3fa2-419c-ba9e-19d52e25d1b9', 'Jalón Abierto en Pronación en Polea Alta', 'Espalda', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-240.webp', '{Tracción}', 'fitcron-240', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('7a183319-2550-4ab1-be78-5a959d15f3dc', 'Jalón en Pronación en Polea Alta', 'Espalda', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-241.webp', '{Tracción}', 'fitcron-241', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('75e2e31e-8b35-4371-a7cb-96a40deee6c2', 'Remo Horizontal Superior con Cuerda en Polea', 'Espalda', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-242.webp', '{Tracción}', 'fitcron-242', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('0664276f-9bd7-4d89-b4ad-5fcca5f2280b', 'Jalón Trasero Abierto en Pronación en Polea Alta', 'Espalda', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-243.webp', '{Tracción}', 'fitcron-243', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('b975624e-7756-4578-a50b-9fe9fb974338', 'Jalón en Supinación en Polea Alta', 'Espalda', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-244.webp', '{Tracción}', 'fitcron-244', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('03252b63-7368-45fe-b586-e9698a7121c3', 'Jalón Cerrado Neutro con Inclinación en Polea Alta', 'Espalda', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-245.webp', '{Tracción}', 'fitcron-245', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('f322335b-9eb4-4bbc-a192-7eb84501f1ef', 'Extensión Diagonal en Polea Baja', 'Espalda', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-246.webp', '{Tracción}', 'fitcron-246', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('a0c69ca2-e80e-42ab-ab91-0906eb8f4b3b', 'Serratos Inferiores con Barra en Polea', 'Espalda', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-247.webp', '{Tracción}', 'fitcron-247', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('d3489414-e67d-4b67-a3ce-9300067f3701', 'Jalón Abierto en Supinación en Polea Alta', 'Espalda', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-248.webp', '{Tracción}', 'fitcron-248', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('51617165-0ae9-4b95-9ff6-16d893fc67dd', 'Jalón Cerrado en Pronación en Polea Alta', 'Espalda', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-249.webp', '{Tracción}', 'fitcron-249', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('ead837f1-52fc-4c2e-ad75-70286040b7d2', 'Jalón Aislado Prono-Neutro en Polea Alta', 'Espalda', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-250.webp', '{Tracción}', 'fitcron-250', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('8621ddb5-3e6f-4e5d-b06f-b367178fc09a', 'Serratos con Cuerda en Polea', 'Espalda', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-251.webp', '{Tracción}', 'fitcron-251', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('38afca61-a1d3-494f-a347-ee9774c7806b', 'Remo Horizontal Neutro en Polea', 'Espalda', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-252.webp', '{Tracción}', 'fitcron-252', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('49e14a29-decb-420d-8348-495bf387bbbe', 'Remo Horizontal Abierto en Pronación en Polea', 'Espalda', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-253.webp', '{Tracción}', 'fitcron-253', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('a85a967a-b66d-4b5e-9abb-2969d77dffb8', 'Remo con giro Aislado en Polea Baja', 'Espalda', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-254.webp', '{Tracción}', 'fitcron-254', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('c13029fd-ccbe-48da-849e-f0788efe5b75', 'Remo Horizontal Aislado en Polea', 'Espalda', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-255.webp', '{Tracción}', 'fitcron-255', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('7b5e398e-dd22-4ce0-be15-55426478c539', 'Remo Superior Aislado en Polea', 'Espalda', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-256.webp', '{Tracción}', 'fitcron-256', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('32c17878-9742-4d9b-98df-53a9389c1e3b', 'Remo Horizontal Cerrado en Pronación en Polea', 'Espalda', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-257.webp', '{Tracción}', 'fitcron-257', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('46a17b93-d6a2-4a1e-8b4d-1fb344faf4ff', 'Jalón Aislado en Polea Alta', 'Espalda', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-258.webp', '{Tracción}', 'fitcron-258', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('1186c386-d47b-4370-b408-1dc84fc6b97f', 'Remo Inferior Aislado con Banda', 'Espalda', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-259.webp', '{Tracción}', 'fitcron-259', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('98eecb0e-ba21-4153-a6b1-f01333595404', 'Remo Superior Aislado con Banda', 'Espalda', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-260.webp', '{Tracción}', 'fitcron-260', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('c23d7bcb-fcd5-42e9-89df-1d7820efb07c', 'Remo Horizontal Aislado con Banda', 'Espalda', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-261.webp', '{Tracción}', 'fitcron-261', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('40f1869f-3ccf-4204-aae3-21c722ff325c', 'Jalón en Supinación con Bandas', 'Espalda', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-262.webp', '{Tracción}', 'fitcron-262', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('3cc976cf-dca0-433e-ac12-f40469fd083e', 'Jalón Neutro con Bandas', 'Espalda', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-263.webp', '{Tracción}', 'fitcron-263', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('1a6c5d10-9b6c-4f4e-b3be-3bcafcd8e2e9', 'Remo Declinado Alterno con Bandas', 'Espalda', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-264.webp', '{Tracción}', 'fitcron-264', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('da95aad2-d3b1-468e-97d9-542322f5dfef', 'Remo Horizontal con Bandas', 'Espalda', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-265.webp', '{Tracción}', 'fitcron-265', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('c7c2a522-304b-4851-8ef0-9129f187c768', 'Remo Libre Declinado con Cuerdas', 'Espalda', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-266.webp', '{Tracción}', 'fitcron-266', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('75841980-cc46-4883-ba2a-b3db1bdfb485', 'Remo Libre Horizontal Abierto con Cuerdas', 'Espalda', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-267.webp', '{Tracción}', 'fitcron-267', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('631b0581-c60e-4de8-bd98-d1e8bb3aefe7', 'Remo Inclinado Alterno con Bandas', 'Espalda', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-268.webp', '{Tracción}', 'fitcron-268', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('ac20cf8d-cb85-42a0-aa42-8686314b7657', 'Remo Libre Inclinado Abierto con Cuerda', 'Espalda', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-269.webp', '{Tracción}', 'fitcron-269', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('5b684e0b-cd2c-44d2-af81-2ee3682e0e52', 'Remo Libre Inclinado Cerrado con Cuerda', 'Espalda', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-270.webp', '{Tracción}', 'fitcron-270', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('6f274dba-6146-40ea-8c74-fe79e7ba4cb1', 'Remo Libre Horizontal Cerrado con Cuerda', 'Espalda', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-271.webp', '{Tracción}', 'fitcron-271', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('749a40dd-15f3-401f-b730-c624189534b5', 'Press Militar Neutro Alterno en Polea', 'Hombros', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-272.webp', '{Empuje}', 'fitcron-272', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('d5a71b82-f0b0-4261-aabf-86e5854381b5', 'Elevación Frontal Aislada en Polea', 'Hombros', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-273.webp', '{Empuje}', 'fitcron-273', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('605fef14-9d0d-4d72-be39-7389ff01d278', 'Elevación Frontal en Polea', 'Hombros', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-274.webp', '{Empuje}', 'fitcron-274', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('2d8fd1bb-fdde-4e0d-8eb0-daac531e3ea0', 'Elevación Lateral Aislada en Polea', 'Hombros', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-275.webp', '{Empuje}', 'fitcron-275', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('18cde763-030f-4f39-9e23-bbb700f36934', 'Press Militar en Polea', 'Hombros', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-276.webp', '{Empuje}', 'fitcron-276', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('5174b5e0-703f-4120-b183-800574c307df', 'Encogimientos en Polea', 'Hombros', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-277.webp', '{Empuje,Tracción}', 'fitcron-277', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('546c9ee8-5b9a-47bd-aa5a-975ab7b591e5', 'Rotación Externa Aislada en Polea', 'Hombros', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-278.webp', '{Empuje,Tracción}', 'fitcron-278', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('1e787750-a5e0-4b37-bbc2-39b3915290f0', 'Remo al mentón en Polea', 'Hombros', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-279.webp', '{Empuje,Tracción}', 'fitcron-279', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('75434794-999b-46e3-8b98-7fe57e806a55', 'Rotación Interna Aislada en Polea', 'Hombros', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-280.webp', '{Empuje}', 'fitcron-280', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('04285586-e5f0-4672-9311-a751546ff9bf', 'Elevación Lateral Horizontal en Polea', 'Hombros', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-281.webp', '{Empuje}', 'fitcron-281', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('54831663-43d2-49c3-a170-b74cfd89e919', 'Remo Superior en Polea', 'Hombros', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-282.webp', '{Empuje,Tracción}', 'fitcron-282', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('7f3afe18-e71b-426b-b6df-4ed16ed49507', 'Elevación Lateral Concentrada en Polea', 'Hombros', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-283.webp', '{Empuje}', 'fitcron-283', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('0909dd2c-6150-43c1-b84b-a0e35e625159', 'Pájaros Aislados en Polea', 'Hombros', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-284.webp', '{Empuje,Tracción}', 'fitcron-284', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('3e7380d0-9473-4df7-8560-caa39e58d9af', 'Press Militar Cerrado en Polea', 'Hombros', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-285.webp', '{Empuje}', 'fitcron-285', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('61233c3f-1964-4421-b550-69fe7c24daaa', 'Elevación Frontal Inclinada en Polea', 'Hombros', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-286.webp', '{Empuje}', 'fitcron-286', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('42d43810-9309-443e-a987-f4e116d3544b', 'Remo al mentón Horizontal en Polea', 'Hombros', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-287.webp', '{Empuje,Tracción}', 'fitcron-287', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('0ad1429b-727c-42da-b1b2-b5ff6ebae1eb', 'Encogimientos Horizontales en Polea', 'Hombros', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-288.webp', '{Empuje,Tracción}', 'fitcron-288', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('041e59f7-14fe-4379-8fdd-51a967242aad', 'Elevación Frontal Horizontal en Polea', 'Hombros', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-289.webp', '{Empuje}', 'fitcron-289', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('5f16cf73-7686-43ae-8848-15b096cbf60f', 'Press Militar con Bandas', 'Hombros', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-290.webp', '{Empuje}', 'fitcron-290', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('a4682c85-cfea-4649-8968-c0a809e04fd3', 'Extensiones Laterales Amplias con Banda', 'Hombros', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-291.webp', '{Empuje,Tracción}', 'fitcron-291', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('49f170ec-7a23-495f-bdc0-9f1deb8ca38a', 'Elevaciones Completas con Bandas', 'Hombros', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-292.webp', '{Empuje}', 'fitcron-292', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('13a1713b-8d7d-49ce-9d7d-c532872db21a', 'Encogimientos con Banda', 'Hombros', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-293.webp', '{Empuje,Tracción}', 'fitcron-293', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('c96432bc-8fec-459c-98fe-0ea989bc125e', 'Remo Superior con Bandas', 'Hombros', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-294.webp', '{Empuje,Tracción}', 'fitcron-294', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('c8130d4e-d620-434e-a2a6-4d123b311c5d', 'Elevaciones Laterales con Banda', 'Hombros', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-295.webp', '{Empuje}', 'fitcron-295', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('14775fb6-7764-4747-a873-bb388eeba9ff', 'Remo al mentón con Banda', 'Hombros', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-296.webp', '{Empuje,Tracción}', 'fitcron-296', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('fa034439-e195-40aa-b274-54f1465ef822', 'Elevaciones Frontales con Banda', 'Hombros', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-297.webp', '{Empuje}', 'fitcron-297', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('2e3c39aa-78f3-42dd-8263-91909f95b5d1', 'Extensiones Laterales con Banda', 'Hombros', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-298.webp', '{Empuje,Tracción}', 'fitcron-298', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('f9c5a54e-4a68-479f-8c1b-34db6bb0954c', 'Press Militar Trasero con Bandas', 'Hombros', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-299.webp', '{Empuje}', 'fitcron-299', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('ff16161f-3450-44a4-8427-c51f4bd9e337', 'Press Militar Aislado con Banda', 'Hombros', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-300.webp', '{Empuje}', 'fitcron-300', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('7792852b-fa38-4934-a80c-714e93ff418f', 'Pájaros de pie con Bandas', 'Hombros', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-301.webp', '{Empuje,Tracción}', 'fitcron-301', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('33db955f-8bb9-47f2-a566-f28cc45e6fe6', 'Elevación Lateral Aislada con Banda', 'Hombros', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-302.webp', '{Empuje}', 'fitcron-302', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('c3ef72aa-a455-4bc1-afab-7fe4342160ff', 'Encogimientos en Paralelas', 'Hombros', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-303.webp', '{Empuje,Tracción}', 'fitcron-303', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('cb8a2b96-866d-4ba3-a125-f697b0e20c53', 'Encogimientos Libres en Banco', 'Hombros', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-304.webp', '{Empuje,Tracción}', 'fitcron-304', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('8e5b5667-5628-4ab5-8bc0-897dd8f52511', 'Flexiones Verticales entre Bancos', 'Hombros', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-305.webp', '{Empuje}', 'fitcron-305', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('b0b17b21-ae44-4140-8cbf-31351073dfcf', 'Flexiones Verticales con Banco', 'Hombros', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-306.webp', '{Empuje}', 'fitcron-306', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('2fd705af-730a-4c6b-aeff-771afd172371', 'Press Militar Libre', 'Hombros', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-307.webp', '{Empuje}', 'fitcron-307', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('df79ac06-1c6b-4855-aa15-d87f62d2ebd8', 'Press Militar Libre entre Bancos', 'Hombros', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-308.webp', '{Empuje}', 'fitcron-308', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('1fb87720-e498-49dd-9f00-1b888887dae7', 'Press Militar Declinado en Pronación en Máquina', 'Hombros', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-309.webp', '{Empuje}', 'fitcron-309', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('a8310a94-d7eb-4fbc-afa0-de94b677f6b3', 'Aperturas Traseras Neutras en Máquina', 'Hombros', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-310.webp', '{Empuje,Tracción}', 'fitcron-310', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('ec168cb8-c771-486f-a7b2-aec6c19ae59b', 'Aperturas Traseras en Pronación en Máquina', 'Hombros', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-311.webp', '{Empuje,Tracción}', 'fitcron-311', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('af1f8af3-b965-44ce-a610-42a99c6183cc', 'Press Aislado en Punta', 'Hombros', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-312.webp', '{Empuje}', 'fitcron-312', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('b3463b33-8997-41de-8226-6789277113f7', 'Press Militar Inclinado en Pronación en Máquina', 'Hombros', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-313.webp', '{Empuje}', 'fitcron-313', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('e0f489b2-6469-412f-961d-42c7e6abffdb', 'Encogimientos en Máquina', 'Hombros', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-314.webp', '{Empuje,Tracción}', 'fitcron-314', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('f38fd22b-e674-4da7-b766-dc2caaa3b227', 'Encogimientos Concentrados en Máquina', 'Hombros', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-315.webp', '{Empuje,Tracción}', 'fitcron-315', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('28f0f5cc-a362-4877-b81d-fac0f1908a9b', 'Press Militar Inclinado Neutro en Máquina', 'Hombros', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-316.webp', '{Empuje}', 'fitcron-316', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('b6f08237-b7ec-42af-9f5f-97c6d9967279', 'Press Militar en Pronación en Máquina', 'Hombros', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-317.webp', '{Empuje}', 'fitcron-317', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('0ce16ef1-cba6-4f15-928d-bfbbe9d2755b', 'Press Militar Neutro en Máquina', 'Hombros', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-318.webp', '{Empuje}', 'fitcron-318', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('788b831d-5de5-4a47-94ec-747327c5a0d9', 'Elevación Lateral en Punta', 'Hombros', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-319.webp', '{Empuje}', 'fitcron-319', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('f0d9842a-a618-4d53-ba23-596445b64b42', 'Elevaciones Laterales en Máquina', 'Hombros', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-320.webp', '{Empuje}', 'fitcron-320', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('8d5b22c7-d690-4d9a-afe6-20820a1500a6', 'Press Arnold Abierto con Mancuernas', 'Hombros', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-321.webp', '{Empuje}', 'fitcron-321', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('4eb1568f-1825-4f17-916e-0d5b1c4e06f3', 'Encogimientos Declinados con Mancuernas', 'Hombros', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-322.webp', '{Empuje,Tracción}', 'fitcron-322', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('75deac6e-8a81-4204-aa7a-ec8bd8116fd0', 'Elevación Frontal con Mancuerna', 'Hombros', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-323.webp', '{Empuje}', 'fitcron-323', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('bbcd9a04-1fa5-48b7-87b3-276e99b29b0e', 'Elevaciones Frontales en Pronación con Mancuernas', 'Hombros', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-324.webp', '{Empuje}', 'fitcron-324', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('aaa08faf-b99f-4a42-8775-e87f4e5728b2', 'Elevaciones Laterales en Supinación con Mancuernas', 'Hombros', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-325.webp', '{Empuje}', 'fitcron-325', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('482e3024-f63d-4a6d-bd37-641fe93f8c5a', 'Elevación Lateral Inclinada Aislada con Mancuerna', 'Hombros', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-326.webp', '{Empuje}', 'fitcron-326', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('1374d009-5584-4ec2-94ff-cd47acba8dc1', 'Elevaciones Frontales Inclinadas con giro con Mancuernas', 'Hombros', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-327.webp', '{Empuje}', 'fitcron-327', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('f6c73c4b-0053-4859-ac0f-87313d96d6d9', 'Encogimientos Inclinados con Mancuernas', 'Hombros', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-328.webp', '{Empuje,Tracción}', 'fitcron-328', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('ae581eba-76ce-47d9-855c-8bc11a8c3144', 'Elevación Lateral Horizontal Aislada con Mancuerna', 'Hombros', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-329.webp', '{Empuje}', 'fitcron-329', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('5ba78ad2-8010-4d06-aabe-27ba61407d00', 'Encogimientos Laterales con Mancuernas', 'Hombros', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-330.webp', '{Empuje,Tracción}', 'fitcron-330', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('473f3bbd-14e8-4581-b27b-2f84ff218172', 'Elevaciones Completas con Mancuernas', 'Hombros', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-331.webp', '{Empuje}', 'fitcron-331', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('43ffcec6-8d42-40cd-8f42-e45669d90285', 'Press Militar en Pronación con Mancuernas', 'Hombros', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-332.webp', '{Empuje}', 'fitcron-332', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('a586c359-ebf7-47ce-ba16-b4235c2ffaed', 'Press Militar Neutro con Mancuernas', 'Hombros', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-333.webp', '{Empuje}', 'fitcron-333', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('d6af0fa4-8f9b-46be-9c07-d68daf5036ff', 'Remo al mentón con Mancuernas', 'Hombros', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-334.webp', '{Empuje,Tracción}', 'fitcron-334', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('838b49db-fb00-4f25-aaae-debc204ec48c', 'Press Militar con giro con Mancuernas', 'Hombros', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-335.webp', '{Empuje}', 'fitcron-335', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('99ee00fb-9f42-45c2-8b5e-3566a8a37883', 'Rotación Vertical Aislada con Mancuerna', 'Hombros', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-336.webp', '{Empuje}', 'fitcron-336', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('5a7663cf-0b03-41fe-a36c-3da3664370bd', 'Elevaciones Frontales Inclinadas en Pronación con Mancuernas', 'Hombros', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-337.webp', '{Empuje}', 'fitcron-337', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('cce1dbcb-ae21-4940-b362-eaea107f5884', 'Elevaciones Laterales Declinadas con Mancuernas', 'Hombros', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-338.webp', '{Empuje}', 'fitcron-338', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('97dcbf6b-c593-4cde-ad20-32f358946d68', 'Pájaros Aislados con Mancuerna', 'Hombros', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-339.webp', '{Empuje,Tracción}', 'fitcron-339', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('805115be-68cb-4c6c-baf2-e972bf193665', 'Remo Superior Aislado con Mancuerna', 'Hombros', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-340.webp', '{Empuje,Tracción}', 'fitcron-340', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('2e781576-dffa-426a-b92d-5308d8071dc3', 'Pájaros sentado con Mancuernas', 'Hombros', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-341.webp', '{Empuje,Tracción}', 'fitcron-341', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('34f4fc33-cc40-4b7a-ad6b-2cd7c1a3aa41', 'Pájaros de pie con Mancuernas', 'Hombros', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-342.webp', '{Empuje,Tracción}', 'fitcron-342', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('0229f9cb-61da-477b-83cc-31f79cb40b9b', 'Elevaciones Laterales Declinadas en Pronación con Mancuernas', 'Hombros', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-343.webp', '{Empuje}', 'fitcron-343', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('ab8d0c37-469d-49c2-a3ee-a0499bd66c46', 'Elevaciones Laterales Declinadas Neutras con Mancuernas', 'Hombros', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-344.webp', '{Empuje}', 'fitcron-344', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('5b29e84a-8600-4fcd-8c9f-aeb85226c006', 'Elevaciones Laterales Horizontales con Mancuernas', 'Hombros', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-345.webp', '{Empuje}', 'fitcron-345', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('f2491fc2-09b5-4d1a-96ab-dc60658a374d', 'Rotación Externa Aislada con Mancuerna', 'Hombros', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-346.webp', '{Empuje,Tracción}', 'fitcron-346', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('cdf6b879-d52f-4df7-8f54-a61f404e7c87', 'Press Cubano Circular con Mancuernas', 'Hombros', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-347.webp', '{Empuje}', 'fitcron-347', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('0768d3e2-ece8-4332-9c86-b1dc68de6744', 'Elevaciones Lateral - Frontal con Mancuernas', 'Hombros', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-348.webp', '{Empuje}', 'fitcron-348', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('1bad40cf-4f55-425d-991d-6ced5f647da5', 'Press Arnold con Mancuernas', 'Hombros', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-350.webp', '{Empuje}', 'fitcron-350', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('e13b429d-2338-4be7-9171-ca8bea90ecd7', 'Elevaciones Circulares con Mancuernas', 'Hombros', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-351.webp', '{Empuje}', 'fitcron-351', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('4d987ea2-cc82-48eb-8a32-d04b5b329b5c', 'Press Scott con Mancuernas', 'Hombros', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-352.webp', '{Empuje}', 'fitcron-352', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('bb6a72b6-225d-4d9c-a718-d2aded753d83', 'Elevaciones Laterales Delanteras con Mancuernas', 'Hombros', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-353.webp', '{Empuje}', 'fitcron-353', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('3850c88d-9ab6-4855-8a8b-b316eeed7c53', 'Press Horizontal con Mancuernas', 'Hombros', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-354.webp', '{Empuje}', 'fitcron-354', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('fedce0b1-ea2a-4b70-a557-f799b59ce304', 'Remo Superior Trasero con Mancuernas', 'Hombros', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-355.webp', '{Empuje,Tracción}', 'fitcron-355', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('dc49f29b-8fb4-40af-be2d-b8f8f29fcc86', 'Elevaciones Laterales Declinadas en Supinación con Mancuernas', 'Hombros', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-356.webp', '{Empuje}', 'fitcron-356', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('de647a11-7a5a-47cd-ab4e-995ff6ad7b22', 'Elevaciones Lateral - Frontal Alto con Mancuernas', 'Hombros', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-357.webp', '{Empuje}', 'fitcron-357', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('0b5a0653-22fc-40ff-ae4d-985a8cb26a4c', 'Press Cubano con Mancuernas', 'Hombros', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-358.webp', '{Empuje}', 'fitcron-358', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('7cd56959-8598-4aea-91d5-03738a7dfdf5', 'Rotación Externa Concentrada con Mancuerna', 'Hombros', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-359.webp', '{Empuje,Tracción}', 'fitcron-359', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('39ca8ce1-cd59-4ef3-bd1e-195a9022f701', 'Elevaciones Frontales en Supinación con Mancuernas', 'Hombros', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-360.webp', '{Empuje}', 'fitcron-360', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('0d8cad54-9083-4c2f-ad2a-2edb162a1b37', 'Elevación Frontal Declinada con Mancuerna', 'Hombros', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-361.webp', '{Empuje}', 'fitcron-361', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('53be2d24-fd88-4924-9e9d-a80e89cbb604', 'Encogimiento Aislado con Mancuerna', 'Hombros', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-362.webp', '{Empuje,Tracción}', 'fitcron-362', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('d8a1f157-701b-4358-80d0-b01f4a8d5d22', 'Elevaciones Frontales Declinadas Neutras con Mancuernas', 'Hombros', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-363.webp', '{Empuje}', 'fitcron-363', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('296ddd0d-01f5-4666-ade9-703e90a7cd48', 'Press Militar en Supinación con Mancuernas', 'Hombros', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-364.webp', '{Empuje}', 'fitcron-364', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('fdfeeb7a-eeef-4e78-b2d8-65be229fd515', 'Elevaciones Laterales Neutras con Mancuernas', 'Hombros', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-365.webp', '{Empuje}', 'fitcron-365', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('5f26a146-b940-4d90-816f-2e6ed3f45feb', 'Elevaciones Frontales Declinadas en Pronación con Mancuernas', 'Hombros', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-366.webp', '{Empuje}', 'fitcron-366', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('00bc4e22-7645-47fa-87fb-f66e00b47b15', 'Elevación Trasera con Barra', 'Hombros', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-367.webp', '{Empuje,Tracción}', 'fitcron-367', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('c661f7e6-047d-47f3-a2d0-e4cb8e92e65c', 'Extensión Trasera con Barra', 'Hombros', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-368.webp', '{Empuje,Tracción}', 'fitcron-368', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('03182787-6aba-4130-a232-3f0af9c78fa6', 'Elevación Completa con Barra', 'Hombros', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-369.webp', '{Empuje}', 'fitcron-369', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('b6e1e35a-968e-4c97-9cf3-cd502f1d81d7', 'Remo al mentón Cerrado con Barra Z', 'Hombros', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-370.webp', '{Empuje,Tracción}', 'fitcron-370', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('67d6cf94-9cff-4414-ade6-03b83ce64980', 'Press Militar Trasero con Barra', 'Hombros', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-371.webp', '{Empuje}', 'fitcron-371', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('d0012281-37df-4ceb-8a5e-336976aa03a8', 'Press Militar en Supinación con Barra Z', 'Hombros', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-373.webp', '{Empuje}', 'fitcron-373', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('c04b3788-5a8e-45ef-ba13-e7757cf9b82e', 'Elevación Frontal Cerrada en Pronación con Barra', 'Hombros', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-374.webp', '{Empuje}', 'fitcron-374', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('2c4de3fd-5c09-4eb5-8622-10def3944897', 'Remo al mentón con Barra', 'Hombros', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-375.webp', '{Empuje,Tracción}', 'fitcron-375', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('d074e355-46ce-43ef-8c4b-ef1317cba218', 'Elevación Frontal Declinada Abierta con Barra Z', 'Hombros', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-376.webp', '{Empuje}', 'fitcron-376', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('8a9698e5-6e5e-4082-bafb-d32208c1ea15', 'Press Militar Mixto con Barra', 'Hombros', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-377.webp', '{Empuje}', 'fitcron-377', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('2495b6fc-6a83-421b-b218-f8d1e7ab0721', 'Press Militar Cerrado con Barra', 'Hombros', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-378.webp', '{Empuje}', 'fitcron-378', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('908485b5-e9fc-4c00-8f48-23d49880b28b', 'Encogimientos en Press Militar con Barra', 'Hombros', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-379.webp', '{Empuje,Tracción}', 'fitcron-379', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('ef587d00-583b-47d0-a4cb-9847254157d2', 'Press Militar Abierto con Barra', 'Hombros', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-380.webp', '{Empuje}', 'fitcron-380', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('23745964-dad0-4d99-90e1-d0e60829a78c', 'Elevación Frontal Declinada en Pronación con Barra', 'Hombros', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-381.webp', '{Empuje}', 'fitcron-381', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('63d02150-7cd3-440c-805b-f567569e8182', 'Encogimientos Delanteros con Barra', 'Hombros', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-382.webp', '{Empuje,Tracción}', 'fitcron-382', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('e004364a-8624-4340-b83a-bdc1993528eb', 'Encogimientos Traseros con Barra', 'Hombros', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-383.webp', '{Empuje,Tracción}', 'fitcron-383', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('5635ae7e-ce22-40f4-9581-89b56e3c74c7', 'Encogimientos Sentado con Barra', 'Hombros', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-384.webp', '{Empuje,Tracción}', 'fitcron-384', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('b6dc6916-ca74-400c-8bfb-3b2f00ca5a45', 'Elevación Frontal con giros con Barra Z', 'Hombros', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-385.webp', '{Empuje}', 'fitcron-385', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('4a8d883c-18a8-46b9-835c-f8d4122af966', 'Elevación Frontal en Pronación con Barra', 'Hombros', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-386.webp', '{Empuje}', 'fitcron-386', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('436bcf2a-c2ff-4a1c-9e4a-74ca301089c2', 'Elevación Frontal Inclinada en Supinación con Barra Z', 'Hombros', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-387.webp', '{Empuje}', 'fitcron-387', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('7e5b7b15-dbdd-48bc-8175-fb8147e3eb0e', 'Jalón en Pronación en Máquina', 'Espalda', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-388.webp', '{Tracción}', 'fitcron-388', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('cce7d893-4ec3-4755-8671-4600c78d6dd6', 'Jalón en Supinación en Máquina', 'Espalda', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-389.webp', '{Tracción}', 'fitcron-389', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('c21a4ec7-2d06-4362-9607-40ed19024526', 'Remo Horizontal en Pronación en Máquina', 'Espalda', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-390.webp', '{Tracción}', 'fitcron-390', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('5f9904c6-c98a-4976-98e1-c6df8efb343c', 'Remo Horizontal en Supinación en Máquina', 'Espalda', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-391.webp', '{Tracción}', 'fitcron-391', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('9b7f7e24-a784-401c-b1cc-6013d48f62d6', 'Remo Horizontal Neutro en Máquina', 'Espalda', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-392.webp', '{Tracción}', 'fitcron-392', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('a3c2ae36-ee4a-486e-b414-01d3abab70f2', 'Remo en Barra T en Supinación', 'Espalda', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-393.webp', '{Tracción}', 'fitcron-393', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('5ecf5da8-1dc2-4817-9e2d-2d5d4100b9d2', 'Remo en Barra T en Pronación', 'Espalda', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-394.webp', '{Tracción}', 'fitcron-394', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('0860f4b1-d34a-4ca9-adfc-bb1a04062e31', 'Remo en Punta', 'Espalda', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-395.webp', '{Tracción}', 'fitcron-395', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('f5c1316c-7faa-467a-9759-db24fbeb0136', 'Remo Aislado en Punta', 'Espalda', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-396.webp', '{Tracción}', 'fitcron-396', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('0b04563c-e51d-4b10-84ae-6a8f101fba70', 'Remo Aislado Neutro en Máquina Smith', 'Espalda', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-397.webp', '{Tracción}', 'fitcron-397', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('956b641c-040a-4362-8c51-b589ff8fcfa9', 'Dominada Invertida', 'Espalda', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-398.webp', '{Tracción}', 'fitcron-398', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('7918fa89-d17b-4858-ae12-2043c54535b2', 'Dominada Mixta', 'Espalda', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-399.webp', '{Tracción}', 'fitcron-399', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('a7653383-fadc-4c9c-b2ed-48e3677ab802', 'Dominada a una mano asistida', 'Espalda', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-400.webp', '{Tracción}', 'fitcron-400', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('fe232295-e7ac-4b85-9cca-ff0b944ea432', 'Dominada Cerrada Corta', 'Espalda', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-401.webp', '{Tracción}', 'fitcron-401', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('4c0f8c38-d8f1-403f-8acc-729e8984c352', 'Dominada en Supinación', 'Espalda', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-402.webp', '{Tracción}', 'fitcron-402', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('f6386c28-d3ad-4553-8b6f-6e5410588a0e', 'Dominada Trasera', 'Espalda', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-403.webp', '{Tracción}', 'fitcron-403', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('34dba3c2-39cb-4957-ae72-60df875225c8', 'Dominada', 'Espalda', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-404.webp', '{Tracción}', 'fitcron-404', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('cf5cb7aa-95f0-424d-bb8a-4ae36a499cc4', 'Dominada Cerrada', 'Espalda', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-405.webp', '{Tracción}', 'fitcron-405', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('b9b772b6-f8ac-4ffd-baa8-d7ccf0d4b9b6', 'Dominada Cerrada en Martillo', 'Espalda', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-406.webp', '{Tracción}', 'fitcron-406', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('b68de2cb-e9d7-47b7-81dc-50a4f4745ecb', 'Dominada Abierta', 'Espalda', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-407.webp', '{Tracción}', 'fitcron-407', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('b2ae93c6-231f-476f-9fea-7c75ebb96209', 'Dominada a una mano', 'Espalda', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-408.webp', '{Tracción}', 'fitcron-408', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('22e169b7-0d01-4a0e-a188-296f4ce1ef01', 'Dominada Lateral', 'Espalda', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-409.webp', '{Tracción}', 'fitcron-409', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('8f84a88b-554a-459e-a7eb-59eb790c96f7', 'Dominada Circular en Supinación', 'Espalda', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-410.webp', '{Tracción}', 'fitcron-410', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('bd0dea49-f26e-4ea9-bc9b-025ef2ffb584', 'Retracción Escapular Colgado', 'Espalda', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-411.webp', '{Tracción}', 'fitcron-411', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('f2e33f11-cd14-42d2-b113-353c30adf4fd', 'Retracción Escapular entre Bancos', 'Espalda', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-412.webp', '{Tracción}', 'fitcron-412', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('26d93ddd-bb5d-4037-9a80-43cad05c85a6', 'Remo Colgado en Supinación', 'Espalda', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-413.webp', '{Tracción}', 'fitcron-413', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('34427ade-c488-45fd-ae29-a3b2ace660b5', 'Remo Colgado en Pronación', 'Espalda', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-414.webp', '{Tracción}', 'fitcron-414', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('5143557d-f1e5-421f-ad28-305e045da443', 'Hiperextensiones', 'Lumbar', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-415.webp', '{"Zona media"}', 'fitcron-415', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('699820ed-cd26-499d-8966-bea5d7505535', 'Hiperextensiones Inclinadas', 'Lumbar', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-416.webp', '{"Zona media"}', 'fitcron-416', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('b322f7bb-649d-489c-9571-80fd8f07d1da', 'Brazada en Fitball', 'Lumbar', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-417.webp', '{"Zona media"}', 'fitcron-417', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('e30fbfe2-5949-42e3-a6e5-fdabf1c88241', 'Hiperextensiones en Fitball', 'Lumbar', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-418.webp', '{"Zona media"}', 'fitcron-418', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('89344c8f-0d8d-42f6-8847-52a954e88019', 'Remo Aislado con Mancuerna', 'Espalda', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-419.webp', '{Tracción}', 'fitcron-419', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('e1824173-5595-4b85-8dd9-1da101ab4deb', 'Pullover con Mancuerna (espalda)', 'Espalda', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-420.webp', '{Tracción}', 'fitcron-420', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('2b794f06-e896-4cbd-9fb7-3d64a8dd1b73', 'Remo Inclinado Neutro con Mancuernas', 'Espalda', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-421.webp', '{Tracción}', 'fitcron-421', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('c98cda79-fc8c-42a0-8ce4-801bd1577489', 'Remo Inclinado en Pronación con Mancuernas', 'Espalda', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-422.webp', '{Tracción}', 'fitcron-422', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('3ee02f3c-428b-4822-97b0-f92f4f7505d9', 'Remo Inclinado en Supinación con Mancuernas', 'Espalda', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-423.webp', '{Tracción}', 'fitcron-423', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('ccf0b67f-14cb-4829-a3b7-bfab431eca73', 'Remo Neutro con Mancuernas', 'Espalda', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-424.webp', '{Tracción}', 'fitcron-424', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('a8dea72f-8f3e-4282-b871-1084442fdc20', 'Remo en Pronación con Mancuernas', 'Espalda', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-425.webp', '{Tracción}', 'fitcron-425', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('5ef78e17-681e-4627-adb2-31262b5b3813', 'Remo en Supinación con Mancuernas', 'Espalda', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-426.webp', '{Tracción}', 'fitcron-426', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('ac59beea-fdc4-492c-85f5-9e645107e6d0', 'Pullover con Barra Z', 'Espalda', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-427.webp', '{Tracción}', 'fitcron-427', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('ba54b578-6c4a-4a79-b4ca-4689ce001aad', 'Remo Aislado con Barra', 'Espalda', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-428.webp', '{Tracción}', 'fitcron-428', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('f8aa2b9a-dc86-49eb-a2b4-ab53edcdf38a', 'Remo Inclinado en Supinación con Barra', 'Espalda', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-429.webp', '{Tracción}', 'fitcron-429', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('1c438e03-3daf-4285-b044-09ff6dddd82c', 'Remo Inclinado en Pronación con Barra', 'Espalda', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-430.webp', '{Tracción}', 'fitcron-430', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('a19e55d5-c11d-482f-abc2-d436c4ffc900', 'Remo en Supinación con Barra', 'Espalda', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-431.webp', '{Tracción}', 'fitcron-431', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('0c8f138a-9e64-42e2-a415-714c3fb0884a', 'Remo en Pronación con Barra', 'Espalda', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-432.webp', '{Tracción}', 'fitcron-432', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('09f9dc2c-d832-4562-b885-1ba9a99c3df9', 'Remo en Pronación Abierto con Barra', 'Espalda', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-433.webp', '{Tracción}', 'fitcron-433', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('5bce717d-24fe-48ab-8c6d-9ab4134886b3', 'Extensión Concentrada en Polea Baja', 'Tríceps', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-434.webp', '{Empuje,Brazos}', 'fitcron-434', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('61a73c8d-58be-460e-bf30-b2ce856467d4', 'Extensión Concentrada en Polea Alta', 'Tríceps', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-435.webp', '{Empuje,Brazos}', 'fitcron-435', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('0fdd21f6-811d-497d-b425-7473f7431878', 'Press Francés Inclinado con Polea', 'Tríceps', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-436.webp', '{Empuje,Brazos}', 'fitcron-436', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('45a43b6d-360c-4621-a74e-3115230179c9', 'Extensión Vertical Neutra en Polea Baja', 'Tríceps', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-437.webp', '{Empuje,Brazos}', 'fitcron-437', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('173af8fe-dee3-4d2d-aa4e-9d233c2a0864', 'Extensión Trasera Aislada en Polea Alta', 'Tríceps', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-438.webp', '{Empuje,Brazos}', 'fitcron-438', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('4253bd65-2ede-4ac6-8ed4-11a8b98096f1', 'Extensión Vertical Aislada en Supinación en Polea Alta', 'Tríceps', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-439.webp', '{Empuje,Brazos}', 'fitcron-439', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('43d6d79c-9e89-4a70-9b69-b8684df6a39e', 'Extensión Vertical en Pronación en Polea Alta', 'Tríceps', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-440.webp', '{Empuje,Brazos}', 'fitcron-440', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('85b15b1c-05c6-421b-9150-0fe74a3f11b4', 'Patadas Traseras en Polea', 'Tríceps', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-441.webp', '{Empuje,Brazos}', 'fitcron-441', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('d1fca7c7-cb23-474c-b011-ed4eedc89368', 'Extensión Vertical Neutra en Polea Alta', 'Tríceps', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-442.webp', '{Empuje,Brazos}', 'fitcron-442', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('43f81210-de8d-4c2f-84bf-c6f717665c6e', 'Extensiones Concentradas en Polea Alta', 'Tríceps', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-443.webp', '{Empuje,Brazos}', 'fitcron-443', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('e599f926-cb27-4a20-ac15-e4c68bbe9508', 'Press Francés con Polea', 'Tríceps', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-444.webp', '{Empuje,Brazos}', 'fitcron-444', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('0ecbe19e-6503-4497-8b05-4cfd819b71e8', 'Extensión Lateral Aislada en Supinación en Polea Alta', 'Tríceps', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-445.webp', '{Empuje,Brazos}', 'fitcron-445', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('ab569bfc-3d15-4433-8aa1-f4c5bf2e40d9', 'Extensión Vertical en Supinación en Polea Alta', 'Tríceps', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-446.webp', '{Empuje,Brazos}', 'fitcron-446', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('eb95af0e-ec14-4eb3-a321-ca875833ecde', 'Extensión Vertical Aislada en Pronación en Polea Alta', 'Tríceps', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-447.webp', '{Empuje,Brazos}', 'fitcron-447', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('abc69462-6b15-45db-be9a-778209b12fec', 'Extensión Horizontal en Martillo en Polea Alta', 'Tríceps', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-448.webp', '{Empuje,Brazos}', 'fitcron-448', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('7c507883-e46b-413d-bb7d-7ea3f48ce724', 'Press Francés Neutro con Polea', 'Tríceps', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-449.webp', '{Empuje,Brazos}', 'fitcron-449', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('7c9011d0-4da4-4051-94cd-4249a915b591', 'Extensión Vertical en Pronación en Polea Baja', 'Tríceps', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-450.webp', '{Empuje,Brazos}', 'fitcron-450', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('05d28772-edc8-4992-86f4-d2a5cd1dafcf', 'Extensión Vertical Aislada en Pronación en Polea Baja', 'Tríceps', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-451.webp', '{Empuje,Brazos}', 'fitcron-451', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('6378ae39-4aa2-46c6-8b40-7b0ceb19aba7', 'Extensión Frontal Aislada en Polea Alta', 'Tríceps', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-452.webp', '{Empuje,Brazos}', 'fitcron-452', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('15fea9b8-a034-45b7-bd70-cdef57cc08a3', 'Extensiones Cruzadas en Polea', 'Tríceps', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-453.webp', '{Empuje,Brazos}', 'fitcron-453', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('a5ae587e-8e08-4621-80bd-74b27a6727d6', 'Curl en Martillo en Polea Baja', 'Bíceps', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-454.webp', '{Tracción,Brazos}', 'fitcron-454', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('e4c07f96-4593-4e0c-ab7b-3afc2b26beaa', 'Curl Vertical en Supinación con Polea', 'Bíceps', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-455.webp', '{Tracción,Brazos}', 'fitcron-455', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('adbc0179-1fca-4c7b-999c-a827d03d3969', 'Curl Aislado en Supinación en Polea Baja', 'Bíceps', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-456.webp', '{Tracción,Brazos}', 'fitcron-456', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('83d1e94a-e17a-4427-b7d4-3fae13def6e2', 'Curl en Banco Scott en Supinación con Polea', 'Bíceps', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-457.webp', '{Tracción,Brazos}', 'fitcron-457', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('91335426-2808-4ebf-9c10-a2bc72ad1b1c', 'Curl en Banco Scott en Pronación con Polea', 'Bíceps', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-458.webp', '{Tracción,Brazos}', 'fitcron-458', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('88d279bf-78ab-494d-9877-b9a86a8daac9', 'Curl en Martillo en Polea Alta', 'Bíceps', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-459.webp', '{Tracción,Brazos}', 'fitcron-459', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('0c2299c4-3649-4ee1-adb4-9e367129c6ab', 'Curl en Supinación en Polea Baja', 'Bíceps', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-460.webp', '{Tracción,Brazos}', 'fitcron-460', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('279e547b-6067-4923-b168-e75d3c75e957', 'Curl Lateral en Supinación con Polea', 'Bíceps', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-461.webp', '{Tracción,Brazos}', 'fitcron-461', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('d5865e05-669e-411f-81ba-9b6f0e10b628', 'Curl Lateral en Supinación Aislado con Polea', 'Bíceps', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-462.webp', '{Tracción,Brazos}', 'fitcron-462', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('5fdccebb-e3c7-4f11-9b4a-ebb0d96c761a', 'Curl Aislado en Pronación en Polea Baja', 'Bíceps', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-463.webp', '{Tracción,Brazos}', 'fitcron-463', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('b769e033-7cd1-47d7-a445-c77bb77b69d5', 'Curl en Pronación con agarre Z en Polea Baja', 'Bíceps', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-464.webp', '{Tracción,Brazos}', 'fitcron-464', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('42f0dbdc-3c94-46c2-aaeb-87500da53331', 'Curl en Supinación con agarre Z en Polea Baja', 'Bíceps', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-465.webp', '{Tracción,Brazos}', 'fitcron-465', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('d713d75e-d7b1-49ec-8d91-faf2eee92c9f', 'Curl Concentrado Lateral Aislado en Supinación en Polea Baja', 'Bíceps', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-466.webp', '{Tracción,Brazos}', 'fitcron-466', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('4393502a-19bd-4d60-83a3-1d2169d526cc', 'Curl en Banco Scott Neutro con Polea', 'Bíceps', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-467.webp', '{Tracción,Brazos}', 'fitcron-467', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('10ad6bc4-fa00-417d-83d8-6e9c36815e43', 'Curl en Banco Scott Neutro Aislado con Polea', 'Bíceps', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-468.webp', '{Tracción,Brazos}', 'fitcron-468', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('67683f5a-06e5-4cb0-869f-3185b4496a0c', 'Curl en Supinación en Polea Alta', 'Bíceps', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-469.webp', '{Tracción,Brazos}', 'fitcron-469', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('cfd092f6-2655-4fb7-b849-a0c27a107cf7', 'Curl Horizontal Cerrado en Supinación con Polea', 'Bíceps', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-470.webp', '{Tracción,Brazos}', 'fitcron-470', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('e513ad33-0617-4e7f-929e-fac8e3057033', 'Curl en Banco Scott en Pronación Aislado con Polea', 'Bíceps', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-471.webp', '{Tracción,Brazos}', 'fitcron-471', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('0fc73cf7-e720-4c0d-86b7-bd37403ba550', 'Curl en Banco Scott en Supinación Aislado con Polea', 'Bíceps', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-472.webp', '{Tracción,Brazos}', 'fitcron-472', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('897a9dc7-3d8b-4016-8cfd-f66e67c71ff7', 'Curl en Supinación Retraído en Polea Baja', 'Bíceps', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-473.webp', '{Tracción,Brazos}', 'fitcron-473', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('32eaf8cb-8a09-4c02-94f8-2db356b23eb1', 'Curl Concentrado Cerrado en Polea Baja', 'Bíceps', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-474.webp', '{Tracción,Brazos}', 'fitcron-474', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('dae01255-8e5e-4f11-b233-584863ad6a5c', 'Curl en Supinación Cerrado en Polea Baja', 'Bíceps', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-475.webp', '{Tracción,Brazos}', 'fitcron-475', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('9fc62721-fa90-41be-91eb-464adf4d85c3', 'Curl Horizontal Inclinado con Polea', 'Bíceps', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-476.webp', '{Tracción,Brazos}', 'fitcron-476', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('e3c2e3b8-19c8-4a9b-a7af-08d4642173e1', 'Curl Concentrado en Supinación en Polea Baja', 'Bíceps', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-477.webp', '{Tracción,Brazos}', 'fitcron-477', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('2be68123-1c5d-4e0f-9347-9d9252ffb193', 'Curl en V en Polea Baja', 'Bíceps', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-478.webp', '{Tracción,Brazos}', 'fitcron-478', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('c7b375e9-b97e-4003-b5d8-7a8864c1565b', 'Curl Horizontal en Supinación con Polea', 'Bíceps', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-479.webp', '{Tracción,Brazos}', 'fitcron-479', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('e1945714-106f-4d11-aeed-446f10e10015', 'Curl Aislado Largo en Supinación en Polea Baja', 'Bíceps', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-480.webp', '{Tracción,Brazos}', 'fitcron-480', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('46239dc2-a51c-4d3f-aa46-1f061dfb8260', 'Curl Concentrado Frontal Aislado en Supinación en Polea Baja', 'Bíceps', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-481.webp', '{Tracción,Brazos}', 'fitcron-481', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('faf2e9e1-5923-4d26-87d4-06f0139e5ffd', 'Curl con peso libre', 'Bíceps', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-482.webp', '{Tracción,Brazos}', 'fitcron-482', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('768211fa-075e-4029-bea5-1c07b4172748', 'Curl Alterno en Supinación en Máquina', 'Bíceps', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-483.webp', '{Tracción,Brazos}', 'fitcron-483', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('7bad2373-8ebb-4b7e-983d-e197359d79f0', 'Curl Concentrado en Máquina', 'Bíceps', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-484.webp', '{Tracción,Brazos}', 'fitcron-484', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('f660734b-4ab1-4a5f-91f3-2cdfdd1c6a70', 'Curl en Pronación en Máquina Scott', 'Bíceps', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-485.webp', '{Tracción,Brazos}', 'fitcron-485', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('31a1b18c-54bc-4e08-9d73-00cdacd19197', 'Curl en Martillo en Máquina Scott', 'Bíceps', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-486.webp', '{Tracción,Brazos}', 'fitcron-486', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('8f7729c8-825a-469b-a808-53963914eb9a', 'Curl en Supinación en Máquina Scott', 'Bíceps', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-487.webp', '{Tracción,Brazos}', 'fitcron-487', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('30b71754-84b5-43ca-bd75-1a663d60ce09', 'Curl con giro Alterno con Mancuernas', 'Bíceps', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-488.webp', '{Tracción,Brazos}', 'fitcron-488', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('bd1c7a97-13ae-4975-ac5d-5614813690b2', 'Curl en Martillo Alterno con Mancuernas', 'Bíceps', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-489.webp', '{Tracción,Brazos}', 'fitcron-489', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('336e2cd9-33cb-458f-9658-72efbcc0003b', 'Curl Inclinado con giro Alterno con Mancuernas', 'Bíceps', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-490.webp', '{Tracción,Brazos}', 'fitcron-490', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('459f3c28-9a4f-4cbb-9ee8-6deb4ccb6390', 'Curl Inclinado Lateral con Mancuernas', 'Bíceps', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-491.webp', '{Tracción,Brazos}', 'fitcron-491', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('b8fc2881-ea28-40dc-8725-162129fa0d6c', 'Curl Inclinado Neutro Alterno con Mancuernas', 'Bíceps', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-492.webp', '{Tracción,Brazos}', 'fitcron-492', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('7333b91d-5e38-43d2-ab0e-24e950c35d9a', 'Curl Aislado hacia abajo con Mancuerna', 'Bíceps', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-493.webp', '{Tracción,Brazos}', 'fitcron-493', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('650d99a0-05aa-4e54-9bed-e66ddf4b5a22', 'Curl Aislado en Pronación con Mancuerna', 'Bíceps', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-494.webp', '{Tracción,Brazos}', 'fitcron-494', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('6bd306a4-2801-4b85-b372-6c964d81c2cd', 'Curl Horizontal con giro con Mancuernas', 'Bíceps', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-495.webp', '{Tracción,Brazos}', 'fitcron-495', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('e000dff9-2939-4d53-9735-18aaa8bb4d7c', 'Curl Concentrado en Supinación con Mancuerna (bíceps)', 'Bíceps', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-496.webp', '{Tracción,Brazos}', 'fitcron-496', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('196e60a8-87c6-45ea-87de-f7da6668ac85', 'Curl Concentrado en Pronación con Mancuerna (bíceps)', 'Bíceps', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-497.webp', '{Tracción,Brazos}', 'fitcron-497', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('99f301b0-2765-4248-abbe-087468736a9d', 'Curl en Banco Scott en Supinación con Mancuerna', 'Bíceps', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-498.webp', '{Tracción,Brazos}', 'fitcron-498', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('e079e786-fb7b-4102-b447-bd66af5bb141', 'Curl en Banco Scott en Pronación con Mancuerna', 'Bíceps', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-499.webp', '{Tracción,Brazos}', 'fitcron-499', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('732adb6a-7fa2-4770-af3c-625f616532db', 'Curl Horizontal en Supinación con Mancuernas', 'Bíceps', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-500.webp', '{Tracción,Brazos}', 'fitcron-500', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('0765cb48-8092-4c36-986b-7de2eba42368', 'Curl en Martillo Cruzado con Mancuernas', 'Bíceps', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-501.webp', '{Tracción,Brazos}', 'fitcron-501', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('c74fe318-5118-4f79-9d1e-6560a52a0160', 'Curl Aislado Neutro con Mancuerna', 'Bíceps', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-502.webp', '{Tracción,Brazos}', 'fitcron-502', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('74923992-bfbd-4e41-b4d0-e394b32e8f6c', 'Curl Aislado en Supinación con Mancuerna', 'Bíceps', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-503.webp', '{Tracción,Brazos}', 'fitcron-503', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('d6e3f521-f94b-4ea8-befc-66feba2b3516', 'Curl Spider Aislado Neutro con Mancuerna', 'Bíceps', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-504.webp', '{Tracción,Brazos}', 'fitcron-504', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('06444ed2-6860-4e07-855e-8576f43c85db', 'Curl Spider Aislado en Pronación con Mancuerna', 'Bíceps', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-505.webp', '{Tracción,Brazos}', 'fitcron-505', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('ef4c9b32-9af8-40e1-a8b3-cb9f304ebc5d', 'Curl Spider Aislado en Supinación con Mancuerna', 'Bíceps', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-506.webp', '{Tracción,Brazos}', 'fitcron-506', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('8b685ab0-525a-401a-bc82-3ea21941e284', 'Curl Lateral con Mancuernas', 'Bíceps', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-507.webp', '{Tracción,Brazos}', 'fitcron-507', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('758e8f3f-9125-4bd8-80f1-63ac899c307d', 'Curl en Banco Scott Neutro con Mancuerna', 'Bíceps', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-508.webp', '{Tracción,Brazos}', 'fitcron-508', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('7c0d81fb-16ff-4bd5-9368-80a21e9a177d', 'Curl Horizontal con Mancuernas', 'Bíceps', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-509.webp', '{Tracción,Brazos}', 'fitcron-509', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('9b07feda-d105-4b48-9678-a6668e8c4167', 'Curl Inclinado Alterno en Supinación con Mancuernas', 'Bíceps', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-510.webp', '{Tracción,Brazos}', 'fitcron-510', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('68ae0377-11d3-4f43-aad7-876d2cf635fc', 'Curl Spider Neutro con Mancuerna', 'Bíceps', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-511.webp', '{Tracción,Brazos}', 'fitcron-511', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('3e0c709b-15b7-4636-88c3-8018c3398863', 'Curl en Supinación Cerrado Con Barra Z', 'Bíceps', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-512.webp', '{Tracción,Brazos}', 'fitcron-512', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('f460391d-29ba-4497-9420-6b78ad08c73a', 'Curl en Pronación con Barra Z', 'Bíceps', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-513.webp', '{Tracción,Brazos}', 'fitcron-513', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('b0131d72-fdab-49fa-a841-d83fce2c8059', 'Curl en Supinación Corto con Barra Z', 'Bíceps', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-514.webp', '{Tracción,Brazos}', 'fitcron-514', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('4da3463d-413e-4764-9b32-baf123d4a9f3', 'Curl en Supinación con Barra Z', 'Bíceps', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-515.webp', '{Tracción,Brazos}', 'fitcron-515', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('9b513eab-1dcc-4b60-8433-e62fb89f1ca5', 'Curl Spider en Supinación con Barra Z', 'Bíceps', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-516.webp', '{Tracción,Brazos}', 'fitcron-516', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('e0a04547-8a21-4960-a15d-bf6d4d4d1ffc', 'Curl Concentrado Cerrado con Barra Z', 'Bíceps', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-517.webp', '{Tracción,Brazos}', 'fitcron-517', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('62b40fb5-3c9b-422e-8cbc-f3082202df9a', 'Curl en Supinación Abierto Con Barra Z', 'Bíceps', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-518.webp', '{Tracción,Brazos}', 'fitcron-518', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('39479f60-201e-4d0c-a9f0-5d0b912a2ade', 'Extensión en caída con Bandas', 'Tríceps', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-519.webp', '{Empuje,Brazos}', 'fitcron-519', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('07cb5006-a1a0-46be-8acd-d356666aaf5d', 'Curl en Supinación Abierto en banco Scott con Barra Z', 'Bíceps', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-520.webp', '{Tracción,Brazos}', 'fitcron-520', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('8b39e489-38b8-485d-ad13-442472f3f6cf', 'Curl en Supinación Cerrado en banco Scott con Barra Z', 'Bíceps', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-521.webp', '{Tracción,Brazos}', 'fitcron-521', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('6a5178e2-0692-48a4-9877-bd0f1f316cc3', 'Press Svend', 'Pectorales', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-624.webp', '{Empuje}', 'fitcron-624', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('3b56eef8-f84c-4c12-adab-1f0f910e9989', 'Curl en Pronación en banco Scott con Barra Z', 'Bíceps', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-522.webp', '{Tracción,Brazos}', 'fitcron-522', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('18393d81-b1f4-4878-89ec-7173ba02fcf0', 'Curl en Supinación hacia abajo con Barra Z', 'Bíceps', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-523.webp', '{Tracción,Brazos}', 'fitcron-523', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('2586991a-115c-4992-8d7b-d2c8741972fa', 'Curl Aislado con Barra', 'Bíceps', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-524.webp', '{Tracción,Brazos}', 'fitcron-524', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('47d9cb16-c833-4a18-9502-beffa86d349a', 'Curl en Supinación Retraído con Barra', 'Bíceps', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-525.webp', '{Tracción,Brazos}', 'fitcron-525', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('dd5b38ce-aa2b-4ed3-becd-02efd3090fee', 'Curl en Supinación con Barra', 'Bíceps', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-526.webp', '{Tracción,Brazos}', 'fitcron-526', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('c37197df-f4e0-4f93-99b0-b1b8a4fde379', 'Curl en Pronación Abierto con Barra', 'Bíceps', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-527.webp', '{Tracción,Brazos}', 'fitcron-527', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('b4227c28-b291-466e-8cfc-de6b9a432dbd', 'Curl en Pronación en banco Scott con Barra', 'Bíceps', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-528.webp', '{Tracción,Brazos}', 'fitcron-528', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('05e55d90-2f2e-4df8-8feb-55568997e76e', 'Curl en Supinación en banco Scott con Barra', 'Bíceps', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-529.webp', '{Tracción,Brazos}', 'fitcron-529', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('622db2f1-7333-4cb2-8a8b-c9e42b0804c0', 'Curl en Supinación Cerrado con Barra', 'Bíceps', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-530.webp', '{Tracción,Brazos}', 'fitcron-530', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('a224e8e3-22d3-420e-b920-5fa7a22bf73a', 'Curl en Pronación con Barra', 'Bíceps', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-531.webp', '{Tracción,Brazos}', 'fitcron-531', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('dc211cd9-c8cf-4ae8-8083-a6a57ed89da9', 'Curl en Martillo con Barra', 'Bíceps', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-532.webp', '{Tracción,Brazos}', 'fitcron-532', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('cb88d8a7-1ff3-4e0e-b8ae-910970af486f', 'Curl en Supinación hacia abajo con Barra', 'Bíceps', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-533.webp', '{Tracción,Brazos}', 'fitcron-533', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('c5c3a967-63ad-4362-86d4-cf2dc512474c', 'Curl Spider en Supinación con Barra', 'Bíceps', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-534.webp', '{Tracción,Brazos}', 'fitcron-534', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('bb3938d4-18be-4f92-9625-2255b9f83abb', 'Curl Concentrado Cerrado con Barra', 'Bíceps', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-535.webp', '{Tracción,Brazos}', 'fitcron-535', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('1e2d79cc-e33b-4e90-a41f-198db8c4765b', 'Curl en Supinación Abierto Con Barra', 'Bíceps', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-536.webp', '{Tracción,Brazos}', 'fitcron-536', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('d7f1b2bf-7ce9-4b43-9ac5-0573395f9a86', 'Curl Concentrado con Barra', 'Bíceps', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-537.webp', '{Tracción,Brazos}', 'fitcron-537', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('f595dd33-eb34-4f02-86ab-d298913e50cf', 'Curl Spider en Pronación con Barra', 'Bíceps', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-538.webp', '{Tracción,Brazos}', 'fitcron-538', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('08300391-b4a9-4f61-90fa-ca3568569949', 'Curl en Supinación Concentrado con Banda', 'Bíceps', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-539.webp', '{Tracción,Brazos}', 'fitcron-539', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('198e5bd3-e7fb-4c34-aa9d-79df2e908713', 'Curl en Supinación Aislado con Banda', 'Bíceps', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-540.webp', '{Tracción,Brazos}', 'fitcron-540', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('c4584417-28ae-4886-a1a2-781c400c45b3', 'Curl en caída con Bandas', 'Bíceps', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-541.webp', '{Tracción,Brazos}', 'fitcron-541', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('e3074538-58e4-44ce-bbf2-7f133916dfb5', 'Curl en Supinación Alterno con Bandas', 'Bíceps', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-542.webp', '{Tracción,Brazos}', 'fitcron-542', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('955190f8-e688-4aa6-bd94-943e15cc6563', 'Curl en Supinación con Bandas', 'Bíceps', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-543.webp', '{Tracción,Brazos}', 'fitcron-543', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('d5bab941-ad42-48b1-ba1d-2cf226a043e2', 'Extensión Vertical con Bandas', 'Tríceps', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-544.webp', '{Empuje,Brazos}', 'fitcron-544', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('c4f42562-ec63-453b-b2bb-37cc99559b9b', 'Press Francés con Bandas', 'Tríceps', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-545.webp', '{Empuje,Brazos}', 'fitcron-545', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('a6514b20-5826-4b0a-b4e2-1daa767f4add', 'Extensión hacia abajo con Bandas', 'Tríceps', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-546.webp', '{Empuje,Brazos}', 'fitcron-546', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('9d106991-b4d7-45f6-9674-ee544ca6554b', 'Extensión Lateral Aislada con Banda', 'Tríceps', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-547.webp', '{Empuje,Brazos}', 'fitcron-547', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('b082c80d-71ee-4c6f-86cc-dd68b6c57109', 'Extensiones Inclinadas con Mancuernas', 'Tríceps', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-548.webp', '{Empuje,Brazos}', 'fitcron-548', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('13784e2c-40a1-47b7-b00c-893b0803a25e', 'Press Francés con Mancuernas', 'Tríceps', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-549.webp', '{Empuje,Brazos}', 'fitcron-549', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('e9f6fcec-c08b-429b-9819-3f7d1348227e', 'Extensión Horizontal Concentrada Interna con Mancuerna', 'Tríceps', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-550.webp', '{Empuje,Brazos}', 'fitcron-550', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('1b517111-30dc-409c-822b-e9976e73891b', 'Extensiones Horizontales Internas con Mancuernas', 'Tríceps', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-551.webp', '{Empuje,Brazos}', 'fitcron-551', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('085fa1d7-6773-4ea3-b8cc-19962dfdf975', 'Extensión Vertical Aislada con Mancuerna', 'Tríceps', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-552.webp', '{Empuje,Brazos}', 'fitcron-552', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('8cc5f287-6ca5-450f-94d5-eeb86580df70', 'Extensión Declinada con Mancuernas', 'Tríceps', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-553.webp', '{Empuje,Brazos}', 'fitcron-553', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('8a56fdd2-4db1-4b1c-b160-c59e530c9360', 'Press Banca Neutro con Mancuernas', 'Tríceps', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-554.webp', '{Empuje,Brazos}', 'fitcron-554', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('9b536724-103b-4ae2-a4bf-87f56f937ab9', 'Extensión Horizontal Concentrada Superior con Mancuerna', 'Tríceps', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-555.webp', '{Empuje,Brazos}', 'fitcron-555', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('4e1fd884-d53a-446e-8b39-47950e6878bf', 'Press Banca en Supinación Aislado con Mancuerna', 'Tríceps', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-556.webp', '{Empuje,Brazos}', 'fitcron-556', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('10aaee02-14da-4fc9-85c5-d200385f9282', 'Press Inclinado Aislado con Mancuerna (tríceps)', 'Tríceps', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-557.webp', '{Empuje,Brazos}', 'fitcron-557', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('b2b789ec-773c-4648-9435-fa55238dd4ce', 'Press Declinado Aislado con Mancuerna', 'Tríceps', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-558.webp', '{Empuje,Brazos}', 'fitcron-558', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('f88a54a4-b977-4e66-84b1-e9adc438a344', 'Press Banca con giro con Mancuernas', 'Tríceps', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-559.webp', '{Empuje,Brazos}', 'fitcron-559', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('1697bce1-fd8d-4b3f-9e73-d1b0f49cd4c3', 'Press Francés Inclinado Alterno con Mancuernas', 'Tríceps', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-560.webp', '{Empuje,Brazos}', 'fitcron-560', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('99f39cf6-8ee4-4385-8081-55ff50e78e4a', 'Patadas Traseras con Mancuernas', 'Tríceps', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-561.webp', '{Empuje,Brazos}', 'fitcron-561', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('0e9c80cc-fc4e-4886-8751-4535d533fac7', 'Patadas Traseras Alternas con Mancuernas', 'Tríceps', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-562.webp', '{Empuje,Brazos}', 'fitcron-562', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('332ebbed-d455-434a-8273-b83a90251fe9', 'Extensión Vertical con Mancuerna', 'Tríceps', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-563.webp', '{Empuje,Brazos}', 'fitcron-563', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('1889d1fe-8eae-4513-a4c5-b615099a7ec1', 'Extensión Delante-Detrás con Mancuernas', 'Tríceps', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-564.webp', '{Empuje,Brazos}', 'fitcron-564', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('c15c40fc-cc8e-4650-bcab-7dda7958d166', 'Press Francés tras nuca con Barra', 'Tríceps', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-565.webp', '{Empuje,Brazos}', 'fitcron-565', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('05f70567-81e1-4cc2-b1dd-d2b6441ec889', 'Extensión Horizontal con Barra', 'Tríceps', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-566.webp', '{Empuje,Brazos}', 'fitcron-566', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('b9fa6a7b-fec9-4c34-814c-ece98e108d60', 'Press Inclinado en Supinación con Barra', 'Tríceps', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-567.webp', '{Empuje,Brazos}', 'fitcron-567', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('fdb6cac5-c6d4-4f6f-89fe-e754096ab143', 'Press Francés Declinado con Barra', 'Tríceps', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-568.webp', '{Empuje,Brazos}', 'fitcron-568', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('e395320b-cdd6-4896-9ce1-8ffd0a8c778a', 'Press Francés Inverso con Barra', 'Tríceps', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-569.webp', '{Empuje,Brazos}', 'fitcron-569', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('87b31cd0-f201-40f6-89ff-32676f43a9fd', 'Press Francés con Barra', 'Tríceps', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-570.webp', '{Empuje,Brazos}', 'fitcron-570', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('66442c15-cc49-4b8d-af66-fc8dced9ffd6', 'Press a una mano con Barra', 'Tríceps', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-571.webp', '{Empuje,Brazos}', 'fitcron-571', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('ba9338a1-0f7d-4e96-92d2-88338ae53bea', 'Press Cerrado con Barra', 'Tríceps', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-572.webp', '{Empuje,Brazos}', 'fitcron-572', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('566fad0e-5bb1-4039-9895-f23b824e24ae', 'Press Inclinado Cerrado con Barra', 'Tríceps', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-573.webp', '{Empuje,Brazos}', 'fitcron-573', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('683eda39-1dd7-4870-8f76-7fddda3e05b1', 'Press Cerrado en Supinación con Barra', 'Tríceps', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-574.webp', '{Empuje,Brazos}', 'fitcron-574', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('cdfcadb1-13ab-4264-a740-596a5d66635f', 'Extensión Vertical con Barra Z', 'Tríceps', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-575.webp', '{Empuje,Brazos}', 'fitcron-575', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('1025ac1c-c36d-44e4-a8b3-a99e756669f4', 'Extensión Inclinada con Barra Z', 'Tríceps', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-576.webp', '{Empuje,Brazos}', 'fitcron-576', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('af8ddb56-f6c2-40be-969d-0f168493014d', 'Extensión Horizontal con Barra Z', 'Tríceps', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-577.webp', '{Empuje,Brazos}', 'fitcron-577', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('0dc45736-67eb-46f6-acaa-2628a9d87cab', 'Press Francés con Barra Z', 'Tríceps', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-578.webp', '{Empuje,Brazos}', 'fitcron-578', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('8a8d1c4c-fd38-435c-a94c-d25fd7c09a12', 'Press Francés Declinado Cerrado con Barra Z', 'Tríceps', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-579.webp', '{Empuje,Brazos}', 'fitcron-579', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('b5bb5e51-a956-4fef-b7dc-7e2ab295c892', 'Press Francés Declinado Abierto con Barra Z', 'Tríceps', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-580.webp', '{Empuje,Brazos}', 'fitcron-580', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('5d0348b5-6c20-465f-96d9-cbf432c89930', 'Extensiones en Pronación en Máquina', 'Tríceps', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-581.webp', '{Empuje,Brazos}', 'fitcron-581', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('30a93135-c9d9-4a96-a78d-e0b13c750db3', 'Extensiones en Máquina', 'Tríceps', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-582.webp', '{Empuje,Brazos}', 'fitcron-582', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('b19503b8-98d5-495d-a610-e1d42e90480e', 'Fondos en Máquina (tríceps)', 'Tríceps', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-583.webp', '{Empuje,Brazos}', 'fitcron-583', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('e4d6bb29-c196-4dff-b4e4-ea35fe63f8c3', 'Fondos en Pronación en Máquina', 'Tríceps', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-584.webp', '{Empuje,Brazos}', 'fitcron-584', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('8299330d-e182-4e44-b054-dbe576f1f40f', 'Flexiones en supinación', 'Tríceps', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-585.webp', '{Empuje,Brazos}', 'fitcron-585', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('1e82ef15-ede0-4ddc-b3c0-595a66601165', 'Flexiones Cruzadas', 'Tríceps', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-586.webp', '{Empuje,Brazos}', 'fitcron-586', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('05a4f699-2ae3-4527-b0a4-ecb23b4c4da2', 'Flexiones Cerradas (tríceps)', 'Tríceps', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-587.webp', '{Empuje,Brazos}', 'fitcron-587', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('0a4576f3-bc0d-4d74-883d-f2856bb24b35', 'Flexiones Básicas', 'Tríceps', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-588.webp', '{Empuje,Brazos}', 'fitcron-588', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('d856a458-8742-4f81-a392-155e0f5fb333', 'Flexiones con codos', 'Tríceps', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-589.webp', '{Empuje,Brazos}', 'fitcron-589', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('3a451777-7005-4785-bf5a-4d396fd493d6', 'Flexiones Diamante', 'Tríceps', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-590.webp', '{Empuje,Brazos}', 'fitcron-590', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('8e06a23d-4c25-4daa-8928-528724a594e8', 'Extensiones en caída libre', 'Tríceps', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-591.webp', '{Empuje,Brazos}', 'fitcron-591', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('2c1b3c54-b5be-4091-bd9d-415e81218931', 'Fondos en banco', 'Tríceps', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-592.webp', '{Empuje,Brazos}', 'fitcron-592', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('216c7565-becd-4470-99f9-a323f1ae0a27', 'Fondos entre bancos', 'Tríceps', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-593.webp', '{Empuje,Brazos}', 'fitcron-593', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('9f86c258-00a0-4815-97c4-4b70e47d4471', 'Fondos Imposibles', 'Tríceps', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-594.webp', '{Empuje,Brazos}', 'fitcron-594', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('489bf554-2703-40c4-9b8c-7eb048b59aad', 'Fondos Coreanos en Barra', 'Tríceps', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-595.webp', '{Empuje,Brazos}', 'fitcron-595', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('fd52a16a-8603-4196-ad55-211e559106de', 'Fondos Cerrados en Paralelas', 'Tríceps', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-596.webp', '{Empuje,Brazos}', 'fitcron-596', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('beff1843-1c21-4f7d-ba1d-a2aa285966b5', 'Pullover Extenso con Mancuernas', 'Pectorales', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-597.webp', '{Empuje}', 'fitcron-597', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('f142b49f-682d-4b2a-b32c-49468f4927b7', 'Pullover con Mancuerna (pecho)', 'Pectorales', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-598.webp', '{Empuje}', 'fitcron-598', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('2f06aeb8-4c18-4ae8-bd30-322bac633fdb', 'Press Declinado Neutro con Mancuernas', 'Pectorales', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-599.webp', '{Empuje}', 'fitcron-599', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('775b9037-a94a-4d3a-ac2f-b1facfeb9f12', 'Press Declinado con Mancuernas', 'Pectorales', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-600.webp', '{Empuje}', 'fitcron-600', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('ec9112f4-3514-4c06-9514-140776d1d6b6', 'Press Banca con Mancuernas', 'Pectorales', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-601.webp', '{Empuje}', 'fitcron-601', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('ff63743d-8218-43bd-b9ff-99ac9bd3dee3', 'Press Inclinado en Supinación con Mancuernas', 'Pectorales', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-602.webp', '{Empuje}', 'fitcron-602', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('42291567-c884-4623-bcad-ca0fcce19e25', 'Press Aislado en Supinación con Mancuerna', 'Pectorales', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-603.webp', '{Empuje}', 'fitcron-603', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('53db4c16-c3bf-4a9a-b024-c8c99f0f96df', 'Press Inclinado en Supinación con giro con Mancuernas', 'Pectorales', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-604.webp', '{Empuje}', 'fitcron-604', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('28445dc5-ece2-433c-b9cc-e47c04f77f85', 'Press Inclinado Aislado con Mancuerna (pecho)', 'Pectorales', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-605.webp', '{Empuje}', 'fitcron-605', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('0c150365-b299-41d8-9983-cb4f9e25abd7', 'Aperturas Declinadas con giro con Mancuernas', 'Pectorales', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-606.webp', '{Empuje}', 'fitcron-606', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('9bc2177f-b433-4bc0-91bc-1ed5906ce3d8', 'Aperturas Declinadas con Mancuernas', 'Pectorales', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-607.webp', '{Empuje}', 'fitcron-607', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('6d704a13-f92a-4ec0-997c-0efba5787b01', 'Aperturas Inclinadas con Mancuernas', 'Pectorales', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-608.webp', '{Empuje}', 'fitcron-608', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('73df1a27-2882-4cb8-93bd-a5b9f2950685', 'Press Banca Alterno con Mancuernas', 'Pectorales', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-610.webp', '{Empuje}', 'fitcron-610', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('94d296d6-323f-4d64-a2fc-ad48cab53fed', 'Press Abierto Neutro con Mancuernas', 'Pectorales', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-611.webp', '{Empuje}', 'fitcron-611', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('e30c664e-dd90-4d4a-b458-712b306f114a', 'Press Cerrado Neutro con Mancuernas', 'Pectorales', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-612.webp', '{Empuje}', 'fitcron-612', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('4dd1cb67-79c0-45ea-8382-7df4085fc1fe', 'Press Inclinado Cerrado Neutro con Mancuerna', 'Pectorales', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-613.webp', '{Empuje}', 'fitcron-613', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('a56f58c3-3ca0-463b-8f2a-2d013b6c9c78', 'Flexiones a una mano asistidas', 'Pectorales', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-614.webp', '{Empuje}', 'fitcron-614', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('81d4fcab-96c0-4522-9f6c-758fc1e77ae7', 'Flexiones a una mano', 'Pectorales', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-615.webp', '{Empuje}', 'fitcron-615', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('5133a241-d5f4-4aeb-98a1-782feac5d980', 'Flexiones Archer', 'Pectorales', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-616.webp', '{Empuje}', 'fitcron-616', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('e0fa3c0a-8847-43d7-ae83-819340dfbd09', 'Flexiones Declinadas', 'Pectorales', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-617.webp', '{Empuje}', 'fitcron-617', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('e2ae2e40-32eb-4c5f-937e-11539d5f04e3', 'Flexiones Pliométricas con Palmada', 'Pectorales', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-618.webp', '{Empuje}', 'fitcron-618', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('0c957461-cb6b-4b39-8aaa-a029a8ab7787', 'Flexiones Cerradas (pecho)', 'Pectorales', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-619.webp', '{Empuje}', 'fitcron-619', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('99aaf9d0-e367-4d64-ad73-b91fbbf99782', 'Flexiones Abiertas', 'Pectorales', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-620.webp', '{Empuje}', 'fitcron-620', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('3b824da3-7ce3-4329-b92c-a78be3ea5184', 'Flexiones Pliométricas', 'Pectorales', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-621.webp', '{Empuje}', 'fitcron-621', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('8706cfa2-611a-4e52-9ce4-c890491f0429', 'Flexiones con Soportes', 'Pectorales', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-622.webp', '{Empuje}', 'fitcron-622', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('7990a3e9-ddf9-4aeb-bd4f-0a5aef3c946c', 'Flexiones', 'Pectorales', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-623.webp', '{Empuje}', 'fitcron-623', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('54cd0588-1d1d-475d-ab51-9417a9771c14', 'Fondos en Barra', 'Pectorales', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-625.webp', '{Empuje}', 'fitcron-625', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('75ed1dbf-fb2d-49eb-a908-082319ec2581', 'Fondos en Paralelas', 'Pectorales', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-626.webp', '{Empuje}', 'fitcron-626', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('1fcb119d-4ecb-41d0-bc97-641b1f8e5523', 'Aperturas en Máquina', 'Pectorales', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-627.webp', '{Empuje}', 'fitcron-627', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('283ca351-d021-4095-8617-8ae1c83a5952', 'Aperturas Extendidas en Máquina', 'Pectorales', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-628.webp', '{Empuje}', 'fitcron-628', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('132cf73f-d0ca-4ce2-b878-e8b7782b7944', 'Press Banca en Máquina', 'Pectorales', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-629.webp', '{Empuje}', 'fitcron-629', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('b6936719-7c45-4a83-b165-8796224cee40', 'Cruces en Máquina', 'Pectorales', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-630.webp', '{Empuje}', 'fitcron-630', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('d0f71f60-c8d3-4baa-90e1-fbf450da94c3', 'Fondos en Máquina (pecho)', 'Pectorales', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-631.webp', '{Empuje}', 'fitcron-631', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('70ef386a-3dd5-4667-acb1-4f12398ffafc', 'Press Frontal Cerrado en Máquina', 'Pectorales', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-632.webp', '{Empuje}', 'fitcron-632', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('8bce5686-54a5-4833-be3b-823564818af0', 'Press Frontal Superior en Máquina', 'Pectorales', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-633.webp', '{Empuje}', 'fitcron-633', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('0b513d0f-28dc-48be-84bb-09756560cdf3', 'Press Inclinado en Máquina', 'Pectorales', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-634.webp', '{Empuje}', 'fitcron-634', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('5fad600f-c7f8-434f-94b7-c9d16be2bdba', 'Press Frontal Inferior en Máquina', 'Pectorales', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-635.webp', '{Empuje}', 'fitcron-635', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('dd0779fb-ad49-43c7-8327-b66ab379a062', 'Press Frontal en Máquina', 'Pectorales', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-636.webp', '{Empuje}', 'fitcron-636', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('4337b505-1c8a-4aa2-b86f-bc1519e58cb3', 'Apertura Aislada en Punta', 'Pectorales', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-637.webp', '{Empuje}', 'fitcron-637', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('78fe7399-290d-401e-9d50-e7b965435a2f', 'Press Declinado con Barra', 'Pectorales', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-638.webp', '{Empuje}', 'fitcron-638', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('63c815eb-ffca-4bbc-87e6-6b3c667e210a', 'Press Declinado Inverso con Barra', 'Pectorales', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-639.webp', '{Empuje}', 'fitcron-639', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('d762f437-d78a-4fbe-b44d-b02261794d4e', 'Pullover Declinado Cerrado con Barra', 'Pectorales', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-640.webp', '{Empuje}', 'fitcron-640', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('c1c7d70d-fa43-4c83-ba24-230623313106', 'Press Banca Abierto Inverso con Barra', 'Pectorales', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-641.webp', '{Empuje}', 'fitcron-641', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('3a093bc7-4da6-4e78-bc61-488bfc0a89a6', 'Press Inclinado Inverso con Barra', 'Pectorales', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-642.webp', '{Empuje}', 'fitcron-642', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('5b5efd6e-7090-4a4e-b0cb-17c82dc38e91', 'Pullover Declinado con Barra', 'Pectorales', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-643.webp', '{Empuje}', 'fitcron-643', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('8a41c6da-cd33-46c7-b153-65732bcfed09', 'Pullover con Barra', 'Pectorales', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-644.webp', '{Empuje}', 'fitcron-644', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('994ad21c-e7b7-4d24-8769-575f4dadc1d9', 'Press Cerrado en Máquina Smith', 'Pectorales', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-645.webp', '{Empuje}', 'fitcron-645', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('94057bf5-bca2-4bd9-858e-a1e1dd3a1786', 'Press Banca Cerrado con Barra', 'Pectorales', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-646.webp', '{Empuje}', 'fitcron-646', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('5b624b4e-c67d-4482-a086-2a6a2d33a76a', 'Press Banca Abierto con Barra', 'Pectorales', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-647.webp', '{Empuje}', 'fitcron-647', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('5c322fef-c64d-4dc2-98ee-1f50b2c7664d', 'Press Inclinado con Barra', 'Pectorales', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-648.webp', '{Empuje}', 'fitcron-648', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('8bc20712-4a05-4e93-acfa-587aa520e8b3', 'Press Banca con Barra', 'Pectorales', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-649.webp', '{Empuje}', 'fitcron-649', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('d17b5826-905b-4f00-a7e6-bb6eb70991ca', 'Pullover con cuerda en Polea', 'Pectorales', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-650.webp', '{Empuje}', 'fitcron-650', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('79037d82-6f91-4226-b301-b892441269a1', 'Apertura Aislada Declinada con Polea', 'Pectorales', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-651.webp', '{Empuje}', 'fitcron-651', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('967444ce-2116-42f0-94ff-4339f54fba65', 'Press Declinado Aislado con Polea', 'Pectorales', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-652.webp', '{Empuje}', 'fitcron-652', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('950fd4f4-5300-4c68-a3ad-ba0bda8978cd', 'Cruce completo de Poleas', 'Pectorales', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-653.webp', '{Empuje}', 'fitcron-653', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('b243e98f-4e6b-4fd2-827d-531465ff0b37', 'Cruce inferior de Poleas', 'Pectorales', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-654.webp', '{Empuje}', 'fitcron-654', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('d4848f3a-fcd4-4d3f-abce-3b9b8afe4f3a', 'Cruce superior de Poleas', 'Pectorales', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-655.webp', '{Empuje}', 'fitcron-655', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('957c5b9f-77f3-4863-a606-4c87572f44be', 'Press Inclinado Aislado con Polea', 'Pectorales', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-657.webp', '{Empuje}', 'fitcron-657', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('9e26b689-21c4-42fc-8994-b88e936f7aa9', 'Press Banca Aislado con Polea', 'Pectorales', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-658.webp', '{Empuje}', 'fitcron-658', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('44fe5e20-6585-43e0-94d2-de6951ca1928', 'Press Frontal a una mano en Polea', 'Pectorales', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-659.webp', '{Empuje}', 'fitcron-659', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('e1564c8e-a186-4498-8229-ff48d436bcda', 'Press Frontal con Poleas', 'Pectorales', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-660.webp', '{Empuje}', 'fitcron-660', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('440cd56c-d874-494a-9391-a45841588398', 'Press Frontal Cerrado con Poleas', 'Pectorales', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-661.webp', '{Empuje}', 'fitcron-661', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('5f1999b5-2ebd-4302-bd30-916ba564ee0d', 'Press Frontal Neutral con Polea', 'Pectorales', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-662.webp', '{Empuje}', 'fitcron-662', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('8c445621-ffae-450a-9493-5201eaedc92a', 'Press Banca con Bandas', 'Pectorales', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-663.webp', '{Empuje}', 'fitcron-663', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('55f5fb3d-f637-4d9c-a61e-b2ff7ee1a9cd', 'Press Frontal Inclinado con Bandas', 'Pectorales', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-664.webp', '{Empuje}', 'fitcron-664', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('0880bdcd-34e9-4aca-b17e-45f9896c0397', 'Aperturas con Bandas', 'Pectorales', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-665.webp', '{Empuje}', 'fitcron-665', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('4b8fafc0-34cb-4052-ae70-29291120d944', 'Press Frontal en Pronación con Bandas', 'Pectorales', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-666.webp', '{Empuje}', 'fitcron-666', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('84335396-fc9b-440c-98e1-c6ef2949b782', 'Press Frontal Neutral con Banda', 'Pectorales', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-667.webp', '{Empuje}', 'fitcron-667', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('2fe09577-c995-46b7-9d72-cfaee2c403f9', 'Carrera continua', 'Cardio', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-668.webp', '{Cardiorrespiratorio}', 'fitcron-668', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('f6ccb23c-7b58-4215-9054-91f1bc800c4f', 'Burpee', 'Cardio', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-669.webp', '{Cardiorrespiratorio,Multiarticulares}', 'fitcron-669', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('006dcdf6-da9f-47b3-b543-fc66986f9254', 'Burpee con Mancuernas', 'Cardio', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-670.webp', '{Cardiorrespiratorio,Multiarticulares}', 'fitcron-670', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('30c455e7-d017-4663-904a-b901e7ff58c7', 'Burpee Jack', 'Cardio', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-671.webp', '{Cardiorrespiratorio,Multiarticulares}', 'fitcron-671', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('b916a6ff-6ae5-452e-a73f-d0c5daedf2ca', 'Caminar con peso', 'Cardio', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-672.webp', '{Cardiorrespiratorio}', 'fitcron-672', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('2b7c86b6-8803-44eb-a396-2a846330fc04', 'Caminar', 'Cardio', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-673.webp', '{Cardiorrespiratorio}', 'fitcron-673', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('a4fae8fc-75c3-4104-a60c-3589f9df7a2e', 'Paso lateral con Banda', 'Cardio', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-674.webp', '{Cardiorrespiratorio}', 'fitcron-674', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('a95a0ae0-5498-45d7-832c-73242ec2f0b4', 'Caminar a paso ligero', 'Cardio', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-675.webp', '{Cardiorrespiratorio}', 'fitcron-675', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('e5d1505d-3bb2-4183-856d-b0a25945d609', 'Butt Kicks', 'Cardio', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-676.webp', '{Cardiorrespiratorio}', 'fitcron-676', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('b828accc-c5e0-4081-a080-365a8b992324', 'Split Jacks', 'Cardio', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-677.webp', '{Cardiorrespiratorio}', 'fitcron-677', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('60b7b80b-4265-4256-bf4c-1f9fe6e38662', 'Mountain Climbers', 'Cardio', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-678.webp', '{Cardiorrespiratorio}', 'fitcron-678', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('71367e82-ef13-4b6b-9015-5344fd294961', 'Carrera de skater', 'Cardio', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-679.webp', '{Cardiorrespiratorio}', 'fitcron-679', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('089e8fb7-b2cd-4b1c-a908-787f664941a9', 'Plyo Jacks', 'Cardio', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-680.webp', '{Cardiorrespiratorio}', 'fitcron-680', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('d8c28014-5ced-4d7a-bfbf-1be6a43c5ec9', 'Jumping Jacks', 'Cardio', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-681.webp', '{Cardiorrespiratorio}', 'fitcron-681', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('da42122b-5695-4567-9eec-bb2d7b9b4400', 'Rodilla al codo con sentadilla', 'Cardio', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-682.webp', '{Cardiorrespiratorio}', 'fitcron-682', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('88970c51-b897-4111-b463-9a98f0ed5a13', 'Rodilla al codo', 'Cardio', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-683.webp', '{Cardiorrespiratorio}', 'fitcron-683', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('8da6febc-e4a6-4b47-a3b9-1167c0734124', 'Rodilla al codo con giro', 'Cardio', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-684.webp', '{Cardiorrespiratorio}', 'fitcron-684', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('df6d36eb-8de7-4634-bbd0-fbabbf493af0', 'Pies rápidos de pie', 'Cardio', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-685.webp', '{Cardiorrespiratorio}', 'fitcron-685', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('9195a2d1-3dbe-43dd-92d4-e95cf09ba39b', 'Salto alterno en el sitio', 'Cardio', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-686.webp', '{Cardiorrespiratorio}', 'fitcron-686', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('c2fccd71-54df-4a5b-9f9b-5e4c21988940', 'Carrera en zigzag', 'Cardio', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-687.webp', '{Cardiorrespiratorio}', 'fitcron-687', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('b680c5bd-1ad4-4d93-a42b-03ddde491a96', 'Skips', 'Cardio', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-688.webp', '{Cardiorrespiratorio}', 'fitcron-688', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('95ba6096-7630-40c2-8c3f-5802a8debe9c', 'Carrera rápida en el sitio', 'Cardio', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-689.webp', '{Cardiorrespiratorio}', 'fitcron-689', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('15e58d13-7cdd-41f3-aebc-7a77683ab47d', 'Elevación de rodillas con apoyo', 'Cardio', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-690.webp', '{Cardiorrespiratorio}', 'fitcron-690', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('2bcf6def-cfd0-4514-b3d3-a07df1b6d450', 'Pies rápidos agachado', 'Cardio', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-691.webp', '{Cardiorrespiratorio}', 'fitcron-691', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('53919cee-642a-41d6-a4a9-9f78bcb420fa', 'Patadas altas', 'Cardio', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-692.webp', '{Cardiorrespiratorio}', 'fitcron-692', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('49f8a70f-9549-4ba4-a59c-e9d1c7bb333f', 'Carrera con salto', 'Cardio', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-693.webp', '{Cardiorrespiratorio}', 'fitcron-693', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('96fc516e-3f9d-4799-889d-d8a4ca961ab0', 'Carrera de pasos cortos', 'Cardio', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-694.webp', '{Cardiorrespiratorio}', 'fitcron-694', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('b8fbcc4c-c720-4327-9eb5-877af235b222', 'Caminar con rodilla arriba', 'Cardio', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-695.webp', '{Cardiorrespiratorio}', 'fitcron-695', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('3788c7c6-ab92-40e6-8f71-fa8e62afc24b', 'Salto con desplazamiento lateral cruzado', 'Cardio', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-696.webp', '{Cardiorrespiratorio}', 'fitcron-696', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('c8d5f2d4-6939-44d5-adeb-7269ef14c26b', 'Salto de esquí', 'Cardio', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-697.webp', '{Cardiorrespiratorio}', 'fitcron-697', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('0600d99a-c64d-4653-bdf6-ae1083621baf', 'Elevación lateral en máquina', 'Hombros', NULL, '2026-11-24 21:51:58.44469-03', '/ejercicios/fitcron-320.webp', '{Empuje}', NULL, NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('c3d03840-668d-4cee-87f6-18f89c99671b', 'Salto con desplazamiento lateral', 'Cardio', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-698.webp', '{Cardiorrespiratorio}', 'fitcron-698', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('7c3e7f1f-50d2-43a4-831c-62e6ea54fe6e', 'Golpes alternos', 'Cardio', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-699.webp', '{Cardiorrespiratorio}', 'fitcron-699', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('66571f66-1bed-4ff1-89ae-40931d24487a', 'Desplazamientos de Boxeo', 'Cardio', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-700.webp', '{Cardiorrespiratorio}', 'fitcron-700', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('8b57a04f-9d4f-41a0-80b5-794c7f8b9398', 'Elevación de rodillas', 'Cardio', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-701.webp', '{Cardiorrespiratorio}', 'fitcron-701', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('ec9b4c6e-4ad6-45d2-9411-8681c734f91a', 'Zancada con salto', 'Cardio', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-702.webp', '{Cardiorrespiratorio}', 'fitcron-702', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('f81f2271-3e8a-4140-b5ce-4c301ce2837e', 'Squat Tuck Jumps', 'Cardio', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-703.webp', '{Cardiorrespiratorio}', 'fitcron-703', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('8743c37c-be9d-42d0-9631-8309c53d5cad', 'Tuck Jumps', 'Cardio', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-704.webp', '{Cardiorrespiratorio}', 'fitcron-704', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('e1b67361-bc27-4deb-834c-0a921a1da84c', 'Sprints con rodilla alta', 'Cardio', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-705.webp', '{Cardiorrespiratorio}', 'fitcron-705', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('93bf4c21-52a1-4efc-b5ef-95a89715969b', 'Step Up', 'Cardio', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-706.webp', '{Cardiorrespiratorio}', 'fitcron-706', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('27857d64-4664-4300-9d5a-3600ca81a7c0', 'Carrera hacia atrás', 'Cardio', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-707.webp', '{Cardiorrespiratorio}', 'fitcron-707', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('cbe125f1-2f37-4118-af9e-9d5581bdece6', 'Caminar en cuclillas', 'Cardio', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-708.webp', '{Cardiorrespiratorio}', 'fitcron-708', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('0a0ac7b3-8252-424b-affb-3ceb3bdfccbc', 'Máquina Escaladora', 'Cardio', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-709.webp', '{Cardiorrespiratorio}', 'fitcron-709', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('ae73818f-460c-47cc-8995-11548588199e', 'Máquina Elíptica', 'Cardio', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-710.webp', '{Cardiorrespiratorio}', 'fitcron-710', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('0d41a04c-9837-4bd1-bccd-c4d8a85a975c', 'Máquina de Step', 'Cardio', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-711.webp', '{Cardiorrespiratorio}', 'fitcron-711', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('b71b705a-4f6e-436f-8472-bab4ffd16dc0', 'Krankcycle', 'Cardio', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-712.webp', '{Cardiorrespiratorio}', 'fitcron-712', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('5c5e4f6e-2769-42c3-8988-c05c7f64ad5f', 'Bicicleta Estática Normal', 'Cardio', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-713.webp', '{Cardiorrespiratorio}', 'fitcron-713', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('6fbdb917-2094-477d-9d77-9c033b666537', 'Bicicleta Estática Deportiva', 'Cardio', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-714.webp', '{Cardiorrespiratorio}', 'fitcron-714', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('47414074-9aac-4678-844c-c8cff8d9e931', 'Máquina de Remo', 'Cardio', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-715.webp', '{Cardiorrespiratorio}', 'fitcron-715', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('c8f4ec77-5675-4c31-9177-af8efa4dc503', 'Carrera en Cinta Inclinada', 'Cardio', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-716.webp', '{Cardiorrespiratorio}', 'fitcron-716', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('946ba89b-b11e-4f08-a738-8425ca655fe6', 'Carrera en Cinta', 'Cardio', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-717.webp', '{Cardiorrespiratorio}', 'fitcron-717', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('862629f1-ed3b-4e0c-87c7-33fe61425bf2', 'Bicicleta Estática Reclinada', 'Cardio', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-718.webp', '{Cardiorrespiratorio}', 'fitcron-718', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('5a376cf9-1f17-4abd-9ac8-07b012795da2', 'Air Bike', 'Cardio', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-719.webp', '{Cardiorrespiratorio}', 'fitcron-719', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('e977a4a9-0b19-4cb4-9067-26d5cc32f777', 'Salto con Cuerda Alterno Alto', 'Cardio', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-720.webp', '{Cardiorrespiratorio}', 'fitcron-720', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('d5f5287c-308e-4c32-a92d-3f864b41b5f3', 'Salto con Cuerda Alterno Normal', 'Cardio', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-721.webp', '{Cardiorrespiratorio}', 'fitcron-721', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('a9e865dc-c352-43fa-816a-99ebeb1cf9b6', 'Salto con Cuerda Alto', 'Cardio', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-722.webp', '{Cardiorrespiratorio}', 'fitcron-722', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('bfce31bb-c467-411b-811c-5c6568b7ad84', 'Salto con Cuerda Lateral', 'Cardio', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-723.webp', '{Cardiorrespiratorio}', 'fitcron-723', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('27669488-6ec3-49d0-a277-91da581d79d3', 'Salto con Cuerda Normal', 'Cardio', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-724.webp', '{Cardiorrespiratorio}', 'fitcron-724', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('c56c45fd-c77b-4116-832f-fafe3a59c313', 'Flexión Frontal con Disco (cuello)', 'Cuello', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-725.webp', '{"Zona media"}', 'fitcron-725', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('4a33de8e-b0c4-4266-9bfd-302efcc3b503', 'Extensión Frontal con Disco (cuello)', 'Cuello', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-726.webp', '{"Zona media"}', 'fitcron-726', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('fd231d5d-2f1f-46aa-9c50-cb1869042d4d', 'Extensión Frontal con Arnés (cuello)', 'Cuello', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-727.webp', '{"Zona media"}', 'fitcron-727', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('d6a593d8-b178-477f-bdfd-5ee9caf711e9', 'Extensión Lateral con Arnés (cuello)', 'Cuello', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-728.webp', '{"Zona media"}', 'fitcron-728', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('a79ac81b-80be-4f13-bafc-8c282a28b0ff', 'Flexión Frontal en Polea (cuello)', 'Cuello', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-729.webp', '{"Zona media"}', 'fitcron-729', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('bb930044-b311-4c2d-9849-28b605dfd89b', 'Extensión Frontal en Polea (cuello)', 'Cuello', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-730.webp', '{"Zona media"}', 'fitcron-730', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('699dc22d-74d4-4cc0-a223-a984e2091aba', 'Extensión Lateral en Máquina (cuello)', 'Cuello', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-731.webp', '{"Zona media"}', 'fitcron-731', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('bf3f3921-dd90-4d51-b1e0-355d73cba548', 'Extensión Frontal en Máquina (cuello)', 'Cuello', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-732.webp', '{"Zona media"}', 'fitcron-732', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('25c2cdb8-b502-46f5-82ee-614a0410c86b', 'Curl a una mano en Polea Alta', 'Antebrazo', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-733.webp', '{Brazos}', 'fitcron-733', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('aee51a83-b4c4-4b54-bd16-1adb6578772a', 'Curl Vertical en Polea Baja', 'Antebrazo', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-734.webp', '{Brazos}', 'fitcron-734', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('4a7b0b69-3b3e-4f8d-ac43-aad3194683b5', 'Curl Concentrado en Supinación con Polea', 'Antebrazo', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-735.webp', '{Brazos}', 'fitcron-735', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('8e4440e5-0dc8-4608-aeaf-b62189260fac', 'Curl Concentrado en Pronación con Polea', 'Antebrazo', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-736.webp', '{Brazos}', 'fitcron-736', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('b05bb956-7188-46d8-9d25-9607e21a468d', 'Hand Grip', 'Antebrazo', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-737.webp', '{Brazos}', 'fitcron-737', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('16041665-1e87-4a6d-ab43-4e71fddde19b', 'Wrist Roller', 'Antebrazo', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-738.webp', '{Brazos}', 'fitcron-738', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('53ee5813-2d19-40e0-a18e-ca0514363ed2', 'Rotación Concentrada con Mancuerna', 'Antebrazo', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-739.webp', '{Brazos}', 'fitcron-739', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('6468ad2c-5e6c-4540-a667-3fcfc91248d8', 'Curl Concentrado Neutral con Mancuerna', 'Antebrazo', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-740.webp', '{Brazos}', 'fitcron-740', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('4fcfa241-3708-4c1f-9d3b-2df8d1cfc074', 'Curl Concentrado en Pronación con Mancuerna (antebrazo)', 'Antebrazo', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-741.webp', '{Brazos}', 'fitcron-741', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('9e82d182-81d7-4803-bd00-c3e46ad3d4c0', 'Curl Concentrado en Supinación con Mancuerna (antebrazo)', 'Antebrazo', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-742.webp', '{Brazos}', 'fitcron-742', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('f3210c3d-140e-41d7-a6bd-16d2e41e2514', 'Curl Inclinado con Barra', 'Antebrazo', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-743.webp', '{Brazos}', 'fitcron-743', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('f910fa63-a700-49c5-8d75-d7bccbc28e3a', 'Curl Vertical en Supinación con Barra', 'Antebrazo', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-744.webp', '{Brazos}', 'fitcron-744', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('e80530cd-d0ad-4aae-a938-2ec4d8c6ab44', 'Curl Vertical de Dedos con Barra', 'Antebrazo', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-745.webp', '{Brazos}', 'fitcron-745', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('7adafec0-26a2-4d07-8008-ed3974843049', 'Curl Concentrado de Dedos con Barra', 'Antebrazo', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-746.webp', '{Brazos}', 'fitcron-746', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('3fcb852b-2531-4a25-9923-1baae418301e', 'Curl Concentrado en Pronación con Barra', 'Antebrazo', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-747.webp', '{Brazos}', 'fitcron-747', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('a810405d-6142-41c3-b4a0-7af64db0885f', 'Curl Concentrado en Supinación con Barra', 'Antebrazo', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-748.webp', '{Brazos}', 'fitcron-748', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('549b8239-a9b6-492a-9fff-0c14494dbd3e', 'Curl Concentrado en Pronación con Banda', 'Antebrazo', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-749.webp', '{Brazos}', 'fitcron-749', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('a5a584a0-4e04-4d35-9e4b-e53287dd3c4c', 'Curl Concentrado en Supinación con Banda', 'Antebrazo', NULL, '2026-11-24 21:51:59.178811-03', '/ejercicios/fitcron-750.webp', '{Brazos}', 'fitcron-750', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('e775f392-b60b-4497-9bf1-ae87691e7cd0', 'Flexiones de brazos', 'Pectorales', NULL, '2026-11-24 21:51:58.44469-03', '/ejercicios/fitcron-623.webp', '{Empuje}', NULL, NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('dd9bb8a5-b89c-4a3a-a9e5-fa75a566995f', 'Flexiones con pies elevados', 'Pectorales', NULL, '2026-11-24 21:51:58.44469-03', '/ejercicios/fitcron-617.webp', '{Empuje}', NULL, NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('10bad6ff-065d-41f0-8d09-076b6817be7a', 'Pec deck', 'Pectorales', NULL, '2026-11-24 21:51:58.44469-03', '/ejercicios/fitcron-627.webp', '{Empuje}', NULL, NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('7929461f-0552-4aab-959f-e5083c84f940', 'Press de hombros con mancuernas', 'Hombros', NULL, '2026-11-24 21:51:58.44469-03', '/ejercicios/fitcron-332.webp', '{Empuje}', NULL, NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('f0f74268-b0f6-4012-91b7-d6c4f9ddf15a', 'Press de hombros en máquina', 'Hombros', NULL, '2026-11-24 21:51:58.44469-03', '/ejercicios/fitcron-317.webp', '{Empuje}', NULL, NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('1608047a-5945-4112-b62e-6e19004f2126', 'Dominadas pronas', 'Espalda', NULL, '2026-11-24 21:51:58.44469-03', '/ejercicios/fitcron-404.webp', '{Tracción}', NULL, NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('f6056d72-364b-4edd-82dd-2dd827c2147f', 'Dominadas supinas', 'Espalda', NULL, '2026-11-24 21:51:58.44469-03', '/ejercicios/fitcron-402.webp', '{Tracción}', NULL, NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('3ffa2288-6807-4667-b3b0-9cc49e434583', 'Dominadas neutras', 'Espalda', NULL, '2026-11-24 21:51:58.44469-03', '/ejercicios/fitcron-406.webp', '{Tracción}', NULL, NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('313aa659-2290-4c4a-a178-0e0653177cee', 'Jalón al pecho agarre pronado', 'Espalda', NULL, '2026-11-24 21:51:58.44469-03', '/ejercicios/fitcron-241.webp', '{Tracción}', NULL, NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('2eb77394-01ba-4918-8244-4e1c0889f90c', 'Jalón al pecho agarre neutro', 'Espalda', NULL, '2026-11-24 21:51:58.44469-03', '/ejercicios/fitcron-223.webp', '{Tracción}', NULL, NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('99da40eb-adfe-45b1-b6fc-7639640c0909', 'Jalón unilateral en polea', 'Espalda', NULL, '2026-11-24 21:51:58.44469-03', '/ejercicios/fitcron-258.webp', '{Tracción}', NULL, NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('9bead206-0574-4afc-b9ac-999259189782', 'Remo con barra', 'Espalda', NULL, '2026-11-24 21:51:58.44469-03', '/ejercicios/fitcron-432.webp', '{Tracción}', NULL, NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('cdd2cfc1-f621-4707-a7b6-55d187bce71a', 'Remo con mancuerna', 'Espalda', NULL, '2026-11-24 21:51:58.44469-03', '/ejercicios/fitcron-419.webp', '{Tracción}', NULL, NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('72189a30-10d1-428a-9193-8d94fb8494a5', 'Remo en máquina con pecho apoyado', 'Espalda', NULL, '2026-11-24 21:51:58.44469-03', '/ejercicios/fitcron-392.webp', '{Tracción}', NULL, NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('fbf4bb30-022f-4110-967f-5e4dd13c653a', 'Remo sentado en polea', 'Espalda', NULL, '2026-11-24 21:51:58.44469-03', '/ejercicios/fitcron-224.webp', '{Tracción}', NULL, NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('bf9d78d3-c029-445d-8d42-a59bc9075281', 'Remo unilateral en polea', 'Espalda', NULL, '2026-11-24 21:51:58.44469-03', '/ejercicios/fitcron-255.webp', '{Tracción}', NULL, NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('896b66db-de1c-47bd-a82b-2530b7558104', 'Pájaro con mancuernas', 'Hombros', NULL, '2026-11-24 21:51:58.44469-03', '/ejercicios/fitcron-342.webp', '{Empuje}', NULL, NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('35efb586-f143-4ef4-8da1-128a82e5f093', 'Reverse pec deck', 'Hombros', NULL, '2026-11-24 21:51:58.44469-03', '/ejercicios/fitcron-311.webp', '{Empuje}', NULL, NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('6a5898e9-44fd-40d2-bbae-120563864383', 'Sentadilla trasera', 'Piernas', NULL, '2026-11-24 21:51:58.44469-03', '/ejercicios/fitcron-152.webp', '{Piernas}', NULL, NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('7f14a1eb-1f40-4dd9-8c1b-b5e50a161c8e', 'Prensa de piernas', 'Piernas', NULL, '2026-11-24 21:51:58.44469-03', '/ejercicios/fitcron-169.webp', '{Piernas}', NULL, NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('03894284-00cd-4612-98d5-65aed556fba5', 'Sentadilla búlgara', 'Piernas', NULL, '2026-11-24 21:51:58.44469-03', '/ejercicios/fitcron-127.webp', '{Piernas}', NULL, NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('98a6e4ea-d845-4b0f-88e8-651fece80a33', 'Zancadas', 'Piernas', NULL, '2026-11-24 21:51:58.44469-03', '/ejercicios/fitcron-113.webp', '{Piernas}', NULL, NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('18eb2e92-80a9-413d-a20d-5da4f01c5e11', 'Step-up', 'Piernas', NULL, '2026-11-24 21:51:58.44469-03', '/ejercicios/fitcron-105.webp', '{Piernas}', NULL, NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('90bda9d7-5fab-4b6b-8e21-e57ccd1d1120', 'Extensión de rodilla', 'Piernas', NULL, '2026-11-24 21:51:58.44469-03', '/ejercicios/fitcron-179.webp', '{Piernas}', NULL, NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('acde63db-c7cc-4b92-abf4-347e6d242437', 'Peso muerto rumano', 'Piernas', NULL, '2026-11-24 21:51:58.44469-03', '/ejercicios/fitcron-149.webp', '{Piernas}', NULL, NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('c803e34e-03ba-4c53-8385-5b299a50b3ee', 'Extensión lumbar 45°', 'Espalda', NULL, '2026-11-24 21:51:58.44469-03', '/ejercicios/fitcron-416.webp', '{Tracción}', NULL, NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('97b450a7-edb6-4995-b94f-5147cf7b93dd', 'Curl femoral tumbado', 'Piernas', NULL, '2026-11-24 21:51:58.44469-03', '/ejercicios/fitcron-170.webp', '{Piernas}', NULL, NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('50529c4b-9c64-4f06-a993-f4506ed268d4', 'Curl femoral unilateral', 'Piernas', NULL, '2026-11-24 21:51:58.44469-03', '/ejercicios/fitcron-162.webp', '{Piernas}', NULL, NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('cc2c929d-37e1-4494-9be5-77a0c2bd944a', 'Aducción de cadera en máquina', 'Piernas', NULL, '2026-11-24 21:51:58.44469-03', '/ejercicios/fitcron-178.webp', '{Piernas}', NULL, NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('7dd2865c-5fb2-43e9-9111-88cac4653a30', 'Patada de glúteo en polea', 'Glúteos', NULL, '2026-11-24 21:51:58.44469-03', '/ejercicios/fitcron-214.webp', '{Piernas}', NULL, NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('e1ad9ca3-99d0-4d82-8be1-f1c104e2f4d8', 'Elevación de talones de pie', 'Piernas', NULL, '2026-11-24 21:51:58.44469-03', '/ejercicios/fitcron-187.webp', '{Piernas}', NULL, NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('7ef4b8c8-7092-4511-85a9-1b1cb8059782', 'Elevación de talones sentado', 'Piernas', NULL, '2026-11-24 21:51:58.44469-03', '/ejercicios/fitcron-160.webp', '{Piernas}', NULL, NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('26bf6240-b7c2-4623-b0fd-7ea7470f1f4e', 'Elevación de talones en prensa', 'Piernas', NULL, '2026-11-24 21:51:58.44469-03', '/ejercicios/fitcron-166.webp', '{Piernas}', NULL, NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('7474c5e4-d439-440b-950e-14f62f4ea686', 'Curl con barra', 'Bíceps', NULL, '2026-11-24 21:51:58.44469-03', '/ejercicios/fitcron-526.webp', '{Tracción,Brazos}', NULL, NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('2ad762c4-945d-443d-bb34-6afdee55bfc0', 'Curl con mancuernas', 'Bíceps', NULL, '2026-11-24 21:51:58.44469-03', '/ejercicios/fitcron-488.webp', '{Tracción,Brazos}', NULL, NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('4ea25c28-bba3-4470-acd7-ad6e4e595f4a', 'Curl inclinado con mancuernas', 'Bíceps', NULL, '2026-11-24 21:51:58.44469-03', '/ejercicios/fitcron-510.webp', '{Tracción,Brazos}', NULL, NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('4ff305ed-ecd8-488d-861f-cb106a14dfc9', 'Curl predicador', 'Bíceps', NULL, '2026-11-24 21:51:58.44469-03', '/ejercicios/fitcron-529.webp', '{Tracción,Brazos}', NULL, NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('bb4f0db3-6b22-4d2d-8c1d-482d1c038a1b', 'Curl martillo', 'Bíceps', NULL, '2026-11-24 21:51:58.44469-03', '/ejercicios/fitcron-489.webp', '{Tracción,Brazos}', NULL, NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('eb98a116-0833-470b-b9cd-f33abf54c34b', 'Curl en polea baja', 'Bíceps', NULL, '2026-11-24 21:51:58.44469-03', '/ejercicios/fitcron-460.webp', '{Tracción,Brazos}', NULL, NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('9f52e0bf-0826-4e37-a228-cbfdf84083a5', 'Press cerrado', 'Tríceps', NULL, '2026-11-24 21:51:58.44469-03', '/ejercicios/fitcron-572.webp', '{Empuje,Brazos}', NULL, NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('a68f5a1c-43c0-4b79-9fb5-5daceb753d2d', 'Extensión de tríceps en polea', 'Tríceps', NULL, '2026-11-24 21:51:58.44469-03', '/ejercicios/fitcron-440.webp', '{Empuje,Brazos}', NULL, NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('d52100c1-3775-4ad1-b3c1-b76299599beb', 'Press francés', 'Tríceps', NULL, '2026-11-24 21:51:58.44469-03', '/ejercicios/fitcron-570.webp', '{Empuje,Brazos}', NULL, NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('7735ca1b-ff43-4a64-897a-919e7d1f0343', 'Elevación lateral con mancuernas', 'Hombros', NULL, '2026-11-24 21:51:58.44469-03', '/ejercicios/fitcron-365.webp', '{Empuje}', NULL, NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('b00e72ec-c4ad-41eb-aa9c-597d85974353', 'Elevación lateral en polea', 'Hombros', NULL, '2026-11-24 21:51:58.44469-03', '/ejercicios/fitcron-275.webp', '{Empuje}', NULL, NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('182c62d7-0015-488c-ae1b-08ec0f45129c', 'Elevación frontal', 'Hombros', NULL, '2026-11-24 21:51:58.44469-03', '/ejercicios/fitcron-323.webp', '{Empuje}', NULL, NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('a13e0ae9-1d50-4ea6-b84b-9850fe92c4ad', 'Crunch en polea', 'Abdominales', NULL, '2026-11-24 21:51:58.44469-03', '/ejercicios/fitcron-86.webp', '{"Zona media"}', NULL, NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('92933eaa-8557-4207-920e-44f43b9afb1c', 'Elevación de piernas colgado', 'Abdominales', NULL, '2026-11-24 21:51:58.44469-03', '/ejercicios/fitcron-72.webp', '{"Zona media"}', NULL, NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.ejercicios (id, nombre, grupo_muscular, video_url, creado_en, imagen_url, categorias, origen, archivado_en, creado_por) VALUES ('f62002aa-9900-4863-8096-32abf753f2e6', 'Encogimientos con barra', 'Espalda', NULL, '2026-11-24 21:51:58.44469-03', '/ejercicios/fitcron-382.webp', '{Tracción}', NULL, NULL, NULL) ON CONFLICT DO NOTHING;


--
-- Data for Name: pagina_inicio; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.pagina_inicio (id, textos, secciones, foto_fundador_url, video_celular_url, video_compu_url, actualizado_en) VALUES (1, '{}', '{}', NULL, NULL, NULL, '2026-11-24 21:51:59.371704-03') ON CONFLICT DO NOTHING;


--
-- Data for Name: planes; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.planes (id, nombre, precio_primer_mes, precio_mensual, activo, orden, descripcion, link_mp, espacio_id) VALUES ('seguimiento', 'Plan seguimiento', 5000, 4000, true, 1, 'Rutina a medida y seguimiento presencial', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.planes (id, nombre, precio_primer_mes, precio_mensual, activo, orden, descripcion, link_mp, espacio_id) VALUES ('seguimiento-online', 'Plan seguimiento online', 3000, 1500, true, 2, 'Rutina y seguimiento solo online; una visita al mes si se puede', NULL, NULL) ON CONFLICT DO NOTHING;
INSERT INTO public.planes (id, nombre, precio_primer_mes, precio_mensual, activo, orden, descripcion, link_mp, espacio_id) VALUES ('rutina', 'Plan rutina', 1500, 500, true, 3, 'Solo la rutina: entrenás por tu cuenta', NULL, NULL) ON CONFLICT DO NOTHING;


--
-- Data for Name: planes_drey; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.planes_drey (id, nombre, tipo, cupos, precio_mensual, precio_primer_mes, link_mp, descripcion, activo, orden, creado_en) VALUES ('profe-10', 'Profe 10', 'profe', 10, 990, NULL, NULL, NULL, true, 10, '2026-11-24 21:51:59.58354-03') ON CONFLICT DO NOTHING;
INSERT INTO public.planes_drey (id, nombre, tipo, cupos, precio_mensual, precio_primer_mes, link_mp, descripcion, activo, orden, creado_en) VALUES ('profe-25', 'Profe 25', 'profe', 25, 1990, NULL, NULL, NULL, true, 20, '2026-11-24 21:51:59.58354-03') ON CONFLICT DO NOTHING;
INSERT INTO public.planes_drey (id, nombre, tipo, cupos, precio_mensual, precio_primer_mes, link_mp, descripcion, activo, orden, creado_en) VALUES ('profe-50', 'Profe 50', 'profe', 50, 3490, NULL, NULL, NULL, true, 30, '2026-11-24 21:51:59.58354-03') ON CONFLICT DO NOTHING;
INSERT INTO public.planes_drey (id, nombre, tipo, cupos, precio_mensual, precio_primer_mes, link_mp, descripcion, activo, orden, creado_en) VALUES ('gimnasio-50', 'Gimnasio 50', 'gimnasio', 50, 4990, NULL, NULL, NULL, true, 40, '2026-11-24 21:51:59.58354-03') ON CONFLICT DO NOTHING;
INSERT INTO public.planes_drey (id, nombre, tipo, cupos, precio_mensual, precio_primer_mes, link_mp, descripcion, activo, orden, creado_en) VALUES ('gimnasio-100', 'Gimnasio 100', 'gimnasio', 100, 7990, NULL, NULL, NULL, true, 50, '2026-11-24 21:51:59.58354-03') ON CONFLICT DO NOTHING;
INSERT INTO public.planes_drey (id, nombre, tipo, cupos, precio_mensual, precio_primer_mes, link_mp, descripcion, activo, orden, creado_en) VALUES ('gimnasio-200', 'Gimnasio 200', 'gimnasio', 200, 12990, NULL, NULL, NULL, true, 60, '2026-11-24 21:51:59.58354-03') ON CONFLICT DO NOTHING;


--
-- Data for Name: tipos_aviso; Type: TABLE DATA; Schema: public; Owner: -
--

INSERT INTO public.tipos_aviso (clave, orden, grupo, disparo, nombre, descripcion, activo, titulo, cuerpo, titulo_original, cuerpo_original, url, hora, hora_original, dias, dias_original, dias_etiqueta, destino, destinos_posibles, planes, variables, requiere, nota, actualizado_en) VALUES ('hoy', 10, 'alumno', 'horario', 'Hoy te toca', 'Cada día que tiene una rutina asignada en su calendario, si todavía no entrenó.', true, 'Hoy te toca {rutina} 🔥', 'Tu entrenamiento de hoy te espera.', 'Hoy te toca {rutina} 🔥', 'Tu entrenamiento de hoy te espera.', '/inicio', '08:00:00', '08:00:00', NULL, NULL, NULL, NULL, '{}', NULL, '[{"clave": "nombre", "texto": "Nombre del alumno", "ejemplo": "Facu"}, {"clave": "rutina", "texto": "Rutina del día", "ejemplo": "Piernas"}]', NULL, 'Cada alumno puede elegir otra hora en Perfil → Recordatorio para entrenar. Si no elige, le llega a esta hora.', '2026-11-24 21:51:59.48092-03') ON CONFLICT DO NOTHING;
INSERT INTO public.tipos_aviso (clave, orden, grupo, disparo, nombre, descripcion, activo, titulo, cuerpo, titulo_original, cuerpo_original, url, hora, hora_original, dias, dias_original, dias_etiqueta, destino, destinos_posibles, planes, variables, requiere, nota, actualizado_en) VALUES ('vence-antes', 20, 'alumno', 'horario', 'Tu plan vence pronto', 'Unos días antes de que venza el plan (los "días de aviso" de Ajustes → Plazos), si todavía no avisó que pagó.', true, 'Tu plan vence en {dias} días', 'Renovalo desde la app para no cortar tu entrenamiento.', 'Tu plan vence en {dias} días', 'Renovalo desde la app para no cortar tu entrenamiento.', '/suscripcion', '08:00:00', '08:00:00', NULL, NULL, NULL, NULL, '{}', NULL, '[{"clave": "nombre", "texto": "Nombre del alumno", "ejemplo": "Facu"}, {"clave": "dias", "texto": "Días que faltan", "ejemplo": "5"}, {"clave": "fecha", "texto": "Fecha de vencimiento", "ejemplo": "20/10"}]', NULL, 'Los días se cambian en Ajustes → Plazos ("avisar al cliente cuántos días antes"). Es el mismo número del cartel que ve en la app.', '2026-11-24 21:51:59.48092-03') ON CONFLICT DO NOTHING;
INSERT INTO public.tipos_aviso (clave, orden, grupo, disparo, nombre, descripcion, activo, titulo, cuerpo, titulo_original, cuerpo_original, url, hora, hora_original, dias, dias_original, dias_etiqueta, destino, destinos_posibles, planes, variables, requiere, nota, actualizado_en) VALUES ('vence-hoy', 30, 'alumno', 'horario', 'Tu plan vence hoy', 'El día que vence el plan, si todavía no avisó que pagó.', true, 'Tu plan vence hoy', 'Podés pagar desde la app en un minuto.', 'Tu plan vence hoy', 'Podés pagar desde la app en un minuto.', '/suscripcion', '08:00:00', '08:00:00', NULL, NULL, NULL, NULL, '{}', NULL, '[{"clave": "nombre", "texto": "Nombre del alumno", "ejemplo": "Facu"}, {"clave": "fecha", "texto": "Fecha de vencimiento", "ejemplo": "20/10"}]', NULL, NULL, '2026-11-24 21:51:59.48092-03') ON CONFLICT DO NOTHING;
INSERT INTO public.tipos_aviso (clave, orden, grupo, disparo, nombre, descripcion, activo, titulo, cuerpo, titulo_original, cuerpo_original, url, hora, hora_original, dias, dias_original, dias_etiqueta, destino, destinos_posibles, planes, variables, requiere, nota, actualizado_en) VALUES ('gracia', 40, 'alumno', 'horario', 'Último día para pagar', 'El último de los días de gracia (Ajustes → Plazos). Al día siguiente se pausa el acceso a las rutinas.', true, 'Último día para pagar', 'Mañana se pausa el acceso a tus rutinas.', 'Último día para pagar', 'Mañana se pausa el acceso a tus rutinas.', '/suscripcion', '08:00:00', '08:00:00', NULL, NULL, NULL, NULL, '{}', NULL, '[{"clave": "nombre", "texto": "Nombre del alumno", "ejemplo": "Facu"}, {"clave": "fecha", "texto": "Fecha de vencimiento", "ejemplo": "20/10"}]', NULL, 'Los días de gracia se cambian en Ajustes → Plazos.', '2026-11-24 21:51:59.48092-03') ON CONFLICT DO NOTHING;
INSERT INTO public.tipos_aviso (clave, orden, grupo, disparo, nombre, descripcion, activo, titulo, cuerpo, titulo_original, cuerpo_original, url, hora, hora_original, dias, dias_original, dias_etiqueta, destino, destinos_posibles, planes, variables, requiere, nota, actualizado_en) VALUES ('sin-entrenar', 50, 'alumno', 'horario', 'Hace días que no entrenás', 'Cuando el alumno pasa varios días sin registrar un entrenamiento. Una sola vez por cada racha sin entrenar.', true, 'Hace {dias} días que no entrenás', 'Tu rutina te espera, {nombre}. ¡Volvé hoy! 💪', 'Hace {dias} días que no entrenás', 'Tu rutina te espera, {nombre}. ¡Volvé hoy! 💪', '/inicio', '18:00:00', '18:00:00', 5, 5, 'Días sin entrenar', NULL, '{}', NULL, '[{"clave": "nombre", "texto": "Nombre del alumno", "ejemplo": "Facu"}, {"clave": "dias", "texto": "Días sin entrenar", "ejemplo": "5"}]', NULL, 'Solo a alumnos con el plan al día y alguna rutina publicada.', '2026-11-24 21:51:59.48092-03') ON CONFLICT DO NOTHING;
INSERT INTO public.tipos_aviso (clave, orden, grupo, disparo, nombre, descripcion, activo, titulo, cuerpo, titulo_original, cuerpo_original, url, hora, hora_original, dias, dias_original, dias_etiqueta, destino, destinos_posibles, planes, variables, requiere, nota, actualizado_en) VALUES ('rutina-nueva', 110, 'alumno', 'accion', 'Rutina nueva', 'Cuando el profe publica una rutina nueva para el alumno.', true, 'Tenés rutina nueva 💪', 'Tu profe te armó "{rutina}". Entrá a verla.', 'Tenés rutina nueva 💪', 'Tu profe te armó "{rutina}". Entrá a verla.', '/rutinas', NULL, NULL, NULL, NULL, NULL, NULL, '{}', NULL, '[{"clave": "nombre", "texto": "Nombre del alumno", "ejemplo": "Facu"}, {"clave": "rutina", "texto": "Nombre de la rutina", "ejemplo": "Piernas"}]', NULL, NULL, '2026-11-24 21:51:59.48092-03') ON CONFLICT DO NOTHING;
INSERT INTO public.tipos_aviso (clave, orden, grupo, disparo, nombre, descripcion, activo, titulo, cuerpo, titulo_original, cuerpo_original, url, hora, hora_original, dias, dias_original, dias_etiqueta, destino, destinos_posibles, planes, variables, requiere, nota, actualizado_en) VALUES ('rutina-editada', 120, 'alumno', 'accion', 'Rutina actualizada', 'Cuando el profe cambia una rutina que el alumno ya tenía. Sale 10 minutos después del último cambio, así llega una sola aunque toque varios ejercicios.', true, 'Tu profe actualizó tu rutina ✏️', 'Hay cambios en "{rutina}". Miralos antes de entrenar.', 'Tu profe actualizó tu rutina ✏️', 'Hay cambios en "{rutina}". Miralos antes de entrenar.', '/rutinas', NULL, NULL, NULL, NULL, NULL, NULL, '{}', NULL, '[{"clave": "nombre", "texto": "Nombre del alumno", "ejemplo": "Facu"}, {"clave": "rutina", "texto": "Nombre de la rutina", "ejemplo": "Piernas"}]', NULL, 'No sale si la rutina se publicó hace menos de 15 minutos (ya le llegó "Rutina nueva").', '2026-11-24 21:51:59.48092-03') ON CONFLICT DO NOTHING;
INSERT INTO public.tipos_aviso (clave, orden, grupo, disparo, nombre, descripcion, activo, titulo, cuerpo, titulo_original, cuerpo_original, url, hora, hora_original, dias, dias_original, dias_etiqueta, destino, destinos_posibles, planes, variables, requiere, nota, actualizado_en) VALUES ('cuenta-activada', 140, 'alumno', 'accion', 'Cuenta activada', 'Cuando le habilitan la cuenta (pago confirmado por primera vez, o al volver después de estar vencido).', true, '¡Tu cuenta está activa! 🎉', 'Ya podés entrar y ver tus rutinas. Tu plan vence el {fecha}.', '¡Tu cuenta está activa! 🎉', 'Ya podés entrar y ver tus rutinas. Tu plan vence el {fecha}.', '/inicio', NULL, NULL, NULL, NULL, NULL, NULL, '{}', NULL, '[{"clave": "nombre", "texto": "Nombre del alumno", "ejemplo": "Facu"}, {"clave": "fecha", "texto": "Nueva fecha de vencimiento", "ejemplo": "16/11"}]', NULL, 'Solo le llega si ya había activado las notificaciones (por ejemplo, en un celular donde ya usaba DREY).', '2026-11-24 21:51:59.48092-03') ON CONFLICT DO NOTHING;
INSERT INTO public.tipos_aviso (clave, orden, grupo, disparo, nombre, descripcion, activo, titulo, cuerpo, titulo_original, cuerpo_original, url, hora, hora_original, dias, dias_original, dias_etiqueta, destino, destinos_posibles, planes, variables, requiere, nota, actualizado_en) VALUES ('pago-confirmado', 150, 'alumno', 'accion', 'Pago confirmado', 'Cuando le confirman un pago y se le suma un mes al plan (transferencia o Mercado Pago).', true, 'Recibimos tu pago ✅', 'Tu plan quedó al día hasta el {fecha}.', 'Recibimos tu pago ✅', 'Tu plan quedó al día hasta el {fecha}.', '/suscripcion', NULL, NULL, NULL, NULL, NULL, NULL, '{}', NULL, '[{"clave": "nombre", "texto": "Nombre del alumno", "ejemplo": "Facu"}, {"clave": "fecha", "texto": "Nueva fecha de vencimiento", "ejemplo": "16/11"}]', NULL, NULL, '2026-11-24 21:51:59.48092-03') ON CONFLICT DO NOTHING;
INSERT INTO public.tipos_aviso (clave, orden, grupo, disparo, nombre, descripcion, activo, titulo, cuerpo, titulo_original, cuerpo_original, url, hora, hora_original, dias, dias_original, dias_etiqueta, destino, destinos_posibles, planes, variables, requiere, nota, actualizado_en) VALUES ('solicitud-ok', 160, 'alumno', 'accion', 'Solicitud aceptada', 'Cuando el profe acepta la solicitud del alumno para entrenar con él.', true, '{profe} aceptó tu solicitud 🎉', 'Desde ahora es tu profe. Pronto te arma la rutina.', '{profe} aceptó tu solicitud 🎉', 'Desde ahora es tu profe. Pronto te arma la rutina.', '/perfil', NULL, NULL, NULL, NULL, NULL, NULL, '{}', NULL, '[{"clave": "nombre", "texto": "Nombre del alumno", "ejemplo": "Facu"}, {"clave": "profe", "texto": "Nombre del profe", "ejemplo": "Bruno Pérez"}]', NULL, 'Si el profe escribe una respuesta, se manda esa respuesta en lugar del texto.', '2026-11-24 21:51:59.48092-03') ON CONFLICT DO NOTHING;
INSERT INTO public.tipos_aviso (clave, orden, grupo, disparo, nombre, descripcion, activo, titulo, cuerpo, titulo_original, cuerpo_original, url, hora, hora_original, dias, dias_original, dias_etiqueta, destino, destinos_posibles, planes, variables, requiere, nota, actualizado_en) VALUES ('solicitud-no', 170, 'alumno', 'accion', 'Solicitud rechazada', 'Cuando el profe rechaza la solicitud.', true, '{profe} no puede tomarte ahora', 'Podés elegir otro profe desde la app.', '{profe} no puede tomarte ahora', 'Podés elegir otro profe desde la app.', '/profes', NULL, NULL, NULL, NULL, NULL, NULL, '{}', NULL, '[{"clave": "nombre", "texto": "Nombre del alumno", "ejemplo": "Facu"}, {"clave": "profe", "texto": "Nombre del profe", "ejemplo": "Bruno Pérez"}]', NULL, 'Si el profe escribe una respuesta, se manda esa respuesta en lugar del texto.', '2026-11-24 21:51:59.48092-03') ON CONFLICT DO NOTHING;
INSERT INTO public.tipos_aviso (clave, orden, grupo, disparo, nombre, descripcion, activo, titulo, cuerpo, titulo_original, cuerpo_original, url, hora, hora_original, dias, dias_original, dias_etiqueta, destino, destinos_posibles, planes, variables, requiere, nota, actualizado_en) VALUES ('profe-asignado', 180, 'alumno', 'accion', 'Profe asignado', 'Cuando le asignan o cambian el profe sin una solicitud (el Admin, el dueño del gimnasio o un profe al confirmar su pago).', true, 'Tu profe ahora es {profe}', 'Entrá a tu perfil para conocerlo.', 'Tu profe ahora es {profe}', 'Entrá a tu perfil para conocerlo.', '/perfil', NULL, NULL, NULL, NULL, NULL, NULL, '{}', NULL, '[{"clave": "nombre", "texto": "Nombre del alumno", "ejemplo": "Facu"}, {"clave": "profe", "texto": "Nombre del profe", "ejemplo": "Bruno Pérez"}]', NULL, NULL, '2026-11-24 21:51:59.48092-03') ON CONFLICT DO NOTHING;
INSERT INTO public.tipos_aviso (clave, orden, grupo, disparo, nombre, descripcion, activo, titulo, cuerpo, titulo_original, cuerpo_original, url, hora, hora_original, dias, dias_original, dias_etiqueta, destino, destinos_posibles, planes, variables, requiere, nota, actualizado_en) VALUES ('descanso', 190, 'alumno', 'entrenando', 'Terminó el descanso', 'Si el alumno sale de DREY mientras descansa entre series, le avisa cuando termina el descanso.', true, '⏱ ¡Terminó el descanso!', 'Volvé a DREY: te toca {siguiente}.', '⏱ ¡Terminó el descanso!', 'Volvé a DREY: te toca {siguiente}.', '/inicio', NULL, NULL, NULL, NULL, NULL, NULL, '{}', NULL, '[{"clave": "nombre", "texto": "Nombre del alumno", "ejemplo": "Facu"}, {"clave": "siguiente", "texto": "Lo que sigue", "ejemplo": "Sentadilla · serie 3"}]', NULL, 'Cada alumno lo prende o apaga en la pantalla de descanso ("Avisarme al terminar"). Si está mirando DREY, no le llega (ya ve el reloj).', '2026-11-24 21:51:59.48092-03') ON CONFLICT DO NOTHING;
INSERT INTO public.tipos_aviso (clave, orden, grupo, disparo, nombre, descripcion, activo, titulo, cuerpo, titulo_original, cuerpo_original, url, hora, hora_original, dias, dias_original, dias_etiqueta, destino, destinos_posibles, planes, variables, requiere, nota, actualizado_en) VALUES ('profe-cuenta', 210, 'profe', 'accion', 'Cuenta nueva', 'Cuando un alumno se registra.', true, 'Cuenta nueva: {alumno}', 'Se registró y espera que la habilites.', 'Cuenta nueva: {alumno}', 'Se registró y espera que la habilites.', '/profe/cuentas', NULL, NULL, NULL, NULL, NULL, 'profe-o-admin', '{profe-o-admin,profe,admin,profe-y-admin}', NULL, '[{"clave": "nombre", "texto": "Nombre de quien recibe", "ejemplo": "Bruno"}, {"clave": "alumno", "texto": "Nombre del alumno", "ejemplo": "Facu Benítez"}]', NULL, NULL, '2026-11-24 21:51:59.48092-03') ON CONFLICT DO NOTHING;
INSERT INTO public.tipos_aviso (clave, orden, grupo, disparo, nombre, descripcion, activo, titulo, cuerpo, titulo_original, cuerpo_original, url, hora, hora_original, dias, dias_original, dias_etiqueta, destino, destinos_posibles, planes, variables, requiere, nota, actualizado_en) VALUES ('profe-pago', 220, 'profe', 'accion', 'Alumno avisó que pagó', 'Cuando el alumno toca "Ya pagué" (transferencia con comprobante).', true, '{alumno} avisó que pagó', 'Revisá el comprobante y confirmalo.', '{alumno} avisó que pagó', 'Revisá el comprobante y confirmalo.', '/profe/cuentas', NULL, NULL, NULL, NULL, NULL, 'profe-o-admin', '{profe-o-admin,profe,admin,profe-y-admin}', NULL, '[{"clave": "nombre", "texto": "Nombre de quien recibe", "ejemplo": "Bruno"}, {"clave": "alumno", "texto": "Nombre del alumno", "ejemplo": "Facu Benítez"}]', NULL, NULL, '2026-11-24 21:51:59.48092-03') ON CONFLICT DO NOTHING;
INSERT INTO public.tipos_aviso (clave, orden, grupo, disparo, nombre, descripcion, activo, titulo, cuerpo, titulo_original, cuerpo_original, url, hora, hora_original, dias, dias_original, dias_etiqueta, destino, destinos_posibles, planes, variables, requiere, nota, actualizado_en) VALUES ('profe-solicitud', 240, 'profe', 'accion', 'Solicitud nueva', 'Cuando un alumno le pide a un profe entrenar con él.', true, '{alumno} quiere entrenar con vos', 'Entrá para aceptar o rechazar la solicitud.', '{alumno} quiere entrenar con vos', 'Entrá para aceptar o rechazar la solicitud.', '/profe/solicitudes', NULL, NULL, NULL, NULL, NULL, 'profe', '{profe,profe-y-admin}', NULL, '[{"clave": "nombre", "texto": "Nombre de quien recibe", "ejemplo": "Bruno"}, {"clave": "alumno", "texto": "Nombre del alumno", "ejemplo": "Facu Benítez"}]', NULL, 'Si el alumno escribió un mensaje, se manda ese mensaje en lugar del texto.', '2026-11-24 21:51:59.48092-03') ON CONFLICT DO NOTHING;
INSERT INTO public.tipos_aviso (clave, orden, grupo, disparo, nombre, descripcion, activo, titulo, cuerpo, titulo_original, cuerpo_original, url, hora, hora_original, dias, dias_original, dias_etiqueta, destino, destinos_posibles, planes, variables, requiere, nota, actualizado_en) VALUES ('profe-alumno-nuevo', 250, 'profe', 'accion', 'Nuevo alumno', 'Cuando le asignan un alumno a un profe (no sale si el propio profe hizo el cambio, por ejemplo al aceptar una solicitud).', true, 'Nuevo alumno: {alumno}', 'Ya está en tu lista de clientes. Armale la rutina.', 'Nuevo alumno: {alumno}', 'Ya está en tu lista de clientes. Armale la rutina.', '/profe/clientes/{cliente_id}', NULL, NULL, NULL, NULL, NULL, 'profe', '{profe,profe-y-admin}', NULL, '[{"clave": "nombre", "texto": "Nombre de quien recibe", "ejemplo": "Bruno"}, {"clave": "alumno", "texto": "Nombre del alumno", "ejemplo": "Facu Benítez"}]', NULL, NULL, '2026-11-24 21:51:59.48092-03') ON CONFLICT DO NOTHING;
INSERT INTO public.tipos_aviso (clave, orden, grupo, disparo, nombre, descripcion, activo, titulo, cuerpo, titulo_original, cuerpo_original, url, hora, hora_original, dias, dias_original, dias_etiqueta, destino, destinos_posibles, planes, variables, requiere, nota, actualizado_en) VALUES ('profe-alumno-se-fue', 260, 'profe', 'accion', 'Alumno cambió de profe', 'Al profe anterior, cuando un alumno suyo pasa a otro profe o queda sin profe.', true, '{alumno} cambió de profe', 'Ahora entrena con {profe_nuevo}.', '{alumno} cambió de profe', 'Ahora entrena con {profe_nuevo}.', '/profe/clientes', NULL, NULL, NULL, NULL, NULL, 'profe', '{profe,profe-y-admin}', NULL, '[{"clave": "nombre", "texto": "Nombre de quien recibe", "ejemplo": "Bruno"}, {"clave": "alumno", "texto": "Nombre del alumno", "ejemplo": "Facu Benítez"}, {"clave": "profe_nuevo", "texto": "Profe nuevo", "ejemplo": "Ana Gómez"}]', NULL, 'Si el alumno quedó sin profe, el texto es "Ya no está en tu lista de clientes."', '2026-11-24 21:51:59.48092-03') ON CONFLICT DO NOTHING;
INSERT INTO public.tipos_aviso (clave, orden, grupo, disparo, nombre, descripcion, activo, titulo, cuerpo, titulo_original, cuerpo_original, url, hora, hora_original, dias, dias_original, dias_etiqueta, destino, destinos_posibles, planes, variables, requiere, nota, actualizado_en) VALUES ('profe-entreno', 270, 'profe', 'accion', 'Entrenamiento terminado', 'Cuando un alumno termina y guarda un entrenamiento (sin comentario).', true, '{alumno} terminó de entrenar 💪', '{rutina} · {esfuerzo}', '{alumno} terminó de entrenar 💪', '{rutina} · {esfuerzo}', '/profe/clientes/{cliente_id}', NULL, NULL, NULL, NULL, NULL, 'profe-o-admin', '{profe-o-admin,profe,admin,profe-y-admin}', NULL, '[{"clave": "nombre", "texto": "Nombre de quien recibe", "ejemplo": "Bruno"}, {"clave": "alumno", "texto": "Nombre del alumno", "ejemplo": "Facu Benítez"}, {"clave": "rutina", "texto": "Rutina que hizo", "ejemplo": "Piernas"}, {"clave": "esfuerzo", "texto": "Esfuerzo que marcó", "ejemplo": "Esfuerzo 4 de 5"}]', NULL, 'Si el alumno dejó un comentario, en su lugar sale "Comentario nuevo" (si está prendida).', '2026-11-24 21:51:59.48092-03') ON CONFLICT DO NOTHING;
INSERT INTO public.tipos_aviso (clave, orden, grupo, disparo, nombre, descripcion, activo, titulo, cuerpo, titulo_original, cuerpo_original, url, hora, hora_original, dias, dias_original, dias_etiqueta, destino, destinos_posibles, planes, variables, requiere, nota, actualizado_en) VALUES ('profe-comentario', 280, 'profe', 'accion', 'Comentario nuevo', 'Cuando un alumno termina un entrenamiento y deja un comentario.', true, '{alumno} dejó un comentario 💬', '"{comentario}" · {rutina}', '{alumno} dejó un comentario 💬', '"{comentario}" · {rutina}', '/profe/clientes/{cliente_id}', NULL, NULL, NULL, NULL, NULL, 'profe-o-admin', '{profe-o-admin,profe,admin,profe-y-admin}', NULL, '[{"clave": "nombre", "texto": "Nombre de quien recibe", "ejemplo": "Bruno"}, {"clave": "alumno", "texto": "Nombre del alumno", "ejemplo": "Facu Benítez"}, {"clave": "rutina", "texto": "Rutina que hizo", "ejemplo": "Piernas"}, {"clave": "comentario", "texto": "El comentario (hasta 120 letras)", "ejemplo": "Me costó la última serie"}, {"clave": "esfuerzo", "texto": "Esfuerzo que marcó", "ejemplo": "Esfuerzo 4 de 5"}]', NULL, NULL, '2026-11-24 21:51:59.48092-03') ON CONFLICT DO NOTHING;
INSERT INTO public.tipos_aviso (clave, orden, grupo, disparo, nombre, descripcion, activo, titulo, cuerpo, titulo_original, cuerpo_original, url, hora, hora_original, dias, dias_original, dias_etiqueta, destino, destinos_posibles, planes, variables, requiere, nota, actualizado_en) VALUES ('profe-sin-entrenar', 290, 'profe', 'horario', 'Alumno sin entrenar', 'Cuando un alumno pasa varios días sin registrar un entrenamiento. Una sola vez por cada racha sin entrenar.', true, '{alumno} no entrena hace {dias} días', 'Escribile para que no pierda el ritmo.', '{alumno} no entrena hace {dias} días', 'Escribile para que no pierda el ritmo.', '/profe/clientes/{cliente_id}', '09:00:00', '09:00:00', 7, 7, 'Días sin entrenar', 'profe-o-admin', '{profe-o-admin,profe,admin,profe-y-admin}', NULL, '[{"clave": "nombre", "texto": "Nombre de quien recibe", "ejemplo": "Bruno"}, {"clave": "alumno", "texto": "Nombre del alumno", "ejemplo": "Facu Benítez"}, {"clave": "dias", "texto": "Días sin entrenar", "ejemplo": "7"}]', NULL, 'Solo por alumnos con el plan al día y alguna rutina publicada.', '2026-11-24 21:51:59.48092-03') ON CONFLICT DO NOTHING;
INSERT INTO public.tipos_aviso (clave, orden, grupo, disparo, nombre, descripcion, activo, titulo, cuerpo, titulo_original, cuerpo_original, url, hora, hora_original, dias, dias_original, dias_etiqueta, destino, destinos_posibles, planes, variables, requiere, nota, actualizado_en) VALUES ('resumen', 130, 'alumno', 'accion', 'Evaluación del mes lista', 'Cuando el profe publica la evaluación mensual (cada 4 semanas de entrenamiento).', true, 'Tu evaluación del mes está lista 📈', 'Tu profe revisó tu progreso: mirá todo lo que mejoraste.', 'Tu evaluación del mes está lista 📈', 'Tu profe revisó tu progreso: mirá todo lo que mejoraste.', '/progreso#avance', NULL, NULL, NULL, NULL, NULL, NULL, '{}', NULL, '[{"clave": "nombre", "texto": "Nombre del alumno", "ejemplo": "Facu"}]', NULL, NULL, '2026-11-24 21:51:59.48092-03') ON CONFLICT DO NOTHING;
INSERT INTO public.tipos_aviso (clave, orden, grupo, disparo, nombre, descripcion, activo, titulo, cuerpo, titulo_original, cuerpo_original, url, hora, hora_original, dias, dias_original, dias_etiqueta, destino, destinos_posibles, planes, variables, requiere, nota, actualizado_en) VALUES ('dueno-habilitacion', 300, 'profe', 'accion', 'Un profe habilitó un alumno', 'Al dueño del gimnasio, cuando un profe del gimnasio habilita a un alumno (solo si el dueño dejó que los profes habiliten).', true, '{profe} habilitó a {alumno}', 'Cupo {cupo} de {cupos} en {espacio}.', '{profe} habilitó a {alumno}', 'Cupo {cupo} de {cupos} en {espacio}.', '/profe/cuentas', NULL, NULL, NULL, NULL, NULL, 'dueno', '{dueno}', NULL, '[{"clave": "nombre", "texto": "Nombre de quien recibe", "ejemplo": "Bruno"}, {"clave": "profe", "texto": "Profe que habilitó", "ejemplo": "Ana Gómez"}, {"clave": "alumno", "texto": "Alumno habilitado", "ejemplo": "María López"}, {"clave": "cupo", "texto": "Cupo que ocupa", "ejemplo": "23"}, {"clave": "cupos", "texto": "Cupos del plan", "ejemplo": "50"}, {"clave": "espacio", "texto": "Gimnasio", "ejemplo": "FitCenter"}]', NULL, NULL, '2026-11-24 21:51:59.630772-03') ON CONFLICT DO NOTHING;
INSERT INTO public.tipos_aviso (clave, orden, grupo, disparo, nombre, descripcion, activo, titulo, cuerpo, titulo_original, cuerpo_original, url, hora, hora_original, dias, dias_original, dias_etiqueta, destino, destinos_posibles, planes, variables, requiere, nota, actualizado_en) VALUES ('admin-espacio-pago', 310, 'profe', 'accion', 'Un espacio avisó que pagó DREY', 'Al Admin, cuando un profe o gimnasio toca "Ya pagué" en Suscripción DREY.', true, '{espacio} avisó que pagó DREY', 'Revisá el comprobante y confirmalo en Pagos → Suscripciones DREY.', '{espacio} avisó que pagó DREY', 'Revisá el comprobante y confirmalo en Pagos → Suscripciones DREY.', '/profe/cuentas?tab=drey', NULL, NULL, NULL, NULL, NULL, 'admin', '{admin}', NULL, '[{"clave": "nombre", "texto": "Nombre de quien recibe", "ejemplo": "Admin"}, {"clave": "espacio", "texto": "Profe o gimnasio", "ejemplo": "FitCenter"}]', NULL, NULL, '2026-11-24 21:51:59.630772-03') ON CONFLICT DO NOTHING;
INSERT INTO public.tipos_aviso (clave, orden, grupo, disparo, nombre, descripcion, activo, titulo, cuerpo, titulo_original, cuerpo_original, url, hora, hora_original, dias, dias_original, dias_etiqueta, destino, destinos_posibles, planes, variables, requiere, nota, actualizado_en) VALUES ('espacio-pago-confirmado', 320, 'profe', 'accion', 'Suscripción DREY confirmada', 'Al dueño del espacio, cuando el Admin confirma su pago a DREY.', true, 'Suscripción DREY al día ✅', '{espacio}: plan {plan} hasta el {fecha}.', 'Suscripción DREY al día ✅', '{espacio}: plan {plan} hasta el {fecha}.', '/profe/suscripcion', NULL, NULL, NULL, NULL, NULL, 'dueno', '{dueno}', NULL, '[{"clave": "nombre", "texto": "Nombre de quien recibe", "ejemplo": "Bruno"}, {"clave": "espacio", "texto": "Profe o gimnasio", "ejemplo": "FitCenter"}, {"clave": "plan", "texto": "Plan DREY", "ejemplo": "Gimnasio 50"}, {"clave": "fecha", "texto": "Nuevo vencimiento", "ejemplo": "30/11"}]', NULL, NULL, '2026-11-24 21:51:59.630772-03') ON CONFLICT DO NOTHING;
INSERT INTO public.tipos_aviso (clave, orden, grupo, disparo, nombre, descripcion, activo, titulo, cuerpo, titulo_original, cuerpo_original, url, hora, hora_original, dias, dias_original, dias_etiqueta, destino, destinos_posibles, planes, variables, requiere, nota, actualizado_en) VALUES ('admin-profe-nuevo', 330, 'profe', 'accion', 'Profe nuevo', 'Al Admin, cuando alguien se registra como profe.', true, 'Profe nuevo: {profe}', 'Se registró con el código {codigo} y empieza su prueba gratis.', 'Profe nuevo: {profe}', 'Se registró con el código {codigo} y empieza su prueba gratis.', '/profe/equipo?tab=espacios', NULL, NULL, NULL, NULL, NULL, 'admin', '{admin}', NULL, '[{"clave": "nombre", "texto": "Nombre de quien recibe", "ejemplo": "Admin"}, {"clave": "profe", "texto": "Profe nuevo", "ejemplo": "Ana Gómez"}, {"clave": "codigo", "texto": "Su código", "ejemplo": "ANA"}]', NULL, NULL, '2026-11-24 21:51:59.691225-03') ON CONFLICT DO NOTHING;
INSERT INTO public.tipos_aviso (clave, orden, grupo, disparo, nombre, descripcion, activo, titulo, cuerpo, titulo_original, cuerpo_original, url, hora, hora_original, dias, dias_original, dias_etiqueta, destino, destinos_posibles, planes, variables, requiere, nota, actualizado_en) VALUES ('admin-gimnasio-nuevo', 340, 'profe', 'accion', 'Gimnasio nuevo', 'Al Admin, cuando alguien registra un gimnasio.', true, 'Gimnasio nuevo: {espacio}', '{profe} lo registró con el código {codigo}.', 'Gimnasio nuevo: {espacio}', '{profe} lo registró con el código {codigo}.', '/profe/equipo?tab=espacios', NULL, NULL, NULL, NULL, NULL, 'admin', '{admin}', NULL, '[{"clave": "nombre", "texto": "Nombre de quien recibe", "ejemplo": "Admin"}, {"clave": "espacio", "texto": "Gimnasio", "ejemplo": "FitCenter"}, {"clave": "profe", "texto": "Dueño", "ejemplo": "Diego Pérez"}, {"clave": "codigo", "texto": "Código del gimnasio", "ejemplo": "FITCENTER"}]', NULL, NULL, '2026-11-24 21:51:59.691225-03') ON CONFLICT DO NOTHING;
INSERT INTO public.tipos_aviso (clave, orden, grupo, disparo, nombre, descripcion, activo, titulo, cuerpo, titulo_original, cuerpo_original, url, hora, hora_original, dias, dias_original, dias_etiqueta, destino, destinos_posibles, planes, variables, requiere, nota, actualizado_en) VALUES ('dueno-solicitud-profe', 350, 'profe', 'accion', 'Un profe quiere sumarse', 'Al dueño del gimnasio, cuando un profe pide sumarse con el código.', true, '{profe} quiere sumarse a {espacio}', 'Entrá a Equipo para aceptar o rechazar.', '{profe} quiere sumarse a {espacio}', 'Entrá a Equipo para aceptar o rechazar.', '/profe/equipo', NULL, NULL, NULL, NULL, NULL, 'dueno', '{dueno}', NULL, '[{"clave": "nombre", "texto": "Nombre de quien recibe", "ejemplo": "Diego"}, {"clave": "profe", "texto": "Profe", "ejemplo": "Ana Gómez"}, {"clave": "espacio", "texto": "Gimnasio", "ejemplo": "FitCenter"}]', NULL, 'Si el profe escribió un mensaje, se manda ese mensaje en lugar del texto.', '2026-11-24 21:51:59.691225-03') ON CONFLICT DO NOTHING;
INSERT INTO public.tipos_aviso (clave, orden, grupo, disparo, nombre, descripcion, activo, titulo, cuerpo, titulo_original, cuerpo_original, url, hora, hora_original, dias, dias_original, dias_etiqueta, destino, destinos_posibles, planes, variables, requiere, nota, actualizado_en) VALUES ('profe-membresia', 360, 'profe', 'accion', 'Respuesta de un gimnasio', 'Al profe, cuando un gimnasio acepta o rechaza su solicitud, o lo quita del equipo.', true, '{resultado}', '{detalle}', '{resultado}', '{detalle}', '/profe/espacios', NULL, NULL, NULL, NULL, NULL, 'profe', '{profe}', NULL, '[{"clave": "nombre", "texto": "Nombre de quien recibe", "ejemplo": "Ana"}, {"clave": "resultado", "texto": "Qué pasó", "ejemplo": "FitCenter te sumó a su equipo ✅"}, {"clave": "detalle", "texto": "Qué hacer", "ejemplo": "Elegilo arriba del panel para ver sus alumnos."}, {"clave": "espacio", "texto": "Gimnasio", "ejemplo": "FitCenter"}]', NULL, NULL, '2026-11-24 21:51:59.691225-03') ON CONFLICT DO NOTHING;
INSERT INTO public.tipos_aviso (clave, orden, grupo, disparo, nombre, descripcion, activo, titulo, cuerpo, titulo_original, cuerpo_original, url, hora, hora_original, dias, dias_original, dias_etiqueta, destino, destinos_posibles, planes, variables, requiere, nota, actualizado_en) VALUES ('profe-invitacion', 370, 'profe', 'accion', 'Invitación de un gimnasio', 'Al profe, cuando un gimnasio lo invita a su equipo.', true, '{espacio} te invita a su equipo', 'Entrá a Mi cuenta → Mis espacios para aceptar.', '{espacio} te invita a su equipo', 'Entrá a Mi cuenta → Mis espacios para aceptar.', '/profe/espacios', NULL, NULL, NULL, NULL, NULL, 'profe', '{profe}', NULL, '[{"clave": "nombre", "texto": "Nombre de quien recibe", "ejemplo": "Ana"}, {"clave": "espacio", "texto": "Gimnasio", "ejemplo": "FitCenter"}]', NULL, NULL, '2026-11-24 21:51:59.691225-03') ON CONFLICT DO NOTHING;
INSERT INTO public.tipos_aviso (clave, orden, grupo, disparo, nombre, descripcion, activo, titulo, cuerpo, titulo_original, cuerpo_original, url, hora, hora_original, dias, dias_original, dias_etiqueta, destino, destinos_posibles, planes, variables, requiere, nota, actualizado_en) VALUES ('espacio-por-vencer', 330, 'profe', 'horario', 'Suscripción DREY por vencer', 'Al dueño del espacio (el profe, o el dueño del gimnasio), los "días de aviso" de Ajustes → Plazos antes de que venza su suscripción DREY, si todavía no avisó que pagó.', true, 'Tu suscripción DREY vence el {fecha}', '{espacio}: renovala desde Suscripción DREY para que tus alumnos sigan entrenando sin cortes.', 'Tu suscripción DREY vence el {fecha}', '{espacio}: renovala desde Suscripción DREY para que tus alumnos sigan entrenando sin cortes.', '/profe/suscripcion', '09:00:00', '09:00:00', NULL, NULL, NULL, 'dueno', '{dueno}', NULL, '[{"clave": "nombre", "texto": "Nombre de quien recibe", "ejemplo": "Bruno"}, {"clave": "espacio", "texto": "Profe o gimnasio", "ejemplo": "FitCenter"}, {"clave": "fecha", "texto": "Día que vence", "ejemplo": "30/11"}]', NULL, NULL, '2026-11-24 21:51:59.82175-03') ON CONFLICT DO NOTHING;
INSERT INTO public.tipos_aviso (clave, orden, grupo, disparo, nombre, descripcion, activo, titulo, cuerpo, titulo_original, cuerpo_original, url, hora, hora_original, dias, dias_original, dias_etiqueta, destino, destinos_posibles, planes, variables, requiere, nota, actualizado_en) VALUES ('espacio-prueba-termina', 335, 'profe', 'horario', 'La prueba gratis está por terminar', 'Al dueño del espacio, unos días antes de que termine su prueba gratis.', true, 'Tu prueba gratis termina el {fecha}', 'Elegí tu plan en Suscripción DREY para seguir habilitando alumnos en {espacio}.', 'Tu prueba gratis termina el {fecha}', 'Elegí tu plan en Suscripción DREY para seguir habilitando alumnos en {espacio}.', '/profe/suscripcion', '09:00:00', '09:00:00', 3, 3, 'Días antes de que termine', 'dueno', '{dueno}', NULL, '[{"clave": "nombre", "texto": "Nombre de quien recibe", "ejemplo": "Bruno"}, {"clave": "espacio", "texto": "Profe o gimnasio", "ejemplo": "FitCenter"}, {"clave": "fecha", "texto": "Último día de la prueba", "ejemplo": "14/11"}]', NULL, NULL, '2026-11-24 21:51:59.82175-03') ON CONFLICT DO NOTHING;
INSERT INTO public.tipos_aviso (clave, orden, grupo, disparo, nombre, descripcion, activo, titulo, cuerpo, titulo_original, cuerpo_original, url, hora, hora_original, dias, dias_original, dias_etiqueta, destino, destinos_posibles, planes, variables, requiere, nota, actualizado_en) VALUES ('espacio-en-pausa', 340, 'profe', 'horario', 'Espacio en pausa', 'Al dueño del espacio, el día que su suscripción DREY queda en pausa (o terminó la prueba sin elegir plan). Sus alumnos siguen entrenando unos días más.', true, '{espacio} está en pausa', 'Tus alumnos entrenan hasta el {fecha}. Pagá desde Suscripción DREY para que no se corten.', '{espacio} está en pausa', 'Tus alumnos entrenan hasta el {fecha}. Pagá desde Suscripción DREY para que no se corten.', '/profe/suscripcion', '09:00:00', '09:00:00', NULL, NULL, NULL, 'dueno', '{dueno}', NULL, '[{"clave": "nombre", "texto": "Nombre de quien recibe", "ejemplo": "Bruno"}, {"clave": "espacio", "texto": "Profe o gimnasio", "ejemplo": "FitCenter"}, {"clave": "fecha", "texto": "Último día de sus alumnos", "ejemplo": "14/12"}]', NULL, NULL, '2026-11-24 21:51:59.82175-03') ON CONFLICT DO NOTHING;
INSERT INTO public.tipos_aviso (clave, orden, grupo, disparo, nombre, descripcion, activo, titulo, cuerpo, titulo_original, cuerpo_original, url, hora, hora_original, dias, dias_original, dias_etiqueta, destino, destinos_posibles, planes, variables, requiere, nota, actualizado_en) VALUES ('admin-espacio-vencido', 345, 'profe', 'horario', 'Un espacio quedó en pausa', 'Al Admin, el día que un profe o gimnasio queda en pausa por no pagar DREY (o terminó su prueba sin elegir plan).', true, '{espacio} quedó en pausa', 'No pagó DREY. Sus alumnos entrenan hasta el {fecha}.', '{espacio} quedó en pausa', 'No pagó DREY. Sus alumnos entrenan hasta el {fecha}.', '/profe/equipo', '09:00:00', '09:00:00', NULL, NULL, NULL, 'admin', '{admin}', NULL, '[{"clave": "nombre", "texto": "Nombre de quien recibe", "ejemplo": "Admin"}, {"clave": "espacio", "texto": "Profe o gimnasio", "ejemplo": "FitCenter"}, {"clave": "fecha", "texto": "Último día de sus alumnos", "ejemplo": "14/12"}]', NULL, NULL, '2026-11-24 21:51:59.82175-03') ON CONFLICT DO NOTHING;
INSERT INTO public.tipos_aviso (clave, orden, grupo, disparo, nombre, descripcion, activo, titulo, cuerpo, titulo_original, cuerpo_original, url, hora, hora_original, dias, dias_original, dias_etiqueta, destino, destinos_posibles, planes, variables, requiere, nota, actualizado_en) VALUES ('espacio-cupo-90', 350, 'profe', 'horario', 'Cupos casi llenos', 'Al dueño del espacio cuando usa el 90 % o más de sus cupos (una vez por mes).', true, 'Usás {usados} de {cupos} cupos', '{espacio} está casi lleno. Si vas a sumar alumnos, pasate a un plan más grande en Suscripción DREY.', 'Usás {usados} de {cupos} cupos', '{espacio} está casi lleno. Si vas a sumar alumnos, pasate a un plan más grande en Suscripción DREY.', '/profe/suscripcion', '09:00:00', '09:00:00', NULL, NULL, NULL, 'dueno', '{dueno}', NULL, '[{"clave": "nombre", "texto": "Nombre de quien recibe", "ejemplo": "Bruno"}, {"clave": "espacio", "texto": "Profe o gimnasio", "ejemplo": "FitCenter"}, {"clave": "usados", "texto": "Cupos usados", "ejemplo": "23"}, {"clave": "cupos", "texto": "Cupos del plan", "ejemplo": "25"}]', NULL, NULL, '2026-11-24 21:51:59.82175-03') ON CONFLICT DO NOTHING;


--
-- PostgreSQL database dump complete
--


