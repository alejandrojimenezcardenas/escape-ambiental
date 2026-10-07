-- =====================================================================
-- ESCAPE AMBIENTAL — base de datos multijugador (Supabase Free)
--
-- Pégalo completo en  SQL Editor → New query → Run.
-- Se puede ejecutar más de una vez sin romper nada.
--
-- Seguridad:
--  * RLS activado. Nadie escribe en las tablas directamente: todo pasa por
--    funciones (RPC) que validan quién eres y en qué sala estás.
--  * Cada dispositivo usa una identidad ANÓNIMA de Supabase (sin registro).
--  * La posición NO se guarda cada frame: viaja por Realtime Broadcast y la
--    base solo recibe una copia cada pocos segundos (para reconectar).
-- =====================================================================

-- ---------------------------------------------------------------------
-- Tablas
-- ---------------------------------------------------------------------
create table if not exists public.rooms (
  id          uuid primary key default gen_random_uuid(),
  code        text not null unique,
  host_id     uuid not null,
  status      text not null default 'waiting' check (status in ('waiting', 'playing', 'finished')),
  start_at    timestamptz,                       -- lo fija el SERVIDOR al iniciar
  created_at  timestamptz not null default now()
);

create table if not exists public.players (
  id                  uuid primary key default gen_random_uuid(),
  room_id             uuid not null references public.rooms(id) on delete cascade,
  user_id             uuid not null,
  name                text not null check (char_length(name) between 1 and 12),
  character_id        text check (character_id in ('broti','goti','soli','roco','briso','reci','pilo','mapi','probi','arbo')),
  x                   real not null default 128,
  y                   real not null default 92,
  score               int  not null default 0,
  completed_stations  text[] not null default '{}',
  station_scores      jsonb not null default '{}'::jsonb,
  finished_challenges jsonb not null default '{}'::jsonb,   -- {"archivo":[true,false,...]}: un solo intento por reto
  finished_at         timestamptz,                -- cuando completó 4/4
  exit_status         text not null default 'pending' check (exit_status in ('pending', 'reached', 'blocked')),
  exit_at             timestamptz,                -- cuándo llegó a la salida (desempate)
  joined_at           timestamptz not null default now(),
  unique (room_id, user_id)
);

-- Resultado final (lo fija el servidor al terminar la partida): 1, 2 o 3 = puesto en el podio
alter table public.players add column if not exists final_rank int;

-- Actividad: última vez que cada dispositivo avisó que sigue conectado (ver ping / _close_stale_rooms)
alter table public.rooms   add column if not exists host_seen timestamptz not null default now();
alter table public.players add column if not exists last_seen timestamptz not null default now();

-- Puntaje: 5 retos x 100 + 500 de bonus por estación = 1.000 por estación, 4.000 en total
alter table public.players drop constraint if exists players_score_check;
alter table public.players add constraint players_score_check check (score between 0 and 4000);

-- Un personaje solo para un jugador de la sala (varios NULL permitidos)
create unique index if not exists players_room_character_uq on public.players (room_id, character_id) where character_id is not null;
create unique index if not exists players_room_name_uq      on public.players (room_id, lower(name));
create index if not exists players_room_idx on public.players (room_id);

-- ---------------------------------------------------------------------
-- Ayudas (se ejecutan con permisos del dueño para evitar recursión en RLS)
-- ---------------------------------------------------------------------
create or replace function public.can_see_room(rid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.rooms   r where r.id = rid and r.host_id = auth.uid())
      or exists (select 1 from public.players p where p.room_id = rid and p.user_id = auth.uid());
$$;

create or replace function public.can_use_topic(t text)
returns boolean language plpgsql stable security definer set search_path = public as $$
declare rid uuid;
begin
  if t is null or t not like 'room:%' then return false; end if;
  begin rid := substr(t, 6)::uuid; exception when others then return false; end;
  return public.can_see_room(rid);
end $$;

-- Hora del servidor: los dispositivos corrigen su reloj con esto
create or replace function public.server_now()
returns timestamptz language sql stable as $$ select now(); $$;

-- ---------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------
alter table public.rooms   enable row level security;
alter table public.players enable row level security;

drop policy if exists rooms_select   on public.rooms;
drop policy if exists players_select on public.players;
create policy rooms_select   on public.rooms   for select to authenticated using (public.can_see_room(id));
create policy players_select on public.players for select to authenticated using (public.can_see_room(room_id));
-- Sin políticas de insert/update/delete: solo las funciones de abajo pueden escribir.

revoke all on public.rooms, public.players from anon, authenticated;
grant select on public.rooms, public.players to authenticated;

