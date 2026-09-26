-- 009 · Resúmenes de progreso cada 4 semanas
--
-- Al terminar cada ciclo de 4 semanas (contadas desde el primer
-- entrenamiento del cliente), la app arma sola un resumen en estado
-- "borrador". El profe lo revisa, le puede sumar un comentario y lo
-- publica. Recién ahí el cliente lo ve en "Mis datos" → "Notificación
-- de avance".
--
-- Se puede correr más de una vez sin romper nada.

create table if not exists public.resumenes_progreso (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.perfiles(id) on delete cascade,
  ciclo int not null,
  desde date not null,
  hasta date not null,
  datos jsonb not null default '{}'::jsonb,
  comentario_profe text,
  estado text not null default 'borrador' check (estado in ('borrador', 'publicado')),
  visto boolean not null default false,
  creado_en timestamptz not null default now(),
  publicado_en timestamptz,
  unique (cliente_id, ciclo)
);

alter table public.resumenes_progreso enable row level security;

-- El profe ve todos; el cliente solo los suyos y solo si están publicados.
drop policy if exists "resumenes: profe todos, cliente los suyos publicados" on public.resumenes_progreso;
create policy "resumenes: profe todos, cliente los suyos publicados"
  on public.resumenes_progreso for select
  to authenticated
  using (public.es_profe() or (cliente_id = auth.uid() and estado = 'publicado'));

drop policy if exists "resumenes: solo el profe los crea" on public.resumenes_progreso;
create policy "resumenes: solo el profe los crea"
  on public.resumenes_progreso for insert
  to authenticated
  with check (public.es_profe());

drop policy if exists "resumenes: solo el profe los edita" on public.resumenes_progreso;
create policy "resumenes: solo el profe los edita"
  on public.resumenes_progreso for update
  to authenticated
  using (public.es_profe())
  with check (public.es_profe());

drop policy if exists "resumenes: solo el profe los borra" on public.resumenes_progreso;
create policy "resumenes: solo el profe los borra"
  on public.resumenes_progreso for delete
  to authenticated
  using (public.es_profe());

-- El cliente no puede editar resúmenes, pero sí marcar como visto uno
-- suyo ya publicado (para que deje de aparecer el aviso en Inicio).
create or replace function public.marcar_resumen_visto(p_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.resumenes_progreso
  set visto = true
  where id = p_id and cliente_id = auth.uid() and estado = 'publicado';
$$;

revoke all on function public.marcar_resumen_visto(uuid) from public;
grant execute on function public.marcar_resumen_visto(uuid) to authenticated;
