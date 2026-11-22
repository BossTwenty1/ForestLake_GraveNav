-- Optional local capstone layout assignment. This installer selects no lots.
begin;

create table gis_private.capstone_planning_lot (
  lot_id bigint primary key references public.lot(lot_id) on delete restrict,
  plan_sha256 text not null check (plan_sha256 ~ '^[0-9a-f]{64}$'),
  cad_candidate_id text not null check (cad_candidate_id ~ '^(lawn|estates):[1-9][0-9]*$'),
  review_reference text not null check (length(btrim(review_reference)) between 1 and 250),
  assigned_at timestamptz not null default now(),
  unique (plan_sha256, cad_candidate_id)
);

alter table gis_private.capstone_planning_lot enable row level security;
revoke all on gis_private.capstone_planning_lot from public, anon, authenticated, service_role;

create function public.get_capstone_planning_plot(p_burial_id bigint, p_plan_sha256 text)
returns text
language sql stable security definer set search_path = pg_catalog
as $$
  select plot.cad_candidate_id
  from gis_private.capstone_planning_lot plot
  join gis_private.capstone_visitor_selection approved on approved.lot_id = plot.lot_id
  join public.burial_record br on br.burial_id = approved.burial_id
    and br.deceased_id = approved.deceased_id and br.lot_id = approved.lot_id
  join public.public_burial_records visible on visible.burial_id = br.burial_id
  where visible.burial_id = p_burial_id and plot.plan_sha256 = p_plan_sha256
$$;

revoke all on function public.get_capstone_planning_plot(bigint,text) from public;
grant execute on function public.get_capstone_planning_plot(bigint,text) to anon, authenticated;

commit;
