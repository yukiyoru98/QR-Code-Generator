-- Supabase PostgreSQL schema for dynamic QR system

create extension if not exists pgcrypto;

create table if not exists public.qr_links (
  id uuid primary key default gen_random_uuid(),
  token text not null unique,
  original_url text not null,
  normalized_url text not null,
  short_url text not null,
  deleted_at timestamptz null,
  expires_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_qr_links_token on public.qr_links (token);
create index if not exists idx_qr_links_deleted_at on public.qr_links (deleted_at);
create index if not exists idx_qr_links_expires_at on public.qr_links (expires_at);

create table if not exists public.scan_events (
  id bigserial primary key,
  token text not null references public.qr_links(token) on delete cascade,
  user_agent text not null default '',
  referer text not null default '',
  ip_hash text not null default '',
  country text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists idx_scan_events_token_created_at on public.scan_events (token, created_at);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_qr_links_updated_at on public.qr_links;

create trigger trg_qr_links_updated_at
before update on public.qr_links
for each row
execute function public.set_updated_at();
