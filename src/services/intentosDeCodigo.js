// Límite de intentos para los códigos (supabase/sql/041).
//
// Si alguien prueba muchos códigos equivocados seguidos (de descuento o de
// profes y gimnasios), la base deja de revisarle códigos por 15 minutos y
// responde con el error "demasiados_intentos". Acá se reconoce ese error
// para mostrar un mensaje claro en vez de "no encontramos el código".

export const MENSAJE_DEMASIADOS_INTENTOS =
  'Probaste muchos códigos seguidos. Por seguridad, esperá 15 minutos y volvé a intentar.'

export function esDemasiadosIntentos(error) {
  return error?.code === 'PT429' || error?.hint === 'demasiados_intentos'
}
