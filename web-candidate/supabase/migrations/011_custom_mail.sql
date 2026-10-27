-- Extend supported providers; ownership and secret policies are unchanged.
begin;
alter table public.mail_accounts drop constraint mail_accounts_provider_check;
alter table public.mail_accounts add constraint mail_accounts_provider_check
  check(provider in ('gmail','naver','daum','yahoo','outlook','custom'));
commit;
