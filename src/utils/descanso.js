// El descanso entre series del modo entrenar (el reloj grande que baja
// solo: components/entrenar/PantallaDescanso.jsx).
//
// Se guarda como { fin, total, ...lo que muestra la pantalla }:
//   fin: la hora (en milisegundos) en la que termina. El tiempo que falta
//        se calcula contra la hora, así no se atrasa si el celular
//        bloquea la pantalla un rato.
//   total: cuántos segundos dura en total (el "de 1:30" del reloj).
// Estas funciones devuelven una copia con el resto de los campos intactos.
// Nada de este archivo lee ni guarda en la base de datos.

// Un descanso que arranca ahora. "datos": lo que muestra la pantalla
// (título, opciones, lo que sigue).
export function empezarDescanso(segundos, ahora, datos = {}) {
  return { ...datos, total: segundos, fin: ahora + segundos * 1000 }
}

// Segundos que faltan (enteros, nunca menos de 0).
export function segundosRestantes(descanso, ahora) {
  if (!descanso) return 0
  return Math.max(0, Math.ceil((descanso.fin - ahora) / 1000))
}

// Cambia cuánto dura un descanso que YA está corriendo, sin reiniciarlo:
// lo que ya descansó sigue contando y solo se suma (o se resta) la
// diferencia. Si iba descansando 60 s y elige 90 s, se le agregan los 30
// que faltan. Si elige menos de lo que ya descansó, el descanso termina.
export function cambiarDuracion(descanso, segundos) {
  const total = Math.max(0, Number(segundos) || 0)
  return { ...descanso, total, fin: descanso.fin + (total - descanso.total) * 1000 }
}

// "+15 s": el descanso dura ese tiempo más.
export function sumarAlDescanso(descanso, segundos) {
  return cambiarDuracion(descanso, descanso.total + segundos)
}
