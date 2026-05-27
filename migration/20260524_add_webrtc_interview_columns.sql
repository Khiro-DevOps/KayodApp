do $$
begin
  create extension if not exists pgcrypto;
exception
  when duplicate_object then null;
end $$;

alter table if exists interviews add column if not exists room_id uuid default gen_random_uuid();
alter table if exists interviews add column if not exists hr_notes text;
alter table if exists interviews add column if not exists webrtc_started_at timestamptz;
alter table if exists interviews add column if not exists webrtc_ended_at timestamptz;

update interviews set room_id = gen_random_uuid() where room_id is null;