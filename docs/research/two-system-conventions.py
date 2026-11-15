"""Exploratory convention audit after Altair failed the frozen Vega transfer.
Fits each convention in Vega only; Altair is never used to fit its sky matrix.
The data are reused for model selection, so this is not a fresh blind test.
"""
import json
import subprocess
from pathlib import Path
import numpy as np
from scipy.spatial.transform import Rotation
ROOT=Path(__file__).resolve().parent
read=lambda name:json.loads((ROOT/name).read_text())
vega=read('vega-external-alignment-results.json')
altair=read('altair-transfer-analysis-results.json')
fixture=read('fixtures/vega-external-image-points.json')
rows=json.loads(subprocess.check_output(['node',str(ROOT/'two-system-conventions.mjs')]))['rows']
def unit(x):
 x=np.asarray(x,dtype=float);return x/np.linalg.norm(x,axis=-1,keepdims=True)
def angle(a,b):
 a,b=unit(a),unit(b)
 return float(np.degrees(np.arctan2(np.linalg.norm(np.cross(a,b)),np.dot(a,b))))
def reflection(a,b):
 n=unit(np.cross(a,b));return np.eye(3)-2*np.outer(n,n)
def pose(h,p,r=0):
 h,p=np.radians([h,p]);f=np.array([np.sin(h)*np.cos(p),np.cos(h)*np.cos(p),np.sin(p)]);right=np.array([np.cos(h),-np.sin(h),0]);down=-np.cross(right,f)
 return np.array([right,down,f]).T@Rotation.from_euler('z',r,degrees=True).as_matrix()
vobs=np.array(vega['localObservedGalacticDirections']);aobs=np.array([r['observedGalacticDirection'] for r in altair['frozenTransfer']])
tc=fixture['coarseTracyCheck'];Q=np.array(min(vega['externalBranches'],key=lambda x:x['siriusHoldoutErrorDeg'])['galacticToCamera22'])
target=next(r['ray'] for r in vega['reticles'] if r['index']==24)
tracy=Q.T@pose(tc['referenceHeadingDeg'],tc['referencePitchDeg'],tc['referenceApproximateRollDeg']).T@pose(tc['headingDeg'],tc['pitchDeg'],tc['approximateRollDeg'])@target
output=[]
for row in rows:
 v=np.array([x['direction'] for x in row['vega']]);a=np.array([x['direction'] for x in row['altair']]);R=Rotation.align_vectors(vobs,v)[0].as_matrix()
 for parity,M in [(1,R),(-1,R@reflection(*v))]:
  errs=[angle(M@x,y) for x,y in zip(a,aobs)]
  output.append(dict(configuration=row['cfg'],parity=parity,
    vegaSeparationErrorDeg=angle(*v)-angle(*vobs),altairSeparationErrorDeg=angle(*a)-angle(*aobs),
    vegaFitErrorsDeg=[angle(M@x,y) for x,y in zip(v,vobs)],tracyCoarseErrorDeg=angle(M@row['tracy']['direction'],tracy),
    altairTransferErrorsDeg=errs,maxAltairTransferErrorDeg=max(errs),
    vegaRangesLs=[x['distanceLs'] for x in row['vega']],altairRangesLs=[x['distanceLs'] for x in row['altair']]))
# These screening limits are exploratory and deliberately loose compared with
# the observed ~0.1-degree repeatability. No formal probability is implied.
geometry=[r for r in output if abs(r['vegaSeparationErrorDeg'])<.25 and abs(r['altairSeparationErrorDeg'])<.25]
compatible=[r for r in geometry if r['tracyCoarseErrorDeg']<5]
sort=lambda rs:sorted(rs,key=lambda r:r['maxAltairTransferErrorDeg'])
print(json.dumps(dict(warning=__doc__,configurationCount=len(rows),parityBranchCount=len(output),
 screens=dict(maximumAbsolutePairSeparationErrorDeg=.25,maximumNominalTracyErrorDeg=5),
 pairGeometryCompatibleBranches=len(geometry),alsoTracyCompatibleBranches=len(compatible),
 bestUnfiltered=sort(output)[:5],bestGeometryCompatible=sort(geometry)[:5],bestAlsoTracyCompatible=sort(compatible)[:5],
 rows=output),indent=2,allow_nan=False))
