"""Achica GIF de ejercicios para la biblioteca de DREY (lo corre alguien técnico).

Por cada GIF de la carpeta de origen crea, en la carpeta de destino:
  NOMBRE.webp        animación 480x480, liviana para el celular (~100 KB)
  mini/NOMBRE.webp   foto chica y quieta 160x160 para las listas (~2 KB)

Así se armaron los 750 de FitCron (public/ejercicios). Después hay que
copiar los archivos a public/ejercicios y cargar cada ejercicio en la base
con imagen_url = '/ejercicios/NOMBRE.webp' (ver supabase/sql/023).

Necesita: Python 3 con Pillow (pip install pillow) y los programas
gifsicle, gif2webp y webpmux (paquetes "gifsicle" y "webp").

Uso:
  python3 herramientas/convertir_gifs.py CARPETA_CON_GIF public/ejercicios [prefijo]
Ejemplo (exercise_12.gif -> fitcron-12.webp):
  python3 herramientas/convertir_gifs.py ~/FitCron_GIFs public/ejercicios fitcron
"""
import os
import re
import subprocess
import sys
import tempfile

from PIL import Image

LADO_ANIMACION = 480
LADO_MINI = 160
CALIDAD_ANIMACION = 65
CALIDAD_MINI = 72


def nombre_destino(archivo, prefijo):
    base = os.path.splitext(archivo)[0]
    numero = re.search(r'(\d+)$', base)
    if prefijo and numero:
        return f'{prefijo}-{numero.group(1)}'
    return re.sub(r'[^a-z0-9]+', '-', base.lower()).strip('-')


def convertir(gif, animacion, mini):
    with tempfile.TemporaryDirectory() as temporal:
        chico = os.path.join(temporal, 'chico.gif')
        subprocess.run(['gifsicle', '--resize', f'{LADO_ANIMACION}x{LADO_ANIMACION}',
                        '--colors', '256', '--no-warnings', gif, '-o', chico], check=True)
        sin_repetir = os.path.join(temporal, 'animacion.webp')
        subprocess.run(['gif2webp', '-q', str(CALIDAD_ANIMACION), '-m', '4', '-lossy', '-quiet',
                        chico, '-o', sin_repetir], check=True)
        # Algunos GIF no dicen "repetir siempre": se fija para que no se corte.
        subprocess.run(['webpmux', '-set', 'loop', '0', sin_repetir, '-o', animacion],
                       check=True, capture_output=True)
    imagen = Image.open(gif)
    imagen.seek(0)
    imagen.convert('RGB').resize((LADO_MINI, LADO_MINI), Image.LANCZOS).save(
        mini, 'WEBP', quality=CALIDAD_MINI, method=6)


def main():
    if len(sys.argv) < 3:
        print(__doc__)
        sys.exit(1)
    origen, destino = sys.argv[1], sys.argv[2]
    prefijo = sys.argv[3] if len(sys.argv) > 3 else ''
    os.makedirs(os.path.join(destino, 'mini'), exist_ok=True)
    gifs = sorted(f for f in os.listdir(origen) if f.lower().endswith('.gif'))
    for indice, archivo in enumerate(gifs, start=1):
        nombre = nombre_destino(archivo, prefijo)
        convertir(os.path.join(origen, archivo),
                  os.path.join(destino, f'{nombre}.webp'),
                  os.path.join(destino, 'mini', f'{nombre}.webp'))
        print(f'[{indice}/{len(gifs)}] {archivo} -> {nombre}.webp')


if __name__ == '__main__':
    main()
