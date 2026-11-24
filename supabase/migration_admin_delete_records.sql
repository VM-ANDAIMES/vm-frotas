begin;

drop policy if exists "admins delete maintenance" on public.maintenance;
create policy "admins delete maintenance"
on public.maintenance
for delete
to authenticated
using (public.is_admin());

drop policy if exists "admins delete fuel" on public.fuel_logs;
create policy "admins delete fuel"
on public.fuel_logs
for delete
to authenticated
using (public.is_admin());

commit;
