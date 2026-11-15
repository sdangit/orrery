"""Research replay from frozen pixel measurements; no screenshots required.

Run from any directory with NumPy and SciPy installed. JSON goes to stdout.
The two named external fit targets are Sol and Altair; Sirius is held out.
This measures Vega's alignment, not a universal orbital-to-galactic rule.
"""
import itertools
import json
from pathlib import Path

import numpy as np
from scipy.optimize import least_squares
from scipy.spatial.transform import Rotation

ROOT = Path(__file__).resolve().parent
data = json.loads((ROOT / 'fixtures/vega-external-image-points.json').read_text())
K = np.array(json.loads((ROOT / 'vega-capture-projection-results.json').read_text())['intrinsics'])
Ki = np.linalg.inv(K)
geometry = json.loads((ROOT / 'vega-capture-geometry-results.json').read_text())


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


def model_at(timestamp):
    row = next(r for r in geometry['rows'] if r['timestamp'] == timestamp)
    return row['models'][1]


def pose(heading, pitch, roll=0):
    """Camera to east/north/up, used ONLY for the coarse Tracy check."""
    h, p = np.radians([heading, pitch])
    forward = np.array([np.sin(h)*np.cos(p), np.cos(h)*np.cos(p), np.sin(p)])
    right = np.array([np.cos(h), -np.sin(h), 0])
    down = -np.cross(right, forward)
    return np.array([right, down, forward]).T @ Rotation.from_euler('z', roll, degrees=True).as_matrix()


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

g = unit(np.array([r['coords'] for r in data['references']]) - data['origin']['coords'])
c = np.array([reticles[22], rotations[21, 22] @ reticles[21],
              rotations[22, 23].T @ reticles[23]])
R = Rotation.align_vectors(c[:2], g[:2])[0].as_matrix()
F = reflection(*g[:2])
branches = [(1, R), (-1, R @ F)]
external = [{'determinant': parity, 'galacticToCamera22': Q.tolist(),
    'fitErrorsDeg': [angle(Q @ a, b) for a, b in zip(g[:2], c[:2])],
    'siriusHoldoutErrorDeg': angle(Q @ g[2], c[2])} for parity, Q in branches]
winner = min(external, key=lambda x: x['siriusHoldoutErrorDeg'])
Q = np.array(winner['galacticToCamera22'])
validation_rays = {x['index']: rays([x['pointPx']])[0] for x in data['reticleValidationCores']}
validation = [{'index': x['index'], 'name': x['name'],
    'reticleToVisibleCoreErrorDeg': angle(reticles[x['index']], validation_rays[x['index']])}
    for x in data['reticleValidationCores']]
# Sensitivity to using the visible Altair/Sirius cores instead of their brackets.
# Sol has no manually identified bright core here and retains its marker bearing.
corec = np.array([reticles[22], rotations[21,22] @ validation_rays[21],
                 rotations[22,23].T @ validation_rays[23]])
coreR = Rotation.align_vectors(corec[:2], g[:2])[0].as_matrix()
corecheck = [{'determinant': parity, 'siriusHoldoutErrorDeg': angle(T @ g[2], corec[2])}
             for parity, T in [(1, coreR), (-1, coreR @ F)]]
Q16 = rotations[16, 17].T @ rotations[17, 22].T @ Q
cores = {x['index']: rays(x['pointsPx']) for x in data['localCores']}
observed = np.einsum('ij,jk->ik', cores[16], Q16)
epoch = '2026-11-15T05:43:12Z'
local = np.array([t['direction'] for t in model_at(epoch)['targets'][:2]])
P = Rotation.align_vectors(observed, local)[0].as_matrix()
Flocal = reflection(*local)
local_branches = [(1, P), (-1, P @ Flocal)]

# Coarse third-local-body check, deliberately independent of starfield fitting.
tc = data['coarseTracyCheck']
tracy = np.array(model_at(tc['hudTimestamp'])['targets'][2]['direction'])
refpose = pose(tc['referenceHeadingDeg'], tc['referencePitchDeg'], tc['referenceApproximateRollDeg'])
tracy_gal = Q.T @ refpose.T @ pose(tc['headingDeg'], tc['pitchDeg'], tc['approximateRollDeg']) @ reticles[24]
local_report = []
for parity, M in local_branches:
    # Sensitivity grid is a declared perturbation test, not a confidence interval.
    errors = []
    for dh, dp, dr, rh, rp, rr in itertools.product([-1, 1], [-1, 1], [-2, 2], [-1, 1], [-1, 1], [-2, 2]):
        measured = Q.T @ pose(113+rh, 9+rp, rr).T @ pose(240+dh, -23+dp, 1.5+dr) @ reticles[24]
        errors.append(angle(M @ tracy, measured))
    local_report.append({'determinant': parity, 'candidateLocalToGalactic': M.tolist(),
        'stellarFitErrorsDeg': [angle(M @ a, b) for a, b in zip(local, observed)],
        'tracyCoarseErrorDeg': angle(M @ tracy, tracy_gal),
        'tracyAttitudeSensitivityErrorRangeDeg': [min(errors), max(errors)]})

# Repeat the older external fit with the parity now measured by Sirius.
oldc = np.array([reticles[7], rotations[7, 11].T @ reticles[11]])
oldQ = Rotation.align_vectors(oldc, g[:2])[0].as_matrix()
if winner['determinant'] < 0:
    oldQ = oldQ @ F
oldobserved = cores[9] @ (rotations[7, 9] @ oldQ)
permutations = []
for perm in itertools.permutations(range(3)):
    for signs in itertools.product([-1, 1], repeat=3):
        M = np.eye(3)[list(perm)] * np.array(signs)[:, None]
        errs = [angle(M @ a, b) for a, b in zip(local, observed)]
        permutations.append({'permutation': perm, 'signs': signs, 'errorsDeg': errs, 'sumErrorDeg': sum(errs)})

result = {'warning': 'Empirical Vega calibration. Sirius tests external parity; rounded HUD attitude only tests local parity coarsely. No universal mapping or formal absolute-error bound is established.',
    'registration': registration, 'reticles': reticle_report,
    'reticleCoreValidation': validation, 'visibleCoreSensitivity': corecheck,
    'externalPairAngles': [{'names': [data['references'][i]['name'], data['references'][j]['name']],
        'observedDeg': angle(c[i], c[j]), 'catalogueDeg': angle(g[i], g[j])} for i, j in [(0,1), (0,2), (1,2)]],
    'externalBranches': external,
    'skyLoopClosureDeg': float(np.degrees(Rotation.from_matrix(rotations[22,23] @ rotations[21,22] @ rotations[21,23].T).magnitude())),
    'localEpoch': epoch, 'localObservedGalacticDirections': observed.tolist(),
    'localObservedSeparationDeg': angle(*cores[16]), 'localCandidateSeparationDeg': angle(*local),
    'localBranches': local_report, 'tracyMirrorSeparationDeg': angle(P @ tracy, P @ Flocal @ tracy),
    'repeatCapture': {'oldSolAltairDeg': angle(*oldc),
        'oldSolReticleTransferErrorDeg': angle(rotations[7,9] @ reticles[7], reticles[9]),
        'oldToNewStellarDirectionDifferenceDeg': [angle(a,b) for a,b in zip(oldobserved,observed)],
        'caveat': 'Different epochs and sites; raw angular differences, not model-propagated residuals.'},
    'bestSignedPermutation': min(permutations, key=lambda x: x['sumErrorDeg'])}
print(json.dumps(result, indent=2, allow_nan=False))
