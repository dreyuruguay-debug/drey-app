import { useEffect, useRef } from 'react'
import { cancelarAvisoDeDescanso, programarAvisoDeDescanso } from '../../services/avisosAlumno.js'

// Aviso de fin del descanso (supabase/sql/030): si el alumno sale de
// DREY mientras descansa (se pone a mirar otra cosa en el celular), le
// llega una notificación cuando termina el descanso.
//
// Cómo funciona: al empezar el descanso se le pide a la base que mande el
// aviso a la hora en que termina. Si el descanso cambia (+15 s u otra
// duración), se vuelve a programar. Se cancela si:
//   · toca "Ya estoy listo" (el descanso terminó antes),
//   · el descanso terminó con DREY a la vista (ya vio el reloj y sintió
//     la vibración: no hace falta otra notificación),
//   · apaga el interruptor, o sale del entrenamiento.
// Si el descanso terminó con DREY en segundo plano, NO se cancela: ese es
// justo el caso en que tiene que llegar.
//
//   descanso: el de utils/descanso.js ({ fin, loQueSigue… }) o null.
//   prendido: el interruptor "Avisarme al terminar" (y no es vista previa).
export function useAvisoDeDescanso(descanso, prendido) {
  const programado = useRef(null) // hora de fin del aviso programado
  const fin = descanso?.fin ?? null
  const siguiente = textoDeLoQueSigue(descanso?.loQueSigue)

  useEffect(() => {
    const faltan = fin ? (fin - Date.now()) / 1000 : 0
    if (prendido && fin && faltan >= 3) {
      programado.current = fin
      programarAvisoDeDescanso(faltan, siguiente)
      return
    }
    if (programado.current) {
      const terminoSolo = Date.now() >= programado.current - 1500
      const enSegundoPlano = document.visibilityState === 'hidden'
      if (!(terminoSolo && enSegundoPlano && prendido)) cancelarAvisoDeDescanso()
      programado.current = null
    }
    // "siguiente" acompaña a "fin": no hace falta reprogramar si solo cambia el texto.
  }, [fin, prendido])

  // Sale del entrenamiento con un aviso programado: se cancela.
  useEffect(
    () => () => {
      if (programado.current && document.visibilityState === 'visible') cancelarAvisoDeDescanso()
    },
    [],
  )
}

// "Sentadilla · Serie 3 de 4"
function textoDeLoQueSigue(loQueSigue) {
  if (!loQueSigue) return ''
  return [loQueSigue.titulo, loQueSigue.detalle].filter(Boolean).join(' · ')
}
