-- Run this ONCE in Supabase: SQL Editor > New query > paste > Run

create table if not exists public.papers (
  id bigint generated always as identity primary key,
  major text not null,
  degree text not null,
  semester int not null check (semester between 1 and 8),
  subject text not null,
  year int not null check (year between 1990 and 2100),
  title text not null,
  file_path text not null,
  file_name text not null,
  file_type text not null,
  file_size bigint not null,
  created_at timestamptz not null default now()
);

alter table public.papers enable row level security;

drop policy if exists "anyone can read papers" on public.papers;
drop policy if exists "anyone can add papers" on public.papers;
create policy "anyone can read papers" on public.papers for select using (true);
create policy "anyone can add papers" on public.papers for insert with check (true);

grant select, insert on public.papers to anon, authenticated;

-- Public storage bucket: 5 MB limit, PDF/JPG/PNG/WebP only
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('papers', 'papers', true, 5242880,
        array['application/pdf','image/jpeg','image/png','image/webp'])
on conflict (id) do update
  set public = true,
      file_size_limit = 5242880,
      allowed_mime_types = array['application/pdf','image/jpeg','image/png','image/webp'];

drop policy if exists "anyone can upload papers" on storage.objects;
create policy "anyone can upload papers" on storage.objects
  for insert with check (bucket_id = 'papers');
