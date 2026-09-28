// Un cronómetro que se puede pausar. Lo usan el tiempo del entrenamiento
// (arriba a la derecha en el modo entrenar) y el reloj de cada actividad
// del calentamiento.
//
// Se guarda como { acumulado, desde }:
//   acumulado: segundos que corrió antes de la última pausa.
//   desde: cuándo arrancó a correr otra vez (milisegundos), o null si
//          está parado.
// Se calcula contra la hora, así no se atrasa si el celular bloquea la
// pantalla un rato. Estas funciones reciben cualquier objeto con esos dos
// campos y devuelven una copia con el resto de los campos intactos.
// Nada de este archivo lee ni guarda en la base de datos.

export function relojParado() {
  return { acumulado: 0, desde: null }
}

export function relojEnMarcha(ahora) {
  return { acumulado: 0, desde: ahora }
}

export function relojCorriendo(reloj) {
  return Boolean(reloj) && reloj.desde !== null && reloj.desde !== undefined
}

// Segundos que lleva (con decimales).
export function segundosDeReloj(reloj, ahora) {
  if (!reloj) return 0
  const enMarcha = relojCorriendo(reloj) ? Math.max(0, ahora - reloj.desde) / 1000 : 0
  return (reloj.acumulado || 0) + enMarcha
}

export function pausarReloj(reloj, ahora) {
  if (!relojCorriendo(reloj)) return reloj
  return { ...reloj, acumulado: segundosDeReloj(reloj, ahora), desde: null }
}

export function reanudarReloj(reloj, ahora) {
  if (!reloj || relojCorriendo(reloj)) return reloj
  return { ...reloj, desde: ahora }
}
