-- 039 · Privacidad de datos (auditoría de noviembre 2026, tanda 1)
--
-- Qué cambia:
--   1. DATOS BANCARIOS DE LOS ESPACIOS. Antes, sin iniciar sesión, se
--      podía pedir el banco, titular y número de cuenta de cualquier profe
--      o gimnasio con solo su código (y la lista de códigos es pública,
--      porque se elige en el registro). Ahora datos_cobro_de_espacio()
--      devuelve solo el nombre del espacio y su link de Mercado Pago. La
--      cuenta bancaria la ve el alumno recién con su cuenta creada, en
--      Suscripción (mi_cobro(), SQL 034, que ya solo muestra la de SU
--      espacio).
--   2. AJUSTES DEL NEGOCIO. La tabla "ajustes" se podía leer sin iniciar
--      sesión, y ahí están el link del grupo de WhatsApp y las cuentas
--      bancarias de DREY. Ahora la tabla la lee solo el Admin, y la app
--      pide mis_ajustes(), que le da a cada uno solo lo que le toca:
--        · todos (también sin sesión): reglas generales (días de prueba,
--          días de gracia, avisos, cobro automático);
--        · con sesión: los datos para transferencia de DREY de los alumnos
--          de antes (transferencia_*);
--        · alumnos con el plan al día: el link del grupo de WhatsApp;
--        · profes y gimnasios: los datos para pagarle a DREY (drey_*);
--        · el Admin: todo.
--
-- Hay que correrlo ANTES de subir la app nueva (la app vieja sigue
-- andando: solo deja de ver esos datos si no le corresponden).
-- Se puede correr más de una vez sin romper nada.

-- 1) Datos de cobro de un espacio, sin sesión (registro) -----------------------
-- Solo el nombre (para "Le pagás a …") y el link general de Mercado Pago.
-- Nada de la cuenta bancaria.
create or replace function public.datos_cobro_de_espacio(p_codigo text)
returns json
language sql
stable
security definer
set search_path = public
as $$
  select json_build_object(
    'espacio', public.nombre_de_espacio(e.id),
    'link_mp', d.link_mp
  )
  from public.espacios e
  left join public.datos_cobro d on d.espacio_id = e.id
  where e.codigo = public.normalizar_codigo(p_codigo);
$$;

revoke all on function public.datos_cobro_de_espacio(text) from public;
grant execute on function public.datos_cobro_de_espacio(text) to anon, authenticated;

-- 2) Ajustes: la tabla solo para el Admin ---------------------------------------
drop policy if exists "ajustes: todos los leen" on public.ajustes;
drop policy if exists "ajustes: solo el Admin los lee" on public.ajustes;
create policy "ajustes: solo el Admin los lee"
  on public.ajustes for select to authenticated
  using (public.es_admin());

revoke select on public.ajustes from anon;

-- Lo que cada uno puede ver de los ajustes (la app lo pide al abrir y cada
-- vez que alguien entra o sale de su cuenta: services/configuracion.js).
-- Devuelve las mismas columnas que la tabla; las que no le tocan, vacías.
create or replace function public.mis_ajustes()
returns json
language plpgsql
stable
security definer
set search_path = public
as $$
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

revoke all on function public.mis_ajustes() from public;
grant execute on function public.mis_ajustes() to anon, authenticated;
