-- Local preparation for Super Administrator. No account is automatically promoted.
begin;
insert into public.role(role_name,description) values ('SUPER_ADMIN','Staff access and security administrator') on conflict (role_name) do nothing;

create or replace function public.is_active_admin() returns boolean
language sql stable security definer set search_path = pg_catalog, pg_temp as $$
  select exists (select 1 from public.account a join public.role r using (role_id)
    where a.account_id=auth.uid() and a.is_active and a.account_status='ACTIVE'
      and r.role_name in ('ADMIN','SUPER_ADMIN'));
$$;

-- Until a super administrator is deliberately bootstrapped, existing administrators
-- retain account-management access. Once one exists, only super administrators do.
create or replace function staff_private.is_admin(p_id uuid) returns boolean
language sql stable security invoker set search_path = pg_catalog, pg_temp as $$
  select exists (select 1 from public.account a join public.role r using (role_id)
    where a.account_id=p_id and a.is_active and a.account_status='ACTIVE'
      and (r.role_name='SUPER_ADMIN' or (r.role_name='ADMIN' and not exists (
        select 1 from public.account x join public.role xr using(role_id)
        where xr.role_name='SUPER_ADMIN' and x.is_active and x.account_status='ACTIVE'))));
$$;

create function public.can_manage_staff_accounts() returns boolean
language sql stable security definer set search_path = pg_catalog, pg_temp as $$
  select staff_private.is_admin(auth.uid());
$$;
revoke all on function public.can_manage_staff_accounts() from public, anon, authenticated, service_role;
grant execute on function public.can_manage_staff_accounts() to authenticated;

-- Protect every account-update path, including legacy protected writers.
create function staff_private.protect_super_admin() returns trigger
language plpgsql security definer set search_path = pg_catalog, pg_temp as $$
declare old_role text; new_role text;
begin
  if new.role_id is not distinct from old.role_id and new.account_status is not distinct from old.account_status
     and new.is_active is not distinct from old.is_active then return new; end if;
  perform staff_private.lock_lifecycle();
  select role_name into old_role from public.role where role_id=old.role_id;
  select role_name into new_role from public.role where role_id=new.role_id;
  if auth.uid()=old.account_id and (new.role_id is distinct from old.role_id
      or (old.is_active and not new.is_active)) then
    raise exception 'You cannot change your own staff role or suspend your own account.' using errcode='42501';
  end if;
  if old_role='SUPER_ADMIN' and old.is_active and old.account_status='ACTIVE'
     and (new_role <> 'SUPER_ADMIN' or not new.is_active or new.account_status <> 'ACTIVE')
     and not exists (select 1 from public.account a join public.role r using(role_id)
       where a.account_id<>old.account_id and a.is_active and a.account_status='ACTIVE' and r.role_name='SUPER_ADMIN') then
    raise exception 'The last active Super Administrator cannot be suspended or demoted.';
  end if;
  return new;
end;
$$;
revoke all on function staff_private.protect_super_admin() from public, anon, authenticated, service_role;
create trigger protect_super_admin before update of role_id, account_status, is_active on public.account
for each row execute function staff_private.protect_super_admin();

-- Operator-only bootstrap: the target must already be an active verified staff
-- account. The hosted rollout must explicitly authorize and review this step.
create function staff_private.bootstrap_super_admin(p_account_id uuid) returns void
language plpgsql security invoker set search_path = pg_catalog, pg_temp as $$
begin
  perform staff_private.lock_lifecycle();
  if exists(select 1 from public.account a join public.role r using(role_id) where r.role_name='SUPER_ADMIN') then
    raise exception 'A Super Administrator already exists.';
  end if;
  if not exists(select 1 from public.account a join auth.users u on u.id=a.account_id
    where a.account_id=p_account_id and a.is_active and a.account_status='ACTIVE'
      and u.email_confirmed_at is not null and staff_private.setup_ready(a.account_id)) then
    raise exception 'The bootstrap account must be active, verified, and have completed password setup.';
  end if;
  update public.account set role_id=(select role_id from public.role where role_name='SUPER_ADMIN')
    where account_id=p_account_id;
  insert into public.audit_log(actor_account_id,action,table_name,record_id,new_values)
    values(null,'update','account',p_account_id::text,jsonb_build_object('event','super_admin_bootstrap'));
