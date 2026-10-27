alter table public.mail_accounts add column automation_enabled boolean not null default false;
alter table public.projects add column auto_created_at timestamptz;
alter table public.messages add column assistance_version bigint not null default 0;
create table public.mail_assistance (
 message_id uuid primary key references public.messages on delete cascade,
 owner_id uuid not null references auth.users on delete cascade,
 source_subject text not null, source_body text not null, source_version bigint not null,
 reply jsonb not null, created_at timestamptz not null default now()
);
alter table public.mail_assistance enable row level security;
create policy assistance_self on public.mail_assistance for select to authenticated using(owner_id=auth.uid());
revoke all on public.mail_assistance from public,anon,authenticated;
grant select on public.mail_assistance to authenticated;
grant all on public.mail_assistance to service_role;

-- One owner lock serializes retries and automatic project creation. Never move an assigned message.
create function public.save_mail_assistance(p_user uuid,p_message uuid,p_project uuid,p_name text,p_product text,p_company text,p_reply jsonb,p_subject text,p_body text,p_sender text,p_automatic boolean,p_version bigint)
returns boolean language plpgsql security definer set search_path=public as $$
declare m messages%rowtype; a mail_accounts%rowtype; target uuid; normalized text;
begin
 perform pg_advisory_xact_lock(hashtextextended(p_user::text,0));
 select * into m from messages where id=p_message and owner_id=p_user for update;
 if not found or m.subject<>p_subject or m.body<>p_body or m.sender<>p_sender or m.assistance_version<>p_version then return false; end if;
 select * into a from mail_accounts where id=m.account_id and owner_id=p_user for share;
 if not found or not a.ai_enabled or (p_automatic and not a.automation_enabled) then return false; end if;
 if m.project_id is null then
   if p_project is not null then
     select id into target from projects where id=p_project and owner_id=p_user and visibility='Private' for update;
   elsif a.automation_enabled and length(trim(p_name)) between 1 and 120 then
     normalized=lower(regexp_replace(trim(p_name),'\s+',' ','g'));
     select id into target from projects where owner_id=p_user and visibility='Private'
       and lower(regexp_replace(trim(name),'\s+',' ','g'))=normalized order by id limit 1 for update;
     if target is null and (select count(*) from projects where owner_id=p_user and auto_created_at>now()-interval '1 day')<20 then
       insert into projects(owner_id,name,product,company,visibility,auto_created_at)
       values(p_user,trim(p_name),left(p_product,200),left(p_company,200),'Private',now()) returning id into target;
     end if;
   end if;
   update messages set project_id=target,product=left(p_product,200),company=left(p_company,200) where id=m.id;
 else
   update messages set product=coalesce(product,left(p_product,200)),company=coalesce(company,left(p_company,200)) where id=m.id;
 end if;
 if p_reply is not null then
   insert into mail_assistance(message_id,owner_id,source_subject,source_body,source_version,reply)
   values(m.id,p_user,p_subject,p_body,p_version,p_reply) on conflict(message_id) do nothing;
 end if;
 return true;
end $$;
revoke all on function public.save_mail_assistance(uuid,uuid,uuid,text,text,text,jsonb,text,text,text,boolean,bigint) from public,anon,authenticated;
grant execute on function public.save_mail_assistance(uuid,uuid,uuid,text,text,text,jsonb,text,text,text,boolean,bigint) to service_role;
-- A changed source invalidates its suggestion, including late UI acceptance.
create function public.invalidate_mail_assistance() returns trigger language plpgsql security definer set search_path=public as $$ begin
 if old.body is distinct from new.body or old.subject is distinct from new.subject or old.sender is distinct from new.sender then
   delete from mail_assistance where message_id=new.id;
   update messages set assistance_version=assistance_version+1 where id=new.id;
 end if; return null;
end $$;
create trigger invalidate_assistance after update of body,subject,sender on public.messages for each row execute function public.invalidate_mail_assistance();

create function public.invalidate_assistance_attachment() returns trigger language plpgsql security definer set search_path=public as $$
declare mid uuid; begin
 mid=case when tg_op='DELETE' then old.message_id else new.message_id end;
 update messages set assistance_version=assistance_version+1 where id=mid;
 delete from mail_assistance where message_id=mid;
 return null;
end $$;
create trigger invalidate_assistance_attachment after insert or delete or update of content_base64,name,type on public.attachments for each row execute function public.invalidate_assistance_attachment();
