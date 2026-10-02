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

alter table public.works drop constraint if exists works_category_check;
alter table public.works
  add constraint works_category_check
  check (category in ('book', 'movie', 'anime', 'music'));

alter table public.works enable row level security;

drop policy if exists "works_select_public" on public.works;
drop policy if exists "works_select_own" on public.works;
create policy "works_select_own"
  on public.works
  for select
  to authenticated
  using (auth.uid() = user_id);

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
