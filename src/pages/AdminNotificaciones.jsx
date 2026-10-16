import { useEffect, useState } from 'react'
import ProfeLayout from '../components/ProfeLayout.jsx'
import Pestanas from '../components/Pestanas.jsx'
import Esqueleto from '../components/Esqueleto.jsx'
import TarjetaAviso from '../components/avisos/TarjetaAviso.jsx'
import EditorAviso from '../components/avisos/EditorAviso.jsx'
import HistorialAvisos from '../components/avisos/HistorialAvisos.jsx'
import { mostrarAviso } from '../services/avisos.js'
import {
  cargarTiposDeAviso,
  faltaInstalar,
  guardarTipoDeAviso,
  mensajeDeError,
} from '../services/avisosAdmin.js'
import { SECCIONES } from '../data/avisos.js'

// Administrador de notificaciones (Ajustes → Notificaciones, solo el
// Admin). Todas las notificaciones de DREY en un solo lugar:
//
//   · Alumnos / Profes: la lista, agrupada en Programadas, Cuando pasa
//     algo y Durante el entrenamiento. El interruptor de cada una la
//     prende o apaga al instante; tocándola se abre el editor
//     (components/avisos/EditorAviso.jsx): a quién le llega, a qué hora o
//     a los cuántos días, los textos (con vista previa) y "Enviarme una
//     prueba".
//   · Enviadas: las últimas que salieron o están por salir
//     (components/avisos/HistorialAvisos.jsx).
//
// Todo se guarda en la base (tabla "tipos_aviso", supabase/sql/030) y vale
// al instante. Cada cambio queda anotado en el Historial de cambios.
const PESTANAS = [
  { id: 'alumno', label: 'Alumnos' },
  { id: 'profe', label: 'Profes' },
  { id: 'enviadas', label: 'Enviadas' },
]

export default function AdminNotificaciones() {
  const [pestana, setPestana] = useState('alumno')
  const [datos, setDatos] = useState(null)
  const [error, setError] = useState(null)
  const [editando, setEditando] = useState(null) // clave de la notificación abierta

  useEffect(() => {
    recargar()
  }, [])

  async function recargar() {
    const resultado = await cargarTiposDeAviso()
    setDatos(resultado.datos)
    setError(resultado.error)
  }

  // Interruptor de la lista: prende o apaga sin abrir el editor.
  async function alternar(tipo) {
    const cambiado = { ...tipo, activo: !tipo.activo }
    reemplazar(cambiado)
    const problema = await guardarTipoDeAviso(cambiado)
    if (problema) {
      reemplazar(tipo)
      mostrarAviso(mensajeDeError(problema), 'error')
      return
    }
    mostrarAviso(cambiado.activo ? `"${tipo.nombre}" prendida` : `"${tipo.nombre}" apagada`)
  }

  function reemplazar(tipo) {
    setDatos((actual) => ({
      ...actual,
      tipos: actual.tipos.map((item) => (item.clave === tipo.clave ? tipo : item)),
    }))
  }

  const tipoAbierto = datos?.tipos.find((tipo) => tipo.clave === editando) || null

  return (
    <ProfeLayout titulo="Notificaciones" volverA="/profe/ajustes" soloAdmin>
      {!datos && !error ? (
        <Esqueleto />
      ) : error ? (
        <p className="profe-vacio">
          {faltaInstalar(error)
            ? 'Falta instalar la actualización de la base (SQL 030).'
            : 'No pudimos cargar las notificaciones. Probá de nuevo.'}
        </p>
      ) : (
        <>
          <ResumenActivados activados={datos.activados} />

          <Pestanas
            etiqueta="Qué notificaciones ver"
            opciones={PESTANAS}
            activa={pestana}
            onCambiar={setPestana}
          />

          {pestana === 'enviadas' ? (
            <HistorialAvisos />
          ) : (
            SECCIONES.map((seccion) => {
              const tipos = datos.tipos.filter(
                (tipo) => tipo.grupo === pestana && tipo.disparo === seccion.disparo,
              )
              if (!tipos.length) return null
              return (
                <section key={seccion.disparo} className="bloque-pagina">
                  <p className="profe-seccion-label">{seccion.titulo}</p>
                  <p className="avisos-seccion-detalle">{seccion.detalle}</p>
                  <div className="lista-tarjetas">
                    {tipos.map((tipo) => (
                      <TarjetaAviso
                        key={tipo.clave}
                        tipo={tipo}
                        extras={datos}
                        onAbrir={() => setEditando(tipo.clave)}
                        onAlternar={() => alternar(tipo)}
                      />
                    ))}
                  </div>
                </section>
              )
            })
          )}

          {tipoAbierto && (
            <EditorAviso
              key={tipoAbierto.clave}
              tipo={tipoAbierto}
              extras={datos}
              onCerrar={() => setEditando(null)}
              onGuardado={(tipo) => {
                reemplazar(tipo)
                setEditando(null)
              }}
            />
          )}
        </>
      )}
    </ProfeLayout>
  )
}

// Cuántos reciben notificaciones (las tienen activadas en algún celular).
function ResumenActivados({ activados }) {
  return (
    <div className="avisos-resumen">
      <p>
        <strong>{activados.alumnos}</strong> {activados.alumnos === 1 ? 'alumno' : 'alumnos'} y{' '}
        <strong>{activados.profes}</strong>{' '}
        {activados.profes === 1 ? 'profe o Admin' : 'profes o Admin'} tienen las notificaciones
        activadas.
      </p>
      <p className="avisos-resumen-nota">
        Solo les llegan a quienes las activaron en su celular (Perfil → Activar notificaciones).
        {activados.yo === 0 &&
          ' Vos todavía no las activaste: hacelo en Mi cuenta para poder recibir las pruebas.'}
      </p>
    </div>
  )
}
