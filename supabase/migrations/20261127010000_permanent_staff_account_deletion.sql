-- Permanent staff account deletion for active Super Administrators.
-- Allows permanent Supabase Auth user removal while preserving a minimal,
-- non-login historical identity row in public.account so cemetery records,
-- photos, and audit attribution stay intact.
begin;

-- Require Super Administrator migration before installing permanent deletion.
do $$
begin
  if not exists (select 1 from public.role where role_name = 'SUPER_ADMIN') then
    raise exception 'Apply migration 20261126010000 before permanent staff account deletion.';
  end if;
end;
$$;

-- Track confirmed permanent deletion on the retained historical account stub.
alter table public.account add column if not exists deleted_at timestamptz;

alter table public.account drop constraint if exists account_deleted_consistency_check;
alter table public.account add constraint account_deleted_consistency_check
  check (deleted_at is null or (not is_active and account_status = 'REVOKED' and deactivated_at is not null));

-- Allow removing auth.users(id) after the controlled deletion flow blocks the
-- account. Protect new inserts with a BEFORE INSERT trigger so account rows
-- still require a real auth.users identity at creation time.
alter table public.account drop constraint if exists account_account_id_fkey;

create or replace function staff_private.require_auth_user_on_insert()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
begin
  if not exists (select 1 from auth.users where id = new.account_id) then
    raise exception 'A valid authentication user is required to create a staff account.'
      using errcode = '23503';
  end if;
  return new;
end;
$$;

revoke all on function staff_private.require_auth_user_on_insert()
  from public, anon, authenticated, service_role;

drop trigger if exists account_require_auth_user_on_insert on public.account;
create trigger account_require_auth_user_on_insert
before insert on public.account
for each row execute function staff_private.require_auth_user_on_insert();

-- Strict active Super Administrator check for permanent deletion (never falls back to ADMIN).
create or replace function staff_private.is_super_admin(p_id uuid)
returns boolean
language sql
stable
security invoker
set search_path = pg_catalog, pg_temp
as $$
  select exists (
    select 1
      from public.account a
      join public.role r using (role_id)
     where a.account_id = p_id
       and a.is_active
       and a.account_status = 'ACTIVE'
       and a.deleted_at is null
       and r.role_name = 'SUPER_ADMIN'
  );
$$;

create or replace function staff_private.require_super_admin(p_id uuid)
returns void
language plpgsql
stable
security invoker
set search_path = pg_catalog, pg_temp
as $$
begin
  if not staff_private.is_super_admin(p_id) then
    raise exception 'An active Super Administrator is required.' using errcode = '42501';
  end if;
end;
$$;

create or replace function public.can_permanently_delete_staff_accounts()
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, pg_temp
as $$
  select staff_private.is_super_admin(auth.uid());
$$;

revoke all on function staff_private.is_super_admin(uuid),
  staff_private.require_super_admin(uuid),
  public.can_permanently_delete_staff_accounts()
  from public, anon, authenticated, service_role;
grant execute on function public.can_permanently_delete_staff_accounts() to authenticated;

-- Prevent permanently deleted stubs from being modified or reactivated, and
-- preserve last-active-Super-Administrator protection on every update or delete.
create or replace function staff_private.protect_super_admin()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  old_role text;
  new_role text;
