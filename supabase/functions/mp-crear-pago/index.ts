// Función de Supabase "mp-crear-pago"
//
// La llama la app cuando el cliente toca "Pagar" en Suscripción.
//   1. Revisa quién es (con su sesión).
//   2. Calcula cuánto tiene que pagar con calcular_precio() de la base
//      (plan, primer mes o no, código de descuento). La app NO manda el
//      precio: así nadie puede pagar menos cambiando algo en su celular.
//   3. Anota el pago como "pendiente" en la tabla "pagos".
//   4. Le pide a Mercado Pago un link de pago y se lo devuelve a la app.
// Cuando el cliente paga, Mercado Pago avisa a la función "mp-webhook",
// que es la que activa la cuenta.
//
// Necesita UN secreto en Supabase (Edge Functions → Secrets):
//   MP_ACCESS_TOKEN = el "Access Token" de producción de Mercado Pago.
// Opcional: APP_URL = la dirección de la app (ej. https://dreysport.com.uy)
// si no, usa la dirección desde donde se abrió la app.
import { createClient } from 'npm:@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function responder(cuerpo: unknown, estado = 200) {
  return new Response(JSON.stringify(cuerpo), {
    status: estado,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return responder({ error: 'Método no permitido' }, 405)

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
  const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!
  const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const MP_TOKEN = Deno.env.get('MP_ACCESS_TOKEN')
  if (!MP_TOKEN) {
    return responder({ error: 'El cobro con Mercado Pago todavía no está configurado.' }, 500)
  }

  // 1) Quién paga
  const autorizacion = req.headers.get('Authorization') || ''
  const comoUsuario = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: autorizacion } },
  })
  const { data: datosUsuario, error: errorUsuario } = await comoUsuario.auth.getUser()
  const usuario = datosUsuario?.user
  if (errorUsuario || !usuario) {
    return responder({ error: 'Tu sesión venció. Volvé a iniciar sesión.' }, 401)
  }

  let codigo: string | null = null
  try {
    const cuerpo = await req.json()
    codigo = typeof cuerpo?.codigo === 'string' && cuerpo.codigo.trim() ? cuerpo.codigo.trim() : null
  } catch {
    // Sin cuerpo: sin código.
  }

  // 2) Cuánto paga (lo decide la base, no la app)
  const admin = createClient(SUPABASE_URL, SERVICE_KEY)
  const { data: precio, error: errorPrecio } = await admin.rpc('calcular_precio', {
    p_cliente: usuario.id,
    p_codigo: codigo,
  })
  if (errorPrecio || !precio || precio.error) {
    return responder({ error: precio?.error || 'No pudimos calcular el precio.' }, 400)
  }

  // 3) Anotar el pago
  const { data: pago, error: errorPago } = await admin
    .from('pagos')
    .insert({
      cliente_id: usuario.id,
      plan: precio.plan,
      monto_base: precio.monto_base,
      monto: precio.monto,
      primer_mes: precio.primer_mes,
      codigo: precio.codigo,
      codigo_id: precio.codigo_id,
    })
    .select('id')
    .single()
  if (errorPago || !pago) {
    console.error('No se pudo anotar el pago', errorPago)
    return responder({ error: 'No pudimos iniciar el pago. Probá de nuevo.' }, 500)
  }

  // Un código que cubre el 100%: no hay nada que cobrar.
  if (precio.monto <= 0) {
    await admin.rpc('registrar_pago_aprobado', { p_pago: pago.id, p_mp_payment: 'sin-costo' })
    return responder({ aprobado: true })
  }

  // 4) Link de pago de Mercado Pago
  const origen = req.headers.get('origin') || ''
  const appUrl = (Deno.env.get('APP_URL') || origen).replace(/\/$/, '')
  const volver = (resultado: string) => `${appUrl}/suscripcion?pago=${resultado}`

  const respuestaMp = await fetch('https://api.mercadopago.com/checkout/preferences', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${MP_TOKEN}`,
      'Content-Type': 'application/json',
      'X-Idempotency-Key': pago.id,
    },
    body: JSON.stringify({
      items: [
        {
          id: precio.plan,
          title: `DREY · ${precio.plan_nombre}${precio.primer_mes ? ' (primer mes)' : ' (1 mes)'}`,
          quantity: 1,
          unit_price: precio.monto,
          currency_id: 'UYU',
        },
      ],
      payer: { email: usuario.email },
      external_reference: pago.id,
      notification_url: `${SUPABASE_URL}/functions/v1/mp-webhook`,
      back_urls: appUrl
        ? { success: volver('ok'), pending: volver('pendiente'), failure: volver('error') }
        : undefined,
      auto_return: appUrl ? 'approved' : undefined,
      statement_descriptor: 'DREY',
      metadata: { pago_id: pago.id },
    }),
  })

  const preferencia = await respuestaMp.json().catch(() => null)
  if (!respuestaMp.ok || !preferencia?.init_point) {
    console.error('Mercado Pago rechazó la preferencia', respuestaMp.status, preferencia)
    await admin
      .from('pagos')
      .update({ estado: 'cancelado', detalle: `Error al crear el cobro (${respuestaMp.status})` })
      .eq('id', pago.id)
    return responder({ error: 'Mercado Pago no respondió bien. Probá de nuevo en un rato.' }, 502)
  }

  await admin.from('pagos').update({ mp_preference_id: preferencia.id }).eq('id', pago.id)
  return responder({ url: preferencia.init_point })
})
