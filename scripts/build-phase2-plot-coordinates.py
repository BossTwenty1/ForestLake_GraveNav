"""Derive CAD plot centres and two explicitly conditional WGS84 review copies.

Run with QGIS Python. No official plot identity, ground accuracy, source datum,
walking endpoint or publication approval is inferred from drawing congruence.
"""
import argparse, csv, hashlib, importlib.util, json
from pathlib import Path
import numpy as np
from shapely.geometry import Polygon, mapping
from pyproj import CRS, Geod, database, network
from pyproj.transformer import TransformerGroup

spec=importlib.util.spec_from_file_location('cad_details',Path(__file__).with_name('build-phase2-cad-details.py'))
cad=importlib.util.module_from_spec(spec);spec.loader.exec_module(cad)
network.set_network_enabled(False)
DATA_SHA='02a4dba490872f9be8cf56280ccf432d31796431c1f808f542fbff86ac28ca77'
LPCS_SHA='c34847dff62d973d276883c2d683a94453a274924e6379deab7531af9d8fb22c'
GRID_SHA='27090b58f56453429c8df661197142c7a3df45b659991656e485643f064f0964'

def groups(path):
    rows=[r for r in cad.recover(path) if r['table']=='polylines' and r['parents'] and r['parents'][-1]==cad.REGULAR]
    return {'lawn':[r for r in rows if cad.ESTATE not in r['parents']],
            'estates':[r for r in rows if cad.ESTATE in r['parents']]}

def polygon(row):
    assert len(row['coords'])==1
    p=Polygon(row['coords'][0][:,:2]);assert p.is_valid and p.area>0
    return p

def centre(poly):return [poly.centroid.x,poly.centroid.y]
def digest(path):return hashlib.sha256(path.read_bytes()).hexdigest()
def write_json(path,value):path.write_text(json.dumps(value,separators=(',',':'),allow_nan=False),encoding='utf-8')

