// Minimal platform tables created by supplied Supabase services before app migrations.
export const testAuthSchema = `
  create schema auth;
  create table auth.users (
    id uuid primary key,
    email text,
    invited_at timestamptz,
    email_confirmed_at timestamptz,
    encrypted_password text,
    raw_user_meta_data jsonb,
    last_sign_in_at timestamptz
  );
  create function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  grant usage on schema auth to anon, authenticated;
  grant execute on function auth.uid() to anon, authenticated;
`;

export const testStorageSchema = `
  create schema storage;
  create table storage.buckets (
    id text primary key,
    name text unique not null,
    public boolean not null default false,
    file_size_limit bigint,
    allowed_mime_types text[]
  );
  create table storage.objects (
    bucket_id text not null references storage.buckets(id),
    name text not null,
    primary key (bucket_id, name)
  );
  alter table storage.objects enable row level security;
  grant usage on schema storage to anon, authenticated, service_role;
  grant select on storage.objects to anon;
  grant select, insert, update, delete on storage.objects to authenticated, service_role;
`;
