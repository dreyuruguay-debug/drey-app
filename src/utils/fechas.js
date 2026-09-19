// Utilidades de fechas usadas en Registro y Mis datos.

// Calcula la edad en años a partir de una fecha de nacimiento en
// formato "YYYY-MM-DD" (el que devuelve un <input type="date">).
export function calcularEdad(fechaNacimientoISO) {
  if (!fechaNacimientoISO) return null
  const nacimiento = new Date(fechaNacimientoISO)
  if (Number.isNaN(nacimiento.getTime())) return null

  const hoy = new Date()
  let edad = hoy.getFullYear() - nacimiento.getFullYear()
  const noCumplioAunEsteAno =
    hoy.getMonth() < nacimiento.getMonth() ||
    (hoy.getMonth() === nacimiento.getMonth() && hoy.getDate() < nacimiento.getDate())
  if (noCumplioAunEsteAno) edad -= 1

  return edad >= 0 ? edad : null
}
