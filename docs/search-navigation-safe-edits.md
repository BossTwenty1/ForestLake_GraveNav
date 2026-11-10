# Search, safe editing and navigation integration

Updated 10 November 2026. Read the [operational handoff](phase2-local-defense.md) for the current Phase 2 scope and [database notes](GraveNav_Database_Implementation_Notes.md) for shared-gravesite capacity.

## Public search

search_public_burials provides bounded, ranked name and lot-code search with garden/year filters and pagination. Exact matches precede ordinary matches and similar-name suggestions. Public eligibility follows the active/public view and removal filters.

Names on a shared plot retain individual burial IDs, dates and profile links. Eligible associated names can appear together through public_shared_plot_burials. A plot-code-only query that matches multiple records asks the visitor to choose a person. Identical display names are insufficient for identity resolution.

The native map retains memorial search in its GraveNav interface. CAD-candidate lookup is a separate expandable control. A source outline reference becomes an operational gravesite link only through the management-reviewed crosswalk.

## Staff editing and recovery

staff_save_record keeps related writes atomic, checks expected revisions and limits accepted fields. Request IDs prevent an exact retry from committing twice. Pending request fingerprints survive a same-tab reload in session storage for up to 24 hours. Submitted form values are not stored there. A new request or cleared storage still requires ordinary duplicate review.

Coordinate/photo review, account actions, removal and recovery require ADMIN authority. MANAGER accounts retain permitted operational edits. New or changed plot coordinates return to pending, and coordinate rejection requires a reason.

Archived and removed interments retain capacity reservations. Recovery restores established associations and cannot overwrite a later revision. Complete recovery evidence remains protected. Audit output applies its existing redaction rules.

The generated Supabase type snapshot and database-schema.ts describe the application contract. Update types against the reviewed migration set and an authorized database. A hosted type generation can omit local forward changes that have yet to be applied there.

## Phase 2 navigation

The main /map workspace includes full CAD planning and verified geographic modes. Search/profile and legacy geographic/navigation links converge on /map. A public burial resolves only through its exact published operational lot/access association; shared deceased records lead to one destination.

GPS is rendered in geographic space. Reviewed edges, direction and metric costs determine routes to the exact access endpoint, without straight-line connectors through graves. Distance updates, freshness/accuracy/containment/corridor checks and arrival use a reviewed policy for the exact release/revision. No Phase 1 graph or arrival threshold is substituted.

Location is requested explicitly and stays on-device. Denial, stale/poor location, missing/unreachable paths and unavailable/changed publications pause guidance. A read-only no-store endpoint verifies availability before activation and periodically while moving; stalled requests time out.

See the [current handoff](phase2-local-defense.md#field-reviewed-navigation-configuration) for policy fields and field gates. Actual Section D evidence and operational settings remain outstanding.

The shared-grave reader distinguishes an unavailable/malformed response from an empty roster and projects only public IDs/names. Profile retry preserves privacy. Unconfigured public readers report unavailability rather than fictional records.

## Validation and release

Run npm run validate with Docker available for genuine PostgreSQL races. Test the real authenticated staff workflow and mobile field behavior in the authorized environment before operational release. Check exact totals and environment limitations in the current handoff.

The September 5 migrations introduced public search and protected editing. Later forward migrations extend those contracts. Inspect the complete reviewed migration set and target before an authorized rollout, and retain recoverable backups. Website deployment and database migration status are separate.