begin
  if old.deleted_at is not null then
    raise exception 'Permanently deleted staff accounts cannot be restored or modified.'
      using errcode = '42501';
  end if;

  if new.role_id is not distinct from old.role_id
     and new.account_status is not distinct from old.account_status
     and new.is_active is not distinct from old.is_active
     and new.deleted_at is not distinct from old.deleted_at then
    return new;
  end if;

  perform staff_private.lock_lifecycle();
  select role_name into old_role from public.role where role_id = old.role_id;
  select role_name into new_role from public.role where role_id = new.role_id;

  if auth.uid() = old.account_id and (
      new.role_id is distinct from old.role_id
      or (old.is_active and not new.is_active)
      or new.deleted_at is not null
  ) then
    raise exception 'You cannot change your own staff role, suspend, or delete your own account.'
      using errcode = '42501';
  end if;

  if old_role = 'SUPER_ADMIN' and old.is_active and old.account_status = 'ACTIVE'
     and (new_role <> 'SUPER_ADMIN' or not new.is_active or new.account_status <> 'ACTIVE' or new.deleted_at is not null)
     and not exists (
       select 1
         from public.account a
         join public.role r using (role_id)
        where a.account_id <> old.account_id
          and a.is_active
          and a.account_status = 'ACTIVE'
          and a.deleted_at is null
          and r.role_name = 'SUPER_ADMIN'
     ) then
    raise exception 'The last active Super Administrator cannot be suspended, demoted, or deleted.';
  end if;

  return new;
end;
$$;

revoke all on function staff_private.protect_super_admin()
  from public, anon, authenticated, service_role;

drop trigger if exists protect_super_admin on public.account;
create trigger protect_super_admin
before update on public.account
for each row execute function staff_private.protect_super_admin();

-- Durable state machine for cross-boundary (database + Supabase Auth) account deletion.
create table if not exists staff_private.account_deletions (
  account_id uuid primary key references public.account(account_id),
  requested_by uuid not null references public.account(account_id),
  target_role text not null,
  original_status text not null,
  attempt_id uuid not null,
  state text not null check (state in ('deleting', 'auth_failed', 'completed')),
  started_at timestamptz not null default now(),
  attempted_at timestamptz not null default now(),
  completed_at timestamptz
);

