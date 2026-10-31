import { porcentajeCupos, textoCupos } from '../utils/cupos.js'

// Barra de cupos de un espacio: "12 de 25 alumnos" (supabase/sql/032).
// Sin tope (espacio sin costo), solo el número. Se pone en alerta al
// llegar al 90 %.
export default function BarraCupos({ total, usados, etiqueta = 'Alumnos habilitados' }) {
  const porcentaje = porcentajeCupos({ total, usados })
  const lleno = porcentaje != null && porcentaje >= 90
  return (
    <div className={lleno ? 'barra-cupos barra-cupos-llena' : 'barra-cupos'}>
      <span className="barra-cupos-textos">
        <span>{etiqueta}</span>
        <strong>{textoCupos({ total, usados })}</strong>
      </span>
      {porcentaje != null && (
        <span
          className="barra-avance-fondo"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={porcentaje}
          aria-label={textoCupos({ total, usados })}
        >
          <span className="barra-avance-relleno" style={{ width: `${porcentaje}%` }} />
        </span>
      )}
    </div>
  )
}
