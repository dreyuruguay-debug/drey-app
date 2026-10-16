-- 030 · Administrador de notificaciones
-- ==========================================================================
-- Todas las notificaciones de DREY pasan a estar en UNA tabla
-- ("tipos_aviso") que el Admin maneja desde la app (Ajustes →
-- Notificaciones): prenderlas o apagarlas, a quién le llegan, a qué hora
-- salen las programadas, cuántos días esperar y los textos.
--
-- Qué trae:
--   1. La tabla tipos_aviso, con las 23 notificaciones y sus textos
--      originales (se pueden restablecer).
--   2. avisar(): la ÚNICA puerta para mandar una notificación. Mira si
--      está prendida, si le corresponde a esa persona (plan), arma el
--      texto con los datos reales ({nombre}, {rutina}…) y la pone en la
--      cola ("avisos").
--   3. Notificaciones nuevas:
--        · Al alumno: cuenta activada, pago confirmado, "hace X días que
--          no entrenás", "tu profe actualizó tu rutina" y fin del
--          descanso (si sale de la app mientras descansa).
--        · Al profe: entrenamiento terminado, comentario nuevo y
--          "X no entrena hace N días".
--   4. Programadas con su propia hora (antes, todas a las 8:00), y el
--      alumno puede elegir a qué hora le llega "Hoy te toca".
--   5. "Vence en N días" usa los días de aviso de Ajustes → Plazos (antes
--      estaba fijo en 3).
--   6. La cola sabe esperar: un aviso puede salir más tarde (el fin del
--      descanso, o "rutina actualizada" 10 minutos después del último
--      cambio, para no mandar uno por cada ejercicio que se toca).
--   7. Se revisa la cola cada 10 segundos (antes, cada minuto), para que
--      el aviso del descanso llegue a tiempo.
--   8. Mercado Pago: el aviso "pagó con Mercado Pago" queda preparado; se
--      activa solo cuando se publiquen las funciones de Mercado Pago.
--
-- Después de correr este archivo hay que volver a publicar la función
-- "enviar-avisos" con el código nuevo (ver LEEME). Se puede correr más de
-- una vez: los cambios que hizo el Admin (textos, horas, etc.) se respetan.
-- ==========================================================================


-- 1) Columnas nuevas -------------------------------------------------------

-- avisos.enviar_desde: desde cuándo se puede mandar (ahora, o más tarde).
-- avisos.reclamado_en: la función enviar-avisos lo tomó para mandarlo
-- (así dos envíos al mismo tiempo nunca mandan el mismo aviso dos veces).
alter table public.avisos add column if not exists enviar_desde timestamptz not null default now();
alter table public.avisos add column if not exists reclamado_en timestamptz;
create index if not exists avisos_por_enviar_idx on public.avisos (enviar_desde) where enviado_en is null;

-- perfiles.hora_recordatorio: a qué hora quiere el alumno su "Hoy te
-- toca" (null = la hora general que eligió el Admin).
alter table public.perfiles add column if not exists hora_recordatorio time;


-- 2) El catálogo de notificaciones -----------------------------------------
--
-- Columnas que cambia el Admin desde la app: activo, titulo, cuerpo,
-- hora, dias, destino y planes. El resto describe cada notificación y lo
-- mantiene este archivo (si se vuelve a correr, se actualiza).
--
--   grupo:   'alumno' o 'profe' (a quién le llega).
--   disparo: 'horario' (programada, sale a una hora), 'accion' (sale
--            cuando pasa algo) o 'entrenando' (durante el entrenamiento).
--   titulo / cuerpo: textos con datos entre llaves, por ejemplo
--            "Hoy te toca {rutina}". Los datos posibles están en "variables".
--   hora:    hora de las programadas (hora de Uruguay).
--   dias:    días a esperar (por ejemplo, "días sin entrenar"). Solo se
--            puede cambiar si tiene "dias_etiqueta".
--   destino: a quién le llega una notificación de profe:
--              'profe-o-admin' = al profe del alumno; si no tiene, al Admin
--              'profe'         = solo al profe
--              'admin'         = solo al Admin
--              'profe-y-admin' = a los dos
--   planes:  notificaciones de alumno: a qué planes les llega (null = a todos).
--   requiere: 'mercadopago' si depende del cobro con Mercado Pago.
create table if not exists public.tipos_aviso (
  clave text primary key,
  orden int not null default 0,
  grupo text not null check (grupo in ('alumno', 'profe')),
  disparo text not null check (disparo in ('horario', 'accion', 'entrenando')),
  nombre text not null,
  descripcion text not null,
  activo boolean not null default true,
  titulo text not null,
  cuerpo text not null default '',
  titulo_original text not null,
  cuerpo_original text not null default '',
  url text not null default '/',
  hora time,
  hora_original time,
  dias int,
  dias_original int,
  dias_etiqueta text,
  destino text,
  destinos_posibles text[] not null default '{}',
  planes text[],
  variables jsonb not null default '[]'::jsonb,
  requiere text,
  nota text,
  actualizado_en timestamptz not null default now()
);

