// Link para abrir WhatsApp con un mensaje ya escrito.
//
// Los celulares de Uruguay se guardan como los escribe la gente
// ("099 123 456", "+598 99 123 456"...): se pasan al formato
// internacional (59899123456). Devuelve '' si no hay un número válido.
const CODIGO_PAIS = '598'

export function numeroInternacional(celular) {
  let digitos = String(celular || '').replace(/\D/g, '')
  if (!digitos) return ''
  if (digitos.startsWith('00')) digitos = digitos.slice(2)
  if (digitos.startsWith(CODIGO_PAIS)) return digitos
  if (digitos.startsWith('0')) digitos = digitos.slice(1)
  return digitos.length >= 8 ? `${CODIGO_PAIS}${digitos}` : ''
}

export function linkWhatsApp(celular, texto = '') {
  const numero = numeroInternacional(celular)
  if (!numero) return ''
  return `https://wa.me/${numero}${texto ? `?text=${encodeURIComponent(texto)}` : ''}`
}
