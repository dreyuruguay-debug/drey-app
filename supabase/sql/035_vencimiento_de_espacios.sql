-- 035 · Cobro por cupos (Entrega D): vencimiento de los espacios y panel
--       del gimnasio
-- ----------------------------------------------------------------------
-- Necesita los SQL 032, 033 y 034.
--
-- Qué pasa cuando un profe o un gimnasio (un "espacio") no le paga a
-- DREY (decisión D3 del plan):
--
--   · Suscripción DREY: aviso unos días antes → días de gracia → PAUSA.
--     La prueba gratis que termina pasa a "pendiente" (tiene que elegir
--     plan y pagar).
--   · Desde que el espacio deja de estar al día, sus ALUMNOS siguen
--     entrenando los días de Ajustes → Plazos (14 de entrada) con un cartel
--     suave ("Hay un tema pendiente con tu gimnasio…", sin hablar de plata
--     ni de DREY). Cumplidos, no ven sus rutinas hasta que el espacio pague.
--     Lo controla la base (acceso_vigente), no la pantalla.
--   · Una tarea cada 5 minutos (junto con las notificaciones programadas)
--     pasa a "pendiente" las pruebas terminadas, pausa los espacios
--     vencidos y manda los avisos: suscripción por vencer, prueba por
--     terminar, espacio en pausa (al dueño y al Admin) y cupo al 90 %.
--   · resumen_espacio(): los números del espacio para el Inicio del dueño
--     (cupos, activos, pendientes, avisos de pago, vencidos, sin entrenar).
--
-- Se puede correr más de una vez sin romper nada.


-- 1) Desde cuándo un espacio está sin servicio ------------------------------------
-- espacios.sin_servicio_desde: el primer día en que el espacio quedó
-- "pendiente" o "en pausa". Queda FIJO mientras siga así (no se corre
-- día a día) y se borra cuando vuelve a estar al día o en prueba.
alter table public.espacios add column if not exists sin_servicio_desde date;

create or replace function public.marcar_sin_servicio_de_espacio()
returns trigger
language plpgsql
as $$
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

drop trigger if exists espacios_marcar_sin_servicio on public.espacios;
create trigger espacios_marcar_sin_servicio
  before update of estado, sin_servicio_desde on public.espacios
  for each row execute function public.marcar_sin_servicio_de_espacio();

-- Desde cuándo rige esta regla: el día que se instala este archivo. Así,
-- a un espacio que ya estaba atrasado no se le cortan los alumnos de
-- golpe: arrancan sus días de cartel desde hoy.
alter table public.ajustes add column if not exists espacios_corte_desde date;
update public.ajustes set espacios_corte_desde = public.hoy_uy()
where id = 1 and espacios_corte_desde is null;

-- Los que ya estaban pendientes o en pausa: su fecha (como pronto, hoy).
update public.espacios
set sin_servicio_desde = least(
  coalesce(prueba_hasta + 1, vencimiento + public.dias_de_gracia() + 1, creado_en::date),
  public.hoy_uy())
where estado in ('pendiente', 'pausado') and sin_servicio_desde is null;


-- 2) Desde cuándo un espacio no está al día ------------------------------------
-- null = al día (pagó, sin costo o en prueba). Si no, el primer día sin
-- servicio: el siguiente al fin de la prueba, el siguiente al último día
-- de gracia o el día en que quedó pendiente o en pausa. Nunca antes del
-- día en que se instaló esta regla.
create or replace function public.espacio_sin_servicio_desde(p_espacio uuid)
returns date
language sql
stable
security definer
set search_path = public
as $$
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

revoke all on function public.espacio_sin_servicio_desde(uuid) from public, anon, authenticated;

-- Días que los alumnos siguen entrenando con el cartel (Ajustes → Plazos).
create or replace function public.dias_alumnos_de_espacio()
returns int
language sql
stable
security definer
set search_path = public
as $$
  select greatest(coalesce((select dias_aviso_alumnos_espacio from public.ajustes where id = 1), 14), 0);
$$;

revoke all on function public.dias_alumnos_de_espacio() from public, anon, authenticated;

-- Hasta qué día (sin incluirlo) entrenan los alumnos de un espacio que no
-- está al día. null = el espacio está al día.
create or replace function public.alumnos_entrenan_hasta(p_espacio uuid)
returns date
language sql
stable
security definer
set search_path = public
as $$
  select public.espacio_sin_servicio_desde(p_espacio) + public.dias_alumnos_de_espacio();
$$;

revoke all on function public.alumnos_entrenan_hasta(uuid) from public, anon, authenticated;

-- ¿El espacio de este alumno lo deja sin acceso? (pasaron los días).
create or replace function public.alumno_bloqueado_por_espacio(p_usuario uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select public.hoy_uy() >= public.alumnos_entrenan_hasta(p.espacio_id)
    from public.perfiles p
    where p.id = p_usuario
      and p.espacio_id is not null
      and not coalesce(p.es_profe, false)
      and not coalesce(p.es_admin, false)
  ), false);
$$;