alter table public.tipos_aviso enable row level security;
drop policy if exists "tipos_aviso: solo el Admin" on public.tipos_aviso;
create policy "tipos_aviso: solo el Admin"
  on public.tipos_aviso for select to authenticated
  using (public.es_admin());
grant select on public.tipos_aviso to authenticated;

-- Las 23 notificaciones. "on conflict" actualiza solo la descripción y los
-- textos originales: lo que eligió el Admin no se toca.
insert into public.tipos_aviso as t (
  clave, orden, grupo, disparo, nombre, descripcion, titulo, cuerpo, titulo_original,
  cuerpo_original, url, hora, hora_original, dias, dias_original, dias_etiqueta, destino,
  destinos_posibles, variables, requiere, nota
) values
  -- Alumno · programadas
  ('hoy', 10, 'alumno', 'horario', 'Hoy te toca',
   'Cada día que tiene una rutina asignada en su calendario, si todavía no entrenó.',
   'Hoy te toca {rutina} 🔥', 'Tu entrenamiento de hoy te espera.',
   'Hoy te toca {rutina} 🔥', 'Tu entrenamiento de hoy te espera.',
   '/inicio', '08:00', '08:00', null, null, null, null, '{}',
   '[{"clave":"nombre","texto":"Nombre del alumno","ejemplo":"Facu"},{"clave":"rutina","texto":"Rutina del día","ejemplo":"Piernas"}]',
   null, 'Cada alumno puede elegir otra hora en Perfil → Recordatorio para entrenar. Si no elige, le llega a esta hora.'),
  ('vence-antes', 20, 'alumno', 'horario', 'Tu plan vence pronto',
   'Unos días antes de que venza el plan (los "días de aviso" de Ajustes → Plazos), si todavía no avisó que pagó.',
   'Tu plan vence en {dias} días', 'Renovalo desde la app para no cortar tu entrenamiento.',
   'Tu plan vence en {dias} días', 'Renovalo desde la app para no cortar tu entrenamiento.',
   '/suscripcion', '08:00', '08:00', null, null, null, null, '{}',
   '[{"clave":"nombre","texto":"Nombre del alumno","ejemplo":"Facu"},{"clave":"dias","texto":"Días que faltan","ejemplo":"5"},{"clave":"fecha","texto":"Fecha de vencimiento","ejemplo":"20/10"}]',
   null, 'Los días se cambian en Ajustes → Plazos ("avisar al cliente cuántos días antes"). Es el mismo número del cartel que ve en la app.'),
  ('vence-hoy', 30, 'alumno', 'horario', 'Tu plan vence hoy',
   'El día que vence el plan, si todavía no avisó que pagó.',
   'Tu plan vence hoy', 'Podés pagar desde la app en un minuto.',
   'Tu plan vence hoy', 'Podés pagar desde la app en un minuto.',
   '/suscripcion', '08:00', '08:00', null, null, null, null, '{}',
   '[{"clave":"nombre","texto":"Nombre del alumno","ejemplo":"Facu"},{"clave":"fecha","texto":"Fecha de vencimiento","ejemplo":"20/10"}]',
   null, null),
  ('gracia', 40, 'alumno', 'horario', 'Último día para pagar',
   'El último de los días de gracia (Ajustes → Plazos). Al día siguiente se pausa el acceso a las rutinas.',
   'Último día para pagar', 'Mañana se pausa el acceso a tus rutinas.',
   'Último día para pagar', 'Mañana se pausa el acceso a tus rutinas.',
   '/suscripcion', '08:00', '08:00', null, null, null, null, '{}',
   '[{"clave":"nombre","texto":"Nombre del alumno","ejemplo":"Facu"},{"clave":"fecha","texto":"Fecha de vencimiento","ejemplo":"20/10"}]',
   null, 'Los días de gracia se cambian en Ajustes → Plazos.'),
  ('sin-entrenar', 50, 'alumno', 'horario', 'Hace días que no entrenás',
   'Cuando el alumno pasa varios días sin registrar un entrenamiento. Una sola vez por cada racha sin entrenar.',
   'Hace {dias} días que no entrenás', 'Tu rutina te espera, {nombre}. ¡Volvé hoy! 💪',
   'Hace {dias} días que no entrenás', 'Tu rutina te espera, {nombre}. ¡Volvé hoy! 💪',
   '/inicio', '18:00', '18:00', 5, 5, 'Días sin entrenar', null, '{}',
   '[{"clave":"nombre","texto":"Nombre del alumno","ejemplo":"Facu"},{"clave":"dias","texto":"Días sin entrenar","ejemplo":"5"}]',
   null, 'Solo a alumnos con el plan al día y alguna rutina publicada.'),
  -- Alumno · por una acción
  ('rutina-nueva', 110, 'alumno', 'accion', 'Rutina nueva',
   'Cuando el profe publica una rutina nueva para el alumno.',
   'Tenés rutina nueva 💪', 'Tu profe te armó "{rutina}". Entrá a verla.',
   'Tenés rutina nueva 💪', 'Tu profe te armó "{rutina}". Entrá a verla.',
   '/rutinas', null, null, null, null, null, null, '{}',
   '[{"clave":"nombre","texto":"Nombre del alumno","ejemplo":"Facu"},{"clave":"rutina","texto":"Nombre de la rutina","ejemplo":"Piernas"}]',
   null, null),
  ('rutina-editada', 120, 'alumno', 'accion', 'Rutina actualizada',
   'Cuando el profe cambia una rutina que el alumno ya tenía. Sale 10 minutos después del último cambio, así llega una sola aunque toque varios ejercicios.',
   'Tu profe actualizó tu rutina ✏️', 'Hay cambios en "{rutina}". Miralos antes de entrenar.',
   'Tu profe actualizó tu rutina ✏️', 'Hay cambios en "{rutina}". Miralos antes de entrenar.',
   '/rutinas', null, null, null, null, null, null, '{}',
   '[{"clave":"nombre","texto":"Nombre del alumno","ejemplo":"Facu"},{"clave":"rutina","texto":"Nombre de la rutina","ejemplo":"Piernas"}]',
   null, 'No sale si la rutina se publicó hace menos de 15 minutos (ya le llegó "Rutina nueva").'),
  ('resumen', 130, 'alumno', 'accion', 'Resumen de avance listo',
   'Cuando el profe publica el resumen de progreso de las últimas 4 semanas.',
   'Tu resumen de avance está listo 📈', 'Tu profe revisó tus últimas 4 semanas.',
   'Tu resumen de avance está listo 📈', 'Tu profe revisó tus últimas 4 semanas.',
   '/progreso#avance', null, null, null, null, null, null, '{}',
   '[{"clave":"nombre","texto":"Nombre del alumno","ejemplo":"Facu"}]',
   null, null),
  ('cuenta-activada', 140, 'alumno', 'accion', 'Cuenta activada',
   'Cuando le habilitan la cuenta (pago confirmado por primera vez, o al volver después de estar vencido).',
   '¡Tu cuenta está activa! 🎉', 'Ya podés entrar y ver tus rutinas. Tu plan vence el {fecha}.',
   '¡Tu cuenta está activa! 🎉', 'Ya podés entrar y ver tus rutinas. Tu plan vence el {fecha}.',
   '/inicio', null, null, null, null, null, null, '{}',
   '[{"clave":"nombre","texto":"Nombre del alumno","ejemplo":"Facu"},{"clave":"fecha","texto":"Nueva fecha de vencimiento","ejemplo":"16/11"}]',
   null, 'Solo le llega si ya había activado las notificaciones (por ejemplo, en un celular donde ya usaba DREY).'),
  ('pago-confirmado', 150, 'alumno', 'accion', 'Pago confirmado',
   'Cuando le confirman un pago y se le suma un mes al plan (transferencia o Mercado Pago).',
   'Recibimos tu pago ✅', 'Tu plan quedó al día hasta el {fecha}.',
   'Recibimos tu pago ✅', 'Tu plan quedó al día hasta el {fecha}.',
   '/suscripcion', null, null, null, null, null, null, '{}',
   '[{"clave":"nombre","texto":"Nombre del alumno","ejemplo":"Facu"},{"clave":"fecha","texto":"Nueva fecha de vencimiento","ejemplo":"16/11"}]',
   null, null),
  ('solicitud-ok', 160, 'alumno', 'accion', 'Solicitud aceptada',
   'Cuando el profe acepta la solicitud del alumno para entrenar con él.',
   '{profe} aceptó tu solicitud 🎉', 'Desde ahora es tu profe. Pronto te arma la rutina.',
   '{profe} aceptó tu solicitud 🎉', 'Desde ahora es tu profe. Pronto te arma la rutina.',
   '/perfil', null, null, null, null, null, null, '{}',
   '[{"clave":"nombre","texto":"Nombre del alumno","ejemplo":"Facu"},{"clave":"profe","texto":"Nombre del profe","ejemplo":"Bruno Pérez"}]',
   null, 'Si el profe escribe una respuesta, se manda esa respuesta en lugar del texto.'),
  ('solicitud-no', 170, 'alumno', 'accion', 'Solicitud rechazada',
   'Cuando el profe rechaza la solicitud.',
   '{profe} no puede tomarte ahora', 'Podés elegir otro profe desde la app.',
   '{profe} no puede tomarte ahora', 'Podés elegir otro profe desde la app.',
   '/profes', null, null, null, null, null, null, '{}',
   '[{"clave":"nombre","texto":"Nombre del alumno","ejemplo":"Facu"},{"clave":"profe","texto":"Nombre del profe","ejemplo":"Bruno Pérez"}]',
   null, 'Si el profe escribe una respuesta, se manda esa respuesta en lugar del texto.'),
  ('profe-asignado', 180, 'alumno', 'accion', 'Profe asignado',
   'Cuando le asignan o cambian el profe sin una solicitud (el Admin, el dueño del gimnasio o un profe al confirmar su pago).',
   'Tu profe ahora es {profe}', 'Entrá a tu perfil para conocerlo.',
   'Tu profe ahora es {profe}', 'Entrá a tu perfil para conocerlo.',
   '/perfil', null, null, null, null, null, null, '{}',
   '[{"clave":"nombre","texto":"Nombre del alumno","ejemplo":"Facu"},{"clave":"profe","texto":"Nombre del profe","ejemplo":"Bruno Pérez"}]',
   null, null),
  -- Alumno · durante el entrenamiento
  ('descanso', 190, 'alumno', 'entrenando', 'Terminó el descanso',
   'Si el alumno sale de DREY mientras descansa entre series, le avisa cuando termina el descanso.',
   '⏱ ¡Terminó el descanso!', 'Volvé a DREY: te toca {siguiente}.',
   '⏱ ¡Terminó el descanso!', 'Volvé a DREY: te toca {siguiente}.',
   '/inicio', null, null, null, null, null, null, '{}',
   '[{"clave":"nombre","texto":"Nombre del alumno","ejemplo":"Facu"},{"clave":"siguiente","texto":"Lo que sigue","ejemplo":"Sentadilla · serie 3"}]',
   null, 'Cada alumno lo prende o apaga en la pantalla de descanso ("Avisarme al terminar"). Si está mirando DREY, no le llega (ya ve el reloj).'),
  -- Profe · por una acción
  ('profe-cuenta', 210, 'profe', 'accion', 'Cuenta nueva',
   'Cuando un alumno se registra.',
   'Cuenta nueva: {alumno}', 'Se registró y espera que la habilites.',
   'Cuenta nueva: {alumno}', 'Se registró y espera que la habilites.',
   '/profe/cuentas', null, null, null, null, null, 'profe-o-admin',
   '{profe-o-admin,profe,admin,profe-y-admin}',
   '[{"clave":"nombre","texto":"Nombre de quien recibe","ejemplo":"Bruno"},{"clave":"alumno","texto":"Nombre del alumno","ejemplo":"Facu Benítez"}]',
   null, null),
  ('profe-pago', 220, 'profe', 'accion', 'Alumno avisó que pagó',
   'Cuando el alumno toca "Ya pagué" (transferencia con comprobante).',
   '{alumno} avisó que pagó', 'Revisá el comprobante y confirmalo.',
   '{alumno} avisó que pagó', 'Revisá el comprobante y confirmalo.',
   '/profe/cuentas', null, null, null, null, null, 'profe-o-admin',
   '{profe-o-admin,profe,admin,profe-y-admin}',
   '[{"clave":"nombre","texto":"Nombre de quien recibe","ejemplo":"Bruno"},{"clave":"alumno","texto":"Nombre del alumno","ejemplo":"Facu Benítez"}]',
   null, null),
  ('profe-mp', 230, 'profe', 'accion', 'Pago con Mercado Pago',
   'Cuando Mercado Pago confirma un pago con tarjeta y se le suma un mes al plan.',
   '{alumno} pagó con Mercado Pago', 'Se le activó el plan por un mes más.',
   '{alumno} pagó con Mercado Pago', 'Se le activó el plan por un mes más.',
   '/profe/cuentas', null, null, null, null, null, 'profe-o-admin',
   '{profe-o-admin,profe,admin,profe-y-admin}',
   '[{"clave":"nombre","texto":"Nombre de quien recibe","ejemplo":"Bruno"},{"clave":"alumno","texto":"Nombre del alumno","ejemplo":"Facu Benítez"}]',
   'mercadopago', 'Queda preparada: empieza a salir sola cuando se active el cobro con Mercado Pago.'),
  ('profe-solicitud', 240, 'profe', 'accion', 'Solicitud nueva',
   'Cuando un alumno le pide a un profe entrenar con él.',
   '{alumno} quiere entrenar con vos', 'Entrá para aceptar o rechazar la solicitud.',
   '{alumno} quiere entrenar con vos', 'Entrá para aceptar o rechazar la solicitud.',
   '/profe/solicitudes', null, null, null, null, null, 'profe',
   '{profe,profe-y-admin}',
   '[{"clave":"nombre","texto":"Nombre de quien recibe","ejemplo":"Bruno"},{"clave":"alumno","texto":"Nombre del alumno","ejemplo":"Facu Benítez"}]',
   null, 'Si el alumno escribió un mensaje, se manda ese mensaje en lugar del texto.'),
  ('profe-alumno-nuevo', 250, 'profe', 'accion', 'Nuevo alumno',
   'Cuando le asignan un alumno a un profe (no sale si el propio profe hizo el cambio, por ejemplo al aceptar una solicitud).',
   'Nuevo alumno: {alumno}', 'Ya está en tu lista de clientes. Armale la rutina.',
   'Nuevo alumno: {alumno}', 'Ya está en tu lista de clientes. Armale la rutina.',
   '/profe/clientes/{cliente_id}', null, null, null, null, null, 'profe',
   '{profe,profe-y-admin}',
   '[{"clave":"nombre","texto":"Nombre de quien recibe","ejemplo":"Bruno"},{"clave":"alumno","texto":"Nombre del alumno","ejemplo":"Facu Benítez"}]',
   null, null),
  ('profe-alumno-se-fue', 260, 'profe', 'accion', 'Alumno cambió de profe',
   'Al profe anterior, cuando un alumno suyo pasa a otro profe o queda sin profe.',
   '{alumno} cambió de profe', 'Ahora entrena con {profe_nuevo}.',
   '{alumno} cambió de profe', 'Ahora entrena con {profe_nuevo}.',
   '/profe/clientes', null, null, null, null, null, 'profe',
   '{profe,profe-y-admin}',
   '[{"clave":"nombre","texto":"Nombre de quien recibe","ejemplo":"Bruno"},{"clave":"alumno","texto":"Nombre del alumno","ejemplo":"Facu Benítez"},{"clave":"profe_nuevo","texto":"Profe nuevo","ejemplo":"Ana Gómez"}]',
   null, 'Si el alumno quedó sin profe, el texto es "Ya no está en tu lista de clientes."'),
  ('profe-entreno', 270, 'profe', 'accion', 'Entrenamiento terminado',
   'Cuando un alumno termina y guarda un entrenamiento (sin comentario).',
   '{alumno} terminó de entrenar 💪', '{rutina} · {esfuerzo}',
   '{alumno} terminó de entrenar 💪', '{rutina} · {esfuerzo}',
   '/profe/clientes/{cliente_id}', null, null, null, null, null, 'profe-o-admin',
   '{profe-o-admin,profe,admin,profe-y-admin}',
   '[{"clave":"nombre","texto":"Nombre de quien recibe","ejemplo":"Bruno"},{"clave":"alumno","texto":"Nombre del alumno","ejemplo":"Facu Benítez"},{"clave":"rutina","texto":"Rutina que hizo","ejemplo":"Piernas"},{"clave":"esfuerzo","texto":"Esfuerzo que marcó","ejemplo":"Esfuerzo 4 de 5"}]',
   null, 'Si el alumno dejó un comentario, en su lugar sale "Comentario nuevo" (si está prendida).'),
  ('profe-comentario', 280, 'profe', 'accion', 'Comentario nuevo',
   'Cuando un alumno termina un entrenamiento y deja un comentario.',
   '{alumno} dejó un comentario 💬', '"{comentario}" · {rutina}',
   '{alumno} dejó un comentario 💬', '"{comentario}" · {rutina}',
   '/profe/clientes/{cliente_id}', null, null, null, null, null, 'profe-o-admin',
   '{profe-o-admin,profe,admin,profe-y-admin}',
   '[{"clave":"nombre","texto":"Nombre de quien recibe","ejemplo":"Bruno"},{"clave":"alumno","texto":"Nombre del alumno","ejemplo":"Facu Benítez"},{"clave":"rutina","texto":"Rutina que hizo","ejemplo":"Piernas"},{"clave":"comentario","texto":"El comentario (hasta 120 letras)","ejemplo":"Me costó la última serie"},{"clave":"esfuerzo","texto":"Esfuerzo que marcó","ejemplo":"Esfuerzo 4 de 5"}]',
   null, null),
  -- Profe · programadas
  ('profe-sin-entrenar', 290, 'profe', 'horario', 'Alumno sin entrenar',
   'Cuando un alumno pasa varios días sin registrar un entrenamiento. Una sola vez por cada racha sin entrenar.',
   '{alumno} no entrena hace {dias} días', 'Escribile para que no pierda el ritmo.',
   '{alumno} no entrena hace {dias} días', 'Escribile para que no pierda el ritmo.',
   '/profe/clientes/{cliente_id}', '09:00', '09:00', 7, 7, 'Días sin entrenar', 'profe-o-admin',
   '{profe-o-admin,profe,admin,profe-y-admin}',
   '[{"clave":"nombre","texto":"Nombre de quien recibe","ejemplo":"Bruno"},{"clave":"alumno","texto":"Nombre del alumno","ejemplo":"Facu Benítez"},{"clave":"dias","texto":"Días sin entrenar","ejemplo":"7"}]',
   null, 'Solo por alumnos con el plan al día y alguna rutina publicada.')
