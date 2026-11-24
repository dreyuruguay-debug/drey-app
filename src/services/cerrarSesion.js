import { supabase } from './supabaseClient.js'
import { usuarioGuardado } from './sesion.js'
import { borrarCopias } from './copiaLocal.js'
import { olvidarAccesoProfe } from './accesoProfe.js'
import { olvidarMisEspacios } from './espacio.js'
import { olvidarDatosPrivados } from '../data/configuracion.js'

// Cerrar sesión: la única forma de salir de la cuenta en toda la app
// (alumno, profe, gimnasio y Admin). Antes de salir borra lo que quedó
// guardado en el celular de esa cuenta, así si otra persona usa el mismo
// celular no ve nada del anterior:
//   · las copias para usar sin señal (rutinas, historial, inicio);
//   · lo anotado del panel (si es profe/Admin y sus espacios);
//   · los datos privados de la configuración (grupo de WhatsApp y
//     cuentas bancarias, supabase/sql/039).
// La memoria de la app se vacía sola (services/memoriaSesion.js).
//
// NO se borran, a propósito:
//   · los entrenamientos terminados que todavía no se enviaron
//     (services/colaEntrenamientos.js): son de esa cuenta y se mandan
//     cuando vuelva a entrar; borrarlos sería perder lo que entrenó;
//   · el entrenamiento a medias del día (utils/entrenamientoEnCurso.js):
//     si vuelve a entrar sigue donde estaba.
//
// Después de llamarla, la pantalla lleva a la de ingreso.
export async function cerrarSesion() {
  const usuario = usuarioGuardado()
  if (usuario?.id) borrarCopias(usuario.id)
  olvidarAccesoProfe()
  olvidarMisEspacios()
  olvidarDatosPrivados()
  // "local": sale de ESTE celular o compu (las otras sesiones de la misma
  // cuenta siguen abiertas) y borra la sesión antes de hablar con el
  // servidor, así también funciona sin señal.
  try {
    await supabase.auth.signOut({ scope: 'local' })
  } catch {
    // La sesión del celular ya se borró: no hay nada más que hacer.
  }
}