revoke all on function public.alumno_bloqueado_por_espacio(uuid) from public, anon, authenticated;

-- Que nadie pueda preguntar directamente si un espacio está al día (un
-- alumno se enteraría de que su profe no le pagó a DREY). La app lo ve
-- por mis_espacios (los profes del espacio) y mi_acceso (el alumno, sin
-- el porqué).
revoke all on function public.estado_espacio(uuid) from public, anon, authenticated;


-- 3) Acceso del alumno (reemplaza la de 020) -----------------------------------
-- Además de su propio plan, que su espacio no lo haya dejado sin acceso.
create or replace function public.acceso_vigente(p_usuario uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
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

revoke all on function public.acceso_vigente(uuid) from public;
grant execute on function public.acceso_vigente(uuid) to authenticated;

-- Las reglas que la usan la llaman UNA vez por consulta (no una vez por
-- fila): "(select …)". Reemplazan las de 013 y 034, iguales en lo demás.
alter policy "rutinas: el cliente ve las suyas guardadas" on public.rutinas
  using (cliente_id = auth.uid() and publicada and (select public.acceso_vigente(auth.uid())));
alter policy "rutina_ejercicios: el cliente ve los de sus rutinas" on public.rutina_ejercicios
  using (
    (select public.acceso_vigente(auth.uid()))
    and exists (
      select 1 from public.rutinas r
      where r.id = rutina_ejercicios.rutina_id and r.cliente_id = auth.uid() and r.publicada
    )
  );
alter policy "codigos: el profe ve los suyos y los clientes los de ropa" on public.codigos_descuento
  using (
    public.es_admin()
    or (tipo = 'plan' and espacio_id is not null and coalesce(public.mi_rol_en_espacio(espacio_id) = 'dueno', false))
    or (tipo = 'ropa' and public.profe_de_confianza())
    or (tipo = 'ropa' and activo and (select public.acceso_vigente(auth.uid())))
  );

-- Lo que ve el alumno en su Inicio (reemplaza la de 012). Suma:
--   espacio_cartel:    su profe o gimnasio no está al día (todavía entrena).
--   espacio_bloqueado: pasaron los días: no ve sus rutinas.
--   espacio_hasta:     el día en que se corta (para el cartel).
--   espacio_tipo:      'profe' o 'gimnasio' (para decir "tu profe" o "tu
--                      gimnasio").
-- Nunca dice por qué (ni plata ni DREY).
create or replace function public.mi_acceso()
returns json
language sql
stable
security definer
set search_path = public
as $$
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

revoke all on function public.mi_acceso() from public, anon;
grant execute on function public.mi_acceso() to authenticated;


-- 4) Mis espacios: también hasta cuándo entrenan sus alumnos ---------------------
-- (reemplaza la de 032; suma "alumnos_hasta" al final)
drop function if exists public.mis_espacios();
create function public.mis_espacios()
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
  ultimo boolean,
  alumnos_hasta date
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

revoke all on function public.mis_espacios() from public, anon;
grant execute on function public.mis_espacios() to authenticated;


-- 5) Números del espacio (Inicio del dueño) ------------------------------------
create or replace function public.resumen_espacio(p_espacio uuid, p_dias_sin_entrenar int default 7)
returns json
language plpgsql
stable
security definer
set search_path = public
as $$
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

revoke all on function public.resumen_espacio(uuid, int) from public, anon;
grant execute on function public.resumen_espacio(uuid, int) to authenticated;


