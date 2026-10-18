import { createElement } from 'react'
import { createRoot } from 'react-dom/client'
import EvaluacionMensual from '../components/evaluacion/EvaluacionMensual.jsx'

// Arma el PDF de una evaluación mensual, en el celular o la compu (sin
// servidor):
//   1. Dibuja la plantilla (EvaluacionMensual, versión PDF) fuera de la
//      pantalla, con fondo blanco y la cabecera negra de DREY.
//   2. Le saca una "foto" a cada parte (data-bloque) con html2canvas.
//   3. Las acomoda en hojas A4 de a partes enteras (ninguna queda cortada
//      entre dos hojas) y numera las páginas.
//
// Las librerías (jsPDF y html2canvas) se descargan recién la primera vez
// que alguien arma un PDF (ver vite.config.js: grupo "pdf"), así la app
// no pesa más para nadie.

const ANCHO_PLANTILLA = 760 // px (ver .evaluacion-pdf en globals.css)
const MARGEN = 28 // pt
const ESPACIO = 8 // pt entre partes
const PIE = 22 // pt reservados abajo para el número de página
const CALIDAD = 0.9
// html2canvas dibuja al doble para que el texto se lea nítido. Cada parte
// es chica, así no se pasa del límite de tamaño de los iPhone.
const ESCALA = 2

// datos: { resumen, nombreAlumno, nombreProfe }. Devuelve un Blob (PDF).
export async function crearPdfEvaluacion({ resumen, nombreAlumno, nombreProfe }) {
  const [{ jsPDF }, { default: html2canvas }] = await Promise.all([
    import('jspdf'),
    import('html2canvas-pro'),
  ])

  const escenario = document.createElement('div')
  escenario.className = 'evaluacion-pdf-escenario'
  escenario.setAttribute('aria-hidden', 'true')
  document.body.appendChild(escenario)
  const raiz = createRoot(escenario)

  try {
    raiz.render(
      createElement(EvaluacionMensual, { resumen, nombreAlumno, nombreProfe, paraPdf: true }),
    )
    await esperarDibujo(escenario)

    const bloques = [...escenario.querySelectorAll('[data-bloque]')]
    const fotos = []
    for (const bloque of bloques) {
      const lienzo = await html2canvas(bloque, {
        scale: ESCALA,
        backgroundColor: '#ffffff',
        logging: false,
        useCORS: true,
        // Copia solo el escenario (no toda la app): es mucho más rápido.
        ignoreElements: (elemento) =>
          elemento.parentElement === document.body && elemento !== escenario,
      })
      fotos.push(lienzo)
    }

    const pdf = new jsPDF({ unit: 'pt', format: 'a4', compress: true })
    const anchoHoja = pdf.internal.pageSize.getWidth()
    const altoHoja = pdf.internal.pageSize.getHeight()
    const anchoUtil = anchoHoja - MARGEN * 2
    const altoUtil = altoHoja - MARGEN - PIE - MARGEN / 2
    const ptPorPx = anchoUtil / (ANCHO_PLANTILLA * ESCALA)

    let y = MARGEN
    let primera = true
    for (const lienzo of fotos) {
      let ancho = lienzo.width * ptPorPx
      let alto = lienzo.height * ptPorPx
      // Una parte más alta que una hoja entera se achica para que entre.
      if (alto > altoUtil) {
        ancho *= altoUtil / alto
        alto = altoUtil
      }
      if (!primera && y + alto > MARGEN + altoUtil) {
        pdf.addPage()
        y = MARGEN
      }
      pdf.addImage(
        lienzo.toDataURL('image/jpeg', CALIDAD),
        'JPEG',
        MARGEN + (anchoUtil - ancho) / 2,
        y,
        ancho,
        alto,
        undefined,
        'FAST',
      )
      y += alto + ESPACIO
      primera = false
    }

    numerarPaginas(pdf, resumen, nombreAlumno, anchoHoja, altoHoja)
    return pdf.output('blob')
  } finally {
    raiz.unmount()
    escenario.remove()
  }
}

// Espera a que React dibuje, que estén las letras de DREY y el logo.
async function esperarDibujo(escenario) {
  await new Promise((listo) => requestAnimationFrame(() => setTimeout(listo, 0)))
  if (document.fonts?.ready) await document.fonts.ready
  await Promise.all(
    [...escenario.querySelectorAll('img')].map((imagen) =>
      imagen.complete
        ? null
        : new Promise((listo) => {
            imagen.onload = listo
            imagen.onerror = listo
          }),
    ),
  )
}

function numerarPaginas(pdf, resumen, nombreAlumno, anchoHoja, altoHoja) {
  const total = pdf.getNumberOfPages()
  const texto = `DREY · Evaluación ${resumen?.ciclo ?? ''}${nombreAlumno ? ` · ${nombreAlumno}` : ''}`
  for (let pagina = 1; pagina <= total; pagina++) {
    pdf.setPage(pagina)
    pdf.setFont('helvetica', 'normal')
    pdf.setFontSize(8)
    pdf.setTextColor(140, 144, 140)
    pdf.text(texto, MARGEN, altoHoja - MARGEN / 2 - 4)
    pdf.text(`Página ${pagina} de ${total}`, anchoHoja - MARGEN, altoHoja - MARGEN / 2 - 4, {
      align: 'right',
    })
  }
}

// Descarga el PDF en el celular o la compu.
export function descargarPdf(blob, nombreArchivo) {
  const url = URL.createObjectURL(blob)
  const enlace = document.createElement('a')
  enlace.href = url
  enlace.download = nombreArchivo
  document.body.appendChild(enlace)
  enlace.click()
  enlace.remove()
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
}
