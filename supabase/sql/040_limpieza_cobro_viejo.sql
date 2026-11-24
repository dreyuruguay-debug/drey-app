-- 040 · Limpieza (auditoría de noviembre 2026, tanda 2)
--
-- Qué cambia:
--   1. SE BORRA EL COBRO AUTOMÁTICO VIEJO con Mercado Pago (el alumno le
--      pagaba a DREY con tarjeta desde la app y la cuenta se activaba
--      sola). Estaba apagado desde el SQL 034: ahora cada alumno le paga a
--      su profe o gimnasio, y el profe confirma el pago desde Cobros.
--      Se borran: mi_precio(), registrar_pago_aprobado(), el aviso al profe
--      "Pago con Mercado Pago" (profe-mp) y su trigger.
--      SE QUEDAN: la tabla "pagos" con todo su historial, calcular_precio()
--      (la usa "Confirmar pago" del profe, registrar_pago_manual) y
--      validar_codigo() (códigos de descuento en el registro). La columna
--      ajustes.cobro_automatico queda (apagada) solo por el historial; la
--      app ya no la usa.
--      Las funciones de Supabase "mp-crear-pago" y "mp-webhook" se borran
--      a mano desde Supabase (ver la guía).
--   2. TOPES A LOS ARCHIVOS que suben alumnos y profes:
--        · comprobantes: hasta 10 MB, solo fotos o PDF;
--        · fotos de progreso: hasta 10 MB, solo fotos.
--      (La app ya achica las fotos antes de subirlas: esto frena a quien
--      intente subir otra cosa saltándose la app.)
--   3. SE QUITA la regla "perfiles: cada uno crea el suyo". El perfil lo
--      crea la base sola al registrarse (handle_new_user); esa regla no la
--      usaba nadie y dejaba una puerta abierta innecesaria.
--
-- Hay que correrlo ANTES de subir la app nueva.
-- Se puede correr más de una vez sin romper nada.

-- 1) Cobro automático viejo ------------------------------------------------------
drop trigger if exists pagos_aviso_aprobado on public.pagos;
drop function if exists public.aviso_pago_aprobado();
drop function if exists public.mi_precio(text);
drop function if exists public.registrar_pago_aprobado(uuid, text);
delete from public.tipos_aviso where clave = 'profe-mp';
update public.ajustes set cobro_automatico = false where id = 1 and cobro_automatico;

-- 2) Topes a los archivos --------------------------------------------------------
update storage.buckets
set file_size_limit = 10485760, -- 10 MB
    allowed_mime_types = array['image/*', 'application/pdf']
where id = 'comprobantes';

update storage.buckets
set file_size_limit = 10485760, -- 10 MB
    allowed_mime_types = array['image/*']
where id = 'fotos-progreso';

-- 3) Perfiles: solo los crea la base -------------------------------------------
drop policy if exists "perfiles: cada uno crea el suyo" on public.perfiles;