end;
$$;
revoke all on function staff_private.bootstrap_super_admin(uuid) from public, anon, authenticated, service_role;
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
     where a.account_id <> p_account_id and a.is_active and a.account_status = 'ACTIVE' and r.role_name in ('ADMIN', 'SUPER_ADMIN')
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
   where r.role_name = upper(p_role_name) and r.role_name in ('SUPER_ADMIN', 'ADMIN', 'MANAGER');
  if not found then raise exception 'Select Administrator or Manager.'; end if;
  perform staff_private.lock_lifecycle();
  perform staff_private.require_admin(auth.uid());
  if upper(p_role_name) = 'MANAGER' and staff_private.is_admin(p_account_id) and not exists (
    select 1 from public.account a join public.role r using (role_id)
     where a.account_id <> p_account_id and a.is_active and a.account_status = 'ACTIVE' and r.role_name in ('ADMIN', 'SUPER_ADMIN')
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

create or replace function public.staff_begin_invitation(
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
       or p_role is null or p_role not in ('SUPER_ADMIN', 'ADMIN', 'MANAGER') then
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

create or replace function staff_private.account_cards()
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
  where a.account_status <> 'REVOKED' and r.role_name in ('SUPER_ADMIN', 'ADMIN', 'MANAGER');
$$;

create or replace function public.staff_account_directory(
  p_search text default '', p_role text default 'ALL', p_status text default 'ALL', p_page integer default 1
)
returns jsonb
language plpgsql stable security definer set search_path = pg_catalog, pg_temp
as $$
declare rows jsonb;
begin
  perform staff_private.require_admin(auth.uid());
  if p_page not between 1 and 100000 or p_page is null
     or p_role not in ('ALL','SUPER_ADMIN','ADMIN','MANAGER') or p_status not in ('ALL','ACTIVE','PENDING','SUSPENDED') then
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
alter table staff_private.invitations drop constraint invitations_role_name_check;
alter table staff_private.invitations add constraint invitations_role_name_check check (role_name in ('SUPER_ADMIN','ADMIN','MANAGER'));
create policy staff_account_restricted_read on public.account as restrictive for select to authenticated
using (account_id=auth.uid() or public.can_manage_staff_accounts());
drop policy staff_account_audit_admin_only on public.audit_log;
create policy staff_account_audit_admin_only on public.audit_log as restrictive for select to authenticated
using (table_name not in ('account','role','staff_invitation') or public.can_manage_staff_accounts());
create or replace function public.admin_update_site_settings(
    p_expected_revision integer,
    p_park_name text,
    p_park_address text,
    p_operating_hours text,
    p_office_phone text,
    p_office_email text,
    p_announcement_enabled boolean,
    p_announcement_title text,
    p_announcement_body text,
    p_announcement_tone text,
    p_visitor_guidelines text,
    p_allow_visitor_gallery_uploads boolean,
    p_allow_visitor_portrait_requests boolean
)
returns public.site_settings
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    v_actor uuid;
    v_before public.site_settings;
    v_after public.site_settings;
    v_park_name text := btrim(coalesce(p_park_name, ''));
    v_park_address text := btrim(coalesce(p_park_address, ''));
    v_hours text := btrim(coalesce(p_operating_hours, ''));
    v_phone text := btrim(coalesce(p_office_phone, ''));
    v_email text := btrim(coalesce(p_office_email, ''));
    v_ann_title text := btrim(coalesce(p_announcement_title, ''));
    v_ann_body text := btrim(coalesce(p_announcement_body, ''));
    v_tone text := lower(btrim(coalesce(p_announcement_tone, 'info')));
    v_guidelines text := btrim(coalesce(p_visitor_guidelines, ''));
begin
    if not public.can_manage_staff_accounts() then
        raise exception 'Only an authorized security administrator may update visitor site settings';
    end if;

    if v_park_name = '' or char_length(v_park_name) > 140 then
        raise exception 'Park name is required and must be 140 characters or fewer';
    end if;
    if v_park_address = '' or char_length(v_park_address) > 240 then
        raise exception 'Park address is required and must be 240 characters or fewer';
    end if;
    if char_length(v_hours) > 160 then
        raise exception 'Operating hours must be 160 characters or fewer';
    end if;
    if char_length(v_phone) > 80 then
        raise exception 'Office phone must be 80 characters or fewer';
    end if;
    if char_length(v_email) > 120 then
        raise exception 'Office email must be 120 characters or fewer';
    end if;
    if char_length(v_ann_title) > 120 then
        raise exception 'Announcement title must be 120 characters or fewer';
    end if;
    if char_length(v_ann_body) > 500 then
        raise exception 'Announcement message must be 500 characters or fewer';
    end if;
    if v_tone not in ('info', 'warning', 'success') then
        raise exception 'Announcement tone must be info, warning, or success';
    end if;
    if char_length(v_guidelines) > 400 then
        raise exception 'Visitor guidelines must be 400 characters or fewer';
    end if;

    select account_id into v_actor from public.account where account_id = auth.uid();

    insert into public.site_settings (setting_id) values (1) on conflict (setting_id) do nothing;

    select * into v_before from public.site_settings where setting_id = 1 for update;
    if p_expected_revision is not null and v_before.revision <> p_expected_revision then
        raise exception 'Another administrator updated site settings. Reload before saving.';
    end if;

    update public.site_settings
       set park_name = v_park_name,
           park_address = v_park_address,
           operating_hours = v_hours,
           office_phone = v_phone,
           office_email = v_email,
           announcement_enabled = coalesce(p_announcement_enabled, false),
           announcement_title = v_ann_title,
           announcement_body = v_ann_body,
           announcement_tone = v_tone,
           visitor_guidelines = v_guidelines,
           allow_visitor_gallery_uploads = coalesce(p_allow_visitor_gallery_uploads, true),
           allow_visitor_portrait_requests = coalesce(p_allow_visitor_portrait_requests, true),
           updated_by = v_actor,
           updated_at = timezone('utc', now()),
           revision = v_before.revision + 1
     where setting_id = 1
    returning * into v_after;

    insert into public.audit_log (
        actor_account_id,
        action,
        table_name,
        record_id,
        old_values,
        new_values
    ) values (
        v_actor,
        'update',
        'site_settings',
        '1',
        to_jsonb(v_before),
        to_jsonb(v_after)
    );

    return v_after;
end;
$$;
commit;
