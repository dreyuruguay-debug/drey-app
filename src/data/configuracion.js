import { guardarJSON, leerJSON } from '../utils/almacenLocal.js'

// Configuración del negocio que el Admin cambia desde "Ajustes"
// (tablas "ajustes" y "planes", supabase/sql/022). Acá solo se guarda la
// última versión conocida; la trae de la base services/configuracion.js.
//
// La última versión queda anotada en el celular: la app abre al instante
// con lo que se sabía (también sin señal) y se actualiza por detrás.
// Mientras no haya nada (primera vez, o la base todavía sin el SQL 022),
// se usan los valores de CONFIGURACION_POR_DEFECTO.

const CLAVE_CELULAR = 'drey-configuracion'

export const CONFIGURACION_POR_DEFECTO = Object.freeze({
  planes: null, // null = los de data/planes.js
  transferencia: { banco: '', titular: '', cuenta: '', moneda: '' },
  cobroAutomatico: false,
  whatsappGrupoUrl: '',
  diasAviso: 5,
  diasDeGracia: 3,
  // Cobro por cupos (supabase/sql/032).
  dreyCobro: { banco: '', titular: '', cuenta: '', moneda: '', linkMercadoPago: '' },
  prueba: { activa: true, dias: 14, cupos: 3 },
  diasAvisoAlumnosEspacio: 14,
  tieneCupos: false, // la base ya tiene el SQL 032
})

let actual = { ...CONFIGURACION_POR_DEFECTO, ...leerJSON(CLAVE_CELULAR, {}) }
const oyentes = new Set()

export function configuracion() {
  return actual
}

export function aplicarConfiguracion(nueva) {
  actual = { ...CONFIGURACION_POR_DEFECTO, ...nueva }
  guardarJSON(CLAVE_CELULAR, actual)
  for (const oyente of oyentes) oyente(actual)
}

// Los datos que no son para todos (supabase/sql/039): el link del grupo de
// WhatsApp y las cuentas bancarias. Al cerrar sesión se borran del
// celular al instante, sin esperar a la base.
export function olvidarDatosPrivados() {
  aplicarConfiguracion({
    ...actual,
    transferencia: CONFIGURACION_POR_DEFECTO.transferencia,
    whatsappGrupoUrl: CONFIGURACION_POR_DEFECTO.whatsappGrupoUrl,
    dreyCobro: CONFIGURACION_POR_DEFECTO.dreyCobro,
  })
}

// Avisa cada vez que cambia la configuración. Devuelve la función para
// dejar de escuchar.
export function escucharConfiguracion(oyente) {
  oyentes.add(oyente)
  return () => oyentes.delete(oyente)
}
