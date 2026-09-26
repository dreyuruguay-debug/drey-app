-- 016 · Evaluación inicial y medidas
--
-- Cada fila de "mediciones" es un control del cliente en una fecha:
-- peso, perímetros (cintura, cadera, pecho, brazo, muslo), % de grasa
-- (si se mide), notas y hasta 3 fotos de progreso (frente, perfil,
-- espalda). La primera se marca como "inicial" (evaluación inicial, que
-- además guarda altura y observaciones del profe).
--
-- Las cargan el cliente (desde Progreso → Mis medidas) o su profe (desde
-- la ficha del cliente). Las fotos van a un almacenamiento PRIVADO
-- ("fotos-progreso"), en una carpeta por cliente: solo las ven el cliente
-- y su profe.
--
-- Se puede correr más de una vez sin romper nada.

create table if not exists public.mediciones (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.perfiles(id) on delete cascade,
  fecha date not null default public.hoy_uy(),
  tipo text not null default 'control' check (tipo in ('inicial', 'control')),
  peso numeric check (peso is null or (peso > 0 and peso < 400)),
  altura numeric check (altura is null or (altura > 50 and altura < 250)),
  grasa numeric check (grasa is null or (grasa >= 0 and grasa <= 70)),
  cintura numeric,
  cadera numeric,
  pecho numeric,
  brazo numeric,
  muslo numeric,
  notas text,
  fotos jsonb not null default '{}'::jsonb,
  cargado_por uuid default auth.uid() references public.perfiles(id) on delete set null,
  creado_en timestamptz not null default now()
);

create index if not exists mediciones_cliente_idx on public.mediciones (cliente_id, fecha);
alter table public.mediciones enable row level security;

drop policy if exists "mediciones: el cliente o su profe las ven" on public.mediciones;
create policy "mediciones: el cliente o su profe las ven"
  on public.mediciones for select to authenticated
  using (cliente_id = auth.uid() or public.puede_ver_cliente(cliente_id));

drop policy if exists "mediciones: el cliente o su profe las cargan" on public.mediciones;
create policy "mediciones: el cliente o su profe las cargan"
  on public.mediciones for insert to authenticated
  with check (cliente_id = auth.uid() or public.puede_ver_cliente(cliente_id));

drop policy if exists "mediciones: el cliente o su profe las corrigen" on public.mediciones;
create policy "mediciones: el cliente o su profe las corrigen"
  on public.mediciones for update to authenticated
  using (cliente_id = auth.uid() or public.puede_ver_cliente(cliente_id))
  with check (cliente_id = auth.uid() or public.puede_ver_cliente(cliente_id));

drop policy if exists "mediciones: el cliente o su profe las borran" on public.mediciones;
create policy "mediciones: el cliente o su profe las borran"
  on public.mediciones for delete to authenticated
  using (cliente_id = auth.uid() or public.puede_ver_cliente(cliente_id));

-- Fotos de progreso: bucket privado, carpeta = id del cliente.
insert into storage.buckets (id, name, public)
values ('fotos-progreso', 'fotos-progreso', false)
on conflict (id) do nothing;

drop policy if exists "fotos-progreso: el cliente o su profe ven" on storage.objects;
create policy "fotos-progreso: el cliente o su profe ven"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'fotos-progreso'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or exists (
        select 1 from public.perfiles c
        where c.id::text = (storage.foldername(name))[1] and public.puede_ver_cliente(c.id)
      )
    )
  );

drop policy if exists "fotos-progreso: el cliente o su profe suben" on storage.objects;
create policy "fotos-progreso: el cliente o su profe suben"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'fotos-progreso'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or exists (
        select 1 from public.perfiles c
        where c.id::text = (storage.foldername(name))[1] and public.puede_ver_cliente(c.id)
      )
    )
  );

drop policy if exists "fotos-progreso: el cliente o su profe borran" on storage.objects;
create policy "fotos-progreso: el cliente o su profe borran"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'fotos-progreso'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or exists (
        select 1 from public.perfiles c
        where c.id::text = (storage.foldername(name))[1] and public.puede_ver_cliente(c.id)
      )
    )
  );
