"""Compare in-game orrery marker positions with production and research geometry.
Only camera rotation, uniform scale, projection depth and image translation fit.
No per-body position, orbital element, epoch, anisotropic scale or sky matrix fits.
"""
import json,subprocess
from pathlib import Path
import numpy as np
from scipy.optimize import least_squares
from scipy.spatial.transform import Rotation
ROOT=Path(__file__).resolve().parent
fixture=json.loads((ROOT/'fixtures/altair-orrery-image-points.json').read_text())
geometry=json.loads(subprocess.check_output(['node',str(ROOT/'altair-orrery-geometry.mjs')]))
def project(p,X):
 q=np.einsum('ij,kj->ik',X,Rotation.from_rotvec(p[:3]).as_matrix())
 return np.exp(p[3])*q[:,:2]/(1+p[6]*q[:,2:])+p[4:6]
def fit_camera(X,Y,selected,seeds):
 # All catalogue radii <6.2 AU. This bound keeps every denominator positive.
 best=None
 for seed in seeds:
  fit=least_squares(lambda p:(project(p,X)[selected]-Y[selected]).ravel(),seed,max_nfev=1200,bounds=([-np.inf]*6+[-.15],[np.inf]*6+[.15]))
  err=project(fit.x,X)-Y;rms=float(np.sqrt(np.mean(np.sum(err[selected]**2,axis=1))))
  if best is None or rms<best[0]:best=(rms,fit.x,err)
 return best
rows=[]
for index,(im,geo) in enumerate(zip(fixture['images'],geometry['rows'])):
 assert im['hudTimestamp']==geo['timestamp']
 toLogical=np.array([1600/im['width'],1000/im['height']]);Y=np.array([p['pointPx'] for p in im['points']])*toLogical
 ids=[p['bodyId'] for p in im['points']];out=[]
 for model in geo['models']:
  X=np.array([b['positionAU'] for b in model['bodies']])[ids]
  seeds=[np.r_[Rotation.random(random_state=i).as_rotvec(),np.log(180),Y[0],0.] for i in range(80)]
  rms,p,err=fit_camera(X,Y,np.arange(len(X)),seeds)
  originalError=err/toLogical
  # Fit five markers and predict the sixth. Exclusion applies to the camera
  # objective; the all-body fit supplies an optimiser start, not a constraint.
  holdouts=[]
  if len(X)==6:
   for excluded in range(6):
    selected=[j for j in range(6) if j!=excluded]
    hr,hp,he=fit_camera(X,Y,selected,[p,*seeds[:12]])
    holdouts.append(dict(excludedBodyId=ids[excluded],fitRmsOriginalPx=float(np.sqrt(np.mean(np.sum((he[selected]/toLogical)**2,axis=1)))),heldoutErrorOriginalPx=float(np.linalg.norm(he[excluded]/toLogical)),predictedHeldoutPx=(project(hp,X)[excluded]/toLogical).tolist()))
  out.append(dict(model=model['model'],cameraParameters=p.tolist(),cameraParameterOrder=['rotationVectorX','rotationVectorY','rotationVectorZ','logScale','translationX','translationY','inverseDepth'],rmsOriginalPx=float(np.sqrt(np.mean(np.sum(originalError**2,axis=1)))),maximumOriginalPx=float(np.max(np.linalg.norm(originalError,axis=1))),projectedBodyPx=(project(p,X)/toLogical).tolist(),bodyErrorsOriginalPx=np.linalg.norm(originalError,axis=1).tolist(),leaveOneMarkerOut=holdouts,projectedOrbits=[dict(id=o['id'],pointsPx=(project(p,np.array(o['pointsAU']))/toLogical).tolist()) for o in model['orbits']]))
 rows.append(dict(imageIndex=index,timestamp=geo['timestamp'],bodyIds=ids,models=out))
# Orbit-outline points are independent of all camera fits above. Evaluate
# point-to-polyline distance, allowing arbitrary orbital phase along the line.
outline=fixture['independentOrbitOutlineSamples'];outlineRows=[]
for model in rows[outline['imageIndex']]['models']:
 checks=[]
 for sample in outline['samples']:
  curve=np.array(next(o['pointsPx'] for o in model['projectedOrbits'] if o['id']==sample['bodyId']))*np.array([1600/4112,1034/2658])
  a=curve[:-1];d=np.diff(curve,axis=0);errors=[]
  for point in sample['previewPoints']:
   t=np.clip(np.sum((point-a)*d,axis=1)/np.sum(d*d,axis=1),0,1)
   errors.append(float(np.min(np.linalg.norm(a+t[:,None]*d-point,axis=1))))
  checks.append(dict(bodyId=sample['bodyId'],rmsPreviewPx=float(np.sqrt(np.mean(np.square(errors)))),maximumPreviewPx=max(errors)))
 outlineRows.append(dict(model=model['model'],checks=checks))
print(json.dumps(dict(warning=__doc__,cameraModel='u,v = exp(logScale)*(R*positionAU).xy / (1+inverseDepth*(R*positionAU).z) + translation. Original pixels first normalized to 1600x1000 logical aspect.',limitations=['Unknown map camera; no cockpit intrinsics reused.','Seven fitted camera parameters; four-marker first image alone is underconstrained for a strong validation.','Marker allowance is approximate, not a statistical error model.','No orbital-element or phase fitting. Fixed external Vega matrix is not used.','This invokes the true-distance production scenePosition path, not a screenshot of a running app.'],independentOrbitOutlineCheck=outlineRows,rows=rows),indent=2,allow_nan=False))
