// Colores de las gráficas de la evaluación mensual.
//
// Las gráficas se dibujan con los colores escritos en cada figura (no con
// clases de CSS) porque el PDF las "fotografía" y en esa foto no llegan
// las clases. En la app se usan las variables del tema (cambian con el
// modo claro / oscuro); en el PDF, colores fijos sobre fondo blanco.
export const COLORES_APP = {
  barra: 'var(--drey-accent)',
  barraSuave: 'var(--drey-relleno)',
  sube: 'var(--drey-accent-texto)',
  baja: 'var(--drey-peligro-texto)',
  linea: 'var(--drey-accent-texto)',
  punto: 'var(--drey-bg)',
  referencia: 'var(--drey-naranja-texto)',
  guia: 'var(--drey-borde)',
  texto: 'var(--drey-texto-apagado)',
  textoFuerte: 'var(--drey-texto-claro)',
}

export const COLORES_PDF = {
  barra: '#3ddc84',
  barraSuave: '#d9ded8',
  sube: '#0e8f4a',
  baja: '#c0392b',
  linea: '#0e8f4a',
  punto: '#ffffff',
  referencia: '#d9822b',
  guia: '#e1e4df',
  texto: '#6d726e',
  textoFuerte: '#2c302d',
}
