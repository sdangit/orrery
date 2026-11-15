"""Research replay from frozen pixel measurements; no screenshots required.

Run from any directory with NumPy and SciPy installed. JSON goes to stdout.
The external fit targets are Sol and Epsilon Indi; Sirius is held out.
This tests the frozen Vega matrix in Altair before any diagnostic local fit.
"""
import json
import subprocess
from pathlib import Path

import numpy as np
from scipy.optimize import least_squares
from scipy.spatial.transform import Rotation

ROOT = Path(__file__).resolve().parent
data = json.loads((ROOT / 'fixtures/altair-capture-image-points.json').read_text())
K = np.array(json.loads((ROOT / 'vega-capture-projection-results.json').read_text())['intrinsics'])
Ki = np.linalg.inv(K)



def unit(v):
    v = np.asarray(v, dtype=float)
    return v / np.linalg.norm(v, axis=-1, keepdims=True)


def rays(points):
    p = np.asarray(points)
    return unit(np.einsum('ij,kj->ik', np.c_[p, np.ones(len(p))], Ki))


def angle(a, b):
    return float(np.degrees(np.arccos(np.clip(unit(a) @ unit(b), -1, 1))))


def reflection(a, b):
    n = unit(np.cross(a, b))
    return np.eye(3) - 2 * np.outer(n, n)


# Refit the retained starfield pairs. Alternating-point holdout is diagnostic:
# all points participated in earlier correspondence selection by RANSAC.
rotations, registration = {}, []
for pair in data['registrationPairs']:
    A, B = rays(pair['pa']), np.array(pair['pb'])
    seed = Rotation.from_matrix(pair['R']).as_rotvec()

    def residual(x):
        q = np.einsum('ij,kj->ik', A, K @ Rotation.from_rotvec(x).as_matrix())
        return q[:, :2] / q[:, 2:] - B

    fit = least_squares(lambda x: residual(x).ravel(), seed, loss='soft_l1')
    held = least_squares(lambda x: residual(x)[::2].ravel(), seed, loss='soft_l1')
    R = Rotation.from_rotvec(fit.x).as_matrix()
    assert np.isfinite(R).all() and abs(np.linalg.det(R) - 1) < 1e-10
    rotations[pair['a'], pair['b']] = R
    registration.append({'a': pair['a'], 'b': pair['b'], 'count': len(A),
        'rmsPx': float(np.sqrt(np.mean(np.sum(residual(fit.x)**2, axis=1)))),
        'alternatingHoldoutRmsPx': float(np.sqrt(np.mean(np.sum(residual(held.x)[1::2]**2, axis=1)))),
        'rotation': R.tolist()})

# A constant-angle target bracket lies on a plane in unit-ray space.
# Its plane normal is the bearing; an off-axis ellipse centre is biased.
reticles, reticle_report = {}, []
for item in data['reticles']:
    r = rays(item['pixelPoints'])
    _, _, vt = np.linalg.svd(r-r.mean(0), full_matrices=False)
    n = vt[-1] * np.sign(vt[-1, 2])
    reticles[item['index']] = n
    radius = np.degrees(np.arccos(np.clip(np.einsum('ij,j->i', r, n), -1, 1)))
    p = K @ n
    reticle_report.append({'index': item['index'], 'pointCount': len(r),
        'centerPx': (p[:2]/p[2]).tolist(), 'ray': n.tolist(),
        'meanRadiusDeg': float(radius.mean()), 'radiusStdDeg': float(radius.std())})

plan=json.loads((ROOT/'fixtures/altair-transfer-plan.json').read_text())
manifest=json.loads((ROOT/'fixtures/altair-capture-manifest.json').read_text())
predictions={i:json.loads(subprocess.check_output(['node',str(ROOT/'altair-transfer-prediction.mjs'),manifest['images'][i]['hudTimestamp']])) for i in [0,9]}
g=unit(np.array([r['coords'] for r in plan['externalReferences']])-np.array([plan['system']['coords'][k] for k in ['x','y','z']]))
c=np.array([reticles[1],rotations[1,4].T@reticles[4],rotations[1,2].T@reticles[2]])
R=Rotation.align_vectors(c[:2],g[:2])[0].as_matrix();F=reflection(*g[:2])
external=[{'determinant':p,'galacticToCamera1':Q.tolist(),'fitErrorsDeg':[angle(Q@a,b) for a,b in zip(g[:2],c[:2])],'siriusHoldoutErrorDeg':angle(Q@g[2],c[2])} for p,Q in [(1,R),(-1,R@F)]]
winner=min(external,key=lambda x:x['siriusHoldoutErrorDeg']);Q=np.array(winner['galacticToCamera1'])
# Source camera -> camera 1, measured starfield rotations only.
T={0:rotations[0,1],1:np.eye(3),2:rotations[1,2].T,4:rotations[1,4].T,
9:rotations[1,4].T@rotations[4,7].T@rotations[7,8].T@rotations[8,9].T}
observed={i:Q.T@T[i]@reticles[i] for i in [0,9]}
results=[]
for i,j in [(0,1),(9,0)]:
 t=predictions[i]['targets'][j]
 results.append(dict(index=i,timestamp=predictions[i]['timestamp'],name=t['name'],observedGalacticDirection=observed[i].tolist(),candidateLocalDirection=t['candidateLocalDirection'],predictedGalacticDirection=t['predictedGalacticDirection'],frozenTransferErrorDeg=angle(observed[i],t['predictedGalacticDirection']),predictedDistanceLs=t['distanceLs'],observerOffsetBoundDeg=t['observerOffsetBoundDeg'],externalSeparations=[dict(name=plan['externalReferences'][k]['name'],observedDeg=angle(T[i]@reticles[i],c[k]),predictedDeg=angle(t['predictedGalacticDirection'],g[k])) for k in range(3)]))
