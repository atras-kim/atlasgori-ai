-- Apply in a dedicated Supabase project. Server writes use a service role after ownership checks.
create extension if not exists pgcrypto;
create table public.profiles (id uuid primary key references auth.users on delete cascade,email text not null);
create unique index profiles_email on public.profiles(lower(email));
create function public.on_atlas_user() returns trigger language plpgsql security definer set search_path=public as $$ begin insert into profiles(id,email) values(new.id,lower(new.email)) on conflict(id) do update set email=excluded.email; return new; end $$;
create trigger atlas_user_created after insert or update of email on auth.users for each row execute function public.on_atlas_user();
insert into public.profiles(id,email) select id,lower(email) from auth.users where email is not null on conflict(id) do nothing;
create table public.companies(id uuid primary key default gen_random_uuid(),name text not null);
create table public.company_members(company_id uuid references public.companies on delete cascade,user_id uuid references auth.users on delete cascade,role text not null check(role in ('admin','member')),primary key(company_id,user_id));
create table public.mail_accounts(id uuid primary key default gen_random_uuid(),owner_id uuid not null references auth.users on delete cascade,email text not null,provider text not null check(provider in ('gmail','naver','daum','yahoo','outlook')),ai_enabled boolean not null default false,last_synced_at timestamptz,backfill_cursor text,sync_until timestamptz,created_at timestamptz not null default now(),unique(owner_id,email));
create table public.account_secrets(account_id uuid primary key references public.mail_accounts on delete cascade,ciphertext text not null);
create table public.projects(id uuid primary key default gen_random_uuid(),owner_id uuid not null references auth.users on delete cascade,name text not null check(length(name) between 1 and 120),product text not null default '',company text not null default '',company_id uuid references public.companies,visibility text not null default 'Private' check(visibility in ('Private','Project Shared','Company','Restricted')),brief jsonb,updated_at timestamptz not null default now(),check(visibility <> 'Company' or company_id is not null));
create table public.project_members(project_id uuid references public.projects on delete cascade,user_id uuid references auth.users on delete cascade,primary key(project_id,user_id));
create table public.messages(id uuid primary key default gen_random_uuid(),account_id uuid not null references public.mail_accounts on delete cascade,owner_id uuid not null references auth.users on delete cascade,provider_id text not null,subject text not null,sender text not null,"to" text[] not null default '{}',body text not null default '',received_at timestamptz not null,unread boolean not null default false,project_id uuid references public.projects on delete set null,product text,company text,unique(account_id,provider_id));
create table public.attachments(id uuid primary key default gen_random_uuid(),message_id uuid not null references public.messages on delete cascade,name text not null,size integer not null,type text not null,extraction text not null default '대기',extracted_text text,content_base64 text not null,unique(message_id,name));
create table public.source_candidates(id uuid primary key default gen_random_uuid(),project_id uuid not null references public.projects on delete cascade,name text not null,url text not null,description text not null default '',created_at timestamptz default now(),unique(project_id,url));
create table public.send_intents(id uuid primary key,owner_id uuid not null references auth.users on delete cascade,account_id uuid not null references public.mail_accounts on delete cascade,ciphertext text not null,digest text not null,status text not null default 'prepared' check(status in ('prepared','sending','submitted','uncertain')),expires_at timestamptz not null,provider_id text,created_at timestamptz default now());
create table public.oauth_states(id text primary key,owner_id uuid not null references auth.users on delete cascade,expires_at timestamptz not null,consumed boolean not null default false);
create table public.rate_limits(user_id uuid not null references auth.users on delete cascade,bucket text not null,window_start timestamptz not null,n integer not null,primary key(user_id,bucket));
create function public.take_rate_slot(p_user uuid,p_bucket text,p_max integer) returns boolean language plpgsql security definer set search_path=public as $$ declare total integer; begin
 insert into rate_limits(user_id,bucket,window_start,n) values(p_user,p_bucket,date_trunc('minute',now()),1)
 on conflict(user_id,bucket) do update set n=case when rate_limits.window_start=date_trunc('minute',now()) then rate_limits.n+1 else 1 end,window_start=date_trunc('minute',now()) returning n into total; return total<=p_max; end $$;
