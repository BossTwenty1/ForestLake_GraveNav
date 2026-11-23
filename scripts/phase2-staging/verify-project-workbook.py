"""Read-only reconciliation of the original workbook and its existing JSON extraction."""
import hashlib
import json
import sys
from collections import Counter
from pathlib import Path
import openpyxl

workbook_path, extraction_path = map(Path, sys.argv[1:3])
before = hashlib.sha256(workbook_path.read_bytes()).hexdigest()
data = json.loads(extraction_path.read_text(encoding="utf-8"))
assert before == data["workbook_sha256"]
workbook = openpyxl.load_workbook(workbook_path, read_only=True, data_only=True)
try:
    sheets = {
        name: list(workbook[name].iter_rows(values_only=True))[1:]
        for name in ["Phase2_Plots", "Demo_Owners", "Demo_Deceased", "Demo_Interments"]
    }
    assert [len(sheets[name]) for name in sheets] == [4470, 45, 100, 100]
    expected_plots = [{
        "source_key": row[12], "display_reference": row[0], "garden": row[1],
        "lawn": row[2], "block": row[3], "lot": row[4], "commercial_class": row[5],
        "pdf_page": int(row[6]), "cad_candidate_id": row[7],
        "review_flags": json.loads(row[9]) if row[9] else [],
        "availability": row[11], "hosted_lot_id": row[10],
    } for row in sheets["Phase2_Plots"]]
    assert expected_plots == data["plots"], "Source plot extraction differs from workbook"
    assert [{
        "sample_id": row[0], "name": row[1], "source_key": row[3], "classification": row[4],
    } for row in sheets["Demo_Owners"]] == data["owners"]
    assert [{
        "sample_id": row[0], "name": row[1], "birth_date": row[2],
        "death_date": row[3], "classification": row[4],
    } for row in sheets["Demo_Deceased"]] == data["people"]
    assert [{
        "sample_id": row[0], "person_id": row[1], "source_key": row[3],
        "interment_date": row[4], "classification": row[6],
    } for row in sheets["Demo_Interments"]] == data["interments"]
    for row, item in zip(sheets["Demo_Interments"], data["interments"]):
        plot = next(p for p in data["plots"] if p["source_key"] == item["source_key"])
        assert row[2] == plot["display_reference"]
    for row, item in zip(sheets["Demo_Owners"], data["owners"]):
        plot = next(p for p in data["plots"] if p["source_key"] == item["source_key"])
        assert row[2] == plot["display_reference"]
finally:
    workbook.close()
assert before == hashlib.sha256(workbook_path.read_bytes()).hexdigest()
groups = Counter(item["source_key"] for item in data["interments"])
owner_keys = {owner["source_key"] for owner in data["owners"]}
assert len(owner_keys) == 45 and owner_keys <= groups.keys()
unowned_keys = groups.keys() - owner_keys
assert len(unowned_keys) == 45
assert all(groups[key] == 1 for key in unowned_keys)
print(json.dumps({
    "workbook_sha256": before, "unchanged": True, "extraction_matches_all_rows": True,
    "plots": 4470, "owners": 45, "people": 100, "interments": 100,
    "referenced_plots": len(groups),
    "interments_per_plot": dict(Counter(groups.values())),
    "owned_referenced_plots": len(owner_keys),
    "unowned_referenced_plots": len(unowned_keys),
    "unowned_plots_are_all_single_record_groups": True,
    "owner_links_outside_referenced_plots": 0,
}))
