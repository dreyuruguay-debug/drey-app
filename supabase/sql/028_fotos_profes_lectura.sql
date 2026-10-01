-- 028 · Fotos de los profes y de la biblioteca: permiso para verlas al borrar
-- ----------------------------------------------------------------------
-- Problema: al subir la foto de perfil, a los profes les salía "No
-- pudimos subir la foto". La app la subía en modo "reemplazar si existe"
-- y para eso la base pide también permiso de LECTURA sobre los archivos
-- del bucket, que no estaba (SQL 026). La app ya se arregló (sube cada
-- foto con un nombre nuevo y no necesita ese modo).
--
-- Este SQL agrega ese permiso de lectura, que además hace falta para
-- BORRAR la foto vieja cuando se cambia por otra (sin él, la foto vieja
-- quedaba guardada de más en Supabase). Lo mismo para las fotos de la
-- biblioteca de ejercicios (SQL 005).
--
-- No cambia quién ve las fotos: los dos buckets ya son públicos (las
-- fotos se ven por su link). Esto solo deja que la app las encuentre
-- para borrarlas.
--
-- Se puede correr más de una vez sin romper nada.

-- Fotos de perfil: el profe las suyas (carpeta = su id) y el Admin todas.
drop policy if exists "fotos-profes: el profe ve la suya" on storage.objects;
create policy "fotos-profes: el profe ve la suya"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'fotos-profes'
    and ((storage.foldername(name))[1] = auth.uid()::text or public.es_admin())
  );

-- Fotos de la biblioteca: los profes y el Admin.
drop policy if exists "ejercicios-fotos: el profe las ve" on storage.objects;
create policy "ejercicios-fotos: el profe las ve"
  on storage.objects for select to authenticated
  using (bucket_id = 'ejercicios-fotos' and public.es_profe());
