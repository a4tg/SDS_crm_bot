-- SQL‑скрипт для создания таблиц CRM‑бота в Supabase.
-- Выполните эти запросы в разделе SQL Editor вашей панели Supabase.

-- Таблица пользователей Telegram.
create table if not exists public.users (
  id uuid primary key default gen_random_uuid(),
  telegram_id bigint not null unique,
  username text,
  first_name text,
  last_name text,
  created_at timestamp with time zone not null default (now() at time zone 'utc')
);

-- Таблица лидов. Каждый лид привязан к пользователю по telegram_id.
create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  telegram_id bigint not null references public.users (telegram_id) on delete cascade,
  name text not null,
  phone text,
  email text,
  status text default 'new',
  created_at timestamp with time zone not null default (now() at time zone 'utc')
);

-- Таблица сообщений (опционально). Сохраняет историю переписки.
create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  telegram_id bigint not null references public.users (telegram_id) on delete cascade,
  message_text text not null,
  direction text check (direction in ('inbound','outbound')),
  created_at timestamp with time zone not null default (now() at time zone 'utc')
);

-- Таблица профилей пользователей (supabase auth). Связывает auth.users с телеграм‑аккаунтами и ролями.
create table if not exists public.profiles (
  -- id совпадает с auth.users.id
  id uuid primary key references auth.users (id) on delete cascade,
  -- человеческое имя/фамилия для отображения
  full_name text,
  -- Telegram ID (bigint) для связи задач и бота
  telegram_id bigint unique,
  -- Роль в CRM (project_head, team_leader, region_manager, junior_manager)
  role text not null,
  -- Дата создания
  created_at timestamp with time zone not null default (now() at time zone 'utc')
);

-- Таблица задач. Хранит информацию о задачах и привязку к постановщику/исполнителю.
create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  client text,
  due_date timestamp with time zone not null,
  description text,
  -- результат выполнения, заполняется исполнителем
  result text,
  -- Статус задачи: 'Выполняется', 'Просрочена', 'Результат на согласовании', 'Завершено'
  status text not null default 'Выполняется',
  -- Telegram ID постановщика задачи
  assigner_telegram_id bigint not null references public.users (telegram_id) on delete cascade,
  -- Telegram ID исполнителя задачи
  assignee_telegram_id bigint references public.users (telegram_id) on delete set null,
  -- Дополнительные комментарии постановщика
  comments text,
  created_at timestamp with time zone not null default (now() at time zone 'utc'),
  updated_at timestamp with time zone not null default (now() at time zone 'utc')
);

-- Таблица файлов задач (опционально). Позволяет хранить ссылки на файлы/изображения.
create table if not exists public.task_files (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks (id) on delete cascade,
  file_url text not null,
  uploaded_at timestamp with time zone not null default (now() at time zone 'utc')
);