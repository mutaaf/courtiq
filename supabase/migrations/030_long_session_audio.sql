-- 030_long_session_audio.sql
-- Long-session voice memo upload pipeline.
--
-- Resumable direct-to-Storage upload from the browser, async transcription
-- via Deepgram URL ingestion + callback webhook, then segmentation.
--
-- Reuses the existing recordings table + status lifecycle
-- (uploading -> transcribing -> parsing -> parsed). Adds:
--   * transcript_request_id            Deepgram request_id (for orphan recovery)
--   * transcript_callback_secret       per-recording HMAC secret for the webhook
--   * transcript_started_at / _completed_at  observability
--   * transcript_cost_usd              Deepgram per-minute cost recorded by the webhook
--   * total_duration_seconds           authoritative duration from Deepgram metadata

alter table recordings
  add column if not exists transcript_request_id text,
  add column if not exists transcript_callback_secret text,
  add column if not exists transcript_started_at timestamptz,
  add column if not exists transcript_completed_at timestamptz,
  add column if not exists transcript_cost_usd numeric(10, 4),
  add column if not exists total_duration_seconds int;

create index if not exists recordings_transcript_request_id_idx
  on recordings (transcript_request_id)
  where transcript_request_id is not null;

create index if not exists recordings_status_started_idx
  on recordings (status, transcript_started_at)
  where status in ('transcribing', 'parsing');
