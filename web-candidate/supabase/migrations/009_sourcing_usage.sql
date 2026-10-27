begin;
alter table public.ai_usage_events drop constraint ai_usage_events_feature_check;
alter table public.ai_usage_events add constraint ai_usage_events_feature_check
check (feature in ('preview','classification','brief','reply','sourcing'));
commit;
