drop policy if exists roster_import_batches_delete_own on public.roster_import_batches;
create policy roster_import_batches_delete_own
on public.roster_import_batches
for delete
to authenticated
using (teacher_id = (select auth.uid()));

grant delete on public.roster_import_batches to authenticated;

revoke all on function private.enforce_google_identity() from public, anon, authenticated;
revoke all on function private.block_password_credentials() from public, anon, authenticated;
