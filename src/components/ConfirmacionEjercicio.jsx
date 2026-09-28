import { textoUso } from '../utils/biblioteca.js'

// Confirmación antes de archivar o borrar un ejercicio de la biblioteca
// (pantalla Biblioteca). Dice en cuántas rutinas y plantillas está, así
// nadie saca un ejercicio sin saber a quién le toca.
//
//   accion:    'archivar' (cualquier profe) o 'borrar' (solo el Admin, y
//              solo si no está en ninguna rutina ni plantilla).
//   estadoUso: 'cargando' mientras se cuenta, 'listo' o 'error'.
//   uso:       { rutinas, clientes, plantillas } (services/biblioteca.js).
export default function ConfirmacionEjercicio({
  ejercicio,
  accion,
  estadoUso,
  uso,
  trabajando,
  onConfirmar,
  onCancelar,
}) {
  const enUso = textoUso(uso || {})
  const { titulo, textos, botonConfirmar, botonTrabajando, puedeConfirmar, textoCancelar } =
    accion === 'borrar' ? contenidoBorrar(estadoUso, enUso) : contenidoArchivar(estadoUso, enUso)
  const idTitulo = `confirmar-${ejercicio.id}`

  return (
    <div
      className="profe-ejercicio-edicion confirmacion-ejercicio"
      role="alertdialog"
      aria-labelledby={idTitulo}
    >
      <p id={idTitulo} className="confirmacion-ejercicio-titulo">
        {titulo} “{ejercicio.nombre}”?
      </p>
      {textos.map((texto) => (
        <p key={texto} className="confirmacion-ejercicio-texto">
          {texto}
        </p>
      ))}
      <div className="profe-ejercicio-edicion-botones">
        {puedeConfirmar && (
          <button
            type="button"
            className={accion === 'borrar' ? 'boton-peligro boton-chico' : 'pill-button'}
            disabled={trabajando}
            onClick={onConfirmar}
          >
            {trabajando ? botonTrabajando : botonConfirmar}
          </button>
        )}
        <button
          type="button"
          className="profe-cerrar-selector"
          disabled={trabajando}
          onClick={onCancelar}
        >
          {textoCancelar}
        </button>
      </div>
    </div>
  )
}

function contenidoArchivar(estadoUso, enUso) {
  const textos = []
  if (estadoUso === 'cargando') textos.push('Revisando en cuántas rutinas está…')
  else if (estadoUso === 'error')
    textos.push(
      'No pudimos revisar en cuántas rutinas está, pero archivarlo no le saca nada a nadie.',
    )
  else if (enUso) textos.push(`Está en ${enUso}. Ahí sigue igual: nadie pierde nada.`)
  else textos.push('No está en ninguna rutina ni plantilla.')
  textos.push(
    'Ya no va a aparecer para agregar a rutinas. Lo recuperás cuando quieras desde “Archivados”.',
  )
  return {
    titulo: '¿Archivar',
    textos,
    botonConfirmar: 'Sí, archivar',
    botonTrabajando: 'Archivando…',
    puedeConfirmar: estadoUso !== 'cargando',
    textoCancelar: 'Cancelar',
  }
}

function contenidoBorrar(estadoUso, enUso) {
  const base = {
    titulo: '¿Borrar para siempre',
    botonConfirmar: 'Sí, borrar para siempre',
    botonTrabajando: 'Borrando…',
    puedeConfirmar: false,
    textoCancelar: 'Cancelar',
  }
  if (estadoUso === 'cargando') {
    return { ...base, textos: ['Revisando si está en alguna rutina…'] }
  }
  if (estadoUso === 'error') {
    return {
      ...base,
      textos: ['No pudimos revisar si está en alguna rutina. Probá de nuevo en un rato.'],
    }
  }
  if (enUso) {
    return {
      ...base,
      textos: [
        `No se puede borrar: está en ${enUso}.`,
        'Queda archivado: no aparece para agregar y esas rutinas siguen igual.',
      ],
      textoCancelar: 'Entendido',
    }
  }
  return {
    ...base,
    textos: [
      'No está en ninguna rutina ni plantilla: no le cambia nada a nadie.',
      'Se borra de la biblioteca y no se puede deshacer.',
    ],
    puedeConfirmar: true,
  }
}
