-- Staff Accounts V1. Account rows and existing sign-in credentials are preserved.
begin;

-- Require the earlier Admin hardening migration before replacing its functions.
do $$
begin
  if to_regclass('public.site_settings') is null then
    raise exception 'Apply migration 20261124060000 before Staff Accounts V1.';
  end if;
  if to_regclass('supabase_migrations.schema_migrations') is not null then
    if not exists (
      select 1 from supabase_migrations.schema_migrations where version = '20261124060000'
    ) then
      raise exception 'Record migration 20261124060000 before Staff Accounts V1.';
    end if;
  end if;
end;
$$;

create schema staff_private;
revoke all on schema staff_private from public, anon, authenticated, service_role;

-- Record password setup only after our request-bound Auth update succeeds.
alter table public.account add column password_setup_at timestamptz;

-- All account role and access changes serialize on this row, including calls
-- through older clients of staff_save_record. Updating it also fences stale
-- snapshots at repeatable-read isolation.
create table staff_private.lifecycle_guard (id boolean primary key check (id), version bigint not null);
insert into staff_private.lifecycle_guard values (true, 0);

create function staff_private.lock_lifecycle()
returns void
language sql volatile security invoker set search_path = pg_catalog, pg_temp
as $$
  update staff_private.lifecycle_guard set version = version + 1 where id;
$$;

create function staff_private.setup_ready(p_id uuid)
returns boolean
language sql stable security invoker set search_path = pg_catalog, pg_temp
as $$
  select exists (
    select 1 from auth.users u join public.account a on a.account_id = u.id
     where u.id = p_id and u.email_confirmed_at is not null
       and nullif(u.encrypted_password, '') is not null
       and (a.password_setup_at is not null or u.invited_at is null
         or (a.account_status in ('ACTIVE', 'SUSPENDED') and a.approved_at is not null))
  );
$$;

create function staff_private.is_admin(p_id uuid)
returns boolean
language sql stable security invoker set search_path = pg_catalog, pg_temp
as $$
  select exists (
    select 1 from public.account a join public.role r using (role_id)
     where a.account_id = p_id and a.is_active and a.account_status = 'ACTIVE' and r.role_name = 'ADMIN'
  );
$$;

create function staff_private.require_admin(p_id uuid)
returns void
language plpgsql stable security invoker set search_path = pg_catalog, pg_temp
as $$
begin
  if not staff_private.is_admin(p_id) then
    raise exception 'An active Administrator is required.' using errcode = '42501';
  end if;
end;
$$;

-- Serialize account writes before the shared writer takes actor and target locks.
-- Preserve the existing writer, receipts, and public RPC signature.
alter function public.staff_save_record(text,text,integer,jsonb,uuid,text) set schema staff_private;
revoke all on function staff_private.staff_save_record(text,text,integer,jsonb,uuid,text)
  from public, anon, authenticated, service_role;

create function public.staff_save_record(
  p_entity text, p_id text, p_revision integer, p_values jsonb,
  p_request_id uuid, p_operation text default 'save'
)
returns jsonb
language plpgsql security definer set search_path = pg_catalog, pg_temp
as $$
begin
  if p_entity = 'account' then
    if not public.is_active_admin_or_manager() then
      raise exception 'An active staff account is required' using errcode = '42501';
    end if;
    if not staff_private.is_admin(auth.uid()) then
      raise exception 'Only administrators may review, recover, remove, or manage accounts' using errcode = '42501';
    end if;
    perform staff_private.lock_lifecycle();
    perform staff_private.require_admin(auth.uid());
  end if;
  return staff_private.staff_save_record(p_entity,p_id,p_revision,p_values,p_request_id,p_operation);
end;
$$;

revoke all on function public.staff_save_record(text,text,integer,jsonb,uuid,text)
  from public, anon, authenticated, service_role;
grant execute on function public.staff_save_record(text,text,integer,jsonb,uuid,text) to authenticated;

create or replace function public.admin_approve_account(p_account_id uuid)
returns public.account
language plpgsql security definer set search_path = pg_catalog, pg_temp
as $$
declare result public.account;
begin
  perform staff_private.require_admin(auth.uid());
  perform staff_private.lock_lifecycle();
  perform staff_private.require_admin(auth.uid());
  if not staff_private.setup_ready(p_account_id) then
    raise exception 'This staff member must finish setting up their password before you grant access.';
  end if;
  update public.account set approved_by = auth.uid(), approved_at = now()
   where account_id = p_account_id and account_status = 'PENDING' and approved_at is null
   returning * into result;
  if not found then raise exception 'Only pending, unapproved accounts may be approved'; end if;
  return result;