on conflict (clave) do update set
  orden = excluded.orden,
  grupo = excluded.grupo,
  disparo = excluded.disparo,
  nombre = excluded.nombre,
  descripcion = excluded.descripcion,
  titulo_original = excluded.titulo_original,
  cuerpo_original = excluded.cuerpo_original,
  url = excluded.url,
  hora_original = excluded.hora_original,
  dias_original = excluded.dias_original,
  dias_etiqueta = excluded.dias_etiqueta,
  destinos_posibles = excluded.destinos_posibles,
  variables = excluded.variables,
  requiere = excluded.requiere,
  nota = excluded.nota;


-- 3) Armar los textos ------------------------------------------------------
-- Cambia cada {dato} por su valor. Los datos que no vinieron se borran y
-- se limpian los restos ("Piernas · " → "Piernas").
create or replace function public.rellenar_aviso(p_texto text, p_vars jsonb)
returns text
language plpgsql
immutable
as $$
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
$$;


-- 4) Poner un aviso en la cola ---------------------------------------------
-- encolar_aviso_en: como encolar_aviso (015) pero con "desde cuándo" se
-- puede mandar. Solo anota si la persona tiene algún celular con las
-- notificaciones activadas.
create or replace function public.encolar_aviso_en(
  p_usuario uuid, p_tipo text, p_titulo text, p_cuerpo text, p_url text, p_clave text,
  p_enviar_desde timestamptz
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
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

revoke all on function public.encolar_aviso_en(uuid, text, text, text, text, text, timestamptz)
  from public, anon, authenticated;

-- La de siempre (015) sigue andando igual, por si algo la llama.
create or replace function public.encolar_aviso(
  p_usuario uuid, p_tipo text, p_titulo text, p_cuerpo text, p_url text, p_clave text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.encolar_aviso_en(p_usuario, p_tipo, p_titulo, p_cuerpo, p_url, p_clave, now());
end;
$$;

revoke all on function public.encolar_aviso(uuid, text, text, text, text, text)
  from public, anon, authenticated;

create or replace function public.tipo_aviso_activo(p_clave text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select activo from public.tipos_aviso where clave = p_clave), false);
$$;

revoke all on function public.tipo_aviso_activo(text) from public, anon, authenticated;

-- avisar(): LA puerta de todas las notificaciones.
--   p_tipo:    clave de tipos_aviso ('hoy', 'rutina-nueva'…).
--   p_usuario: quién la recibe.
--   p_vars:    los datos para el texto, por ejemplo {"rutina": "Piernas"}.
--              {nombre} (el de quien la recibe) se agrega solo.
--              "mensaje_personal": si viene con texto, reemplaza al cuerpo
--              (la respuesta que escribió el profe o el mensaje del alumno).
--   p_clave:   identificador único (el mismo aviso no se manda dos veces).
--   p_enviar_desde: si tiene que salir más tarde.
-- Devuelve true si quedó en la cola.
create or replace function public.avisar(
  p_tipo text,
  p_usuario uuid,
  p_vars jsonb default '{}'::jsonb,
  p_clave text default null,
  p_enviar_desde timestamptz default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
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

revoke all on function public.avisar(text, uuid, jsonb, text, timestamptz) from public, anon, authenticated;

-- A quiénes les llega una notificación de profe, según su "destino".
--   p_cliente: el alumno del que se trata.
--   p_profe:   un profe puntual (solicitudes, alumno nuevo…); si es null,
--              se usa el profe del alumno.
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
begin
  if v_destino in ('profe', 'profe-y-admin', 'profe-o-admin') and v_profe is not null then
    return next v_profe;
  end if;
  if v_destino in ('admin', 'profe-y-admin') or (v_destino = 'profe-o-admin' and v_profe is null) then
    return query
      select id from public.perfiles
      where es_admin and id is distinct from v_profe;
  end if;
end;
$$;

revoke all on function public.destinatarios_de_profe(text, uuid, uuid) from public, anon, authenticated;

create or replace function public.avisar_profes(
  p_tipo text, p_cliente uuid, p_profe uuid, p_vars jsonb, p_clave text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
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

revoke all on function public.avisar_profes(text, uuid, uuid, jsonb, text) from public, anon, authenticated;

create or replace function public.fecha_corta(p_fecha date)
returns text
language sql
immutable
as $$
  select coalesce(to_char(p_fecha, 'DD/MM'), '');
$$;


-- 5) Avisos que salen cuando pasa algo -------------------------------------

-- Rutina nueva (reemplaza la de 015)
create or replace function public.aviso_rutina_nueva()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.publicada and (tg_op = 'INSERT' or not coalesce(old.publicada, false)) then
    perform public.avisar('rutina-nueva', new.cliente_id,
      jsonb_build_object('rutina', new.nombre), 'rutina:' || new.id);
  end if;
  return new;
end;
$$;

-- Rutina actualizada: espera 10 minutos desde el ÚLTIMO cambio (cada
-- cambio corre la hora), así sale uno solo por sesión de edición.
create or replace function public.aviso_rutina_editada(p_rutina uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
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

revoke all on function public.aviso_rutina_editada(uuid) from public, anon, authenticated;

create or replace function public.aviso_ejercicios_de_rutina_cambiaron()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.aviso_rutina_editada(coalesce(new.rutina_id, old.rutina_id));
  return null;
end;
$$;

drop trigger if exists rutina_ejercicios_aviso_editada on public.rutina_ejercicios;
create trigger rutina_ejercicios_aviso_editada
  after insert or update or delete on public.rutina_ejercicios
  for each row execute function public.aviso_ejercicios_de_rutina_cambiaron();

create or replace function public.aviso_rutina_cambio()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Solo cambios de contenido de una rutina ya publicada (no el orden).
  if old.publicada and new.publicada
     and (to_jsonb(new) - 'orden') is distinct from (to_jsonb(old) - 'orden') then
    perform public.aviso_rutina_editada(new.id);
  end if;
  return null;
end;
$$;

drop trigger if exists rutinas_aviso_editada on public.rutinas;
create trigger rutinas_aviso_editada
  after update on public.rutinas
  for each row execute function public.aviso_rutina_cambio();

-- Resumen de avance publicado (reemplaza la de 015)
create or replace function public.aviso_resumen_publicado()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.estado = 'publicado' and old.estado is distinct from 'publicado' then
    perform public.avisar('resumen', new.cliente_id, '{}'::jsonb, 'resumen:' || new.id);
  end if;
  return new;
end;
$$;

-- Al profe: cuenta nueva y "avisó que pagó" (reemplaza la de 020)
create or replace function public.aviso_al_profe_de_cuenta()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
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

-- Al alumno: cuenta activada o pago confirmado
create or replace function public.aviso_cuenta_del_alumno()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
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

drop trigger if exists perfiles_aviso_cuenta_alumno on public.perfiles;
create trigger perfiles_aviso_cuenta_alumno
  after update of estado, vencimiento on public.perfiles
  for each row execute function public.aviso_cuenta_del_alumno();

-- Al profe: pago con Mercado Pago aprobado (reemplaza la de 015).
-- Preparada: sale sola cuando funcione el cobro con Mercado Pago.
create or replace function public.aviso_pago_aprobado()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.estado = 'aprobado' and old.estado is distinct from 'aprobado' and new.metodo = 'mercadopago' then
    perform public.avisar_profes('profe-mp', new.cliente_id, null, '{}'::jsonb, 'mp:' || new.id);
  end if;
  return new;
end;
$$;

-- Al profe: entrenamiento terminado o comentario nuevo
create or replace function public.aviso_entrenamiento_al_profe()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
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

drop trigger if exists sesiones_aviso_al_profe on public.sesiones;
create trigger sesiones_aviso_al_profe
  after insert on public.sesiones
  for each row execute function public.aviso_entrenamiento_al_profe();


-- 6) Solicitudes y cambio de profe (026, con los avisos nuevos) -----------
-- Son las mismas funciones del SQL 026: solo cambian las líneas que
-- mandan los avisos (ahora pasan por avisar()).

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

revoke all on function public.solicitar_profe(uuid, text) from public, anon;
grant execute on function public.solicitar_profe(uuid, text) to authenticated;

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

revoke all on function public.responder_solicitud_profe(uuid, boolean, text) from public, anon;
grant execute on function public.responder_solicitud_profe(uuid, boolean, text) to authenticated;

create or replace function public.al_cambiar_profe_de_alumno()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
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


-- 7) Avisos programados (cada uno a su hora) -------------------------------
-- Corre cada 5 minutos. Cada notificación programada sale cuando llega su
-- hora; si por algo no pudo salir, se reintenta hasta 3 horas después.
-- La "clave" de cada aviso evita que se repita en el día.
create or replace function public.en_hora(p_ahora time, p_hora time)
returns boolean
language sql
immutable
as $$
  select p_hora is not null and p_ahora >= p_hora and p_ahora - p_hora <= interval '3 hours';
$$;

create or replace function public.generar_avisos_programados()
returns int
language plpgsql
security definer
set search_path = public
as $$
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

revoke all on function public.generar_avisos_programados() from public, anon, authenticated;

-- El nombre viejo (015/020) sigue existiendo y hace lo mismo.
create or replace function public.generar_avisos_del_dia()
returns int
language sql
security definer
set search_path = public
as $$
  select public.generar_avisos_programados();
$$;

revoke all on function public.generar_avisos_del_dia() from public, anon, authenticated;


-- 8) Mandar la cola --------------------------------------------------------