-- Canal de posiciones (Realtime Broadcast privado): solo la gente de esa sala
drop policy if exists ea_broadcast_read  on realtime.messages;
drop policy if exists ea_broadcast_write on realtime.messages;
create policy ea_broadcast_read  on realtime.messages for select to authenticated
  using (extension = 'broadcast' and public.can_use_topic(realtime.topic()));
create policy ea_broadcast_write on realtime.messages for insert to authenticated
  with check (extension = 'broadcast' and public.can_use_topic(realtime.topic()));

-- ---------------------------------------------------------------------
-- Funciones del juego
-- ---------------------------------------------------------------------

-- ANFITRIÓN: crea la sala y genera el código único
create or replace function public.create_room()
returns public.rooms language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  alphabet text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';     -- sin O/0/I/1
  c text; r public.rooms; tries int := 0;
begin
  if uid is null then raise exception 'no_auth'; end if;
  perform public._close_stale_rooms();
  update public.rooms set status = 'finished' where host_id = uid and status <> 'finished';   -- un solo anfitrión por sala
  loop
    c := '';
    for i in 1..5 loop c := c || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1); end loop;
    begin
      insert into public.rooms (code, host_id) values (c, uid) returning * into r;
      return r;
    exception when unique_violation then
      tries := tries + 1;
      if tries > 20 then raise; end if;
    end;
  end loop;
end $$;

-- JUGADOR: entra a una sala con el código (máximo 10). Si ya estaba, se reconecta.
create or replace function public.join_room(p_code text, p_name text)
returns public.players language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  nm text := btrim(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g'));
  r public.rooms; p public.players;
begin
  if uid is null then raise exception 'no_auth'; end if;
  if nm = '' or char_length(nm) > 12 then raise exception 'bad_name'; end if;
  perform public._close_stale_rooms();
  select * into r from public.rooms where code = upper(btrim(coalesce(p_code, ''))) and status <> 'finished' for update;
  if not found then raise exception 'room_not_found'; end if;
  if r.host_id = uid then raise exception 'host_cannot_play'; end if;

  select * into p from public.players where room_id = r.id and user_id = uid;
  if found then return p; end if;                                     -- reconexión

  if r.status <> 'waiting' then raise exception 'game_started'; end if;
  if (select count(*) from public.players where room_id = r.id) >= 10 then raise exception 'room_full'; end if;
  if exists (select 1 from public.players where room_id = r.id and lower(name) = lower(nm)) then raise exception 'name_taken'; end if;

  insert into public.players (room_id, user_id, name) values (r.id, uid, nm) returning * into p;
  return p;
end $$;

-- JUGADOR: elige (o libera con NULL) su personaje. Un personaje, un jugador.
create or replace function public.choose_character(p_character text)
returns public.players language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); p public.players; r public.rooms;
begin
  select pl.* into p from public.players pl join public.rooms ro on ro.id = pl.room_id
   where pl.user_id = uid and ro.status = 'waiting' order by pl.joined_at desc limit 1;
  if not found then raise exception 'not_in_waiting_room'; end if;
  begin
    update public.players set character_id = p_character where id = p.id returning * into p;
  exception when unique_violation then raise exception 'character_taken';
  end;
  return p;
end $$;

-- ANFITRIÓN: inicia la partida. start_at = hora del SERVIDOR + 3 s (cuenta 3-2-1).
create or replace function public.start_game(p_room uuid)
returns public.rooms language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid(); r public.rooms; pl record; chars text[] := array['broti','goti','soli','roco','briso','reci','pilo','mapi','probi','arbo']; free text[];
begin
  select * into r from public.rooms where id = p_room for update;
  if not found or r.host_id <> uid then raise exception 'not_host'; end if;
  if r.status <> 'waiting' then raise exception 'already_started'; end if;
  if not exists (select 1 from public.players where room_id = r.id) then raise exception 'no_players'; end if;

  -- quien no eligió personaje recibe uno libre
  select coalesce(array_agg(c), '{}') into free from unnest(chars) c
   where c not in (select character_id from public.players where room_id = r.id and character_id is not null);
  for pl in select id from public.players where room_id = r.id and character_id is null order by joined_at loop
    update public.players set character_id = free[1] where id = pl.id;
    free := free[2:];
  end loop;

  update public.rooms set status = 'playing', start_at = now() + interval '3 seconds' where id = r.id returning * into r;
  return r;
end $$;