end;
$$;

create or replace function public.admin_activate_account(p_account_id uuid)
returns public.account
language plpgsql security definer set search_path = pg_catalog, pg_temp
as $$
declare result public.account;
begin
  perform staff_private.require_admin(auth.uid());
  perform staff_private.lock_lifecycle();
  perform staff_private.require_admin(auth.uid());
  if not staff_private.setup_ready(p_account_id) then
    raise exception 'This staff member must finish setting up their password before you grant access.';
  end if;
  update public.account set is_active = true, account_status = 'ACTIVE', deactivated_at = null
   where account_id = p_account_id and approved_at is not null
     and account_status in ('PENDING', 'SUSPENDED')
   returning * into result;
  if not found then raise exception 'Only approved pending or suspended accounts may be activated'; end if;
  return result;
end;
$$;

create or replace function public.admin_deactivate_account(p_account_id uuid, p_account_status text)
returns public.account
language plpgsql security definer set search_path = pg_catalog, pg_temp
as $$
declare result public.account;
begin
  perform staff_private.require_admin(auth.uid());
  if p_account_id = auth.uid() then
    raise exception 'You cannot suspend your own account.';
  end if;
  if upper(p_account_status) is distinct from 'SUSPENDED' then
    raise exception 'Staff access can only be suspended.';
  end if;
  perform staff_private.lock_lifecycle();
  perform staff_private.require_admin(auth.uid());
  if staff_private.is_admin(p_account_id) and not exists (
    select 1 from public.account a join public.role r using (role_id)
     where a.account_id <> p_account_id and a.is_active and a.account_status = 'ACTIVE' and r.role_name = 'ADMIN'
  ) then
    raise exception 'The last active Administrator cannot be suspended.';
  end if;
  update public.account set is_active = false, account_status = 'SUSPENDED', deactivated_at = now()
   where account_id = p_account_id and account_status = 'ACTIVE'
   returning * into result;
  if not found then raise exception 'Only active accounts may be suspended'; end if;
  return result;
end;
$$;

create or replace function public.admin_change_account_role(p_account_id uuid, p_role_name text)
returns public.account
language plpgsql security definer set search_path = pg_catalog, pg_temp
as $$
declare
  result public.account;
  new_role bigint;
begin
  perform staff_private.require_admin(auth.uid());
  if p_account_id = auth.uid() then raise exception 'You cannot change your own staff role.'; end if;
  select r.role_id into new_role from public.role r
   where r.role_name = upper(p_role_name) and r.role_name in ('ADMIN', 'MANAGER');
  if not found then raise exception 'Select Administrator or Manager.'; end if;
  perform staff_private.lock_lifecycle();
  perform staff_private.require_admin(auth.uid());
  if upper(p_role_name) = 'MANAGER' and staff_private.is_admin(p_account_id) and not exists (
    select 1 from public.account a join public.role r using (role_id)
     where a.account_id <> p_account_id and a.is_active and a.account_status = 'ACTIVE' and r.role_name = 'ADMIN'
  ) then
    raise exception 'The last active Administrator cannot be demoted.';
  end if;
  update public.account set role_id = new_role
   where account_id = p_account_id and account_status <> 'REVOKED' and role_id <> new_role
   returning * into result;
  if not found then raise exception 'This role is already assigned or the account is unavailable.'; end if;
  return result;
end;
$$;

-- One click and one transaction. Granting access never leaves a partially approved account.
create function public.staff_grant_account(p_account_id uuid, p_revision integer)
returns void
language plpgsql security definer set search_path = pg_catalog, pg_temp
as $$
declare target public.account;
begin
  perform staff_private.require_admin(auth.uid());
  perform staff_private.lock_lifecycle();
  perform staff_private.require_admin(auth.uid());
  select * into target from public.account where account_id = p_account_id for update;
  if not found or target.account_status <> 'PENDING' then
    raise exception 'Only pending staff accounts can be granted access.';
  end if;
  if target.revision is distinct from p_revision then
    raise exception 'This account changed. Reload and review it again.' using errcode = '40001';
  end if;
  if target.approved_at is null then perform public.admin_approve_account(p_account_id); end if;
  perform public.admin_activate_account(p_account_id);
end;
$$;

