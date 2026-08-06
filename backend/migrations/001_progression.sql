-- Схема Supabase для Score Engine. НЕ применена автоматически:
-- прогнать вручную (supabase db push / SQL editor), когда бэкенд поедет в прод.
-- Демо-режим FastAPI работает без базы — всё в памяти процесса.

-- Override-ы конфигов: то, что редактирует админка. Приоритетнее JSON из репо.
create table if not exists progression_overrides (
  game_id     text primary key,
  config      jsonb not null,
  version     int not null default 1,
  active      boolean not null default true,
  updated_at  timestamptz not null default now(),
  updated_by  text
);

-- История изменений для отката.
create table if not exists progression_history (
  id          bigint generated always as identity primary key,
  game_id     text not null,
  config      jsonb not null,
  version     int not null,
  updated_at  timestamptz not null default now(),
  updated_by  text
);

-- Кошелёк: баланс на пользователя.
create table if not exists user_wallet (
  user_id     text primary key,
  balance     int not null default 0,
  updated_at  timestamptz not null default now()
);

-- Идемпотентные ключи выданных наград: level-<slug>-<n>, soz-daily-<dayId>,
-- quest-<id>-<dayId>, ach-<id>, checkin-<dayId>. Совпадают с клиентским
-- демо-кошельком (packages/game-progress/src/bonus.ts).
create table if not exists wallet_keys (
  user_id     text not null,
  key         text not null,
  amount      int not null,
  created_at  timestamptz not null default now(),
  primary key (user_id, key)
);

-- Кумулятивная статистика для достижений: metric — 'wordsGuessed', 'bestHeight'…
create table if not exists user_stats (
  user_id     text not null,
  metric      text not null,
  value       double precision not null default 0,
  updated_at  timestamptz not null default now(),
  primary key (user_id, metric)
);

-- Аудит начислений — сырьё для анализа баланса и антифрода.
create table if not exists balance_audit (
  id          bigint generated always as identity primary key,
  user_id     text not null,
  game_id     text not null,
  xp          int not null,
  reason      text not null,
  session_id  text,
  created_at  timestamptz not null default now()
);
create index if not exists balance_audit_user_idx on balance_audit (user_id, created_at desc);
create index if not exists balance_audit_game_idx on balance_audit (game_id, created_at desc);

-- Автоматический бэкап версии при каждом изменении override — база для отката.
create or replace function trg_progression_history() returns trigger as $$
begin
  insert into progression_history (game_id, config, version, updated_by)
  values (new.game_id, new.config, new.version, new.updated_by);
  return new;
end $$ language plpgsql;

drop trigger if exists progression_history_trg on progression_overrides;
create trigger progression_history_trg
after insert or update on progression_overrides
for each row execute function trg_progression_history();
