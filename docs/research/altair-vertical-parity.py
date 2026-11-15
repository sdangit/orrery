"""Test both orbital parities with a forward-facing perspective camera.

Unlike the historical fit, inverse depth is nonnegative. Camera coordinates
are right/down/forward (a right-handed basis); all bodies remain in front.
Only camera pose, positive uniform scale, translation and depth are fitted.
No orbital data or timestamps are fitted. Original historical reports remain intact.
"""
import json
import subprocess
from pathlib import Path
import numpy as np
from scipy.optimize import least_squares
from scipy.spatial.transform import Rotation

ROOT = Path(__file__).resolve().parent
fixture = json.loads((ROOT / 'fixtures/altair-orrery-image-points.json').read_text())
geometry = json.loads(subprocess.check_output(['node', str(ROOT / 'altair-orrery-geometry.mjs')]))
historical = json.loads((ROOT / 'altair-orrery-analysis-results.json').read_text())

def project(p, points):
    q = points @ Rotation.from_rotvec(p[:3]).as_matrix().T
    return np.exp(p[3]) * q[:, :2] / (1 + p[6] * q[:, 2:]) + p[4:6]

rows = []
for image, row, old in zip(fixture['images'], geometry['rows'], historical['rows']):
    model = next(m for m in row['models'] if m['model'] == 'candidate')
    oldfit = next(m for m in old['models'] if m['model'] == 'candidate')
    ids = [p['bodyId'] for p in image['points']]
    scale = np.array([1600 / image['width'], 1000 / image['height']])
    observed = np.array([p['pointPx'] for p in image['points']]) * scale
    points = np.array([b['positionAU'] for b in model['bodies']])[ids]
    models = []
    for reflected in [False, True]:
        reflection = np.diag([1, 1, -1 if reflected else 1])
        positions = points @ reflection
        seeds = [np.r_[Rotation.random(random_state=i).as_rotvec(), np.log(180), observed[0], .04] for i in range(48)]
        if reflected:
            # Exact mirror of the historical negative-depth fit is a valid
            # positive-depth camera: H R F, H=diag(1,1,-1), det(H R F)=+1.
            p = np.array(oldfit['cameraParameters'])
            p[:3] = Rotation.from_matrix(reflection @ Rotation.from_rotvec(p[:3]).as_matrix() @ reflection).as_rotvec()
            p[6] = -p[6]
            seeds.append(p)
        best = None
        for seed in seeds:
            fit = least_squares(lambda p: (project(p, positions) - observed).ravel(), seed,
                                bounds=([-np.inf]*6 + [0], [np.inf]*6 + [.15]), max_nfev=1500)
            errors = (project(fit.x, positions) - observed) / scale
            rms = float(np.sqrt(np.mean(np.sum(errors**2, axis=1))))
            if best is None or rms < best[0]:
                best = (rms, fit.x, errors)
        rms, p, errors = best
        outline_checks = []
        outline = fixture['independentOrbitOutlineSamples']
        if image is fixture['images'][outline['imageIndex']]:
            for sample in outline['samples']:
                curve = np.array(next(o['pointsAU'] for o in model['orbits'] if o['id'] == sample['bodyId'])) @ reflection
                curve = project(p, curve) / scale * np.array([1600 / image['width'], 1034 / image['height']])
                a, d = curve[:-1], np.diff(curve, axis=0)
                distances = []
                for point in sample['previewPoints']:
                    t = np.clip(np.sum((point-a)*d, axis=1) / np.sum(d*d, axis=1), 0, 1)
                    distances.append(float(np.min(np.linalg.norm(a+t[:, None]*d-point, axis=1))))
                outline_checks.append(dict(bodyId=sample['bodyId'], rmsPreviewPx=float(np.sqrt(np.mean(np.square(distances))))))
        models.append(dict(reflected=reflected, rmsOriginalPx=rms,
                           maxOriginalPx=float(np.max(np.linalg.norm(errors, axis=1))),
                           inverseDepth=float(p[6]), cameraParameters=p.tolist(),
                           bodyErrorsOriginalPx=np.linalg.norm(errors, axis=1).tolist(), independentOutlineChecks=outline_checks))
    rows.append(dict(timestamp=row['timestamp'], bodyIds=ids,
                     historicalInverseDepth=oldfit['cameraParameters'][6], models=models))

print(json.dumps(dict(description=__doc__, limitations=[
    'First image has only four markers for seven fitted parameters.',
    'Same existing image measurements; this is a corrected audit, not new observations.',
    'No V886 Centauri screenshot fit is claimed.',
], rows=rows), indent=2, allow_nan=False))
