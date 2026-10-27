-- Logical folders reference original attachments; no public storage URLs or file copies.
alter table public.attachments add column document_kind text not null default 'review'
  check (document_kind in ('quote','brochure','review'));
alter table public.attachments add column company_key text not null default '';
alter table public.attachments add column company_label text not null default '';
alter table public.attachments add column document_manual boolean not null default false;

create function public.document_classification(p_name text,p_sender text)
returns jsonb language plpgsql immutable set search_path=public as $$
declare n text := lower(p_name); q boolean; b boolean; emails text[]; email text; domain text;
  k text := 'review'; company text := ''; label text := '';
begin
  -- Only explicit filename keywords. Ambiguous files never inherit the email subject's category.
  q := n ~ '(^|[^a-z])(quotation|quote|proforma)([^a-z]|$)' or n ~ '견적서|견적([^가-힣]|$)|가격표';
  b := n ~ '(^|[^a-z])(brochure|catalog|catalogue)([^a-z]|$)' or n ~ '브로셔|브로슈어|카탈로그|카다로그|제품소개';
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
  if q and not b then k := 'quote';
  elsif b and not q and company <> '' then k := 'brochure'; end if;
  return jsonb_build_object('kind',k,'company_key',company,'company_label',label);
end $$;
revoke all on function public.document_classification(text,text) from public,anon,authenticated;
grant execute on function public.document_classification(text,text) to service_role;

create function public.classify_document_attachment() returns trigger language plpgsql set search_path=public as $$
declare result jsonb; sender_text text;
begin
  if new.document_manual then return new; end if;
  select sender into sender_text from messages where id=new.message_id;
  result := document_classification(new.name,coalesce(sender_text,''));
  new.document_kind := result->>'kind'; new.company_key := result->>'company_key';
  new.company_label := result->>'company_label'; return new;
end $$;
revoke all on function public.classify_document_attachment() from public,anon,authenticated;
grant execute on function public.classify_document_attachment() to service_role;
create trigger document_attachment_classification before insert or update of name,message_id,document_manual
  on public.attachments for each row execute function public.classify_document_attachment();
-- Safe to rerun this backfill: manual corrections and original bytes are unchanged.
update public.attachments set name=name where not document_manual;

create view public.document_library with (security_invoker=true) as
 select a.id,a.message_id,a.name,a.size,a.type,a.document_kind,a.company_key,a.company_label,a.document_manual,
   case when a.document_kind='brochure' then a.company_key else '' end as folder_key,
   m.project_id,m.owner_id,m.sender,m.subject,m.received_at
 from public.attachments a join public.messages m on m.id=a.message_id;
revoke all on public.document_library from public,anon,authenticated;
grant select on public.document_library to authenticated,service_role;

create function public.document_folders(p_project uuid)
returns table(document_kind text,folder_key text,company_label text,file_count bigint)
language sql stable security invoker set search_path=public as $$
  select d.document_kind,d.folder_key,
    case when d.document_kind='brochure' then min(d.company_label) else '' end,count(*)
  from document_library d where d.project_id is not distinct from p_project
  group by d.document_kind,d.folder_key order by d.document_kind,d.folder_key;
$$;
revoke all on function public.document_folders(uuid) from public,anon;
grant execute on function public.document_folders(uuid) to authenticated,service_role;

create function public.correct_document(p_user uuid,p_id uuid,p_kind text,p_company text)
returns boolean language plpgsql security invoker set search_path=public as $$
declare changed integer;
begin
  if p_kind not in ('quote','brochure','review') or p_kind is null or p_company is null
     or length(trim(p_company))>160 or (p_kind='brochure' and length(trim(p_company))=0)
     or p_company ~ '[[:cntrl:]]' then raise exception 'Invalid document classification'; end if;
  update attachments a set document_kind=p_kind,company_label=trim(p_company),
    company_key=case when trim(p_company)='' then '' else 'manual:'||lower(trim(p_company)) end,document_manual=true
  from messages m where a.id=p_id and m.id=a.message_id and m.owner_id=p_user;
  get diagnostics changed = row_count; return changed=1;
end $$;
revoke all on function public.correct_document(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.correct_document(uuid,uuid,text,text) to service_role;
create index attachment_document_folder on public.attachments(document_kind,company_key);
