// Arma el texto de una notificación con datos de ejemplo, para la vista
// previa del administrador de notificaciones. Hace lo mismo que la
// función rellenar_aviso de la base (supabase/sql/030): cambia cada
// {dato} por su valor, borra los que no vinieron y limpia los restos.
// Nada de este archivo lee ni guarda en la base de datos.

export function rellenarAviso(texto, valores = {}) {
  let resultado = String(texto || '')
  for (const [clave, valor] of Object.entries(valores)) {
    resultado = resultado.split(`{${clave}}`).join(valor ?? '')
  }
  return resultado
    .replace(/\{[a-z_]+\}/g, '')
    .replace(/""/g, '')
    .replace(/\s+([.,!?:])/g, '$1')
    .replace(/\s{2,}/g, ' ')
    .replace(/^\s*·\s*|\s*·\s*$/g, '')
    .trim()
}

// { clave: ejemplo } a partir de la lista de datos de una notificación
// ([{ clave, texto, ejemplo }]).
export function ejemplosDe(variables = []) {
  return Object.fromEntries(variables.map((variable) => [variable.clave, variable.ejemplo]))
}
