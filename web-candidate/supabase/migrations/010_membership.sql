begin;
create table public.app_members (
 id uuid primary key references auth.users on delete cascade,
 email text not null, joined_at timestamptz not null default now(), last_login_at timestamptz,
 state text not null default 'active' check(state in ('active','suspended')),
 is_operator boolean not null default false,
 monthly_limit bigint not null default 0 check(monthly_limit between 0 and 1000000000)
);
create table public.member_audit (
 id uuid primary key default gen_random_uuid(),actor_id uuid,member_id uuid,
 action text not null,details jsonb not null default '{}',created_at timestamptz not null default now()
);
create table public.member_invites (
 id uuid primary key default gen_random_uuid(),email text not null,token_hash text not null unique,
 created_by uuid not null,created_at timestamptz not null default now(),expires_at timestamptz not null,
 consumed_at timestamptz,consumed_by uuid,revoked boolean not null default false
);
insert into public.app_members(id,email,joined_at,monthly_limit)
 select id,lower(email),created_at,1000000 from auth.users where email is not null;
-- Bootstrap the previously verified workspace owner; never trust client metadata for operator status.
update public.app_members set is_operator=true where id='e4134a88-14e5-4c7d-ab0f-9dda958bd5bd';
insert into public.member_audit(member_id,action,details) select id,'existing_member_imported',jsonb_build_object('monthly_limit',monthly_limit) from public.app_members;
alter table public.app_members enable row level security;
alter table public.member_audit enable row level security;
alter table public.member_invites enable row level security;
revoke all on public.app_members,public.member_audit,public.member_invites from public,anon,authenticated;
grant all on public.app_members,public.member_audit,public.member_invites to service_role;
create function public.active_atlas_member() returns boolean language sql stable security definer set search_path=public as $$
 select exists(select 1 from app_members where id=auth.uid() and state='active');
$$;
revoke all on function public.active_atlas_member() from public,anon;
grant execute on function public.active_atlas_member() to authenticated;
-- Existing RLS still determines ownership/sharing. This adds a deny gate, never a grant.
do $$ declare t record; begin
 for t in select tablename from pg_tables where schemaname='public' and rowsecurity loop
 execute format('create policy active_members_only on public.%I as restrictive for all to authenticated using (public.active_atlas_member()) with check (public.active_atlas_member())',t.tablename);
 end loop;
end $$;
create function public.register_invited_member() returns trigger language plpgsql security definer set search_path=public as $$
declare invitation member_invites;
begin
 update member_invites set consumed_at=now(),consumed_by=new.id
 where token_hash=new.raw_user_meta_data->>'atlas_invite_hash' and email=lower(new.email)
 and expires_at>now() and consumed_at is null and not revoked returning * into invitation;
 if invitation.id is null then raise exception 'Valid invitation required'; end if;
 insert into app_members(id,email) values(new.id,lower(new.email));
 insert into member_audit(actor_id,member_id,action,details) values(new.id,new.id,'registered',jsonb_build_object('invite_id',invitation.id));
 return new;
end $$;
create trigger atlas_invite_registration after insert on auth.users for each row execute function public.register_invited_member();
alter table public.ai_usage_events add column reserved_tokens bigint not null default 0 check(reserved_tokens>=0);
update public.ai_usage_events set reserved_tokens=200000 where status in ('pending','unknown');
create function public.reserve_atlas_ai(p_owner uuid,p_feature text,p_model text,p_reserve bigint) returns uuid language plpgsql security definer set search_path=public as $$
declare member app_members; used bigint; result uuid; start_time timestamptz;
begin
 if p_reserve<1 or p_reserve>1000000 then raise exception 'Invalid reservation'; end if;
 select * into member from app_members where id=p_owner for update;
 if member.id is null or member.state<>'active' then raise exception 'Member inactive'; end if;
 start_time=date_trunc('month',now() at time zone 'Asia/Seoul') at time zone 'Asia/Seoul';
 if exists(select 1 from ai_usage_events where owner_id=p_owner and created_at>=start_time and reserved_tokens>0 and total_tokens>reserved_tokens) then raise exception 'AI_QUOTA_REVIEW_REQUIRED'; end if;
 select coalesce(sum(case when status='reported' then total_tokens else reserved_tokens end),0) into used from ai_usage_events where owner_id=p_owner and created_at>=start_time;
 if used+p_reserve>member.monthly_limit then raise exception 'AI_QUOTA_EXCEEDED'; end if;
 insert into ai_usage_events(owner_id,feature,model,reserved_tokens) values(p_owner,p_feature,p_model,p_reserve) returning id into result;
 return result;
end $$;
create function public.manage_atlas_member(p_actor uuid,p_member uuid,p_state text,p_limit bigint) returns void language plpgsql security definer set search_path=public as $$
declare previous app_members;
begin
 if not exists(select 1 from app_members where id=p_actor and is_operator and state='active') then raise exception 'Forbidden'; end if;
 select * into previous from app_members where id=p_member for update;
 if previous.id is null or (previous.is_operator and p_state<>'active') then raise exception 'Operator settings protected'; end if;
 update app_members set state=p_state,monthly_limit=p_limit where id=p_member;
 insert into member_audit(actor_id,member_id,action,details) values(p_actor,p_member,'settings_changed',jsonb_build_object('before_state',previous.state,'state',p_state,'before_limit',previous.monthly_limit,'monthly_limit',p_limit));
end $$;
revoke all on function public.reserve_atlas_ai(uuid,text,text,bigint),public.manage_atlas_member(uuid,uuid,text,bigint) from public,anon,authenticated;
grant execute on function public.reserve_atlas_ai(uuid,text,text,bigint),public.manage_atlas_member(uuid,uuid,text,bigint) to service_role;
create function public.atlas_member_summary(p_owner uuid default null) returns jsonb language sql stable security definer set search_path=public as $$
 select coalesce(jsonb_agg(row_to_json(r)),'[]'::jsonb) from (
 select m.*,u.email_confirmed_at,u.last_sign_in_at,
 coalesce(sum(e.total_tokens) filter(where e.status='reported'),0) as used_tokens,
 coalesce(sum(e.reserved_tokens) filter(where e.status<>'reported'),0) as held_tokens
 from app_members m join auth.users u on u.id=m.id
 left join ai_usage_events e on e.owner_id=m.id and e.created_at >= (date_trunc('month',now() at time zone 'Asia/Seoul') at time zone 'Asia/Seoul')
 where p_owner is null or m.id=p_owner group by m.id,u.email_confirmed_at,u.last_sign_in_at order by m.joined_at desc
 ) r;
$$;
revoke all on function public.atlas_member_summary(uuid) from public,anon,authenticated;
grant execute on function public.atlas_member_summary(uuid) to service_role;
create function public.settle_atlas_ai(p_owner uuid,p_id uuid,p_report jsonb) returns void language plpgsql security definer set search_path=public as $$
begin
 perform 1 from app_members where id=p_owner for update;
 update ai_usage_events set status=case when p_report ? 'total_tokens' then 'reported' else 'unknown' end,
 input_tokens=(p_report->>'input_tokens')::bigint,output_tokens=(p_report->>'output_tokens')::bigint,
 cached_tokens=(p_report->>'cached_tokens')::bigint,total_tokens=(p_report->>'total_tokens')::bigint,
 response_id=p_report->>'response_id',model=coalesce(p_report->>'model',model)
 where id=p_id and owner_id=p_owner and status='pending';
end $$;
revoke all on function public.settle_atlas_ai(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.settle_atlas_ai(uuid,uuid,jsonb) to service_role;
commit;