def main():
    parser=argparse.ArgumentParser()
    for key in ['data','lpcs-import','grid-import','alignment','lpcs-dwg','grid-dwg','output','review-output']:
        parser.add_argument('--'+key,type=Path,required=True)
    args=parser.parse_args()
    assert 'public' not in args.review_output.resolve().parts,'Conditional geographic copies must stay outside the web root'
    assert digest(args.data)==DATA_SHA and digest(args.lpcs_dwg)==LPCS_SHA and digest(args.grid_dwg)==GRID_SHA
    original=args.data.read_bytes();data=json.loads(original)
    evidence=json.loads(args.alignment.read_text(encoding='utf-8'))
    assert evidence['operational_georeferencing_approved'] is False
    control=evidence['CAD_to_CAD_similarity'];assert control['control_pairs']==7 and control['residual_max_drawing_units']<1e-6
    grid_linear=np.array(control['linear_row_vector']);grid_offset=np.array(control['translation'])
    lpcs,grid=groups(args.lpcs_import),groups(args.grid_import)
    joined=[]
    for layer,count in [('lawn',4146),('estates',348)]:
        assert len(lpcs[layer])==len(grid[layer])==len(data['layers'][layer])==count
        joined.extend(zip(data['layers'][layer],lpcs[layer],grid[layer]))
    old_xy=np.array([centre(Polygon(old['shape']['positions'][0])) for old,_,_ in joined])
    local_xy=np.array([centre(polygon(local)) for _,local,_ in joined])
    linear,offset=cad.similarity(old_xy,local_xy)
    centroid_error=float(np.max(np.linalg.norm(old_xy@linear+offset-local_xy,axis=1)))
    assert centroid_error<.001
    transforms={}
    for code in ['EPSG:3124','EPSG:25394']:
        group=TransformerGroup(CRS(code),4326,always_xy=True,allow_ballpark=False)
        assert group.best_available and group.transformers
        transforms[code]=group.transformers[0]
    entries={};drafts={code:[] for code in transforms};csv_rows=[];separations=[];max_local=0.;max_grid=0.
    geod=Geod(ellps='WGS84')
    for old,local,other in joined:
        lp,gp=polygon(local),polygon(other)
        predicted=np.array(old['shape']['positions'][0])[:,:2]@linear+offset
        max_local=max(max_local,lp.hausdorff_distance(Polygon(predicted)))
        predicted_grid=np.array(lp.exterior.coords)@grid_linear+grid_offset
        max_grid=max(max_grid,gp.hausdorff_distance(Polygon(predicted_grid)))
        lc,gc=centre(lp),centre(gp)
        assert np.linalg.norm(np.array(lc)@grid_linear+grid_offset-gc)<.001
        assert lp.covers(lp.centroid) and gp.covers(gp.centroid)
        candidate=old['id'];assert candidate not in entries
        entry={'instancePath':old['properties']['instance_path'],
               'lpcsInstancePath':'/'.join(local['path']),'gridInstancePath':'/'.join(other['path']),
               'lpcsCenter':lc,'gridCenter':gc}
        entries[candidate]=entry
        row={'candidate_id':candidate,'source_reference':entry['instancePath'],
             'lpcs_source_reference':entry['lpcsInstancePath'],'grid_source_reference':entry['gridInstancePath'],
             'lpcs_x':lc[0],'lpcs_y':lc[1],'grid_easting':gc[0],'grid_northing':gc[1],
             'official_plot_id':'','geographic_status':'CONDITIONAL_NOT_APPROVED_NO_NAVIGATION'}
        centres=[]
        for code,transform in transforms.items():
            longitude,latitude=transform.transform(*gc,errcheck=True);centres.append((longitude,latitude))
            assert 122<longitude<125 and 12<latitude<14
            coords=np.array(gp.exterior.coords)
            lon,lat=transform.transform(coords[:,0],coords[:,1],errcheck=True)
            wgs_poly=Polygon(zip(lon,lat));assert wgs_poly.is_valid
            props={'candidateId':candidate,**entry,'officialPlotId':None,'sourceCRSHypothesis':code,
                   'status':'CONDITIONAL_NOT_APPROVED','navigationAllowed':False,'centreLonLat':[longitude,latitude],
                   'overlapReviewFids':old.get('review',{}).get('overlapReviewFids',[])}
            drafts[code].append({'type':'Feature','id':candidate,'properties':props,'geometry':mapping(wgs_poly)})
            prefix='if_prs92' if code=='EPSG:3124' else 'if_luzon1911'
            row[prefix+'_longitude']=longitude;row[prefix+'_latitude']=latitude
        separation=geod.inv(*centres[0],*centres[1])[2];separations.append(separation)
        row['conditional_hypotheses_separation_m']=separation;csv_rows.append(row)
    assert max_local<.001 and max_grid<.001,'One or more complete lot outlines failed the paired-drawing check'
    args.output.parent.mkdir(parents=True,exist_ok=True);args.review_output.mkdir(parents=True,exist_ok=True)
    manifest={'format':'gravenav-plot-coordinate-references-v1','status':'cad-reference-only','sourceDatum':'unresolved',
              'geographicApproved':False,'coordinateUnits':'source-drawing-units','targetDataSha256':DATA_SHA,
              'sourceHashes':{'lpcs':LPCS_SHA,'grid':GRID_SHA,'controlEvidence':digest(args.alignment)},
              'candidateCount':4494,'alignment':{'controlPairCount':7,'maxCentroidResidualUnits':centroid_error,
              'maxLocalPolygonResidualUnits':max_local,'maxGridPolygonResidualUnits':max_grid},'entries':entries}
    write_json(args.output,manifest)
    operations={code:{'description':t.description,'pipeline':t.definition,'catalogAccuracyMNotFieldValidation':t.accuracy}
                for code,t in transforms.items()}
    for code,features in drafts.items():
        filename='conditional-'+('prs92' if code=='EPSG:3124' else 'luzon1911')+'-NOT-FOR-NAVIGATION.geojson'
        write_json(args.review_output/filename,{'type':'FeatureCollection','name':filename,
                   'status':'CONDITIONAL_NOT_APPROVED','navigationAllowed':False,'sourceCRSHypothesis':code,
                   'targetCRS':'EPSG:4326','features':features})
    with (args.review_output/'plot-coordinate-review.csv').open('w',newline='',encoding='utf-8-sig') as stream:
        writer=csv.DictWriter(stream,fieldnames=list(csv_rows[0]));writer.writeheader();writer.writerows(csv_rows)
    report={'format':'gravenav-plot-coordinate-build-checks-v1','candidateCount':len(entries),'runtimeSha256':digest(args.output),
            'geometryUnchanged':args.data.read_bytes()==original,'alignment':manifest['alignment'],
            'sourceHashes':manifest['sourceHashes'],'EPSGDatabase':database.get_database_metadata('EPSG.VERSION'),
            'operations':operations,'conditionalHypothesisSeparationM':{'min':min(separations),'max':max(separations)},
            'officialPlotIdsAssigned':0,'navigationAllowed':False,'networkEnabled':False}
    assert report['geometryUnchanged'] and len(entries)==4494
    write_json(args.review_output/'build-checks.json',report)
    print(json.dumps(report,indent=2))

if __name__=='__main__':main()
