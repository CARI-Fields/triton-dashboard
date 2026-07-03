-- Lock the board behind login. Run once in Supabase -> SQL Editor.
-- After this, ONLY logged-in users (the shared team account) can read/write.
-- Do this AFTER creating the shared user (Authentication -> Users -> Add user).

-- Replace the public (anon) policies with authenticated-only ones.
drop policy if exists "public access" on modules;
drop policy if exists "auth access"   on modules;
create policy "auth access" on modules for all to authenticated using (true) with check (true);

drop policy if exists "public access" on tasks;
drop policy if exists "auth access"   on tasks;
create policy "auth access" on tasks for all to authenticated using (true) with check (true);

drop policy if exists "public access" on members;
drop policy if exists "auth access"   on members;
create policy "auth access" on members for all to authenticated using (true) with check (true);

drop policy if exists "public access" on experiments;
drop policy if exists "auth access"   on experiments;
create policy "auth access" on experiments for all to authenticated using (true) with check (true);

drop policy if exists "public access" on attachments;
drop policy if exists "auth access"   on attachments;
create policy "auth access" on attachments for all to authenticated using (true) with check (true);

-- Storage: require login to upload/change images. Reads stay public because the
-- app shows images via <img src=public-url> and the file paths contain random
-- UUIDs. (Ask if you want images fully private via signed URLs.)
drop policy if exists "task-images insert" on storage.objects;
drop policy if exists "task-images update" on storage.objects;
drop policy if exists "task-images delete" on storage.objects;
create policy "task-images insert" on storage.objects for insert to authenticated with check (bucket_id = 'task-images');
create policy "task-images update" on storage.objects for update to authenticated using (bucket_id = 'task-images');
create policy "task-images delete" on storage.objects for delete to authenticated using (bucket_id = 'task-images');
