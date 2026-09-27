create table if not exists school_settings (
  user_id uuid primary key references users(id) on delete cascade,
  school_name text not null default 'Northstar Academy',
  tagline text not null default 'Learn. Lead. Belong.',
  address text not null default '',
  phone text not null default '',
  default_accent text not null default 'indigo' check (default_accent in ('indigo', 'teal', 'coral')),
  updated_at timestamptz not null default now()
);

create table if not exists student_cards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  name text not null,
  student_id text not null,
  class_name text not null,
  section text not null default '',
  blood_group text not null default '',
  school_name text not null,
  academic_year text not null,
  photo_url text,
  accent text not null default 'indigo' check (accent in ('indigo', 'teal', 'coral')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists student_cards_user_id_idx on student_cards(user_id);
create unique index if not exists student_cards_user_student_id_idx
  on student_cards(user_id, student_id);