-- Los avisos que ya se pueden mandar. El aviso del descanso que no pudo
-- salir a tiempo (más de 2 minutos tarde) ya no sirve y no se manda.
create or replace function public.avisos_listos_para_enviar()
returns setof public.avisos
language sql
stable
security definer
set search_path = public
as $$
  select * from public.avisos
  where enviado_en is null
    and intentos < 5
    and enviar_desde <= now() + interval '3 seconds'
    and creado_en > now() - interval '1 day'
    and (reclamado_en is null or reclamado_en < now() - interval '2 minutes')
    and not (tipo = 'descanso' and enviar_desde < now() - interval '2 minutes');
$$;

revoke all on function public.avisos_listos_para_enviar() from public, anon, authenticated;

-- La función enviar-avisos "reclama" los avisos que va a mandar: así, si
-- corren dos envíos a la vez, cada aviso sale una sola vez.
create or replace function public.reclamar_avisos(p_limite int default 100)
returns setof public.avisos
language sql
security definer
set search_path = public
as $$
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

revoke all on function public.reclamar_avisos(int) from public, anon, authenticated;
grant execute on function public.reclamar_avisos(int) to service_role;

-- Llama a la función "enviar-avisos" solo si hay algo para mandar.
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

revoke all on function public.disparar_envio_de_avisos() from public, anon, authenticated;