-- Calcula el podio de la sala: elegibles (4/4 y 1.200+), máximo 3, por puntaje;
-- desempate: quién llegó antes a la salida. Se guarda en players.final_rank.
create or replace function public._finalize_room(rid uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.players set final_rank = null where room_id = rid;
  update public.players p set final_rank = r.rk
    from (
      select id, row_number() over (order by score desc, exit_at asc nulls last, finished_at asc nulls last) as rk
        from public.players
       where room_id = rid and coalesce(array_length(completed_stations, 1), 0) = 4 and score >= 1200
    ) r
   where p.id = r.id and r.rk <= 3;
end $$;

-- Cierra solas las salas abandonadas (nadie pulsó TERMINAR PARTIDA y ya no hay actividad):
--   * en juego: pasaron más de 17 min desde el inicio (15:00 de juego + 2 min de margen), o
--               ni el anfitrión ni ningún jugador avisó que sigue conectado en los últimos 3 min
--   * en espera: nadie avisó en los últimos 10 min
-- Al cerrar una partida en juego se calcula el podio igual que con TERMINAR PARTIDA.
create or replace function public._close_stale_rooms()
returns void language plpgsql security definer set search_path = public as $$
declare r record;
begin
  for r in
    select ro.id, ro.status from public.rooms ro
     where ro.status <> 'finished'
       and (
            (ro.status = 'playing' and now() > ro.start_at + interval '17 minutes')
         or (ro.status = 'playing' and greatest(ro.host_seen, coalesce((select max(p.last_seen) from public.players p where p.room_id = ro.id), ro.host_seen)) < now() - interval '3 minutes')
         or (ro.status = 'waiting' and greatest(ro.host_seen, coalesce((select max(p.last_seen) from public.players p where p.room_id = ro.id), ro.host_seen)) < now() - interval '10 minutes')
       )
     for update of ro skip locked
  loop
    if r.status = 'playing' then perform public._finalize_room(r.id); end if;
    update public.rooms set status = 'finished' where id = r.id;
  end loop;
end $$;

-- Cualquiera: cierra las salas abandonadas (la usa el cliente al reconectarse)
create or replace function public.close_stale_rooms()
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'no_auth'; end if;
  perform public._close_stale_rooms();
end $$;

-- Cualquiera de la sala (anfitrión o jugador): "sigo conectado". Devuelve el estado de la sala.
create or replace function public.ping(p_room uuid)
returns text language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); r public.rooms; st text;
begin
  if uid is null then raise exception 'no_auth'; end if;
  select * into r from public.rooms where id = p_room;
  if not found then return 'finished'; end if;
  if r.host_id = uid then
    update public.rooms set host_seen = now() where id = r.id and status <> 'finished';
  else
    update public.players set last_seen = now() where room_id = r.id and user_id = uid;
  end if;
  perform public._close_stale_rooms();
  select status into st from public.rooms where id = r.id;
  return coalesce(st, 'finished');
end $$;

-- Cualquiera de la sala: cierra la partida cuando el reloj del SERVIDOR pasó los 15:00
create or replace function public.finish_game(p_room uuid)
returns public.rooms language plpgsql security definer set search_path = public as $$
declare r public.rooms;
begin
  if not public.can_see_room(p_room) then raise exception 'not_in_room'; end if;
  select * into r from public.rooms where id = p_room for update;
  if r.status = 'playing' and now() >= r.start_at + interval '15 minutes' then
    perform public._finalize_room(r.id);
    update public.rooms set status = 'finished' where id = r.id returning * into r;
  end if;
  return r;
end $$;

-- SOLO EL ANFITRIÓN: termina la partida para todos (botón TERMINAR PARTIDA)
create or replace function public.end_game(p_room uuid)
returns public.rooms language plpgsql security definer set search_path = public as $$
declare r public.rooms;
begin
  select * into r from public.rooms where id = p_room for update;
  if not found or r.host_id <> auth.uid() then raise exception 'not_host'; end if;
  if r.status = 'playing' then
    perform public._finalize_room(r.id);
    update public.rooms set status = 'finished' where id = r.id returning * into r;
  end if;
  return r;
end $$;

-- Helper: jugador del que llama, en una partida en curso y dentro del tiempo
create or replace function public._active_player()
returns public.players language plpgsql stable security definer set search_path = public as $$
declare p public.players;
begin
  select pl.* into p from public.players pl join public.rooms ro on ro.id = pl.room_id
   where pl.user_id = auth.uid() and ro.status = 'playing'
     and now() >= ro.start_at and now() <= ro.start_at + interval '15 minutes 5 seconds'
   order by ro.created_at desc limit 1;
  if not found then raise exception 'game_not_active'; end if;
  return p;
end $$;

-- JUGADOR: guarda su progreso. El servidor RECALCULA puntos y estaciones desde los retos
-- contestados (+100 por acierto, +500 por estación de 5 retos con 3+ aciertos) y no deja cambiar respuestas ya dadas.
create or replace function public.report_progress(p_challenges jsonb)
returns public.players language plpgsql security definer set search_path = public as $$
declare
  p public.players; k text; arr jsonb; old jsonb; n int; i int; c int;
  valid text[] := array['archivo','emergencias','laboratorio','nucleo'];
  ss jsonb := '{}'::jsonb; total int := 0; comp text[]; done text[] := '{}'; st int;