-- Invite delivery crosses the database/Auth boundary. One durable attempt per
-- normalized identity prevents duplicate rows and supports safe retries.
create table staff_private.invitations (
  id uuid primary key default gen_random_uuid(),
  email text unique not null,
  username text not null,
  role_name text not null check (role_name in ('ADMIN', 'MANAGER')),
  requested_by uuid not null references public.account(account_id),
  account_id uuid unique references public.account(account_id),
  attempt_id uuid,
  attempted_at timestamptz not null default now(),
  sent_at timestamptz,
  delivery_status text not null default 'sending' check (delivery_status in ('sending', 'sent', 'failed'))
);
create unique index staff_invitation_username_key on staff_private.invitations (lower(username));

create function public.staff_begin_invitation(
  p_actor uuid, p_email text default null, p_username text default null,
  p_role text default null, p_account_id uuid default null, p_revision integer default null
)
returns jsonb
language plpgsql security definer set search_path = pg_catalog, pg_temp
as $$
declare
  invite staff_private.invitations;
  email_input text := lower(btrim(p_email));
  name_input text := btrim(p_username);
begin
  perform staff_private.require_admin(p_actor);
  if p_account_id is not null then
    select i.* into invite from staff_private.invitations i
    join public.account a on a.account_id = i.account_id
    join auth.users u on u.id = a.account_id
    where a.account_id = p_account_id and a.revision = p_revision and a.account_status = 'PENDING'
      and u.email_confirmed_at is null and lower(u.email) = i.email
    for update of i;
    if not found then raise exception 'This invitation is no longer eligible to resend. Reload and review the staff account.'; end if;
  else
    if coalesce(length(email_input), 0) not between 3 and 254 or email_input !~ '^\S+@\S+\.\S+$'
       or coalesce(length(name_input), 0) not between 2 and 80
       or p_role is null or p_role not in ('ADMIN', 'MANAGER') then
      raise exception 'Enter a valid staff name, work email, and role.';
    end if;
    select * into invite from staff_private.invitations where email = email_input for update;
    if not found then
      if exists (select 1 from auth.users u where lower(u.email) = email_input) then
        raise exception 'An account already uses this email address.';
      end if;
      if exists (select 1 from public.account a where lower(a.username) = lower(name_input)) then
        raise exception 'That staff name is already in use.';
      end if;
      insert into staff_private.invitations(email, username, role_name, requested_by, attempt_id)
      values (email_input, name_input, p_role, p_actor, null) on conflict do nothing
      returning * into invite;
      if not found then
        select * into invite from staff_private.invitations where email = email_input for update;
        if not found then raise exception 'That staff name is already in use.'; end if;
      end if;
    end if;
    if lower(invite.username) <> lower(name_input) or invite.role_name <> p_role then
      raise exception 'An invitation already uses this email. Review the original staff account.';
    end if;
    if invite.delivery_status = 'sent' then
      return jsonb_build_object('state', 'sent', 'accountId', invite.account_id);
    end if;
  end if;

  if invite.attempt_id is not null and invite.delivery_status = 'sending'
      and invite.attempted_at > now() - interval '2 minutes' then
    return jsonb_build_object('state', 'sending');
  end if;
  if invite.sent_at > now() - interval '1 minute' then
    raise exception 'Please wait one minute between invitation emails.';
  end if;
  if exists (
    select 1 from auth.users u where lower(u.email) = invite.email
     and u.id is distinct from invite.account_id
     and (u.invited_at is null or (u.raw_user_meta_data->>'gravenav_invitation_id') is distinct from invite.id::text)
  ) then raise exception 'This email belongs to a different account. Review the staff directory.'; end if;

  update staff_private.invitations
     set delivery_status = 'sending', attempt_id = gen_random_uuid(), attempted_at = now()
   where id = invite.id returning * into invite;
  return jsonb_build_object('state', 'send', 'id', invite.id, 'attemptId', invite.attempt_id, 'email', invite.email);
end;
$$;

create function public.staff_finish_invitation(
  p_actor uuid, p_invitation_id uuid, p_attempt_id uuid, p_sent boolean, p_user_id uuid default null
)
returns jsonb
language plpgsql security definer set search_path = pg_catalog, pg_temp
as $$
declare
  invite staff_private.invitations;
  identity_id uuid;
  action_name text;
