// Las fiestas en que la app se viste distinto para el alumno: un adorno
// en Inicio y un saludo grande al abrirla (components/MensajeDelDia.jsx).
// Si ese día su profe escribió un mensaje (pages/ProfeMensajes.jsx), se
// muestra el del profe con el diseño de la fiesta; si no, el saludo de
// acá, firmado con el nombre del profe.
//
//   dias: los días en que vale, como "MM-DD" (se repite todos los años).
//   diaDelSaludo: el día que propone la pantalla del profe para programar
//     su saludo.
//   dibujo: qué adorno se dibuja (components/AdornoDeFiesta.jsx).
// Nada de este archivo lee ni guarda en la base de datos.
export const FIESTAS = [
  {
    id: 'navidad',
    nombre: 'Navidad',
    dias: ['12-24', '12-25'],
    diaDelSaludo: '12-25',
    dibujo: 'arbol',
    titulo: '¡Feliz Navidad!',
    saludo: 'Que pases una Navidad muy linda junto a los tuyos. Gracias por entrenar con nosotros.',
  },
  {
    id: 'fin-de-anio',
    nombre: 'Fin de año',
    dias: ['12-31'],
    diaDelSaludo: '12-31',
    dibujo: 'fuegos',
    titulo: '¡Feliz fin de año!',
    saludo: 'Gracias por todo lo que entrenaste este año. A brindar por lo que lograste.',
  },
  {
    id: 'anio-nuevo',
    nombre: 'Año Nuevo',
    dias: ['01-01'],
    diaDelSaludo: '01-01',
    dibujo: 'fuegos',
    titulo: '¡Feliz Año Nuevo!',
    saludo: 'Que este año venga con salud y muchos entrenamientos. ¡Vamos con todo!',
  },
]

// La fiesta de ese día ('YYYY-MM-DD'), o null.
export function fiestaDelDia(fechaISO) {
  const dia = String(fechaISO || '').slice(5)
  return FIESTAS.find((fiesta) => fiesta.dias.includes(dia)) || null
}

// La próxima vez que cae el día del saludo de una fiesta, desde hoy
// (incluido): 'YYYY-MM-DD'. Para el botón "Navidad (25/12)" del profe.
export function proximaFechaDe(fiesta, hoyISO) {
  const anio = Number(String(hoyISO).slice(0, 4))
  const esteAnio = `${anio}-${fiesta.diaDelSaludo}`
  return esteAnio >= hoyISO ? esteAnio : `${anio + 1}-${fiesta.diaDelSaludo}`
}

// "Te lo desea Facu" / "Te lo desea tu profe".
export function firmaDelSaludo(nombreDelProfe) {
  return `Te lo desea ${nombreDelProfe || 'tu profe'}`
}
