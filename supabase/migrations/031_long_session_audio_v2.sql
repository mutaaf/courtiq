-- 031_long_session_audio_v2.sql
-- Efficiency pass on the long-session pipeline:
--   1. Cache segmentation result on the recording row so /capture/review is instant.
--   2. Add the recordings table to the Realtime publication for live status updates.
--   3. Create the 'audio' Storage bucket + RLS policies that the tus resumable
--      upload relies on (auth uid as the second path segment).

-- 1. Segmentation cache --------------------------------------------------------

alter table recordings
  add column if not exists segmentation_result jsonb,
  add column if not exists segmentation_completed_at timestamptz;

-- 2. Realtime ------------------------------------------------------------------

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'recordings'
  ) then
    alter publication supabase_realtime add table recordings;
  end if;
end $$;

-- 3. Audio bucket + RLS --------------------------------------------------------
-- Idempotent: skip if the bucket exists. We allow files up to 500 MB which
-- comfortably covers a 4-hour recording at common bitrates.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'audio',
  'audio',
  false,
  524288000, -- 500 MB
  array[
    'audio/webm', 'audio/ogg', 'audio/mp4', 'audio/m4a', 'audio/x-m4a',
    'audio/aac', 'audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/x-wav',
    'audio/flac', 'video/mp4', 'video/quicktime'
  ]
)
on conflict (id) do nothing;

-- Path layout enforced by /api/voice/recordings/init: recordings/{coach_id}/{recording_id}.{ext}
-- The second segment is the auth uid, so we authorize on (storage.foldername(name))[2].

drop policy if exists "audio_owner_insert" on storage.objects;
create policy "audio_owner_insert"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'audio'
    and (storage.foldername(name))[1] = 'recordings'
    and (storage.foldername(name))[2] = auth.uid()::text
  );

drop policy if exists "audio_owner_update" on storage.objects;
create policy "audio_owner_update"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'audio'
    and (storage.foldername(name))[1] = 'recordings'
    and (storage.foldername(name))[2] = auth.uid()::text
  )
  with check (
    bucket_id = 'audio'
    and (storage.foldername(name))[1] = 'recordings'
    and (storage.foldername(name))[2] = auth.uid()::text
  );

drop policy if exists "audio_owner_select" on storage.objects;
create policy "audio_owner_select"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'audio'
    and (storage.foldername(name))[1] = 'recordings'
    and (storage.foldername(name))[2] = auth.uid()::text
  );

drop policy if exists "audio_owner_delete" on storage.objects;
create policy "audio_owner_delete"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'audio'
    and (storage.foldername(name))[1] = 'recordings'
    and (storage.foldername(name))[2] = auth.uid()::text
  );
