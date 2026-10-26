-- Swami Abhyasika schema. Plain PostgreSQL: runs unchanged on the embedded
-- local database (PGlite) and on Supabase (paste into the SQL editor, or let
-- the app apply it automatically on first start).

create table if not exists users (
  id            text primary key,
  username      text unique not null,
  password_hash text not null,
  role          text not null default 'owner',
  created_at    timestamptz not null default now()
);

create table if not exists students (
  id             text primary key,
  position       int  not null default 0,
  name           text,
  phone          text,
  course         text,
  gender         text,
  shift          text,
  admission_date text,
  due_date       text,
  total_fees     numeric,
  paid_fees      numeric,
  hash           text not null,
  data           jsonb not null,          -- the full student object (minus payments/photo)
  updated_at     timestamptz not null default now()
);
create index if not exists students_phone_idx on students (phone);
create index if not exists students_due_idx   on students (due_date);

create table if not exists payments (
  id         bigserial primary key,
  student_id text not null references students(id) on delete cascade,
  position   int  not null default 0,
  amount     numeric,
  paid_on    text,
  method     text,
  notes      text,
  data       jsonb not null
);
create index if not exists payments_student_idx on payments (student_id, position);
create index if not exists payments_date_idx    on payments (paid_on);

create table if not exists photos (
  student_id text primary key,            -- no FK on purpose: photo may arrive before the student row
  url        text not null
);

create table if not exists bookings (
  id         text primary key,
  position   int  not null default 0,
  student_id text,
  seat       text,
  floor      text,
  from_date  text,
  due_date   text,
  status     text,
  hash       text not null,
  data       jsonb not null,
  updated_at timestamptz not null default now()
);
create index if not exists bookings_seat_idx    on bookings (floor, seat, status);
create index if not exists bookings_student_idx on bookings (student_id);

-- Small ordered lists: fee tiers, delete requests, cash closings, broadcast history
create table if not exists collections (
  name text not null,
  idx  int  not null,
  data jsonb not null,
  primary key (name, idx)
);

-- Everything else (institute profile, reminder settings, courses, templates, theme, owner PIN ...)
create table if not exists settings (
  key        text primary key,
  value      text not null,
  updated_at timestamptz not null default now()
);

-- Change counter per big list. A device that saved from an out-of-date copy is told to reload
-- instead of silently deleting what another device added.
create table if not exists versions (
  key text primary key,
  v   bigint not null default 0
);

-- Wording the owner changed for WhatsApp messages. No row = the built-in default wording is used.
create table if not exists message_templates (
  key        text primary key,
  body       text not null,
  updated_at timestamptz not null default now(),
  updated_by text
);

-- Every backup attempt, for the history on Settings → Backup & Restore.
create table if not exists backup_runs (
  id           bigserial primary key,
  destination  text not null check (destination in ('local', 'google_drive')),
  trigger      text not null check (trigger in ('manual', 'scheduled', 'catch_up')),
  status       text not null check (status in ('running', 'success', 'failed', 'skipped')),
  started_at   timestamptz not null default now(),
  finished_at  timestamptz,
  file_name    text,
  size_bytes   bigint,
  drive_file_id text,
  counts       jsonb,
  changes      jsonb,
  manifest     jsonb,          -- fingerprints used to compare with the next backup; kept only on the latest success
  error        text,
  created_by   text
);
create index if not exists backup_runs_dest_idx on backup_runs (destination, started_at desc);
-- Only one Google Drive backup may run at a time (two open tabs cannot start two).
create unique index if not exists backup_runs_one_running on backup_runs (destination) where status = 'running' and destination = 'google_drive';

-- Connections to outside services (Google Drive). Secrets inside are encrypted by the app.
create table if not exists integrations (
  name       text primary key,
  data       jsonb not null,
  updated_at timestamptz not null default now()
);

-- Supabase Auth keeps the passwords. Our table is the allow-list: only people listed here may use the app.
alter table users alter column password_hash drop not null;
alter table users add column if not exists email text;

-- Lock the tables against Supabase's public (anon/authenticated) API. The app talks
-- to the database only from the server, with the owner connection, which bypasses RLS.
alter table users       enable row level security;
alter table students    enable row level security;
alter table payments    enable row level security;
alter table photos      enable row level security;
alter table bookings    enable row level security;
alter table collections enable row level security;
alter table settings    enable row level security;
alter table versions    enable row level security;
alter table message_templates enable row level security;
alter table backup_runs enable row level security;
alter table integrations enable row level security;