begin
  perform staff_private.require_admin(p_actor);
  select * into invite from staff_private.invitations where id = p_invitation_id for update;
  if not found or invite.attempt_id is distinct from p_attempt_id then
    raise exception 'This invitation attempt changed.';
  end if;
  if invite.delivery_status <> 'sending' then
    return jsonb_build_object('state', invite.delivery_status, 'accountId', invite.account_id);
  end if;
  select u.id into identity_id from auth.users u
   where lower(u.email) = invite.email and u.invited_at is not null
     and (p_user_id is null or u.id = p_user_id)
     and (u.id = invite.account_id or u.raw_user_meta_data->>'gravenav_invitation_id' = invite.id::text);
  if p_sent and identity_id is null then
    raise exception 'The invitation identity could not be confirmed.';
  end if;
  if identity_id is not null and invite.account_id is null then
    insert into public.account(account_id, role_id, username, created_by)
      select identity_id, r.role_id, invite.username, invite.requested_by
      from public.role r where r.role_name = invite.role_name;
  end if;

  action_name := case when not p_sent then 'invite_failed'
    when invite.sent_at is null then 'invite_sent' else 'invite_resent' end;
  update staff_private.invitations
     set account_id = coalesce(identity_id, account_id),
         delivery_status = case when p_sent then 'sent' else 'failed' end,
         sent_at = case when p_sent then now() else sent_at end
   where id = invite.id returning * into invite;
  insert into public.audit_log(actor_account_id, action, table_name, record_id, old_values, new_values)
  values (p_actor, 'update', 'account', coalesce(invite.account_id, invite.id)::text, null,
    jsonb_build_object('event', action_name, 'delivery_status', invite.delivery_status));
  return jsonb_build_object('state', invite.delivery_status, 'accountId', invite.account_id);
end;
$$;

-- Only the application confirms setup, after updating the authenticated user's
-- password through Auth. Link acceptance alone can populate an Auth hash.
create function public.record_staff_password_setup(p_account_id uuid)
returns void
language plpgsql security definer set search_path = pg_catalog, pg_temp
as $$
begin
  if not exists (select 1 from auth.users u where u.id = p_account_id
      and u.email_confirmed_at is not null and nullif(u.encrypted_password, '') is not null) then
    raise exception 'Staff password setup could not be verified.';
  end if;
  update public.account set password_setup_at = now()
   where account_id = p_account_id and account_status = 'PENDING' and password_setup_at is null;
  if found then
    insert into public.audit_log(actor_account_id, action, table_name, record_id, new_values)
    values (p_account_id, 'update', 'account', p_account_id::text, jsonb_build_object('event','password_setup'));
  end if;
end;
$$;

revoke all on function public.record_staff_password_setup(uuid) from public, anon, authenticated, service_role;
grant execute on function public.record_staff_password_setup(uuid) to service_role;

-- Manager access to operational events remains governed by the existing policies.
create policy staff_account_audit_admin_only on public.audit_log
as restrictive for select to authenticated
using (table_name not in ('account', 'role', 'staff_invitation') or public.is_active_admin());

-- Keep export aligned with the restricted operational audit policy on installs
-- that have not yet applied the broader November 24 site-settings migration.
create or replace function public.export_audit_log(
  p_from timestamptz default null, p_to timestamptz default null
)
returns setof public.audit_log
language plpgsql security definer set search_path = pg_catalog, pg_temp
as $$
begin
  perform staff_private.require_admin(auth.uid());
  insert into public.audit_log (actor_account_id, action, table_name, record_id)
  values (auth.uid(), 'export', 'audit_log', 'export');
  return query select al.* from public.audit_log al
   where (p_from is null or al.created_at >= p_from)
     and (p_to is null or al.created_at < p_to)
   order by al.created_at, al.audit_id;
end;
$$;

-- This projection keeps Auth-only fields and secrets out of public.account.
create function staff_private.account_cards()
returns table (
  "accountId" uuid, username text, email text, role text, status text, revision integer,
  "createdAt" timestamptz, "lastSignInAt" timestamptz, "invitedAt" timestamptz,
  "setupReady" boolean, "emailVerified" boolean, "canResend" boolean, "canRecover" boolean
)
language sql stable security invoker set search_path = pg_catalog, pg_temp
as $$
  select a.account_id, a.username, u.email::text, r.role_name, a.account_status, a.revision,
    a.created_at, u.last_sign_in_at, u.invited_at, staff_private.setup_ready(a.account_id),
    u.email_confirmed_at is not null,
    a.account_status = 'PENDING' and i.id is not null and u.email_confirmed_at is null and lower(u.email) = i.email,
    a.account_status in ('ACTIVE', 'PENDING') and u.email is not null and u.email_confirmed_at is not null
  from public.account a join public.role r using (role_id)
  join auth.users u on u.id = a.account_id
  left join staff_private.invitations i on i.account_id = a.account_id
  where a.account_status <> 'REVOKED' and r.role_name in ('ADMIN', 'MANAGER');
