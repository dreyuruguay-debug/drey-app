-- 043 · Historial del calendario (noviembre 2026)
--
-- El problema: "La semana de todos → Cómo viene" marcaba con ✕ las faltas
-- de semanas anteriores usando el calendario de HOY. Si el profe le había
-- cambiado los días a un alumno, en las semanas viejas aparecían faltas
-- que no eran.
--
-- Qué cambia:
--   · Tabla nueva calendario_historial: cada vez que el profe cambia qué
--     rutina le toca a un alumno un día de la semana, queda anotado desde
--     qué fecha vale. La anota la base sola (trigger): la app no escribe ahí.
--   · Si el profe cambia varias veces el mismo día, queda lo último.
--   · Arranca con el calendario de hoy, válido desde el lunes de esta
--     semana. Para las semanas anteriores a esa no hay datos: la app
--     muestra solo lo que entrenaron (sin marcar faltas).
--   · La leen el alumno (lo suyo) y quien puede ver al alumno (su profe,
--     el dueño del gimnasio, el Admin), igual que el calendario.
--
-- Se puede correr antes o después de subir la app (la app vieja no la usa;
-- la nueva, si la tabla todavía no existe, sigue como antes).
-- Se puede correr más de una vez sin romper nada.

-- 1) La tabla -----------------------------------------------------------------------
create table if not exists public.calendario_historial (
  id bigint generated always as identity primary key,
  cliente_id uuid not null references public.perfiles(id) on delete cascade,
  dia text not null,
  rutina_id uuid references public.rutinas(id) on delete set null,
  desde date not null,
  creado_en timestamptz not null default now(),
  unique (cliente_id, dia, desde)
);

create index if not exists calendario_historial_cliente_idx
  on public.calendario_historial (cliente_id, desde);

alter table public.calendario_historial enable row level security;

drop policy if exists "calendario_historial: el cliente o su profe lo ven"
  on public.calendario_historial;
create policy "calendario_historial: el cliente o su profe lo ven"
  on public.calendario_historial for select to authenticated
  using (cliente_id = auth.uid() or public.puede_ver_cliente(cliente_id));

revoke all on public.calendario_historial from public, anon;
revoke insert, update, delete on public.calendario_historial from authenticated;
grant select on public.calendario_historial to authenticated;

-- 2) Se anota solo cada cambio del calendario ---------------------------------------
create or replace function public.anotar_cambio_de_calendario()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cliente uuid := coalesce(new.cliente_id, old.cliente_id);
  v_dia text := coalesce(new.dia, old.dia);
  v_rutina uuid := case when tg_op = 'DELETE' then null else new.rutina_id end;
begin
  -- Si cambió de día o de alumno (casi nunca), el día viejo queda libre.
  if tg_op = 'UPDATE' and (old.cliente_id, old.dia) is distinct from (new.cliente_id, new.dia) then
    insert into public.calendario_historial (cliente_id, dia, rutina_id, desde)
    values (old.cliente_id, old.dia, null, public.hoy_uy())
    on conflict (cliente_id, dia, desde) do update set rutina_id = excluded.rutina_id,
      creado_en = now();
  end if;
  insert into public.calendario_historial (cliente_id, dia, rutina_id, desde)
  values (v_cliente, v_dia, v_rutina, public.hoy_uy())
  on conflict (cliente_id, dia, desde) do update set rutina_id = excluded.rutina_id,
    creado_en = now();
  return null;
end;
$$;

revoke all on function public.anotar_cambio_de_calendario() from public, anon, authenticated;

drop trigger if exists calendario_anotar_historial on public.calendario_cliente;
create trigger calendario_anotar_historial
  after insert or update or delete on public.calendario_cliente
  for each row execute function public.anotar_cambio_de_calendario();

-- 3) Punto de partida: el calendario de hoy, desde el lunes de esta semana ----------
-- (Solo para los alumnos que todavía no tienen historial: correrlo de nuevo
-- no cambia nada.)
insert into public.calendario_historial (cliente_id, dia, rutina_id, desde)
select c.cliente_id, c.dia, c.rutina_id, date_trunc('week', public.hoy_uy())::date
from public.calendario_cliente c
where not exists (
  select 1 from public.calendario_historial h where h.cliente_id = c.cliente_id
)
on conflict (cliente_id, dia, desde) do nothing;
