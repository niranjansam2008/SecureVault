-- Enable RLS on all application tables.
alter table public.profiles enable row level security;
alter table public.vendors enable row level security;
alter table public.deposits enable row level security;
alter table public.documents enable row level security;
alter table public.audit_logs enable row level security;
alter table public.notifications enable row level security;

create or replace function public.current_role()
returns public.app_role language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid()
$$;

create or replace function public.is_staff()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.current_role() in ('requester','verifier','approver','admin'), false)
$$;

-- Profiles: users can read their own profile; staff can read profiles for operational workflows.
drop policy if exists "profile read" on public.profiles;
create policy "profile read" on public.profiles for select to authenticated
using (id = auth.uid() or public.is_staff());

-- No client-side profile UPDATE policy: users must not be able to promote
-- themselves by changing the role column. Administrators assign roles through
-- a trusted admin workflow or the Supabase SQL editor.

-- Vendor rows: owner or staff can read; user can create own vendor row.
drop policy if exists "vendors read" on public.vendors;
create policy "vendors read" on public.vendors for select to authenticated
using (user_id = auth.uid() or public.is_staff());

drop policy if exists "vendors insert own" on public.vendors;
create policy "vendors insert own" on public.vendors for insert to authenticated
with check (user_id = auth.uid());

-- Deposits: vendor sees own; staff can see all. Owners can submit; staff workflow handled by Flask with caller JWT.
drop policy if exists "deposits read" on public.deposits;
create policy "deposits read" on public.deposits for select to authenticated
using (owner_id = auth.uid() or public.is_staff());

drop policy if exists "deposits insert own" on public.deposits;
create policy "deposits insert own" on public.deposits for insert to authenticated
with check (owner_id = auth.uid() and public.current_role() in ('vendor','requester','admin'));

drop policy if exists "deposits update staff" on public.deposits;
create policy "deposits update staff" on public.deposits for update to authenticated
using (public.is_staff()) with check (public.is_staff());

-- Documents: owner or staff can read; owner can attach own document.
drop policy if exists "documents read" on public.documents;
create policy "documents read" on public.documents for select to authenticated
using (owner_id = auth.uid() or public.is_staff());

drop policy if exists "documents insert own" on public.documents;
create policy "documents insert own" on public.documents for insert to authenticated
with check (owner_id = auth.uid());

-- Audit trail: visible to staff and actor; inserts only by authenticated actor.
drop policy if exists "audit read" on public.audit_logs;
create policy "audit read" on public.audit_logs for select to authenticated
using (actor_id = auth.uid() or public.is_staff());

drop policy if exists "audit insert actor" on public.audit_logs;
create policy "audit insert actor" on public.audit_logs for insert to authenticated
with check (actor_id = auth.uid());

drop policy if exists "notifications own read" on public.notifications;
create policy "notifications own read" on public.notifications for select to authenticated
using (user_id = auth.uid());

-- Private bucket. Create it if absent.
insert into storage.buckets (id, name, public)
values ('fdr-documents', 'fdr-documents', false)
on conflict (id) do update set public = false;

drop policy if exists "FDR docs read owner or staff" on storage.objects;
create policy "FDR docs read owner or staff" on storage.objects for select to authenticated
using (bucket_id = 'fdr-documents' and (
  (storage.foldername(name))[1] = auth.uid()::text or public.is_staff()
));

drop policy if exists "FDR docs upload own folder" on storage.objects;
create policy "FDR docs upload own folder" on storage.objects for insert to authenticated
with check (bucket_id = 'fdr-documents' and (storage.foldername(name))[1] = auth.uid()::text);
