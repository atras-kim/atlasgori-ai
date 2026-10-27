alter table public.attachments drop constraint attachments_document_kind_check;
alter table public.attachments add constraint attachments_document_kind_check check(document_kind in ('quote','brochure','contract','review'));
create or replace function public.document_classification(p_name text,p_sender text)
returns jsonb language plpgsql immutable set search_path=public as $$
declare n text := lower(p_name); q boolean; b boolean; c boolean; emails text[]; email text; domain text;
  k text := 'review'; company text := ''; label text := '';
begin
  -- Only explicit filename keywords. Ambiguous files never inherit the email subject's category.
  q := n ~ '(^|[^a-z])(quotation|quote|proforma)([^a-z]|$)' or n ~ '견적서|견적([^가-힣]|$)|가격표';
  b := n ~ '(^|[^a-z])(brochure|catalog|catalogue)([^a-z]|$)' or n ~ '브로셔|브로슈어|카탈로그|카다로그|제품소개';
  c := n ~ '(^|[^a-z])(contract|agreement|nda)([^a-z]|$)' or n ~ '계약서|비밀유지';
  select array_agg(lower(x[1])) into emails from regexp_matches(p_sender,
    '([a-zA-Z0-9.!#$%&''*+/=?^_`{|}~-]+@[a-zA-Z0-9-]+(\.[a-zA-Z0-9-]+)+)','g') x;
  if array_length(emails,1)=1 then
    email := emails[1]; domain := split_part(email,'@',2);
    if domain in ('gmail.com','googlemail.com','naver.com','daum.net','hanmail.net')
       or domain ~ '^(yahoo|hotmail|outlook|live|gmx|protonmail|proton|mail|icloud|aol|qq|163)\.' then
      company := 'sender:'||email; label := email;
    else company := 'domain:'||domain; label := domain;
    end if;
  end if;
  if c and not q and not b then k := 'contract';
  elsif q and not b and not c then k := 'quote';
  elsif b and not q and not c and company <> '' then k := 'brochure'; end if;
  return jsonb_build_object('kind',k,'company_key',company,'company_label',label);
end $$;

create or replace function public.correct_document(p_user uuid,p_id uuid,p_kind text,p_company text)
returns boolean language plpgsql security invoker set search_path=public as $$
declare changed integer;
begin
  if p_kind not in ('quote','brochure','contract','review') or p_kind is null or p_company is null
     or length(trim(p_company))>160 or (p_kind='brochure' and length(trim(p_company))=0)
     or p_company ~ '[[:cntrl:]]' then raise exception 'Invalid document classification'; end if;
  update attachments a set document_kind=p_kind,company_label=trim(p_company),
    company_key=case when trim(p_company)='' then '' else 'manual:'||lower(trim(p_company)) end,document_manual=true
  from messages m where a.id=p_id and m.id=a.message_id and m.owner_id=p_user;
  get diagnostics changed = row_count; return changed=1;
end $$;
revoke all on function public.correct_document(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.correct_document(uuid,uuid,text,text) to service_role;

with classified as (
 select a.id,document_classification(a.name,m.sender) as result
 from public.attachments a join public.messages m on m.id=a.message_id where not a.document_manual
)
update public.attachments a set document_kind=c.result->>'kind',company_key=c.result->>'company_key',company_label=c.result->>'company_label'
from classified c where c.id=a.id and not a.document_manual;

-- Explicit user organization of a saved analysis; no AI call and no send authority.
create function public.organize_saved_message(p_user uuid,p_message uuid,p_name text,p_product text,p_company text,p_subject text,p_sender text)
returns jsonb language plpgsql security definer set search_path=public as $$
declare m messages%rowtype; target uuid; normalized text;
begin
 if length(trim(p_name)) not between 1 and 120 or p_name is null then raise exception 'Invalid project name'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_user::text,0));
 select * into m from messages where id=p_message and owner_id=p_user for update;
 if not found then raise exception 'Message unavailable'; end if;
 if m.subject is distinct from p_subject or m.sender is distinct from p_sender then raise exception 'Source changed'; end if;
 if m.project_id is not null then return jsonb_build_object('changed',false,'projectId',m.project_id); end if;
 normalized=lower(regexp_replace(trim(p_name),'\s+',' ','g'));
 select id into target from projects where owner_id=p_user and visibility='Private'
  and lower(regexp_replace(trim(name),'\s+',' ','g'))=normalized order by id limit 1 for update;
 if target is null then
  insert into projects(owner_id,name,product,company,visibility)
  values(p_user,trim(p_name),left(p_product,200),left(p_company,200),'Private') returning id into target;
 end if;
 update messages set project_id=target,product=coalesce(product,left(p_product,200)),company=coalesce(company,left(p_company,200)) where id=m.id and project_id is null;
 return jsonb_build_object('changed',true,'projectId',target);
end $$;
revoke all on function public.organize_saved_message(uuid,uuid,text,text,text,text,text) from public,anon,authenticated;
grant execute on function public.organize_saved_message(uuid,uuid,text,text,text,text,text) to service_role;
