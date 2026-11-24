-- Dynamic Visitor Site Settings + Admin RBAC/Lifecycle Hardening
-- 1. Singleton public.site_settings table (public read, ADMIN-only RPC write + audit log)
-- 2. Allow ADMIN to reactivate SUSPENDED accounts via public.admin_activate_account
-- 3. Restrict public.export_audit_log to ADMIN-only (prevent MANAGER export of ADMIN GIS audit rows)
-- 4. Tighten burial_photos_staff_delete Storage RLS policy to ADMIN-only

begin;

create table if not exists public.site_settings (
    setting_id smallint primary key default 1 check (setting_id = 1),
    park_name text not null default 'Forest Lake Memorial Park - Legazpi',
    park_address text not null default 'Tagongtong, Barangay 56 (Taysan), Legazpi City, Albay, Philippines',
    operating_hours text not null default 'Open daily, 6:00 AM – 6:00 PM',
    office_phone text not null default '',
    office_email text not null default '',
    announcement_enabled boolean not null default false,
    announcement_title text not null default '',
    announcement_body text not null default '',
    announcement_tone text not null default 'info' check (announcement_tone in ('info', 'warning', 'success')),
    visitor_guidelines text not null default 'Keep pathways clear and respect families taking time for quiet remembrance.',
    allow_visitor_gallery_uploads boolean not null default true,
    allow_visitor_portrait_requests boolean not null default true,
    updated_by uuid references public.account(account_id),
    updated_at timestamptz not null default timezone('utc', now()),
    revision integer not null default 1 check (revision >= 1)
);

insert into public.site_settings (setting_id)
values (1)
on conflict (setting_id) do nothing;

alter table public.site_settings enable row level security;

drop policy if exists site_settings_public_read on public.site_settings;
create policy site_settings_public_read
on public.site_settings
for select
to anon, authenticated
using (setting_id = 1);

grant select on public.site_settings to anon, authenticated, service_role;
revoke insert, update, delete on public.site_settings from anon, authenticated;

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
    if not public.is_active_admin() then
        raise exception 'Only an active ADMIN may update visitor site settings';
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

revoke all on function public.admin_update_site_settings(integer, text, text, text, text, text, boolean, text, text, text, text, boolean, boolean) from public;
grant execute on function public.admin_update_site_settings(integer, text, text, text, text, text, boolean, text, text, text, text, boolean, boolean) to authenticated;

-- 2. Allow ADMIN to activate approved PENDING accounts OR reactivate SUSPENDED accounts (REVOKED stays permanent).
create or replace function public.admin_activate_account(p_account_id uuid)
returns public.account
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    activated_account public.account;
begin
    if not public.is_active_admin() then
        raise exception 'Only an active ADMIN may activate or reactivate accounts';
    end if;

    update public.account
       set is_active = true,
           account_status = 'ACTIVE',
           deactivated_at = null
     where account_id = p_account_id
       and (
           (account_status = 'PENDING' and approved_at is not null)
           or account_status = 'SUSPENDED'
       )
    returning * into activated_account;

    if not found then
        raise exception 'Only approved pending or suspended accounts may be activated';
    end if;

    return activated_account;
end;
$$;

-- 3. Restrict export_audit_log to ADMIN-only so MANAGER cannot bypass release-aware audit RLS.
create or replace function public.export_audit_log(
    p_from timestamptz default null,
    p_to timestamptz default null
)
returns setof public.audit_log
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    actor_id uuid;
begin
    if not public.is_active_admin() then
        raise exception 'Only active ADMIN accounts may export audit logs';
    end if;

    select a.account_id
      into actor_id
      from public.account as a
     where a.account_id = auth.uid();

    insert into public.audit_log (
        actor_account_id,
        action,
        table_name,
        record_id,
        old_values,
        new_values
    ) values (
        actor_id,
        'export',
        'audit_log',
        'export',
        null,
        null
    );

    return query
    select al.*
      from public.audit_log as al
     where (p_from is null or al.created_at >= p_from)
       and (p_to is null or al.created_at < p_to)
     order by al.created_at, al.audit_id;
end;
$$;

-- 4. Tighten burial-photos storage DELETE policy to ADMIN-only (guarded for environments without storage schema).
do $$
begin
    if to_regclass('storage.objects') is not null then
        execute 'drop policy if exists burial_photos_staff_delete on storage.objects';
        execute $pol$
            create policy burial_photos_staff_delete on storage.objects
            for delete to authenticated
            using (
                bucket_id = 'burial-photos'
                and name ~ '^burial/[1-9][0-9]*/[a-zA-Z0-9_-][a-zA-Z0-9._-]*$'
                and public.is_active_admin()
            )
        $pol$;
    end if;
end
$$;

commit;