validation=[]
for x in data['visibleCores']:
 i=x['index'];v=rays([x['pointPx']])[0]
 validation.append(dict(index=i,name=x['name'],reticleToCoreErrorDeg=angle(v,reticles[i]),coreObservedGalacticDirection=(Q.T@T[i]@v).tolist()))
loops=[]
for a,b,d in [(1,2,3),(1,3,4),(4,5,6),(4,6,7)]:
 L=rotations[a,d].T@rotations[b,d]@rotations[a,b]
 loops.append(dict(indices=[a,b,d],closureDeg=float(np.degrees(Rotation.from_matrix(L).magnitude()))))
# Diagnostics below are deliberately calculated after the frozen residuals.
# They cannot replace or redefine the primary transfer result.
local=np.array([r['candidateLocalDirection'] for r in results])
obs=np.array([observed[0],observed[9]])
P=Rotation.align_vectors(obs,local)[0].as_matrix()
localfit=[dict(determinant=parity,matrix=M.tolist(),fitErrorsDeg=[angle(M@a,b) for a,b in zip(local,obs)]) for parity,M in [(1,P),(-1,P@reflection(*local))]]
frozen=np.array(plan['frozenCandidateLocalToGalactic'])
relative=float(np.degrees(Rotation.from_matrix(P@frozen.T).magnitude()))
# Alternate paths use redundant measured sky overlaps, never HUD poses.
altEpsilon=rotations[1,3].T@rotations[3,4].T@reticles[4]
altT9=rotations[1,3].T@rotations[3,4].T@rotations[4,6].T@rotations[6,7].T@rotations[7,8].T@rotations[8,9].T
alternativePaths=dict(epsilonBearingDifferenceDeg=angle(altEpsilon,T[4]@reticles[4]),altairBearingDifferenceDeg=angle(altT9@reticles[9],T[9]@reticles[9]),altairFrozenErrorDeg=angle(Q.T@altT9@reticles[9],results[1]['predictedGalacticDirection']))
coreRays={x['index']:rays([x['pointPx']])[0] for x in data['visibleCores']}
corec=np.array([coreRays[1],T[4]@reticles[4],T[2]@coreRays[2]])
coreQ=Rotation.align_vectors(corec[:2],g[:2])[0].as_matrix()@F
coreSensitivity=dict(note='Visible Sol/Sirius/local cores replace their brackets; Epsilon Indi still uses its bracket.',siriusHoldoutErrorDeg=angle(coreQ@g[2],corec[2]),localTransferErrorsDeg=[dict(index=i,errorDeg=angle(coreQ.T@T[i]@coreRays[i],results[j]['predictedGalacticDirection'])) for j,i in enumerate([0,9])])
fresh=[]
for row in results:
 i=row['index'];j=1 if i==0 else 0
 pred=json.loads(subprocess.check_output(['node',str(ROOT/'altair-transfer-prediction.mjs'),row['timestamp'],'--fresh-journal']))['targets'][j]
 fresh.append(dict(index=i,name=row['name'],directionChangeDeg=angle(pred['candidateLocalDirection'],row['candidateLocalDirection']),frozenTransferErrorDeg=angle(observed[i],pred['predictedGalacticDirection']),distanceLs=pred['distanceLs']))
# The two local observations are 141 seconds apart. Document their predicted
# drift instead of silently treating them as exactly simultaneous.
timeDrift=[dict(name=a['name'],degrees=angle(a['candidateLocalDirection'],b['candidateLocalDirection'])) for a,b in zip(predictions[0]['targets'],predictions[9]['targets'])]
result=dict(warning='Frozen Vega transfer test; no local-to-galactic refit is used in these residuals. Target-arc model and projection have systematic uncertainties; operational gates are not confidence intervals.',registration=registration,reticles=reticle_report,externalBranches=external,externalPairAngles=[dict(names=[plan['externalReferences'][i]['name'],plan['externalReferences'][j]['name']],observedDeg=angle(c[i],c[j]),catalogueDeg=angle(g[i],g[j])) for i,j in [(0,1),(0,2),(1,2)]],skyLoopClosures=loops,visibleCoreValidation=validation,frozenTransfer=results,localPairSeparation=dict(observedDeg=angle(observed[0],observed[9]),candidateAtSeparateCaptureEpochsDeg=angle(results[0]['candidateLocalDirection'],results[1]['candidateLocalDirection'])),capturePredictions=predictions,alternateRegistrationPaths=alternativePaths,visibleCoreSensitivity=coreSensitivity,freshJournalSensitivity=fresh,predictedMotionAcrossSession=timeDrift,diagnosticAltairLocalFits=dict(warning="Post-test two-body fits, not independent validation. Both parities remain possible in Altair; no third local direction or later epoch is held out.",branches=localfit,properRotationDifferenceFromFrozenDeg=relative))
print(json.dumps(result,indent=2,allow_nan=False))
