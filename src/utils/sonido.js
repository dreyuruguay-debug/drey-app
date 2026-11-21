// Un "bip" corto, para avisar sin que el alumno mire la pantalla (por
// ejemplo, al terminar los segundos de una plancha: el celular está en el
// piso y la vibración no siempre se nota; en iPhone no hay vibración).
//
// Los navegadores solo dejan sonar después de un toque del usuario: por
// eso prepararSonido() se llama desde el botón que arranca el cronómetro.
// Si el navegador no puede (o el celular está en silencio), no pasa nada.

let contexto = null

export function prepararSonido() {
  try {
    const Clase = window.AudioContext || window.webkitAudioContext
    if (!Clase) return
    if (!contexto) contexto = new Clase()
    if (contexto.state === 'suspended') contexto.resume()
  } catch {
    // Sin sonido: sigue todo igual.
  }
}

// frecuencia en Hz (más alto = más agudo), duración en segundos.
export function bip(frecuencia = 880, duracion = 0.18) {
  try {
    if (!contexto || contexto.state !== 'running') return
    const oscilador = contexto.createOscillator()
    const volumen = contexto.createGain()
    oscilador.type = 'sine'
    oscilador.frequency.value = frecuencia
    const ahora = contexto.currentTime
    // Sube y baja suave, para que no haga "clic".
    volumen.gain.setValueAtTime(0.0001, ahora)
    volumen.gain.exponentialRampToValueAtTime(0.4, ahora + 0.02)
    volumen.gain.exponentialRampToValueAtTime(0.0001, ahora + duracion)
    oscilador.connect(volumen).connect(contexto.destination)
    oscilador.start(ahora)
    oscilador.stop(ahora + duracion + 0.02)
  } catch {
    // Sin sonido: sigue todo igual.
  }
}
