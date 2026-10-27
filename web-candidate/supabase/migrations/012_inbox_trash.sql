-- ATLAS Inbox organization only; retain provider mail and project evidence.
alter table public.messages add column if not exists inbox_trashed_at timestamptz;
create index if not exists messages_inbox_trash on public.messages(owner_id,inbox_trashed_at);
