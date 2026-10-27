alter table public.projects add column evidence_version bigint not null default 0;
-- Evidence mutations and project visibility writes serialize on the project row.
create function public.invalidate_project_evidence() returns trigger language plpgsql security definer set search_path=public as $$ begin
 if tg_op='DELETE' or tg_op='UPDATE' then update projects set evidence_version=evidence_version+1,brief=null where id=old.project_id; end if;
 if tg_op='INSERT' or tg_op='UPDATE' then update projects set evidence_version=evidence_version+1,brief=null where id=new.project_id; end if;
 return null; end $$;
create trigger invalidate_evidence after insert or delete or update of project_id,body,subject on public.messages for each row execute function public.invalidate_project_evidence();
create function public.invalidate_attachment_evidence() returns trigger language plpgsql security definer set search_path=public as $$ declare mid uuid; begin
 mid=case when tg_op='DELETE' then old.message_id else new.message_id end;
 update projects set evidence_version=evidence_version+1,brief=null where id=(select project_id from messages where id=mid); return null; end $$;
create trigger invalidate_attachment after insert or delete or update of content_base64 on public.attachments for each row execute function public.invalidate_attachment_evidence();
create function public.assign_private_classification(p_user uuid,p_message uuid,p_project uuid,p_product text,p_company text) returns void language plpgsql security definer set search_path=public as $$ declare target uuid; begin
 if p_project is not null then select id into target from projects where id=p_project and owner_id=p_user and visibility='Private' for update; end if;
 update messages set product=p_product,company=p_company,project_id=target where id=p_message and owner_id=p_user and project_id is null;
 end $$;
revoke all on function public.assign_private_classification(uuid,uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.assign_private_classification(uuid,uuid,uuid,text,text) to service_role;
