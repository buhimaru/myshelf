create table if not exists public.works (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  category text not null check (category in ('book', 'movie', 'anime', 'music')),
  image_url text,
  description text,
  user_id uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.works add column if not exists user_id uuid references auth.users (id) on delete set null;
alter table public.works add column if not exists is_public boolean not null default true;

alter table public.works drop constraint if exists works_category_check;
alter table public.works
  add constraint works_category_check
  check (category in ('book', 'movie', 'anime', 'music'));

alter table public.works enable row level security;

drop policy if exists "works_select_public" on public.works;
drop policy if exists "works_select_own" on public.works;
drop policy if exists "works_select_visible" on public.works;
create policy "works_select_visible"
  on public.works
  for select
  to anon, authenticated
  using (
    auth.uid() = user_id
    or (
      user_id is not null
      and exists (
        select 1
        from public.profiles as profiles
        where profiles.id = works.user_id
          and profiles.is_public = true
      )
    )
  );

drop policy if exists "works_insert_public" on public.works;
drop policy if exists "works_insert_own" on public.works;
create policy "works_insert_own"
  on public.works
  for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "works_update_public" on public.works;
drop policy if exists "works_update_own" on public.works;
create policy "works_update_own"
  on public.works
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "works_delete_public" on public.works;
drop policy if exists "works_delete_own" on public.works;
create policy "works_delete_own"
  on public.works
  for delete
  to authenticated
  using (auth.uid() = user_id);

create table if not exists public.comments (
  id uuid primary key default gen_random_uuid(),
  work_id uuid not null references public.works (id) on delete cascade,
  author_name text,
  body text not null,
  user_id uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.comments add column if not exists user_id uuid references auth.users (id) on delete set null;

alter table public.comments enable row level security;

drop policy if exists "comments_select_public" on public.comments;
create policy "comments_select_public"
  on public.comments
  for select
  to anon, authenticated
  using (true);

drop policy if exists "comments_insert_public" on public.comments;
drop policy if exists "comments_insert_own" on public.comments;
create policy "comments_insert_own"
  on public.comments
  for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "comments_delete_public" on public.comments;
drop policy if exists "comments_delete_own" on public.comments;
create policy "comments_delete_own"
  on public.comments
  for delete
  to authenticated
  using (auth.uid() = user_id);

insert into storage.buckets (id, name, public)
values ('covers', 'covers', true)
on conflict (id) do update set public = true;

drop policy if exists "covers_public_read" on storage.objects;
create policy "covers_public_read"
  on storage.objects
  for select
  to anon, authenticated
  using (bucket_id = 'covers');

drop policy if exists "covers_authenticated_insert" on storage.objects;
create policy "covers_authenticated_insert"
  on storage.objects
  for insert
  to authenticated
  with check (bucket_id = 'covers');

drop policy if exists "covers_authenticated_update" on storage.objects;
create policy "covers_authenticated_update"
  on storage.objects
  for update
  to authenticated
  using (bucket_id = 'covers')
  with check (bucket_id = 'covers');

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null,
  username text,
  created_at timestamptz not null default now()
);

alter table public.profiles add column if not exists username text;
alter table public.profiles add column if not exists is_public boolean not null default true;

update public.profiles
set username = coalesce(nullif(username, ''), display_name, 'ユーザー')
where username is null or username = '';

alter table public.profiles enable row level security;

drop policy if exists "profiles_select_public" on public.profiles;
create policy "profiles_select_public"
  on public.profiles
  for select
  to anon, authenticated
  using (true);

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own"
  on public.profiles
  for insert
  to authenticated
  with check (auth.uid() = id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
  on public.profiles
  for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name, username)
  values (
    new.id,
    coalesce(nullif(split_part(new.email, '@', 1), ''), 'ユーザー'),
    coalesce(nullif(split_part(new.email, '@', 1), ''), 'ユーザー')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

insert into public.profiles (id, display_name, username)
select
  users.id,
  coalesce(nullif(split_part(users.email, '@', 1), ''), 'ユーザー'),
  coalesce(nullif(split_part(users.email, '@', 1), ''), 'ユーザー')
from auth.users as users
on conflict (id) do nothing;

alter table public.works drop constraint if exists works_user_id_profiles_fkey;
alter table public.works
  add constraint works_user_id_profiles_fkey
  foreign key (user_id) references public.profiles (id) on delete set null;
