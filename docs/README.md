# GraveNav documentation

Updated 9 November 2026. This index directs current development of the operational Phase 2 system.

## Read first

1. [Phase 2 operational handoff](phase2-local-defense.md) defines the accepted scope, current implementation, evidence gaps, field workflow, installed assets and validation status. Its filename is retained for existing links.
2. [Database implementation notes](GraveNav_Database_Implementation_Notes.md) describe the current local schema and protected workflows.
3. [Search and safe editing](search-navigation-safe-edits.md) describes record search, revisions, retry receipts and recovery.
4. [Production-readiness checklist](production-readiness.md) covers authorized hosting, authentication and release checks.

## Current GIS contracts

- [Pilot package v1](gis/pilot-package-v1.md) defines the existing 15-file package and offline validator.
- [Import, review, publication and rollback](gis/import-and-publication.md) defines the protected workflow.
- [GIS foundation design](superpowers/specs/2026-09-28-gis-foundation-design.md) remains the technical architecture reference. Its implementation-stage labels differ from physical cemetery sections.

The current handoff controls product scope and present readiness. SQL migrations, application source and tests control implemented behavior. A dated result describes the state tested on its recorded date.

## Archived evidence

- [Earlier Phase 2 handoff and audit history](archive/2026-11-09/phase2-readiness-history.md)
- [November 6 readiness assessment](archive/2026-11-06/GraveNav_Final_Defense_Readiness_2026-11-06.md)
- [Retired Phase 1 KML cleanup](archive/phase1/forest-lake-phase1-kml-cleanup.md)
- [GIS deployment history](archive/2026-09-28/gis-deployment-history.md)
- [Completed GIS implementation plan](archive/2026-09-28/gis-foundation-implementation-plan.md)
- [Earlier core ERD diagrams](archive/schema/README.md): retained as historical models; they omit later shared-gravesite/GIS/security details.
- [Legacy map and boundary import SQL](archive/phase1/README.md): historical inputs targeting the earlier site/map; do not execute them as Phase 2 setup.

Archived reports preserve provenance and prior test results. Earlier SQL and ERD files retain their original bytes in the archive. Their filenames do not establish current authority. Use the current handoff when choosing or implementing the next task.

## Other references

The design-reference directory contains visual references for the existing interface. The accepted CAD package and its source audits live in the separate Phase 2 workspace listed in the handoff. Their release handoffs describe those artifacts. Main-application integration decisions are recorded here.

The original Excel workbooks, restricted management queue and field-verification record retain their existing private locations. Only aggregate findings and evidence paths belong in general project documentation.