revoke all on function public.take_rate_slot(uuid,text,integer) from public,anon,authenticated;
grant execute on function public.take_rate_slot(uuid,text,integer) to service_role;
create function public.can_read_project(p_id uuid) returns boolean language sql stable security definer set search_path=public as $$
 select exists(select 1 from projects p where p.id=p_id and (p.owner_id=auth.uid() or (p.visibility in ('Project Shared','Restricted') and exists(select 1 from project_members m where m.project_id=p.id and m.user_id=auth.uid())) or (p.visibility='Company' and exists(select 1 from company_members c where c.company_id=p.company_id and c.user_id=auth.uid()))));
$$;
create function public.can_read_message(p_id uuid) returns boolean language sql stable security definer set search_path=public as $$
 select exists(select 1 from messages m where m.id=p_id and (m.owner_id=auth.uid() or (m.project_id is not null and can_read_project(m.project_id))));
$$;
revoke all on function public.can_read_project(uuid),public.can_read_message(uuid) from public,anon;
grant execute on function public.can_read_project(uuid),public.can_read_message(uuid) to authenticated;
alter table public.profiles enable row level security;
alter table public.companies enable row level security;
alter table public.company_members enable row level security;
alter table public.projects enable row level security;
alter table public.project_members enable row level security;
alter table public.mail_accounts enable row level security;
alter table public.account_secrets enable row level security;
alter table public.messages enable row level security;
alter table public.attachments enable row level security;
alter table public.source_candidates enable row level security;
alter table public.send_intents enable row level security;
alter table public.oauth_states enable row level security;
alter table public.rate_limits enable row level security;
create policy profile_self on public.profiles for select to authenticated using(id=auth.uid());
create policy company_members_self on public.company_members for select to authenticated using(user_id=auth.uid());
create policy company_visible on public.companies for select to authenticated using(exists(select 1 from company_members where company_id=id and user_id=auth.uid()));
create policy accounts_self on public.mail_accounts for select to authenticated using(owner_id=auth.uid());
create policy projects_visible on public.projects for select to authenticated using(can_read_project(id));
create policy members_visible on public.project_members for select to authenticated using(exists(select 1 from projects p where p.id=project_id and p.owner_id=auth.uid()));
create policy messages_visible on public.messages for select to authenticated using(owner_id=auth.uid() or can_read_project(project_id));
create policy attachments_visible on public.attachments for select to authenticated using(can_read_message(message_id));
create policy sources_visible on public.source_candidates for select to authenticated using(can_read_project(project_id));
revoke all on public.profiles,public.companies,public.company_members,public.projects,public.project_members,public.mail_accounts,public.account_secrets,public.messages,public.attachments,public.source_candidates,public.send_intents,public.oauth_states,public.rate_limits from anon,authenticated;
grant select on public.profiles,public.companies,public.company_members,public.projects,public.project_members,public.mail_accounts,public.messages,public.attachments,public.source_candidates to authenticated;
grant all on public.profiles,public.companies,public.company_members,public.projects,public.project_members,public.mail_accounts,public.account_secrets,public.messages,public.attachments,public.source_candidates,public.send_intents,public.oauth_states,public.rate_limits to service_role;
create index messages_owner_date on public.messages(owner_id,received_at desc);
create index messages_project on public.messages(project_id);
create index attachments_message on public.attachments(message_id);
create index project_member_user on public.project_members(user_id,project_id);
-- Retention maintenance (configure a scheduler before production): delete expired prepared intents,
-- blank ciphertext on old terminal intents, and delete expired oauth_states. Do not retry sending intents.
