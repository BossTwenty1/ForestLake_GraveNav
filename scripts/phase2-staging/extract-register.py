from pathlib import Path
import json,hashlib,argparse
import openpyxl
parser=argparse.ArgumentParser(description='Extract the approved Phase 2 register as private staging input. Does not connect to any database.')
parser.add_argument('--workbook',required=True,type=Path);parser.add_argument('--report',required=True,type=Path);parser.add_argument('--out',required=True,type=Path)
args=parser.parse_args();OUT=args.out;OUT.mkdir(parents=True,exist_ok=True);x=args.workbook;report=args.report
w=openpyxl.load_workbook(x,read_only=True,data_only=True)
def table(name):
 rows=w[name].iter_rows(min_row=7,values_only=True);headers=next(rows)
 return headers,[list(r) for r in rows if r[0] is not None]
headers,raw=table('Phase 2 plots');assert len(raw)==4470 and len(headers)==18
assert list(headers)==['Garden','Lawn','Block as printed','Lot as printed','PDF fill class','PDF page','CAD correspondence','CAD polygon ID','CAD instance path','Outline error (drawing units)','PDF document locator','Numbering review','Existing overlap FIDs','Database lot ID','Official link approved','Occupancy','Review note','PDF fill RGB']
fields=['garden','lawn','block_literal','lot_literal','commercial_class','pdf_page','cad_correspondence','cad_candidate_id','cad_instance_path','drawing_outline_error','pdf_locator','numbering_review','overlap_fids_literal','database_lot_id','official_link_approved','occupancy','source_review_note','pdf_fill_rgb']
rows=[]
for i,r in enumerate(raw,8):
 v=dict(zip(fields,r));identity=[v[k] for k in ['garden','lawn','block_literal','lot_literal','pdf_page','pdf_locator']]
 v.update(source_row_key=hashlib.sha256(json.dumps(identity,ensure_ascii=False,separators=(',',':')).encode()).hexdigest(),workbook_row=i)
 assert v['database_lot_id'] is None and v['official_link_approved']=='NO' and v['occupancy']=='UNKNOWN'
 rows.append(v)
ch,cr=table('CAD index');eh,er=table('Exceptions')
assert len(cr)==4494 and len(er)==100
assert len(set(r['source_row_key'] for r in rows))==4470
assert len(set(r['cad_candidate_id'] for r in rows if r['cad_candidate_id']))==4451
assert sum(r['overlap_fids_literal'] is not None for r in rows)==31
assert sum(r['block_literal'] is None or r['lot_literal'] is None for r in rows)==351
result={'format':'gravenav-phase2-source-register-v1','scope':'entire Forest Lake Phase 2','sources':{'workbook':str(x),'workbook_sha256':hashlib.sha256(x.read_bytes()).hexdigest(),'crosswalk_report':str(report),'crosswalk_report_sha256':hashlib.sha256(report.read_bytes()).hexdigest()},'workbook_headers':list(headers),'rows':rows,'cad_index_headers':list(ch),'cad_candidates':cr,'source_exceptions_headers':list(eh),'source_exceptions':er}
(OUT/'source-register.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
scopes=sorted(set((r['garden'],r['lawn']) for r in rows))
bindings={'format':'gravenav-phase2-reviewed-bindings-v1','source_workbook_sha256':result['sources']['workbook_sha256'],'target_snapshot_sha256':None,'site':{'site_id':None,'review_reference':None},'scopes':[{'garden':g,'lawn':l,'area_id':None,'sector_id':None,'review_reference':None} for g,l in scopes],'lot_bindings':[]}
(OUT/'reviewed-bindings.template.json').write_text(json.dumps(bindings,indent=2))
print(json.dumps({'rows':len(rows),'cad_candidates':len(cr),'source_exceptions':len(er),'complete_source_identities':sum(r['block_literal'] is not None and r['lot_literal'] is not None for r in rows),'workbook_sha256':result['sources']['workbook_sha256'],'report_sha256':result['sources']['crosswalk_report_sha256']}))
