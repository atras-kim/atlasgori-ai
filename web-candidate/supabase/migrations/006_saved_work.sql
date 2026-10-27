create table public.saved_work (
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null references auth.users on delete cascade,
 kind text not null check(kind in ('analysis','draft')),
 ciphertext text not null,
 title_ciphertext text not null,
 version integer not null default 1 check(version>0),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create index saved_work_owner_kind_updated on public.saved_work(owner_id,kind,updated_at desc);
alter table public.saved_work enable row level security;
create policy saved_work_owner_read on public.saved_work for select to authenticated using(owner_id=auth.uid());
revoke all on public.saved_work from public,anon,authenticated;
grant select on public.saved_work to authenticated;
grant all on public.saved_work to service_role;
