create table public.ai_usage_events (
 id uuid primary key default gen_random_uuid(), owner_id uuid not null references auth.users on delete cascade,
 feature text not null check(feature in ('preview','classification','brief','reply')),
 model text not null, response_id text unique, created_at timestamptz not null default now(),
 status text not null default 'pending' check(status in ('pending','reported','unknown')),
 input_tokens bigint, output_tokens bigint, cached_tokens bigint, total_tokens bigint,
 check ((status <> 'reported' and input_tokens is null and output_tokens is null and cached_tokens is null and total_tokens is null)
 or (status = 'reported' and input_tokens >= 0 and output_tokens >= 0 and cached_tokens >= 0 and cached_tokens <= input_tokens
 and total_tokens = input_tokens + output_tokens and input_tokens is not null and output_tokens is not null and cached_tokens is not null and total_tokens is not null))
);
create index ai_usage_owner_created on public.ai_usage_events(owner_id,created_at desc);
alter table public.ai_usage_events enable row level security;
create policy ai_usage_self on public.ai_usage_events for select to authenticated using(owner_id=auth.uid());
revoke all on public.ai_usage_events from public,anon,authenticated;
grant select on public.ai_usage_events to authenticated;
grant all on public.ai_usage_events to service_role;
create function public.my_ai_usage() returns jsonb language sql stable security invoker set search_path=public as $$
 with bounds as (select date_trunc('month',now() at time zone 'Asia/Seoul') at time zone 'Asia/Seoul' as start_at, (date_trunc('month',now() at time zone 'Asia/Seoul') + interval '1 month') at time zone 'Asia/Seoul' as end_at),
 events as (select e.* from public.ai_usage_events e,bounds b where e.owner_id=auth.uid() and e.created_at>=b.start_at and e.created_at < b.end_at)
 select jsonb_build_object('month',to_char(now() at time zone 'Asia/Seoul','YYYY-MM'),'timezone','Asia/Seoul',
 'input',coalesce(sum(input_tokens),0),'output',coalesce(sum(output_tokens),0),'cached',coalesce(sum(cached_tokens),0),'total',coalesce(sum(total_tokens),0),
 'requests',count(*),'unconfirmed',count(*) filter(where status <> 'reported'),
 'history',coalesce((select jsonb_agg(to_jsonb(r) order by r.created_at desc) from
 (select id,feature,model,created_at,status,input_tokens,output_tokens,total_tokens from events order by created_at desc limit 10) r),'[]'::jsonb)) from events;
$$;
revoke all on function public.my_ai_usage() from public,anon;
grant execute on function public.my_ai_usage() to authenticated;
