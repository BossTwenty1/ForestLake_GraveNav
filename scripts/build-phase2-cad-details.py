"""Build local-only vector detail overlays from a decoded engineer DWG.

Run with QGIS's Python (GDAL, NumPy and Shapely). Existing plot IDs, outlines,
review flags and GPS contracts are preserved byte-for-byte. No CRS is assigned.
"""
import argparse, hashlib, html, json, math
from collections import defaultdict, Counter
from pathlib import Path
import numpy as np
from osgeo import ogr
from shapely.geometry import Polygon

ogr.UseExceptions()
REGULAR='[Saleable] Regular 1m x 2.5m Cut'
ESTATE='[Saleable] 12-Lotter Estate Block'

def pieces(g):
    if g.GetGeometryCount():
        return [p for i in range(g.GetGeometryCount()) for p in pieces(g.GetGeometryRef(i))]
    return [np.array(g.GetPoints(),dtype=float)] if g.GetPointCount() else []

def insert_matrix(row,base):
    import re
    raw=re.search(r'\(3:([^)]*)\)',row.get('ext') or '')
    n=np.array([float(v) for v in raw[1].split(',')] if raw else [0.,0.,1.])
    assert np.linalg.norm(n)>0
    n/=np.linalg.norm(n)
    x=np.cross([0,1,0],n) if abs(n[0])<1/64 and abs(n[1])<1/64 else np.cross([0,0,1],n)
    x/=np.linalg.norm(x)
    axes=np.column_stack([x,np.cross(n,x),n])
    a=row['angle'];c,s=math.cos(a),math.sin(a)
    linear=axes@np.array([[c,-s,0],[s,c,0],[0,0,1]])@np.diag([row[k] for k in ['xscale','yscale','zscale']])
    m=np.eye(4);m[:3,:3]=linear;m[:3,3]=axes@row['coords'][0][0]-linear@base
    return m

def apply(m,p):
    return p@m[:3,:3].T+m[:3,3]

def recover(path):
    ds=ogr.Open(str(path),0)
    blocks={f['name']:(f['handle'],np.array(f.GetGeometryRef().GetPoint())) for f in ds.GetLayerByName('blocks')}
    rows=[]
    for table in ['lines','polylines','texts','hatches','inserts']:
        for f in ds.GetLayerByName(table):
            g=f.GetGeometryRef()
            rows.append({**f.items(),'table':table,'coords':pieces(g.GetLinearGeometry()) if g else []})
    defined={(r['table'],r['handle']) for r in rows if r['block']>=0}
    by_block=defaultdict(list);model=[]
    for r in rows:
        if r['block']>=0:by_block[r['block']].append(r)
        elif r['space']==0 and (r['table'],r['handle']) not in defined:model.append(r)
    leaves=[]
    def walk(items,m,names=(),path=()):
        for r in items:
            trace=path+(str(r['handle']),)
            if r['table']=='inserts':
                assert r['name'] not in names and r['colcount']==r['rowcount']==1
                bid,base=blocks[r['name']]
                walk(by_block[bid],m@insert_matrix(r,base),names+(r['name'],),trace)
            else:leaves.append({**r,'coords':[apply(m,p) for p in r['coords']],'parents':names,'path':trace})
    walk(model,np.eye(4))
    return leaves

def similarity(x,y):
    p,q=x-x.mean(axis=0),y-y.mean(axis=0)
    den=np.sum(p*p);assert den>0
    a=np.sum(p*q)/den;b=np.sum(p[:,0]*q[:,1]-p[:,1]*q[:,0])/den
    linear=np.array([[a,b],[-b,a]])
    return linear,y.mean(axis=0)-x.mean(axis=0)@linear

def digest(path):return hashlib.sha256(path.read_bytes()).hexdigest()