$$;

create function public.staff_account_directory(
  p_search text default '', p_role text default 'ALL', p_status text default 'ALL', p_page integer default 1
)
returns jsonb
language plpgsql stable security definer set search_path = pg_catalog, pg_temp
as $$
declare rows jsonb;
begin
  perform staff_private.require_admin(auth.uid());
  if p_page not between 1 and 100000 or p_page is null
     or p_role not in ('ALL','ADMIN','MANAGER') or p_status not in ('ALL','ACTIVE','PENDING','SUSPENDED') then
    raise exception 'Invalid directory filters.';
  end if;
  with source as materialized (select * from staff_private.account_cards()),
  filtered as materialized (
    select * from source s where (p_role = 'ALL' or s.role = p_role) and (p_status = 'ALL' or s.status = p_status)
     and (strpos(lower(s.username), lower(btrim(left(p_search, 254)))) > 0
       or strpos(lower(coalesce(s.email, '')), lower(btrim(left(p_search, 254)))) > 0)
  ),
  page as (
    select * from filtered f order by lower(f.username), f."accountId" limit 20 offset ((p_page - 1) * 20)
  )
  select jsonb_build_object(
    'summary', (select jsonb_build_object(
      'total', count(*), 'active', count(*) filter (where status = 'ACTIVE'),
      'pending', count(*) filter (where status = 'PENDING'), 'suspended', count(*) filter (where status = 'SUSPENDED')
    ) from source),
    'total', (select count(*) from filtered),
    'items', coalesce((select jsonb_agg(to_jsonb(page) order by lower(page.username), page."accountId") from page), '[]'::jsonb)
  ) into rows;
  return rows;
end;
$$;

create function public.staff_account_details(p_account_id uuid)
returns jsonb
language plpgsql stable security definer set search_path = pg_catalog, pg_temp
as $$
declare card jsonb;
begin
  perform staff_private.require_admin(auth.uid());
  select to_jsonb(c) into card from staff_private.account_cards() c where c."accountId" = p_account_id;
  if not found then raise exception 'This staff account is unavailable.'; end if;
  return jsonb_build_object('account', card, 'activity', coalesce((
    select jsonb_agg(to_jsonb(e) order by e."at" desc, e.id desc) from (
      select l.audit_id as id, coalesce(l.new_values->>'event', l.action) as action, l.created_at as "at",
        coalesce(a.username, 'System') as actor,
        coalesce(l.old_values, previous.new_values)->>'account_status' as "fromStatus",
        l.new_values->>'account_status' as "toStatus",
        old_role.role_name as "fromRole", new_role.role_name as "toRole"
      from public.audit_log l left join public.account a on a.account_id = l.actor_account_id
      -- Some older audit writers recorded only the resulting account snapshot.
      left join lateral (
        select prior.new_values from public.audit_log prior
        where l.action = 'update' and l.new_values ? 'account_status' and l.old_values is null
          and prior.table_name = 'account' and prior.record_id = l.record_id
          and prior.new_values ? 'account_status' and prior.audit_id < l.audit_id
        order by prior.audit_id desc limit 1
      ) previous on true
      left join public.role old_role on old_role.role_id::text = coalesce(l.old_values, previous.new_values)->>'role_id'
      left join public.role new_role on new_role.role_id::text = l.new_values->>'role_id'
      where l.table_name = 'account' and l.record_id = p_account_id::text
      order by l.created_at desc, l.audit_id desc limit 8
    ) e
  ), '[]'::jsonb));
end;
$$;

revoke execute on function public.admin_create_account(uuid,text,text) from public, anon, authenticated;
revoke all on function public.staff_grant_account(uuid,integer), public.staff_account_directory(text,text,text,integer),
  public.staff_account_details(uuid) from public, anon, authenticated, service_role;
grant execute on function public.staff_grant_account(uuid,integer), public.staff_account_directory(text,text,text,integer),
  public.staff_account_details(uuid) to authenticated;
revoke all on function public.staff_begin_invitation(uuid,text,text,text,uuid,integer),
  public.staff_finish_invitation(uuid,uuid,uuid,boolean,uuid) from public, anon, authenticated, service_role;
grant execute on function public.staff_begin_invitation(uuid,text,text,text,uuid,integer),
  public.staff_finish_invitation(uuid,uuid,uuid,boolean,uuid) to service_role;

commit;
