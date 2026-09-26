-- Historial real de entrenamientos (sesiones) y almacenamiento de los
-- comprobantes de pago que suben los clientes.

-- 1) Sesiones: cada rutina que un cliente completó de verdad. "detalle"
-- guarda, por ejercicio, las series con el kg y las reps que hizo esa
-- vez — así la próxima vez se puede mostrar en la columna "Anterior".
create table if not exists public.sesiones (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.perfiles(id) on delete cascade,
  rutina_id uuid references public.rutinas(id) on delete set null,
  fecha date not null default current_date,
  esfuerzo int,
  comentario text,
  detalle jsonb,
  creado_en timestamptz not null default now()
);

alter table public.sesiones enable row level security;

create policy "sesiones: el dueño o el profe pueden ver"
  on public.sesiones for select
  to authenticated
  using (auth.uid() = cliente_id or public.es_profe());

create policy "sesiones: el cliente registra las suyas"
  on public.sesiones for insert
  to authenticated
  with check (auth.uid() = cliente_id);

-- 2) Bucket privado para los comprobantes de pago. Cada archivo se
-- guarda en una carpeta con el id del cliente (ej: "<cliente_id>/foto.jpg")
-- para que las políticas de abajo puedan reconocer al dueño.
insert into storage.buckets (id, name, public)
values ('comprobantes', 'comprobantes', false)
on conflict (id) do nothing;

create policy "comprobantes: el dueño sube el suyo"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'comprobantes'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "comprobantes: el dueño o el profe lo ven"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'comprobantes'
    and ((storage.foldername(name))[1] = auth.uid()::text or public.es_profe())
  );