-- Phase 1: Validate active Super Administrator, serialize concurrent lifecycle
-- operations, enforce self and last-Super-Administrator protection, block access
-- immediately in the database, and issue a single-flight attempt token.
create or replace function public.staff_begin_account_deletion(
  p_actor uuid,
  p_account_id uuid,
  p_revision integer
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  target record;
  existing staff_private.account_deletions;
  next_attempt uuid := gen_random_uuid();
  next_revision integer;
  has_auth boolean;
begin
  perform staff_private.require_super_admin(p_actor);

  if p_account_id is null or p_revision is null then
    raise exception 'Select a staff account to delete.';
  end if;

  if p_account_id = p_actor then
    raise exception 'You cannot delete your own account.' using errcode = '42501';
  end if;

  -- Serialize all account role, suspension, grant, and deletion changes.
  perform staff_private.lock_lifecycle();
  perform staff_private.require_super_admin(p_actor);

  select a.account_id, a.role_id, r.role_name, a.is_active, a.account_status, a.revision, a.deleted_at
    into target
    from public.account a
    join public.role r using (role_id)
   where a.account_id = p_account_id
     for update of a;

  if not found then
    raise exception 'This staff account could not be found.';
  end if;

  select * into existing
    from staff_private.account_deletions
   where account_id = p_account_id
     for update;

  -- Idempotent completion check for duplicate or already-finished requests.
  if target.deleted_at is not null or existing.state = 'completed' then
    return jsonb_build_object(
      'state', 'completed',
      'accountId', p_account_id,
      'revision', target.revision
    );
  end if;

  -- Prevent overlapping Auth delete calls while a fresh attempt is in flight.
  if existing.account_id is not null
     and existing.state = 'deleting'
     and existing.attempted_at > now() - interval '2 minutes' then
    return jsonb_build_object(
      'state', 'deleting',
      'accountId', p_account_id,
      'revision', target.revision
    );
  end if;

  if target.revision is distinct from p_revision then
    raise exception 'This account changed. Reload and review it again.' using errcode = '40001';
  end if;

  if existing.account_id is null and target.account_status = 'REVOKED' then
    raise exception 'This staff account is no longer active in the directory.';
  end if;

  if target.role_name = 'SUPER_ADMIN' and target.is_active and target.account_status = 'ACTIVE'
     and not exists (
       select 1
         from public.account a
         join public.role r using (role_id)
        where a.account_id <> p_account_id
          and a.is_active
          and a.account_status = 'ACTIVE'
          and a.deleted_at is null
          and r.role_name = 'SUPER_ADMIN'
     ) then
    raise exception 'The last active Super Administrator cannot be deleted.';
  end if;

  -- Block workspace access before touching Supabase Auth.
  if target.is_active or target.account_status <> 'REVOKED' then
    update public.account
       set is_active = false,
           account_status = 'REVOKED',
           deactivated_at = coalesce(deactivated_at, now())
     where account_id = p_account_id
    returning revision into next_revision;
  else
    next_revision := target.revision;
  end if;

  if existing.account_id is null then
    insert into staff_private.account_deletions(
      account_id, requested_by, target_role, original_status, attempt_id, state
    ) values (
      p_account_id, p_actor, target.role_name, target.account_status, next_attempt, 'deleting'
    );
  else
    update staff_private.account_deletions
       set requested_by = p_actor,
           attempt_id = next_attempt,
           state = 'deleting',
           attempted_at = now()
     where account_id = p_account_id;
  end if;

  insert into public.audit_log(actor_account_id, action, table_name, record_id, old_values, new_values)
  values (
    p_actor,
    'update',
    'account',
    p_account_id::text,
    jsonb_build_object('role', coalesce(existing.target_role, target.role_name), 'account_status', target.account_status),
    jsonb_build_object('event', 'deletion_started', 'account_status', 'REVOKED')
  );

  select exists(select 1 from auth.users where id = p_account_id) into has_auth;

  return jsonb_build_object(
    'state', 'delete_auth',
    'accountId', p_account_id,
    'attemptId', next_attempt,
    'revision', next_revision,
    'hasAuthUser', has_auth
  );
end;
$$;

-- Phase 2: Confirm Supabase Auth removal in the database itself before marking
-- permanent deletion complete, scrub personal details from public.account and
-- staff_private.invitations, or record a retryable auth_failed state.
create or replace function public.staff_finish_account_deletion(
  p_actor uuid,
  p_account_id uuid,
  p_attempt_id uuid,
  p_auth_deleted boolean
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  deletion staff_private.account_deletions;
  target public.account;
  anon_label text;
  still_has_auth boolean;
begin
  perform staff_private.require_super_admin(p_actor);
  perform staff_private.lock_lifecycle();
  perform staff_private.require_super_admin(p_actor);

  select * into deletion
    from staff_private.account_deletions
   where account_id = p_account_id
     for update;

  if not found then
    raise exception 'No active deletion request was found for this account.';
  end if;

  select * into target
    from public.account
   where account_id = p_account_id
     for update;

  if deletion.state = 'completed' and target.deleted_at is not null then
    return jsonb_build_object(
      'state', 'completed',
      'accountId', p_account_id,
      'revision', target.revision
    );
  end if;

  if deletion.attempt_id is distinct from p_attempt_id then
    raise exception 'This deletion attempt changed. Reload Staff Accounts and review it again.'
      using errcode = '40001';
  end if;

  select exists(select 1 from auth.users where id = p_account_id) into still_has_auth;

  if p_auth_deleted and not still_has_auth then
    -- Replace personal display username with a unique non-personal historical label.
    anon_label := 'Deleted staff (' || left(replace(p_account_id::text, '-', ''), 8) || ')';
    if exists (select 1 from public.account where lower(username) = lower(anon_label) and account_id <> p_account_id) then
      anon_label := 'Deleted staff (' || replace(p_account_id::text, '-', '') || ')';
    end if;

    update public.account
       set username = anon_label,
           is_active = false,
           account_status = 'REVOKED',
           deactivated_at = coalesce(deactivated_at, now()),
           password_setup_at = null,
           deleted_at = now()
     where account_id = p_account_id
    returning * into target;

    -- Remove personal email/name from private invitation tracking for this account.
    delete from staff_private.invitations where account_id = p_account_id;

    update staff_private.account_deletions
       set state = 'completed',
           completed_at = now(),
           attempted_at = now()
     where account_id = p_account_id;

    insert into public.audit_log(actor_account_id, action, table_name, record_id, old_values, new_values)
    values (
      p_actor,
      'delete',
      'account',
      p_account_id::text,
      jsonb_build_object('role', deletion.target_role, 'account_status', deletion.original_status),
      jsonb_build_object('event', 'account_deleted', 'account_status', 'REVOKED', 'deleted', true)
    );

    return jsonb_build_object(
      'state', 'completed',
      'accountId', p_account_id,
      'revision', target.revision
    );
  end if;

  -- Auth user still exists or deletion failed: keep access blocked and allow safe retry.
  update staff_private.account_deletions
     set state = 'auth_failed',
         attempted_at = now()
   where account_id = p_account_id;

  insert into public.audit_log(actor_account_id, action, table_name, record_id, old_values, new_values)
  values (
    p_actor,
    'update',
    'account',
    p_account_id::text,
    null,
    jsonb_build_object('event', 'deletion_failed', 'account_status', 'REVOKED')
  );

  return jsonb_build_object(
    'state', 'auth_failed',
    'accountId', p_account_id,
    'revision', target.revision
  );
end;
$$;

revoke all on function public.staff_begin_account_deletion(uuid, uuid, integer),
  public.staff_finish_account_deletion(uuid, uuid, uuid, boolean)
  from public, anon, authenticated, service_role;
grant execute on function public.staff_begin_account_deletion(uuid, uuid, integer),
  public.staff_finish_account_deletion(uuid, uuid, uuid, boolean)
  to service_role;

-- Update directory projection so:
-- 1) Confirmed permanently deleted accounts never appear in Staff Accounts.
-- 2) Interrupted/failed deletion attempts stay visible to Super Administrators
--    as deletionPending = true so they can safely retry and finish removal.
-- 3) canDelete is true only for an active Super Administrator targeting another account.
drop function if exists staff_private.account_cards();
create function staff_private.account_cards()
returns table (
  "accountId" uuid, username text, email text, role text, status text, revision integer,
  "createdAt" timestamptz, "lastSignInAt" timestamptz, "invitedAt" timestamptz,
  "setupReady" boolean, "emailVerified" boolean, "canResend" boolean, "canRecover" boolean,
  "deletionPending" boolean, "canDelete" boolean
)
language sql
stable
security invoker
set search_path = pg_catalog, pg_temp
as $$
  select
    a.account_id,
    a.username,
    u.email::text,
    r.role_name,
    case
      when d.account_id is not null and d.state in ('deleting', 'auth_failed') then 'DELETING'
      else a.account_status
    end,
    a.revision,
    a.created_at,
    u.last_sign_in_at,
    u.invited_at,
    staff_private.setup_ready(a.account_id),
    u.email_confirmed_at is not null,
    a.account_status = 'PENDING' and i.id is not null and u.email_confirmed_at is null and lower(u.email) = i.email,
    a.account_status in ('ACTIVE', 'PENDING') and u.email is not null and u.email_confirmed_at is not null,
    d.account_id is not null and d.state in ('deleting', 'auth_failed'),
    a.account_id is distinct from auth.uid() and staff_private.is_super_admin(auth.uid())
  from public.account a
  join public.role r using (role_id)
  left join auth.users u on u.id = a.account_id
  left join staff_private.invitations i on i.account_id = a.account_id
  left join staff_private.account_deletions d on d.account_id = a.account_id
  where a.deleted_at is null
    and (
      (a.account_status <> 'REVOKED' and u.id is not null)
      or (d.account_id is not null and d.state in ('deleting', 'auth_failed'))
    )
    and r.role_name in ('SUPER_ADMIN', 'ADMIN', 'MANAGER');
$$;

revoke all on function staff_private.account_cards() from public, anon, authenticated, service_role;

commit;
