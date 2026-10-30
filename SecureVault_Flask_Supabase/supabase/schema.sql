create extension if not exists pgcrypto;

create type public.app_role as enum ('vendor','requester','verifier','approver','admin');
create type public.deposit_status as enum ('draft','submitted','verified','approved','rejected','renewed','released','forfeited');

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  role public.app_role not null default 'vendor',
  department text,
  created_at timestamptz not null default now()
);

create table if not exists public.vendors (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  vendor_name text not null,
  email text,
  created_at timestamptz not null default now()
);

create table if not exists public.deposits (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id),
  vendor_name text not null,
  fdr_number text not null,
  bank_name text not null,
  amount numeric(14,2) not null check (amount > 0),
  issue_date date not null,
  maturity_date date not null,
  department text,
  beneficiary text,
  status public.deposit_status not null default 'submitted',
  verification_notes text,
  verified_by uuid references auth.users(id),
  approval_notes text,
  approved_by uuid references auth.users(id),
  closure_notes text,
  closed_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (maturity_date >= issue_date)
);

create unique index if not exists deposits_fdr_number_unique on public.deposits (lower(fdr_number), lower(bank_name));

create table if not exists public.documents (
  id uuid primary key default gen_random_uuid(),
  deposit_id uuid not null references public.deposits(id) on delete cascade,
  owner_id uuid not null references auth.users(id),
  storage_path text not null,
  original_filename text not null,
  content_type text,
  uploaded_at timestamptz not null default now()
);

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid not null references auth.users(id),
  deposit_id uuid references public.deposits(id) on delete set null,
  action text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  deposit_id uuid references public.deposits(id) on delete cascade,
  title text not null,
  message text not null,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists deposits_owner_idx on public.deposits(owner_id);
create index if not exists deposits_maturity_idx on public.deposits(maturity_date);
create index if not exists audit_logs_deposit_idx on public.audit_logs(deposit_id, created_at desc);

-- Keep updated_at current.
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;

drop trigger if exists deposits_updated_at on public.deposits;
create trigger deposits_updated_at before update on public.deposits
for each row execute function public.set_updated_at();

-- Create a profile for each new auth user. Role defaults to vendor; privileged roles must be assigned by an admin.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name, role)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name',''), 'vendor')
  on conflict (id) do nothing;
  return new;
end; $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
for each row execute procedure public.handle_new_user();
