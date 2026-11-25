import { useState } from 'react'

// Barra de abajo mientras se eligen alumnos para asignarles un profe:
// "3 elegidos · [profe] · Asignar · Cancelar". La usan el Admin (con
// todos los profes) y el dueño de un gimnasio (con los de su equipo).
//   profes: [{ id, nombre, apellido }]
export default function BarraAsignar({ cantidad, profes, guardando, onAsignar, onCancelar }) {
  const [profeId, setProfeId] = useState('')
  return (
    <div className="barra-asignar" role="region" aria-label="Asignar un profe">
      <span className="barra-asignar-cantidad">
        {cantidad === 0
          ? 'Elegí alumnos'
          : `${cantidad} ${cantidad === 1 ? 'elegido' : 'elegidos'}`}
      </span>
      <select
        className="profe-calendario-select"
        value={profeId}
        onChange={(event) => setProfeId(event.target.value)}
        aria-label="Profe al que pasan"
      >
        <option value="">Elegí el profe…</option>
        {profes.map((profe) => (
          <option key={profe.id} value={profe.id}>
            {`${profe.nombre} ${profe.apellido || ''}`.trim()}
          </option>
        ))}
      </select>
      <button
        type="button"
        className="boton-principal boton-chico"
        disabled={!profeId || cantidad === 0 || guardando}
        onClick={() => onAsignar(profeId)}
      >
        {guardando ? 'Asignando…' : 'Asignar'}
      </button>
      <button type="button" className="boton-texto" onClick={onCancelar}>
        Cancelar
      </button>
    </div>
  )
}
