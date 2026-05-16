do $$
begin
  if exists (select 1 from pg_type where typname = 'notification_type') then
    if not exists (
      select 1
      from pg_enum e
      join pg_type t on t.oid = e.enumtypid
      where t.typname = 'notification_type'
        and e.enumlabel = 'interview_rescheduled'
    ) then
      alter type notification_type add value 'interview_rescheduled';
    end if;
  end if;
end
$$;