def main():
    ap=argparse.ArgumentParser()
    for key in ['cad-import','dwg','pdf','data','landscape','output']:ap.add_argument('--'+key,type=Path,required=True)
    args=ap.parse_args();args.output.mkdir(parents=True,exist_ok=True)
    original_data_bytes=args.data.read_bytes();data=json.loads(original_data_bytes)
    landscape=json.loads(args.landscape.read_bytes())
    leaves=recover(args.cad_import)
    lots=[r for r in leaves if r['table']=='polylines' and r['parents'] and r['parents'][-1]==REGULAR]
    groups={'lawn':[r for r in lots if ESTATE not in r['parents']],'estates':[r for r in lots if ESTATE in r['parents']]}
    source=[];target=[]
    for key,count in [('lawn',4146),('estates',348)]:
        assert len(groups[key])==len(data['layers'][key])==count
        for r,old in zip(groups[key],data['layers'][key]):
            assert len(r['coords'])==1
            new_poly=Polygon(r['coords'][0][:,:2]);old_poly=Polygon(old['shape']['positions'][0])
            assert new_poly.is_valid and old_poly.is_valid
            source.append([new_poly.centroid.x,new_poly.centroid.y]);target.append([old_poly.centroid.x,old_poly.centroid.y])
    source=np.array(source);target=np.array(target)
    linear,offset=similarity(source,target)
    errors=np.linalg.norm(source@linear+offset-target,axis=1)
    assert max(errors)<.001,'New CAD does not match every existing candidate; never move plot IDs by assumption'
    common=list(lots[0]['path'][:-1])
    for row in lots[1:]:
        common=common[:next((i for i,(a,b) in enumerate(zip(common,row['path'])) if a!=b),min(len(common),len(row['path'])))]
    assert len(common)>=2
    subset=[r for r in leaves if list(r['path'][:len(common)])==common and not (r['parents'] and r['parents'][-1]==REGULAR)]
    bounds=landscape['bounds'];xmin,ymin,xmax,ymax=bounds
    buckets=defaultdict(list);counts=Counter();labels=[];parking_bays=set()
    parking_parts=defaultdict(list);light_parts=defaultdict(list)
    def project(p):return p[:,:2]@linear+offset
    def path(points):return 'M'+' L'.join(f'{x:.3f},{y:.3f}' for x,y in points)
    for r in subset:
        layer=r['layer'];table=r['table']
        if table=='texts':
            import re
            text=re.sub(r'\\[^;\\]*;','',r['text'].replace('\\P',' ')).replace('{','').replace('}','').strip()
            if layer=='[Text] Sector Labels' and text in ['A','B','C','D']:
                p=project(r['coords'][0])[0]
                labels.append({'id':'section-'+str(r['handle']),'name':text,'kind':'section','cadXY':p.tolist(),'sourceHandle':format(r['handle'],'X'),'sourceLayer':layer})
            elif text in ['CREEK','3M CREEK EASEMENT']:
                p=project(r['coords'][0])[0]
                if xmin<=p[0]<=xmax and ymin<=p[1]<=ymax:
                    labels.append({'id':'edge-'+str(r['handle']),'name':'Creek' if text=='CREEK' else 'Creek easement','kind':'edge','cadXY':p.tolist(),'sourceHandle':format(r['handle'],'X'),'sourceLayer':layer})
            continue
        if table not in ['lines','polylines']:continue
        if r['parents'][-1]=='PL':
            light_parts[r['path'][:-1]].extend(project(p) for p in r['coords'])
            continue
        parking=any(n.startswith('[Parking]') for n in r['parents'])
        if parking:
            index=next(i for i,n in enumerate(r['parents']) if n.startswith('[Parking]'))
            parking_bays.add(r['path'][:index+1])
            parking_parts[r['path'][:index+1]].extend(project(p) for p in r['coords'])
        roof=layer=='[Amenities] Roof'
        floor=layer in ['[Amenities] Floor','A_Floor','A_Finish','Existing Structures-Building-Developments']
        if parking:role='site';category='parking'
        elif layer in ['Road','[SDP] Road Line','CENTERLINE','Provincial Road']:role='roads';category='road-edge'
        elif layer in ['Side Walk Line','[SDP] Pathwalk & Sidewalk','[SDP] Pathwalks and Sidewalks']:role='paths';category='pathwalk'
        elif layer in ['[SDP] Perimeter Fence','[SDP] Property Line','[SDP] River Encroachment','RIPRAP','[SDP] Slope Protection']:role='edges';category='creek' if 'River' in layer else 'fence' if 'Fence' in layer else 'edge'
        elif roof or floor or layer in ['[SDP] Amenities','[SDP] Street Lights']:
            role='site';category='roof' if roof else 'floor' if floor else 'fixture'
        else:continue
        for part in r['coords']:
            points=project(part)
            if len(points)<2:continue
            if points[:,0].max()<xmin or points[:,0].min()>xmax or points[:,1].max()<ymin or points[:,1].min()>ymax:continue
            closed=len(points)>=4 and np.linalg.norm(points[0]-points[-1])<.001
            d=path(points)+(' Z' if closed else '')
            fills={'parking':'#d4d3c7','roof':'url(#roof)','floor':'#d7ceb7','fixture':'#c5cbb9','pathwalk':'#ded7c1','creek':'#b6cfc4','edge':'#aab69c','fence':'none','road-edge':'none'}
            strokes={'parking':'#f1eee0','roof':'#695f4d','floor':'#918771','fixture':'#6a8065','pathwalk':'#b8ac91','creek':'#779c94','edge':'#7c8e71','fence':'#657560','road-edge':'#d1cbb9'}
            width={'parking':.085,'roof':.13,'floor':.12,'fixture':.09,'pathwalk':.085,'creek':.14,'edge':.1,'fence':.16,'road-edge':.18}[category]
            extra=' filter="url(#shadow)"' if closed and category=='roof' else ''
            extra+=' stroke-dasharray=".3 .4"' if category=='fence' else ''
            opacity='.3' if category in ['creek','edge'] else '.92'
            buckets[role].append(({'floor':0,'parking':1,'fixture':2,'roof':3}.get(category,0),f'<path data-kind="{category}" d="{d}" fill="{fills[category] if closed else "none"}" fill-opacity="{opacity}" stroke="{strokes[category]}" stroke-width="{width}" stroke-linejoin="round" stroke-linecap="round"{extra}/>'))
            counts[category]+=1
    # Replace oversized drafting symbols with compact lights on the user-confirmed walkway centreline.
    broad=next(p for p in landscape['pathways'] if p['id']=='broad-pathwalk')
    start,end=[np.mean(points,axis=0) for points in broad['provisionalEnds']]
    direction=end-start;length2=np.dot(direction,direction)
    light_placements=[]
    assert len(light_parts)==6
    for i,(source_path,parts) in enumerate(sorted(light_parts.items())):
        points=np.concatenate(parts);source=(points.min(axis=0)+points.max(axis=0))/2
        t=np.dot(source-start,direction)/length2;assert 0<=t<=1
        display=start+t*direction;offset=np.linalg.norm(display-source);assert offset<5
        x,y=display;angle=math.degrees(math.atan2(direction[1],direction[0]))
        symbol=f'<g data-kind="street-light" data-source="{"/".join(source_path)}" transform="translate({x:.3f} {y:.3f}) rotate({angle:.3f})"><path d="M0,0 L.65,-.75" fill="none" stroke="#22372e" stroke-width=".22" opacity=".18"/><circle r=".23" fill="#4c5d54" stroke="#d7d2bf" stroke-width=".07"/><path d="M0,0 L0,1.05 M-.7,1.05 L.7,1.05" fill="none" stroke="#34483f" stroke-width=".14" stroke-linecap="round"/><rect x="-.95" y=".91" width=".55" height=".3" rx=".12" fill="#f2e8b8" stroke="#34483f" stroke-width=".1"/><rect x=".4" y=".91" width=".55" height=".3" rx=".12" fill="#f2e8b8" stroke="#34483f" stroke-width=".1"/></g>'
        buckets['site'].append((4,symbol));counts['street-light']+=1
        light_placements.append({'sourcePath':'/'.join(source_path),'sourceCadXY':source.tolist(),'displayCadXY':display.tolist(),'centrelineOffsetUnits':float(offset)})
    labels.append({'id':'broad-walkway','name':'Walkway','kind':'amenity','cadXY':((start+end)/2).tolist(),'sourceHandles':broad['source']})
    # Label spatial groups without inventing official parking-area identities or capacities.
    parking_paths=sorted(parking_parts)
    centres=np.array([(np.concatenate(parking_parts[p]).min(axis=0)+np.concatenate(parking_parts[p]).max(axis=0))/2 for p in parking_paths])
    remaining=set(range(len(centres)));parking_groups=[]
    while remaining:
        pending=[min(remaining)];remaining.remove(pending[0]);group=[]
        while pending:
            i=pending.pop();group.append(i)
            nearby={j for j in remaining if np.linalg.norm(centres[i]-centres[j])<9}
            remaining-=nearby;pending.extend(sorted(nearby))
        anchor=min(group,key=lambda j:np.linalg.norm(centres[j]-centres[group].mean(axis=0)))
        labels.append({'id':'parking-'+str(len(parking_groups)+1),'name':'Parking','kind':'amenity','cadXY':centres[anchor].tolist(),'sourcePaths':['/'.join(parking_paths[j]) for j in sorted(group)]})
        parking_groups.append({'labelId':labels[-1]['id'],'bayInstances':len(group)})
    assert sum(p['bayInstances'] for p in parking_groups)==81
    assert len(labels)>=6 and all(buckets[k] for k in ['site','roads','paths','edges'])
    assets={}
    for role in ['site','roads','paths','edges']:
        content=f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{xmin} {-ymax} {xmax-xmin} {ymax-ymin}" width="4096" height="4096"><title>Forest Lake Phase 2 CAD {role} details</title><defs><linearGradient id="roof" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#b4a184"/><stop offset="1" stop-color="#897c63"/></linearGradient><filter id="shadow" x="-30%" y="-30%" width="160%" height="160%"><feDropShadow dx=".25" dy="-.3" stdDeviation=".2" flood-color="#263b26" flood-opacity=".28"/></filter></defs><g transform="scale(1,-1)">'+''.join(s for _,s in sorted(buckets[role],key=lambda x:x[0]))+'</g></svg>'
        raw=content.encode();sha=hashlib.sha256(raw).hexdigest();filename=f'{role}.{sha[:12]}.svg'
        (args.output/filename).write_bytes(raw)
        assets[role]={'image':filename,'sha256':sha,'bytes':len(raw),'features':len(buckets[role])}
    source_files=[{'name':args.dwg.name,'sha256':digest(args.dwg),'role':'CAD geometry'},{'name':args.pdf.name,'sha256':digest(args.pdf),'role':'Visual plan reference'}]
    assert len(parking_bays)==81
    manifest={'format':'gravenav-cad-details-v1','coordinateSystem':{'type':'local-cartesian','georeferenced':False},'bounds':bounds,'targetDataSha256':hashlib.sha256(original_data_bytes).hexdigest(),'candidateCount':4494,'parkingBayCount':len(parking_bays),'alignment':{'method':'planar similarity using all 4494 corresponding candidate centroids','maxResidualUnits':float(max(errors)),'linearRowVector':linear.tolist(),'translation':offset.tolist()},'sourceFiles':source_files,'counts':dict(counts),'layers':assets,'labels':labels,'streetLights':light_placements,'parkingLabelGroups':parking_groups,'notice':'CAD-backed planning details. Materials and shadows are illustrative; physical completion and GPS placement are unverified.'}
    (args.output/'manifest.json').write_text(json.dumps(manifest,indent=2),encoding='utf-8')
    assert args.data.read_bytes()==original_data_bytes
    print(json.dumps({'manifestSha256':digest(args.output/'manifest.json'),'alignmentMaxResidualUnits':float(max(errors)),'sourceScopePrefix':common,'layers':assets,'counts':dict(counts),'labels':labels},indent=2))

if __name__=='__main__':main()
