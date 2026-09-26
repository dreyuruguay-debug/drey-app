-- Fotos de los ejercicios. El bucket es público (son fotos ilustrativas
-- del ejercicio, no datos sensibles) para poder mostrarlas directo en
-- la app sin pedir un link firmado cada vez.
alter table public.ejercicios add column if not exists imagen_url text;

insert into storage.buckets (id, name, public)
values ('ejercicios-fotos', 'ejercicios-fotos', true)
on conflict (id) do nothing;

create policy "ejercicios-fotos: solo el profe sube"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'ejercicios-fotos' and public.es_profe());

create policy "ejercicios-fotos: solo el profe reemplaza"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'ejercicios-fotos' and public.es_profe())
  with check (bucket_id = 'ejercicios-fotos' and public.es_profe());

create policy "ejercicios-fotos: solo el profe borra"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'ejercicios-fotos' and public.es_profe());
