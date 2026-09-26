// Función de Supabase "enviar-avisos"
//
// Manda a los celulares las notificaciones que están esperando en la
// tabla "avisos". No la llama la app: la llama la propia base de datos
// cada minuto, solo cuando hay avisos esperando (ver
// supabase/sql/015_notificaciones.sql).
//
// Para que nadie más pueda usarla, la base manda una clave secreta
// (x-drey-secreto) que esta función compara con la guardada en la tabla
// ajustes_internos. Por eso tiene que tener DESACTIVADO "Verify JWT".
//
// Secretos que usa (Edge Functions → Secrets):
//   VAPID_PUBLICA  = la clave pública de notificaciones (ver LEEME)
//   VAPID_PRIVADA  = la clave privada de notificaciones (ver LEEME)
//   VAPID_EMAIL    = un email de contacto (ej. hola@dreysport.com.uy)
import { createClient } from 'npm:@supabase/supabase-js@2'
import webpush from 'npm:web-push@3.6.7'

const POR_VUELTA = 100
const INTENTOS_MAXIMOS = 5

Deno.serve(async (req) => {
  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  // 1) ¿La llama la base de datos?
  const { data: ajuste } = await admin
    .from('ajustes_internos')
    .select('valor')
    .eq('clave', 'avisos_secreto')
    .maybeSingle()
  if (!ajuste?.valor || req.headers.get('x-drey-secreto') !== ajuste.valor) {
    return new Response('No autorizado', { status: 401 })
  }

  const publica = Deno.env.get('VAPID_PUBLICA')
  const privada = Deno.env.get('VAPID_PRIVADA')
  if (!publica || !privada) return new Response('Faltan las claves VAPID', { status: 500 })
  webpush.setVapidDetails(
    `mailto:${Deno.env.get('VAPID_EMAIL') || 'avisos@drey.app'}`,
    publica,
    privada,
  )

  // 2) Avisos esperando (del último día; los más viejos ya no sirven)
  const { data: avisos } = await admin
    .from('avisos')
    .select('id, usuario_id, titulo, cuerpo, url, tipo, intentos')
    .is('enviado_en', null)
    .lt('intentos', INTENTOS_MAXIMOS)
    .gt('creado_en', new Date(Date.now() - 24 * 3600 * 1000).toISOString())
    .order('creado_en')
    .limit(POR_VUELTA)
  if (!avisos?.length) return new Response('Nada para enviar')

  const usuarios = [...new Set(avisos.map((aviso) => aviso.usuario_id))]
  const { data: suscripciones } = await admin
    .from('push_suscripciones')
    .select('id, usuario_id, endpoint, p256dh, auth')
    .in('usuario_id', usuarios)

  let enviados = 0
  for (const aviso of avisos) {
    const suyas = (suscripciones || []).filter((sus) => sus.usuario_id === aviso.usuario_id)
    const contenido = JSON.stringify({
      titulo: aviso.titulo,
      cuerpo: aviso.cuerpo,
      url: aviso.url || '/',
      etiqueta: aviso.tipo,
    })

    let alguno = suyas.length === 0 // sin celulares: se da por terminado
    for (const sus of suyas) {
      try {
        await webpush.sendNotification(
          { endpoint: sus.endpoint, keys: { p256dh: sus.p256dh, auth: sus.auth } },
          contenido,
          { TTL: 12 * 3600 },
        )
        alguno = true
      } catch (error) {
        const codigo = (error as { statusCode?: number }).statusCode
        // 404/410: ese celular ya no acepta avisos (desinstaló la app o
        // los desactivó). Se borra para no intentar más.
        if (codigo === 404 || codigo === 410) {
          await admin.from('push_suscripciones').delete().eq('id', sus.id)
          alguno = true
        } else {
          console.error('No se pudo enviar', aviso.id, codigo, String(error))
        }
      }
    }

    if (alguno) {
      enviados += 1
      await admin.from('avisos').update({ enviado_en: new Date().toISOString() }).eq('id', aviso.id)
    } else {
      await admin.from('avisos').update({ intentos: aviso.intentos + 1 }).eq('id', aviso.id)
    }
  }

  return new Response(`Enviados: ${enviados}`)
})
