-- Продуктовая аналитика каталога: сырые факты, показатели считаются на чтении.
--
-- Схема намеренно плоская и append-only: строку никто не обновляет, поэтому
-- запись дёшева, а новый вопрос к данным решается новым запросом, а не миграцией.
-- Дни считаются по Ташкенту (UTC+5) — тем же расчётом, что day_id в коде.
--
-- Персональные данные здесь не хранятся: user_id — идентификатор, который
-- прислало приложение, ни имени, ни телефона, ни устройства мы не принимаем.

-- Завершённые и отклонённые партии.
create table if not exists analytics_rounds (
  id           bigserial primary key,
  ts           timestamptz not null default now(),
  day_id       integer     not null,
  user_id      text        not null,
  game_id      text        not null,
  session_id   text        not null,
  mode         text        not null,
  level        integer,
  score        integer     not null default 0,
  duration_ms  integer     not null default 0,
  won          boolean,
  stars        smallint    not null default 0,
  xp           integer     not null default 0,
  -- Причина отказа антифрода; null — партия зачтена.
  rejected     text
);

create index if not exists analytics_rounds_day on analytics_rounds (day_id);
create index if not exists analytics_rounds_game_day on analytics_rounds (game_id, day_id);
create index if not exists analytics_rounds_user_day on analytics_rounds (user_id, day_id);

-- Пакеты сырых событий партии: сколько пришло и чем кончилось.
create table if not exists analytics_events (
  id           bigserial primary key,
  ts           timestamptz not null default now(),
  day_id       integer     not null,
  user_id      text        not null,
  game_id      text        not null,
  session_id   text        not null,
  count        integer     not null default 0,
  xp           integer     not null default 0,
  rejected     text
);

create index if not exists analytics_events_day on analytics_events (day_id);
create index if not exists analytics_events_game_day on analytics_events (game_id, day_id);

-- Заходы в каталог: чек-ин раз в день, он же признак «пришёл сегодня».
create table if not exists analytics_visits (
  id       bigserial primary key,
  ts       timestamptz not null default now(),
  day_id   integer     not null,
  user_id  text        not null
);

create index if not exists analytics_visits_day on analytics_visits (day_id);
create unique index if not exists analytics_visits_once_a_day on analytics_visits (user_id, day_id);

-- Начисления уже пишутся в balance_audit (001_progression.sql); для экономики
-- нужна отметка времени и день — добавляем, если таблица создана раньше.
alter table if exists balance_audit add column if not exists ts timestamptz not null default now();
alter table if exists balance_audit add column if not exists day_id integer;
create index if not exists balance_audit_day on balance_audit (day_id);

-- Витрина «активность по дням» — тот же расчёт, что отдаёт /analytics/overview.
create or replace view analytics_daily as
select
  day_id,
  count(distinct user_id)                                  as players,
  count(*) filter (where rejected is null)                 as rounds,
  count(*) filter (where rejected is not null)             as rejected,
  coalesce(sum(xp) filter (where rejected is null), 0)     as xp
from analytics_rounds
group by day_id
order by day_id;
