-- Ensure resumes table insert policy uses auth.uid() owner check
alter table if exists public.resumes enable row level security;

drop policy if exists "resumes_insert" on public.resumes;
create policy "resumes_insert"
	on public.resumes
	for insert
	to authenticated
	with check (candidate_id = auth.uid());

-- Storage RLS for resumes bucket
-- NOTE: Do not run ALTER TABLE on storage.objects here.
-- Supabase manages this table and non-owner roles can hit:
-- "must be owner of table objects".

-- Expected object path: <auth.uid()>/<filename>
drop policy if exists "resumes_bucket_select_own" on storage.objects;
create policy "resumes_bucket_select_own"
	on storage.objects
	for select
	to authenticated
	using (
		bucket_id = 'resumes'
		and (storage.foldername(name))[1] = auth.uid()::text
	);

drop policy if exists "resumes_bucket_insert_own" on storage.objects;
create policy "resumes_bucket_insert_own"
	on storage.objects
	for insert
	to authenticated
	with check (
		bucket_id = 'resumes'
		and (storage.foldername(name))[1] = auth.uid()::text
	);

drop policy if exists "resumes_bucket_update_own" on storage.objects;
create policy "resumes_bucket_update_own"
	on storage.objects
	for update
	to authenticated
	using (
		bucket_id = 'resumes'
		and (storage.foldername(name))[1] = auth.uid()::text
	)
	with check (
		bucket_id = 'resumes'
		and (storage.foldername(name))[1] = auth.uid()::text
	);

drop policy if exists "resumes_bucket_delete_own" on storage.objects;
create policy "resumes_bucket_delete_own"
	on storage.objects
	for delete
	to authenticated
	using (
		bucket_id = 'resumes'
		and (storage.foldername(name))[1] = auth.uid()::text
	);
