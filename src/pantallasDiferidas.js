import { lazy } from 'react'

// Pantallas que se descargan aparte (lazy): las del panel del profe y
// algunas del alumno que se usan poco. Así los clientes, que nunca usan
// el panel, descargan una web más liviana y la app abre más rápido.
// App.jsx las usa en sus rutas.
//
// Si justo se publicó una versión nueva de la web mientras el profe la
// tenía abierta, el archivo viejo de la pantalla ya no existe: en ese
// caso se recarga la página una vez para traer la versión nueva.
//
// Cada pantalla queda anotada en PANTALLAS_PROFE o PANTALLAS_CLIENTE para
// poder descargarla por adelantado (ver precargarPantallas, abajo).
const PANTALLAS_PROFE = []
const PANTALLAS_CLIENTE = []

function pantallaDiferida(importar, grupo = PANTALLAS_PROFE) {
  grupo.push(importar)
  return lazy(() =>
    importar()
      .then((modulo) => {
        try {
          sessionStorage.removeItem('drey-recarga')
        } catch {
          // Sin sessionStorage no hay nada que limpiar.
        }
        return modulo
      })
      .catch((error) => {
        let yaRecargo = false
        try {
          yaRecargo = sessionStorage.getItem('drey-recarga') === '1'
          sessionStorage.setItem('drey-recarga', '1')
        } catch {
          // Sin sessionStorage (modo privado): se intenta recargar igual.
        }
        if (!yaRecargo) {
          window.location.reload()
          return new Promise(() => {})
        }
        throw error
      }),
  )
}

export const PanelProfe = pantallaDiferida(() => import('./pages/PanelProfe.jsx'))
export const ProfeCuentas = pantallaDiferida(() => import('./pages/ProfeCuentas.jsx'))
export const ProfeEjercicios = pantallaDiferida(() => import('./pages/ProfeEjercicios.jsx'))
export const ProfeClientes = pantallaDiferida(() => import('./pages/ProfeClientes.jsx'))
export const ProfeClienteDetalle = pantallaDiferida(() => import('./pages/ProfeClienteDetalle.jsx'))
export const ProfeCalendario = pantallaDiferida(() => import('./pages/ProfeCalendario.jsx'))
export const ProfePlantillas = pantallaDiferida(() => import('./pages/ProfePlantillas.jsx'))
export const ProfeRutinas = pantallaDiferida(() => import('./pages/ProfeRutinas.jsx'))
export const ProfeRutinaNueva = pantallaDiferida(() => import('./pages/ProfeRutinaNueva.jsx'))
export const ProfeRutinaEditor = pantallaDiferida(() => import('./pages/ProfeRutinaEditor.jsx'))
export const ProfeRutinaDias = pantallaDiferida(() => import('./pages/ProfeRutinaDias.jsx'))
export const ProfeProgresion = pantallaDiferida(() => import('./pages/ProfeProgresion.jsx'))
export const ProfeClienteProgreso = pantallaDiferida(() => import('./pages/ProfeClienteProgreso.jsx'))
export const ProfeCodigos = pantallaDiferida(() => import('./pages/ProfeCodigos.jsx'))

// Textos legales: se leen poco, así que también se cargan aparte.
export const Legal = pantallaDiferida(() => import('./pages/Legal.jsx'), PANTALLAS_CLIENTE)
export const PrivacidadYDatos = pantallaDiferida(() => import('./pages/PrivacidadYDatos.jsx'), PANTALLAS_CLIENTE)
export const ProfeEstadisticas = pantallaDiferida(() => import('./pages/ProfeEstadisticas.jsx'))
export const ProfeEquipo = pantallaDiferida(() => import('./pages/ProfeEquipo.jsx'))
export const NuevaContrasena = pantallaDiferida(() => import('./pages/NuevaContrasena.jsx'), PANTALLAS_CLIENTE)
export const Medidas = pantallaDiferida(() => import('./pages/Medidas.jsx'), PANTALLAS_CLIENTE)
export const ProfeClienteMedidas = pantallaDiferida(() => import('./pages/ProfeClienteMedidas.jsx'))


// Descarga por adelantado el código de las pantallas diferidas, sin
// mostrarlas: así la primera vez que se abren no hay que esperarlo.
// Se hace cuando el celular está libre (después de dibujar la pantalla
// actual) y de a una, para no competir con lo que se está cargando.
// Si falla no pasa nada: se vuelve a intentar al abrir la pantalla.
const yaPrecargados = new Set()

export function precargarPantallas(grupo) {
  const lista = grupo === 'profe' ? PANTALLAS_PROFE : PANTALLAS_CLIENTE
  if (yaPrecargados.has(grupo)) return
  yaPrecargados.add(grupo)
  // Con el ahorro de datos del celular activado, no se descarga de más.
  if (navigator.connection?.saveData) return

  const cuandoEsteLibre = window.requestIdleCallback || ((tarea) => setTimeout(tarea, 1500))
  let indice = 0
  function siguiente() {
    if (indice >= lista.length) return
    lista[indice++]()
      .catch(() => {})
      .finally(() => cuandoEsteLibre(siguiente))
  }
  cuandoEsteLibre(siguiente)
}
