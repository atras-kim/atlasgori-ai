begin;
create table if not exists public.quote_reviews(
 id uuid primary key default gen_random_uuid(),owner_id uuid not null references auth.users on delete cascade,
 project_id uuid not null references public.projects on delete cascade,
 attachment_id uuid not null references public.attachments on delete cascade,
 source_hash text not null,ciphertext text not null,version integer not null default 1 check(version>0),updated_at timestamptz not null default now(),unique(owner_id,attachment_id));
alter table public.quote_reviews enable row level security;
drop policy if exists quote_owner on public.quote_reviews;
create policy quote_owner on public.quote_reviews for select to authenticated using(owner_id=auth.uid() and exists(select 1 from public.messages m join public.attachments a on a.message_id=m.id where a.id=attachment_id and m.owner_id=auth.uid() and m.project_id=quote_reviews.project_id));
revoke all on public.quote_reviews from anon,authenticated;
grant select on public.quote_reviews to authenticated;
grant all on public.quote_reviews to service_role;
create or replace function public.save_quote_review(p_user uuid,p_project uuid,p_attachment uuid,p_hash text,p_ciphertext text,p_version integer)
returns integer language plpgsql security definer set search_path=public as $$
declare v integer;
begin
 perform 1 from public.messages m join public.attachments a on a.message_id=m.id join public.projects p on p.id=m.project_id
 where a.id=p_attachment and m.owner_id=p_user and p.owner_id=p_user and p.id=p_project and md5(a.content_base64)=p_hash for update of m,a,p;
 if not found then raise exception 'source_changed';end if;
 if p_version=0 then
 insert into public.quote_reviews(owner_id,project_id,attachment_id,source_hash,ciphertext) values(p_user,p_project,p_attachment,p_hash,p_ciphertext) on conflict(owner_id,attachment_id) do nothing returning version into v;
 else
 update public.quote_reviews set ciphertext=p_ciphertext,version=version+1,updated_at=now() where owner_id=p_user and attachment_id=p_attachment and project_id=p_project and source_hash=p_hash and version=p_version returning version into v;
 end if;
 return v;
end $$;
revoke all on function public.save_quote_review(uuid,uuid,uuid,text,text,integer) from public,anon,authenticated;
grant execute on function public.save_quote_review(uuid,uuid,uuid,text,text,integer) to service_role;
commit;
