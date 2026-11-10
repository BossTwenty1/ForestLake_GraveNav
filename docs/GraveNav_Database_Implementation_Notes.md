# GraveNav database implementation notes

Updated 9 November 2026 against the local release candidate. Use the [current operational handoff](phase2-local-defense.md) for scope and the [GIS package contract](gis/pilot-package-v1.md) for mapping inputs. Hosted migration state requires an authorized target inspection.

## Physical plots, people and interments

The operational hierarchy is site -> area/garden -> lot. A lot is one physical gravesite with an official lot_code, unique within area_id. Nullable block references and older sector structures provide compatibility with earlier data.

Each deceased row has its existing internal deceased_id and individual display name and life dates. Each burial_record associates a deceased person with a lot and retains its own burial_id, interment date, status, remains and source references. Photos continue to reference a burial record. Owners retain their existing relationships to lots.

The forward migration 20261107010000_shared_gravesite_interments.sql replaces the global single-burial index with a unique (lot_id, interment_slot) reservation. The supported workflow creates distinct individual records under the shared lot. A repeated source order requires reconciliation before another confirmed association. Matching names and dates trigger review rather than identity merging.

## Classification and capacity

- An administrator records grave_type and a restricted approval reference.
- Approved regular graves have six slots.
- Mausoleums use their individually approved numeric capacity and arrangement reference. Admissions wait while capacity is unconfigured.
- Unclassified lots retain the earlier one-assignment behavior pending classification.
- Pending, archived, removed and restored records retain their reserved slots. Exhumations, corrected orders and capacity release require further policy decisions.
- New classified records require a reviewed order, interment date and explicit actual-interment confirmation before activation. Legacy rows retain their identities and unknown confirmation state until reviewed.
- Confirmed orders and associations are retained for reconciliation. The current workflow restricts moves from classified or confirmed interments.

The database serializes admissions through the lot and private write fence. Staff-visible plot revisions and coordinate review state are independent of slot reservations. See the migration and shared-interment tests for exact guards.

## Protected staff changes

staff_save_record is the application mutation boundary. It checks an active ADMIN or MANAGER account, allowed fields, expected revision and request UUID, then commits related writes atomically. Direct application table writes and older mutation RPC access are revoked.

ADMIN authority is required for classification/capacity approval, coordinate and photo review, account lifecycle, removal and recovery. MANAGER accounts retain permitted operational create/edit access. Recovery snapshots are protected, and revision checks prevent undo from overwriting subsequent changes. Removed burials retain their relationships and reservations.

Request receipts protect exact retries. A new request UUID does not establish that a person or workbook transaction is new. Keep ambiguous Section D entries in restricted reconciliation.

## Public records and privacy

The public burial view includes active burial records with deceased.public_display enabled, while excluding removed burials and lots. Search and profiles use burial IDs. The shared-plot roster applies the same eligibility filters to every individual. Its reader distinguishes unavailable/invalid responses from an empty roster, projects only IDs/names, and offers profile retry. Public readers have no fictional-record fallback.

The public view exposes the recorded coordinate and its verification status. Coordinate presence alone does not establish a valid navigation destination. Phase 2 additionally requires the correct published lot geometry and reviewed access association.

Keep owner contact details, private notes, source review evidence, survey/device details and credentials in their authorized stores. Supabase Auth manages passwords. Photos use a private Storage bucket and the protected approval workflow.

## Coordinates and GIS

A lot coordinate is nullable. Plot Management accepts optional coordinates, and new or changed coordinates return to pending. Coordinate Verification is a protected review workflow. Existing database containment checks apply.

The main map at /map renders the Phase 2 CAD landscape in local Cartesian coordinates. The geographic mode within /map uses the existing adapter for public_mapping_layer and public_burial_gis, checking scope, publication revision, burial identity, lot, polygon and access node. The old /phase2-map URL redirects into this workspace. One physical lot retains one geographic destination for its eligible deceased records.

Survey captures, georeferencing runs, versioned geometry, graph access, import validation and explicit release review/publication remain governed by the [GIS runbook](gis/import-and-publication.md). The native planning display does not itself establish a geographic transformation.

## Migration provenance

The shared-gravesite migration and M09 lock-order correction are committed locally at the baseline recorded in the handoff. Their hosted application remains subject to separate authorization. Preserve immutable earlier migrations, established IDs, foreign keys and audit history. Apply reviewed forward migrations once, in order, to an explicitly approved target.