-- 9) Aviso de fin del descanso (lo pide la app) ----------------------------

-- La app lo programa al empezar cada descanso (y lo vuelve a programar si
-- se cambia el tiempo). Sale cuando termina el descanso.
--   p_segundos:  cuánto falta para que termine.
--   p_siguiente: lo que sigue ("Sentadilla · serie 3").
-- Devuelve true si quedó programado.
create or replace function public.programar_aviso_descanso(p_segundos int, p_siguiente text default null)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
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

revoke all on function public.programar_aviso_descanso(int, text) from public, anon;
grant execute on function public.programar_aviso_descanso(int, text) to authenticated;

-- Lo cancela (tocó "Ya estoy listo", el descanso terminó con DREY a la
-- vista, o salió del entrenamiento).
create or replace function public.cancelar_aviso_descanso()
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.avisos
  where usuario_id = auth.uid() and tipo = 'descanso' and enviado_en is null and reclamado_en is null;
$$;

revoke all on function public.cancelar_aviso_descanso() from public, anon;
grant execute on function public.cancelar_aviso_descanso() to authenticated;


-- 10) Hora del recordatorio del alumno -------------------------------------

-- Lo que ve el alumno en Perfil → Recordatorio para entrenar.
create or replace function public.mi_recordatorio()
returns json
language sql
stable
security definer
set search_path = public
as $$
  select json_build_object(
    'propia', (select to_char(hora_recordatorio, 'HH24:MI') from public.perfiles where id = auth.uid()),
    'general', (select to_char(hora, 'HH24:MI') from public.tipos_aviso where clave = 'hoy'),
    'activo', public.tipo_aviso_activo('hoy')
  );