-- 6) Notificaciones nuevas ------------------------------------------------------
insert into public.tipos_aviso as t (
  clave, orden, grupo, disparo, nombre, descripcion, titulo, cuerpo, titulo_original,
  cuerpo_original, url, hora, hora_original, dias, dias_original, dias_etiqueta, destino,
  destinos_posibles, variables, nota
) values
  ('espacio-por-vencer', 330, 'profe', 'horario', 'Suscripción DREY por vencer',
   'Al dueño del espacio (el profe, o el dueño del gimnasio), los "días de aviso" de Ajustes → Plazos antes de que venza su suscripción DREY, si todavía no avisó que pagó.',
   'Tu suscripción DREY vence el {fecha}', '{espacio}: renovala desde Suscripción DREY para que tus alumnos sigan entrenando sin cortes.',
   'Tu suscripción DREY vence el {fecha}', '{espacio}: renovala desde Suscripción DREY para que tus alumnos sigan entrenando sin cortes.',
   '/profe/suscripcion', '09:00', '09:00', null, null, null, 'dueno', '{dueno}',
   '[{"clave":"nombre","texto":"Nombre de quien recibe","ejemplo":"Bruno"},{"clave":"espacio","texto":"Profe o gimnasio","ejemplo":"FitCenter"},{"clave":"fecha","texto":"Día que vence","ejemplo":"30/11"}]',
   null),
  ('espacio-prueba-termina', 335, 'profe', 'horario', 'La prueba gratis está por terminar',
   'Al dueño del espacio, unos días antes de que termine su prueba gratis.',
   'Tu prueba gratis termina el {fecha}', 'Elegí tu plan en Suscripción DREY para seguir habilitando alumnos en {espacio}.',
   'Tu prueba gratis termina el {fecha}', 'Elegí tu plan en Suscripción DREY para seguir habilitando alumnos en {espacio}.',
   '/profe/suscripcion', '09:00', '09:00', 3, 3, 'Días antes de que termine', 'dueno', '{dueno}',
   '[{"clave":"nombre","texto":"Nombre de quien recibe","ejemplo":"Bruno"},{"clave":"espacio","texto":"Profe o gimnasio","ejemplo":"FitCenter"},{"clave":"fecha","texto":"Último día de la prueba","ejemplo":"14/11"}]',
   null),
  ('espacio-en-pausa', 340, 'profe', 'horario', 'Espacio en pausa',
   'Al dueño del espacio, el día que su suscripción DREY queda en pausa (o terminó la prueba sin elegir plan). Sus alumnos siguen entrenando unos días más.',
   '{espacio} está en pausa', 'Tus alumnos entrenan hasta el {fecha}. Pagá desde Suscripción DREY para que no se corten.',
   '{espacio} está en pausa', 'Tus alumnos entrenan hasta el {fecha}. Pagá desde Suscripción DREY para que no se corten.',
   '/profe/suscripcion', '09:00', '09:00', null, null, null, 'dueno', '{dueno}',
   '[{"clave":"nombre","texto":"Nombre de quien recibe","ejemplo":"Bruno"},{"clave":"espacio","texto":"Profe o gimnasio","ejemplo":"FitCenter"},{"clave":"fecha","texto":"Último día de sus alumnos","ejemplo":"14/12"}]',
   null),
  ('admin-espacio-vencido', 345, 'profe', 'horario', 'Un espacio quedó en pausa',
   'Al Admin, el día que un profe o gimnasio queda en pausa por no pagar DREY (o terminó su prueba sin elegir plan).',
   '{espacio} quedó en pausa', 'No pagó DREY. Sus alumnos entrenan hasta el {fecha}.',
   '{espacio} quedó en pausa', 'No pagó DREY. Sus alumnos entrenan hasta el {fecha}.',
   '/profe/equipo', '09:00', '09:00', null, null, null, 'admin', '{admin}',
   '[{"clave":"nombre","texto":"Nombre de quien recibe","ejemplo":"Admin"},{"clave":"espacio","texto":"Profe o gimnasio","ejemplo":"FitCenter"},{"clave":"fecha","texto":"Último día de sus alumnos","ejemplo":"14/12"}]',
   null),
  ('espacio-cupo-90', 350, 'profe', 'horario', 'Cupos casi llenos',
   'Al dueño del espacio cuando usa el 90 % o más de sus cupos (una vez por mes).',
   'Usás {usados} de {cupos} cupos', '{espacio} está casi lleno. Si vas a sumar alumnos, pasate a un plan más grande en Suscripción DREY.',
   'Usás {usados} de {cupos} cupos', '{espacio} está casi lleno. Si vas a sumar alumnos, pasate a un plan más grande en Suscripción DREY.',
   '/profe/suscripcion', '09:00', '09:00', null, null, null, 'dueno', '{dueno}',
   '[{"clave":"nombre","texto":"Nombre de quien recibe","ejemplo":"Bruno"},{"clave":"espacio","texto":"Profe o gimnasio","ejemplo":"FitCenter"},{"clave":"usados","texto":"Cupos usados","ejemplo":"23"},{"clave":"cupos","texto":"Cupos del plan","ejemplo":"25"}]',
   null)
on conflict (clave) do update set
  orden = excluded.orden,
  grupo = excluded.grupo,
  disparo = excluded.disparo,
  nombre = excluded.nombre,
  descripcion = excluded.descripcion,
  titulo_original = excluded.titulo_original,
  cuerpo_original = excluded.cuerpo_original,
  hora_original = excluded.hora_original,
  dias_original = excluded.dias_original,
  dias_etiqueta = excluded.dias_etiqueta,
  destinos_posibles = excluded.destinos_posibles,
  variables = excluded.variables,
  nota = excluded.nota;


-- 7) La tarea de los espacios ----------------------------------------------------
-- Corre cada 5 minutos (pg_cron). Lo que cambia estados se hace una sola
-- vez (si ya está hecho, no hace nada); los avisos salen a su hora y una
-- sola vez (cada uno tiene su clave).
create or replace function public.tarea_de_espacios()
returns int
language plpgsql
security definer
set search_path = public
as $$
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

revoke all on function public.tarea_de_espacios() from public, anon, authenticated;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'drey-espacios';
    perform cron.schedule('drey-espacios', '*/5 * * * *', 'select public.tarea_de_espacios()');
  else
    raise notice 'pg_cron no está activo: activarlo en Database → Extensions y volver a correr este archivo.';
  end if;
end;
$$;

-- Una pasada ahora (pone al día las pruebas terminadas y los vencidos).
do $$
begin
  perform public.tarea_de_espacios();
end;
$$;
