-- Perception private artifact storage.
-- Object keys are always namespaced by authenticated user id:
--   <user_id>/<project_id>/<generated-id>-<filename>

insert into storage.buckets (id, name, public)
values ('perception-artifacts', 'perception-artifacts', false)
on conflict (id) do update
set public = excluded.public;

drop policy if exists "perception_artifacts_select_own" on storage.objects;
create policy "perception_artifacts_select_own"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'perception-artifacts'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "perception_artifacts_insert_own" on storage.objects;
create policy "perception_artifacts_insert_own"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'perception-artifacts'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "perception_artifacts_update_own" on storage.objects;
create policy "perception_artifacts_update_own"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'perception-artifacts'
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id = 'perception-artifacts'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "perception_artifacts_delete_own" on storage.objects;
create policy "perception_artifacts_delete_own"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'perception-artifacts'
  and (storage.foldername(name))[1] = auth.uid()::text
);