$$;

revoke all on function public.mi_recordatorio() from public, anon;
grant execute on function public.mi_recordatorio() to authenticated;

-- p_hora null = volver a la hora general.
create or replace function public.guardar_mi_recordatorio(p_hora time default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Iniciá sesión de nuevo';
  end if;
  update public.perfiles set hora_recordatorio = p_hora where id = auth.uid();
end;
$$;

revoke all on function public.guardar_mi_recordatorio(time) from public, anon;
grant execute on function public.guardar_mi_recordatorio(time) to authenticated;


-- 11) Para el Admin: ver, cambiar y probar ---------------------------------

-- Todo lo que muestra Ajustes → Notificaciones.
create or replace function public.tipos_de_aviso()
returns json
language plpgsql
stable
security definer
set search_path = public
as $$
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

revoke all on function public.tipos_de_aviso() from public, anon;
grant execute on function public.tipos_de_aviso() to authenticated;

-- Guarda los cambios de una notificación (y los anota en el Historial).
create or replace function public.guardar_tipo_aviso(
  p_clave text,
  p_activo boolean,
  p_titulo text,
  p_cuerpo text,
  p_hora time default null,
  p_dias int default null,
  p_destino text default null,
  p_planes text[] default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
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

revoke all on function public.guardar_tipo_aviso(text, boolean, text, text, time, int, text, text[]) from public, anon;
grant execute on function public.guardar_tipo_aviso(text, boolean, text, text, time, int, text, text[]) to authenticated;

-- "Enviarme una prueba": le manda al Admin esa notificación con datos de
-- ejemplo (aunque esté apagada). Devuelve en cuántos celulares la va a
-- recibir (0 = no activó las notificaciones en ningún celular).
create or replace function public.probar_tipo_aviso(p_clave text, p_titulo text default null, p_cuerpo text default null)
returns int
language plpgsql
security definer
set search_path = public
as $$
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

revoke all on function public.probar_tipo_aviso(text, text, text) from public, anon;
grant execute on function public.probar_tipo_aviso(text, text, text) to authenticated;

-- Las últimas notificaciones enviadas o en espera (sin los descansos).
create or replace function public.historial_avisos(p_limite int default 100)
returns table (
  id uuid,
  tipo text,
  nombre_tipo text,
  destinatario text,
  titulo text,
  cuerpo text,
  creado_en timestamptz,
  enviar_desde timestamptz,
  enviado_en timestamptz,
  intentos int
)
language plpgsql
stable
security definer
set search_path = public
as $$
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

revoke all on function public.historial_avisos(int) from public, anon;
grant execute on function public.historial_avisos(int) to authenticated;


-- 12) Tareas programadas ---------------------------------------------------
--   drey-avisos-programados: cada 5 minutos arma los avisos que tocan.
--   drey-enviar-avisos:      cada 10 segundos manda los que están listos
--                            (si la versión de pg_cron no acepta segundos,
--                            queda cada minuto).
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job
    where jobname in ('drey-avisos-del-dia', 'drey-avisos-programados', 'drey-enviar-avisos');
    perform cron.schedule('drey-avisos-programados', '*/5 * * * *', 'select public.generar_avisos_programados()');
    begin
      perform cron.schedule('drey-enviar-avisos', '10 seconds', 'select public.disparar_envio_de_avisos()');
    exception when others then
      perform cron.schedule('drey-enviar-avisos', '* * * * *', 'select public.disparar_envio_de_avisos()');
    end;
  else
    raise notice 'pg_cron no está activo: activarlo en Database → Extensions y volver a correr este archivo.';
  end if;
end;
$$;