begin
  p := public._active_player();
  if p.exit_status = 'reached' then raise exception 'already_exited'; end if;      -- quien ya salió no suma más puntos
  if p_challenges is null or jsonb_typeof(p_challenges) <> 'object' then raise exception 'bad_data'; end if;
  for k, arr in select key, value from jsonb_each(p_challenges) loop
    if not (k = any (valid)) or jsonb_typeof(arr) <> 'array' or jsonb_array_length(arr) > 5 then raise exception 'bad_data'; end if;
    n := jsonb_array_length(arr);
    for i in 0 .. n - 1 loop
      if jsonb_typeof(arr -> i) <> 'boolean' then raise exception 'bad_data'; end if;
    end loop;
    old := coalesce(p.finished_challenges -> k, '[]'::jsonb);
    if n < jsonb_array_length(old) then raise exception 'cannot_undo'; end if;
    for i in 0 .. jsonb_array_length(old) - 1 loop
      if (arr -> i) <> (old -> i) then raise exception 'cannot_change_answer'; end if;     -- un solo intento
    end loop;
    c := (select count(*) from jsonb_array_elements(arr) a where a = 'true'::jsonb);
    st := 100 * c + case when n = 5 and c >= 3 then 500 else 0 end;      -- el bonus exige 3 aciertos de 5
    ss := ss || jsonb_build_object(k, st);
    total := total + st;
    if n = 5 then done := done || k; end if;
  end loop;
  -- las estaciones ya completadas conservan su orden; las nuevas se añaden al final
  comp := p.completed_stations || array(select d from unnest(done) d where d <> all (p.completed_stations));
  update public.players
     set finished_challenges = p_challenges, station_scores = ss, score = total, completed_stations = comp,
         finished_at = case when finished_at is null and array_length(comp, 1) = 4 then now() else finished_at end
   where id = p.id returning * into p;
  return p;
end $$;

-- JUGADOR: copia de la posición (el cliente la llama cada pocos segundos, no cada frame)
create or replace function public.save_position(p_x real, p_y real)
returns void language plpgsql security definer set search_path = public as $$
declare p public.players;
begin
  p := public._active_player();
  update public.players set x = least(256, greatest(0, p_x)), y = least(200, greatest(0, p_y)) where id = p.id;
end $$;

-- JUGADOR: llega a la puerta de salida. El SERVIDOR decide.
--   elegible = 4/4 estaciones y mínimo 1.200 puntos
--   solo salen los 3 mejores elegibles por puntaje (desempate: quién llegó antes a la salida)
create or replace function public.claim_exit()
returns jsonb language plpgsql security definer set search_path = public as $$
declare p public.players; mine boolean; rank int; ok boolean;
begin
  p := public._active_player();
  if p.exit_status = 'reached' then return jsonb_build_object('status', 'reached'); end if;
  mine := coalesce(array_length(p.completed_stations, 1), 0) = 4 and p.score >= 1200;
  if not mine then
    return jsonb_build_object('status', 'not_eligible', 'completed', coalesce(array_length(p.completed_stations, 1), 0), 'score', p.score);
  end if;
  update public.players set exit_at = coalesce(exit_at, now()) where id = p.id returning * into p;   -- hora de llegada
  select 1 + count(*) into rank from public.players o
   where o.room_id = p.room_id and o.id <> p.id
     and coalesce(array_length(o.completed_stations, 1), 0) = 4 and o.score >= 1200
     and (o.score > p.score or (o.score = p.score and o.exit_at is not null and o.exit_at < p.exit_at));
  ok := rank <= 3;
  update public.players set exit_status = case when ok then 'reached' else 'blocked' end where id = p.id;
  return jsonb_build_object('status', case when ok then 'reached' else 'blocked' end, 'rank', rank);
end $$;

-- ---------------------------------------------------------------------
-- Permisos de las funciones: solo usuarios autenticados (incluye anónimos)
-- ---------------------------------------------------------------------
revoke execute on all functions in schema public from public, anon;
grant execute on function
  public.server_now(), public.create_room(), public.join_room(text, text), public.choose_character(text),
  public.start_game(uuid), public.finish_game(uuid), public.end_game(uuid), public.report_progress(jsonb),
  public.save_position(real, real), public.claim_exit(), public.ping(uuid), public.close_stale_rooms(),
  public.can_see_room(uuid), public.can_use_topic(text)          -- las usan las políticas RLS
  to authenticated;

-- ---------------------------------------------------------------------
-- Realtime: avisar cambios de las dos tablas (respeta RLS)
-- ---------------------------------------------------------------------
do $$ begin
  alter publication supabase_realtime add table public.rooms;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.players;
exception when duplicate_object then null; end $$;
