// Función de Supabase "mp-webhook"
//
// Mercado Pago la llama sola cada vez que cambia un pago (aprobado,
// rechazado...). Esta función:
//   1. Le pregunta DIRECTAMENTE a Mercado Pago cómo está ese pago (no se
//      cree lo que dice el aviso, así nadie puede inventar un pago).
//   2. Si está aprobado y el monto coincide con lo anotado, activa la
//      cuenta del cliente y le suma un mes (registrar_pago_aprobado, en
//      la base). Si el aviso llega repetido, no suma dos veces.
//   3. Si fue rechazado o cancelado, lo anota.
//
// IMPORTANTE: esta función tiene que tener DESACTIVADA la opción
// "Verify JWT" / "Enforce JWT verification" (Mercado Pago no tiene
// sesión de Supabase). Ver LEEME.
//
// Secretos que usa (Edge Functions → Secrets):
//   MP_ACCESS_TOKEN   (obligatorio, el mismo que usa mp-crear-pago)
//   MP_WEBHOOK_SECRET (opcional: la "clave secreta" de Webhooks en
//                      Mercado Pago; si está, se revisa la firma de los
//                      avisos que vienen firmados)
import { createClient } from 'npm:@supabase/supabase-js@2'

function ok(texto = 'ok') {
  return new Response(texto, { status: 200 })
}

// Revisa la firma "x-signature" que manda Mercado Pago.
async function firmaValida(req: Request, idDato: string, secreto: string) {
  const firma = req.headers.get('x-signature') || ''
  const idPedido = req.headers.get('x-request-id') || ''
  const partes = Object.fromEntries(
    firma.split(',').map((parte) => parte.split('=').map((texto) => texto.trim())),
  )
  if (!partes.ts || !partes.v1) return false

  const id = /^[a-z0-9]+$/i.test(idDato) ? idDato.toLowerCase() : idDato
  const manifiesto = `id:${id};request-id:${idPedido};ts:${partes.ts};`
  const clave = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secreto),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const bytes = await crypto.subtle.sign('HMAC', clave, new TextEncoder().encode(manifiesto))
  const calculada = [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, '0')).join('')
  return calculada === partes.v1
}

Deno.serve(async (req) => {
  const url = new URL(req.url)
  let cuerpo: Record<string, any> = {}
  try {
    cuerpo = await req.json()
  } catch {
    // Algunos avisos vienen solo en la dirección.
  }

  const tipo = cuerpo.type || cuerpo.topic || url.searchParams.get('type') || url.searchParams.get('topic')
  const idPago = String(
    cuerpo.data?.id || url.searchParams.get('data.id') || url.searchParams.get('id') || '',
  )
  // Solo interesan los avisos de pagos.
  if (tipo !== 'payment' || !idPago) return ok('ignorado')

  const MP_TOKEN = Deno.env.get('MP_ACCESS_TOKEN')
  if (!MP_TOKEN) return new Response('Falta MP_ACCESS_TOKEN', { status: 500 })

  // Si el aviso viene firmado y la firma no coincide, se descarta. (Si no
  // viene firmado se sigue igual: de todas formas el pago se le pregunta
  // a Mercado Pago directamente, así que un aviso falso no activa nada.)
  const secreto = Deno.env.get('MP_WEBHOOK_SECRET')
  if (
    secreto &&
    req.headers.get('x-signature') &&
    !(await firmaValida(req, url.searchParams.get('data.id') || idPago, secreto))
  ) {
    console.warn('Aviso con firma inválida', idPago)
    return new Response('Firma inválida', { status: 401 })
  }

  // 1) Estado real del pago, preguntado a Mercado Pago
  const respuesta = await fetch(`https://api.mercadopago.com/v1/payments/${idPago}`, {
    headers: { Authorization: `Bearer ${MP_TOKEN}` },
  })
  if (!respuesta.ok) {
    console.error('No se pudo consultar el pago', idPago, respuesta.status)
    // 500: Mercado Pago vuelve a avisar más tarde.
    return new Response('No se pudo consultar', { status: 500 })
  }
  const pagoMp = await respuesta.json()
  const idInterno = pagoMp.external_reference || pagoMp.metadata?.pago_id
  if (!idInterno) return ok('sin referencia')

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )
  const { data: pago } = await admin
    .from('pagos')
    .select('id, monto, estado')
    .eq('id', idInterno)
    .maybeSingle()
  if (!pago) return ok('pago desconocido')

  // 2) Aprobado: activar la cuenta
  if (pagoMp.status === 'approved') {
    const pagado = Number(pagoMp.transaction_amount) || 0
    if (pagoMp.currency_id !== 'UYU' || pagado + 0.01 < pago.monto) {
      console.error('Monto o moneda no coinciden', idPago, pagado, pago.monto, pagoMp.currency_id)
      await admin
        .from('pagos')
        .update({ detalle: `Revisar: se pagó ${pagado} ${pagoMp.currency_id}`, mp_payment_id: idPago })
        .eq('id', pago.id)
      return ok('monto distinto')
    }
    const { error } = await admin.rpc('registrar_pago_aprobado', {
      p_pago: pago.id,
      p_mp_payment: idPago,
    })
    if (error) {
      console.error('No se pudo registrar el pago', error)
      return new Response('Error al registrar', { status: 500 })
    }
    return ok('aprobado')
  }

  // 3) Rechazado o cancelado
  if (['rejected', 'cancelled', 'refunded', 'charged_back'].includes(pagoMp.status)) {
    if (pago.estado === 'pendiente') {
      await admin
        .from('pagos')
        .update({
          estado: pagoMp.status === 'rejected' ? 'rechazado' : 'cancelado',
          mp_payment_id: idPago,
          detalle: pagoMp.status_detail || pagoMp.status,
        })
        .eq('id', pago.id)
    }
    if (pago.estado === 'aprobado') {
      // Devolución o contracargo de un pago ya aprobado: se deja anotado
      // para que el profe lo vea (no se descuenta el mes automáticamente).
      await admin
        .from('pagos')
        .update({ detalle: `Mercado Pago: ${pagoMp.status}` })
        .eq('id', pago.id)
    }
  }
  return ok(pagoMp.status || 'sin estado')
})
