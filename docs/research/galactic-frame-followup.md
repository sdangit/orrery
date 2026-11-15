# Orbital frame audit and screenshot calibration

Continuation on 2026-11-14, America/Los_Angeles, of the [initial research checkpoint](galactic-starfield-alignment.md). This report records source inspection, numerical experiments, and the subsequent in-game observation session. It does not establish a universal galactic alignment rule.

**Latest update:** [Production angle correction and source-data audit](#production-angle-correction-and-source-data-audit) fixes the confirmed Altair mismatch in the running app. The renderer now negates Elite ascending-node/periapsis inputs consistently for positions, orbit lines and orbit-aligned views. A live-source audit finds no stale-phase explanation for Altair. All captured markers pass a fixed-camera regression within 3 original pixels, and the user reports the app appears corrected. Other systems—especially nested hierarchies—still need confirmation. Historical experiments below retain their pre-correction baselines and must not be mistaken for current app behaviour.

## Findings that change the earlier assessment

**The current common-frame assumption is contradicted by the captured distance data.** A candidate model that carries parent orbital orientation and axial tilt through the hierarchy agrees much more closely with those distances. Merely changing angle signs is insufficient. A further root-binary convention resolves a large circumbinary discrepancy in HIP 97950, but that particular rule still needs independent discriminatory validation.

**The player's unknown free-space position need not prevent sky calibration.** We can either estimate position from sufficiently informative body measurements or bound its effect by observing close to a known small body. The latter is the simpler first experiment in Vega.

**Absolute sky orientation remains unmeasured.** Arrival distances cannot establish a global rotation or reflection of the system. Even excellent scalar-distance agreement does not independently certify every reconstructed 3D direction. An external sky reference is still required.

## Community source audit

### Canonn sign correction history

The angle-sign change was located in [Canonn commit d0f67811f21c](https://github.com/canonn-science/canonn-signals/commit/d0f67811f21cbecde743e54ee235f2f73a0b0130), associated with [PR 77](https://github.com/canonn-science/canonn-signals/pull/77). The commit changes node and periapsis signs and updates the corresponding mean-longitude calculation. It documents an Elite/Spansh convention but does not include an observed celestial-attitude fixture.

The inspected commit comments, PR discussion/review comments, precursor PR 69 discussion, and issue 17 comments did not supply an orbital-to-galactic transformation or the measurement that originally established the sign change. This avenue has yielded the implementation provenance, but no sky-frame definition so far. A maintainer may know more; no message has been sent.

### SrvSurvey successor implementation

[PR 1023's orbital implementation at 4739ae7](https://github.com/njthomson/SrvSurvey/blob/4739ae7bc6ae56715e85af39a906b671aadd2cef/SrvSurvey/game/OrbitalMechanics.cs) retains the negative inclination/node/periapsis convention and additive parent accumulation.

Its [eight orbital/route tests](https://github.com/njthomson/SrvSurvey/blob/4739ae7bc6ae56715e85af39a906b671aadd2cef/tests/SrvSurvey.OrbitalTests/OrbitalMechanicsTests.cs) exercise parent accumulation, invalid data, hierarchy inference, and route behavior. They do not compare nonzero orbital angles against observed sky geometry. The simple accumulation fixture has zero orientation angles. These tests therefore cannot resolve the frame discrepancy identified here.

### Elite Day Night model

The inspected [`elite_daynight_model_v16.py`](https://github.com/LouisH99/Elite-Dangerous-Day-Night-Calculator/blob/main/elite_daynight_model_v16.py) uses positive orbital angles and fits a body-frame orientation, spin phase, and discrete sign alternatives to observations. Its comments explicitly treat the inertial axes as arbitrary and rely on the fit to absorb an unknown convention.

This confirms that the project is a calibration precedent, rather than a source of a fixed galactic-frame mapping. A fitted body orientation can absorb an arbitrary constant basis for a single orbital model; that does not prove it can correct wrong relative geometry across an entire hierarchy. No day/night predictions were independently reproduced in this session.

## An additional constraint from catalogue arrival distances

The Spansh snapshots preserve both `distanceToArrival` and `timestamps.distanceToArrival`, alongside mean anomaly and its own timestamp. These provide an independent scalar measurement against which a reconstructed hierarchy can be checked, without needing the player's current position.

The experiment evaluates each body's position at its recorded distance timestamp, propagates each ancestor from that ancestor's own mean-anomaly timestamp, and compares the resulting distance from the main star with the stored arrival distance. Treating the main star as the distance origin is an empirical interpretation supported by the direct-star checks; the broad community event documentation names the arrival field without fully defining all geometry semantics. [Event reference](https://doc.elitedangereuse.fr/Exploration/).

The values being compared are **not live ship-to-target HUD ranges**. Do not substitute `distanceToArrival` for an observer range in a triangulation calculation.

### Reproduction files

- [Projected snapshots](fixtures/orbital-frame-snapshots.json): only fields needed for orbital reconstruction and the Vega observation plan, from seven public Spansh dumps, with source URLs and hashes of the original responses.
- [Orbital audit](orbital-frame-audit.mjs): offline executable comparison using the actual Orrery Kepler solver.
- [Complete numerical results](orbital-frame-audit-results.json): all 312 body measurements, all five model variants, and per-body residuals.

Run from the repository root:

```sh
node docs/research/orbital-frame-audit.mjs
node docs/research/orbital-frame-audit.mjs --json
```

The baseline is additionally checked against the app's actual `absolutePosition` function, within one metre of numerical summation difference. This audit compares the physical orbital calculation, not compressed rendering, object sizes, or the entire UI. All selected measurements are retained; the script fails if a case is silently skipped or an ancestor is missing.

### Candidate formula

For a body with node `Ω`, inclination `i`, and argument of periapsis `ω`, the tested candidate orbital basis is:

```text
B = Rz(-Ω) Rx(+i) Rz(-ω)

v = [a(cos E - e), a sqrt(1 - e²) sin E, 0]
Pbody = Pparent + Qparent B v
Qbody = Qparent B Rx(AxialTilt)
```

`P` is position and `Q` is the inherited orientation supplied to children. Orbital angles are converted from degrees; the raw axial-tilt value enters as radians. The time-varying mean anomaly controls `E`; daily body spin is not added to the children's orbital frame. This is an empirically tested candidate, not a quoted Frontier definition.

An alternative with all relevant reflections consistently applied could fit the same ranges. The signs above specify this experiment's internal convention; scalar ranges cannot settle global handedness.

The candidate differs from the current app in two ways: node/periapsis signs and the inherited orientation. It also differs from the inspected community common-frame implementations by carrying that orientation through the parent chain.

### Root binary hypothesis

HIP 97950 initially remained a large counterexample after adding inherited orientation and tilt. Its A/B/C stellar arrangement and A's local planets fit, while the outer ABC bodies did not.

The additional hypothesis is that the outer circumbinary bodies inherit the central binary's orbital basis. The two members that define the binary are treated separately so that their shared orbital orientation is not applied twice.

The research implementation identifies a root main star and one opposite member with matching period, eccentricity, inclination, and node, and periapsis offset by approximately 180 degrees. Other root children then receive the main star's orbital basis. In HIP 97950 this identifies bodies 1 and 2, where 2 is itself the B/C barycentre. It is not hard-coded to the system name or those IDs.

This rule was developed by examining the HIP discrepancy, so HIP is a fit case for this hypothesis, not an independent validation. Although other fixtures also contain a detected root pair, their measured geometry does not provide the same discriminatory circumbinary test. Further root and nested-barycentre cases remain necessary.

### Results

Residuals below are RMS differences from recorded arrival distances, in light-seconds. One light-second is 299,792.458 km. A smaller scalar residual is evidence about the tested geometry, not a direct measurement of sky angular accuracy.

| System | Measurements | Current app convention | Negative node and periapsis only | Inherited orbit and tilt | Candidate including root binary rule |
| --- | ---: | ---: | ---: | ---: | ---: |
| Sol | 39 | 1.916204 | 1.561365 | 0.001734 | 0.001734 |
| HIP 97950 | 39 | 307.309527 | 443.161410 | 443.223162 | 0.000347 |
| Bleia Dryiae XJ-R e4-1 | 172 | 16177.385170 | 7259.988293 | 0.063002 | 0.063002 |
| Epsilon Indi | 13 | 622.389223 | 166.596053 | 0.000995 | 0.000995 |
| 61 Cygni | 5 | 0.000151 | 0.000151 | 0.000151 | 0.000151 |
| LHS 3447 | 33 | 392.537774 | 40.721898 | 0.000006 | 0.000006 |
| Vega | 11 | 2.140044 | 0.740667 | 0.000448 | 0.000448 |

Selection history matters:

- Sol was used to explore combinations of angle signs, parent-frame inheritance, and axial-tilt rotations. It is a model-development sample.
- The unmodified inherited-frame candidate then greatly improved Bleia, but failed on HIP's outer bodies.
- The root-binary rule was developed using HIP.
- Epsilon Indi, 61 Cygni, and LHS 3447 were fetched afterward to check the candidate without changing it. Epsilon Indi and LHS 3447 provide useful further support. 61 Cygni is not discriminatory: all models give practically the same scalar distances.
- Vega was fetched after the user identified it as their current location. The same candidate improves its distance fit without a Vega-specific adjustment.

A direct example is the Moon in the saved Sol snapshot:

| Calculation | Distance from Sol in light-seconds |
| --- | ---: |
| Recorded | 506.068536 |
| Current common-frame convention | 506.323728387 |
| Negative node/periapsis, still common frame | 507.926196633 |
| Inherited orbital orientation and tilt | 506.068536260 |

The current discrepancy for that record is about 76,504 km. Applying just the community angle signs makes it worse; including the inherited frame brings it close to the stored value. This is why a sign-only production patch would be premature.

### Residuals and data limitations

The candidate's remaining maximum residuals include about 0.008240 ls in Sol and 0.095687 ls in Bleia. These are not zero and, in absolute distance, the latter is about 28,687 km. Several moon residuals track the residual of their distant parent, which is consistent with inherited upstream position or source-precision error, but the cause has not been established.

Spansh combines records and timestamps from multiple contributions. Rounded orbital elements, stale or inconsistent metadata, epoch semantics, and our remaining model errors can all matter. Fresh simultaneous raw journal scans would improve the test. The current audit neither bounds all of these effects nor proves the reconstructed directions are uniquely correct.

The attempted LFT 509 sample was unsuitable for this particular check because the inspected response did not identify a usable main-star origin. It was not counted as a validation case. The durable audit intentionally requires an explicit main star.

The captured Triton record has a negative orbital period, approximately -5.876854 days. The research harness retains its sign; zero periods are invalid. The current app's community mapper already permits nonzero negative periods. Do not introduce a blanket positive-period requirement while porting another project's orbital validation rules.

## What has and has not been resolved

| Original issue | Updated status |
| --- | --- |
| F1 reference frame definition | Strong evidence for hierarchical orbital/equatorial frame inheritance; no complete official definition recovered |
| F2 universal galactic mapping | Still open; none of the range measurements can determine it |
| F3 authored versus procedural systems | Candidate works much better on Sol and several other captured systems; universal equivalence is not established |
| F4 angle signs | Negative node/periapsis supported as part of the candidate; global handedness remains unobservable from ranges |
| F5 direct addition of parent offsets | Current common-frame assumption fails the captured-distance comparison; hierarchical candidate substantially improves it |
| F6 system seed encoding orientation | No verified derivation found; not resolved |
| F7 calibration without ship XYZ | Feasible in principle through range/pose estimation or near-body error bounds; synthetic demonstration added |
| F8 reuse across relog/return | Needs actual in-game observations |
| F9 existing community solution | Three implementation avenues inspected further; no fixed external alignment found |
| V3 parallax | Quantified geometric bounds; exact game behavior for skybox versus navigation reticles still needs observation |
| V4 compressed display | Physical positions must be used for calibration; compression cannot preserve all observer geometry |
| D1 units and epochs | Candidate uses per-field phase/distance epochs, degrees for orbital angles, radians for axial tilt, signed periods |
| D2 documentation accuracy | Existing technical claim narrowed to match the unresolved conventions |

The API-density, provider-contract, catalogue-count, photometric, and anomalous-record questions from the original checkpoint remain open. This continuation prioritizes geometry, which is the blocker for claiming an accurately aligned in-system sky.

## Recovering alignment without known ship coordinates

### The full image pose problem

For local body positions `Pi`, observer position `C`, a system-to-galaxy orientation `Q`, galactic-to-camera attitude `A`, and camera projection `K`, a local-body image measurement obeys:

```text
pixel_i ~ project(K A Q (Pi - C))
```

For a distant catalogue direction `dj`, using the sky-at-infinity approximation:

```text
pixel_j ~ project(K A dj)
```

Background references constrain camera attitude `A`; local bodies constrain `C` and `Q`. Consequently, an unknown observer position is a parameter to estimate, not automatically a fatal missing input.

[OpenCV's PnP documentation](https://docs.opencv.org/4.x/d5/d1f/calib3d_solvePnP.html) describes recovering rotation and translation from known 3D points and their image projections, with calibrated projection. Three-point methods can have multiple solutions. Extra points, independent views, and explicit treatment of coplanar or nearly coplanar geometry are necessary safeguards. A camera pose fitted only to local bodies does not provide the galactic link; that comes from the background references.

Multiple arbitrary viewpoints do not automatically fix everything. Each unregistered image adds a camera pose and possibly unknown translation. The model must tie views together using identifiable bodies, times, background references, known ranges or location constraints, and consistent camera projection. Moving baselines help when they are measured or jointly constrained.

### Range multilateration

With observer ranges `ri` to known body centres `Pi`:

```text
|C - Pi|² = ri²

2 (Pi - P0) · C = |Pi|² - |P0|² + r0² - ri²
```

Four noncoplanar centres give three independent linear difference equations for `C` in ideal data. With noise, use more constraints and a residual-based fit. Three ranges can leave a mirror ambiguity; coplanar range anchors cannot distinguish observer positions reflected across their plane. Nearly coplanar geometry amplifies rounding error.

HUD distances could supply additional constraints, but first verify whether a particular display measures to a body centre, surface, selected POI, or another reference. Record units and rounding. Do not use catalogue arrival distances as observer ranges, and do not treat measurements taken while moving or while fast moons advance as simultaneous.

### Synthetic experiment

[The offline calibration demonstration](observer-calibration-demo.mjs) and [its output](observer-calibration-results.json) use four known body centres, ranges, and body bearings already expressed in a known sky frame. They recover two different unknown observer positions and the same fixed frame rotation, then check two bearings not used to fit the rotation.

The noise-free errors are at floating-point scale. This verifies the geometry calculation, not a real game's measurement quality or a screenshot-processing pipeline.

With assumed range errors of ±0.01 ls, a well-spread fixture gives about 0.0231 ls of observer-position error. Flattening the fourth anchor to nearly the other three's plane increases that to about 64.7 ls. Exactly coplanar range geometry is explicitly rejected as singular. The ±0.01 ls figure is an experiment input, not a measured Elite HUD precision.

Run:

```sh
node docs/research/observer-calibration-demo.mjs
```

### Near-body observations can avoid solving the full position

If the ship is within distance `rho` of a known body centre, and a target is distance `D` from that centre, using the body's centre as an approximate observer introduces at most:

```text
angular position contribution <= asin(rho / D), for rho < D
```

Use body radius plus altitude as a conservative bound for a landed or low-hover observation. This does not require knowing the body's prime meridian or spin phase. Latitude/longitude remain useful metadata, but they are not sufficient for exact Cartesian reconstruction without the body's full orientation.

For an observer within 1,000 km of a moon centre, the bound is about 0.0573 degrees for a target 1 million km away, but only 0.000383 degrees for a target 1 AU away. Choosing distant local references can therefore make unknown surface position a much smaller contribution than screenshot measurement error.

### Background parallax

The same geometric bound gives about 0.000906 degrees for a 1 AU observer offset relative to a target 1 ly away; 100 AU at 1 ly gives about 0.0906 degrees, and 100 AU at 4 ly gives about 0.02265 degrees.

These are geometric bounds, not measurements of Elite's sky renderer. Its jump-generated background and an external-system navigation marker may not use identical observer origins or update behavior. Compare them experimentally rather than assuming both account for intra-system parallax.

## Proposed first observation in Vega

The user is currently in Vega and can travel nearby. The [Vega dump](https://spansh.co.uk/api/dump/301958431924) provides a useful site without leaving the system. [EDSM's body catalogue](https://www.edsm.net/en/system/bodies/id/11009/name/Vega) also identifies the landable bodies.

**Recommended initial site: Trikora**, the landable moon of Tracy's Havan. The inspected records give a radius of approximately 1,704.6 km and an orbital period of about 451.15 days. Its slow orbital motion and accessible size are preferable for a first measurement to the roughly 0.83-day moon Vega 2 d a, whose nearby geometry changes more rapidly.

The candidate model evaluated at the snapshot time, 2026-11-15 03:00:07 UTC, predicts the following approximate geometry from Trikora's centre:

| Target | Distance | Bound from radius plus 10 km altitude |
| --- | ---: | ---: |
| Vega | 3,743.60 ls | 0.000088 degrees |
| Vega 2 | 4,329.17 ls | 0.000076 degrees |
| Tracy's Havan | 10.16 ls | 0.03224 degrees |

Vega and Vega 2 are about 24.5 degrees apart in the candidate geometry, making a shared broad view plausible if the horizon does not obstruct them. Tracy's Havan is approximately 145.8 degrees from Vega, so it would require another view. These are model predictions for planning, not observed alignments or validated full angular error budgets.

Popov Reward is a nearer-to-arrival alternative: it is landable, approximately 1,300.2 km in radius, and has a roughly 362-day orbit. Its two stellar references are about 155.7 degrees apart in the candidate geometry, making it less convenient for a shared view. Staying at Trikora is a suggestion, not a requirement if the user already has a convenient stable location.

### First capture should establish whether the image information is usable

Start with a small pilot capture rather than collecting a large dataset blindly:

1. Land or hover low over Trikora, ideally with Vega and Vega 2 above the horizon. A screenshot of the HUD with body identity, latitude, longitude, and altitude records the location constraint.
2. Use ordinary in-game cockpit screenshots at the original resolution. Keep the HUD and avoid cropping, rescaling, FOV changes, headlook changes, or free-camera translation between images intended to share a pose. A free-camera image is usable only if its separate pose is accounted for.
3. Capture a broad view including Vega, Vega 2 if identifiable, and background stars. Target each local reference in turn if that helps identify its centre, preserving the camera orientation as far as possible. Record a UTC time for every image; body rotation means a landed camera is not perfectly inertial over time.
4. Include the relevant current journal scans and barycentre events, or the system snapshot used by the app. Fresh journal phases are preferable to relying indefinitely on the community capture. A journal `Screenshot` event may help associate file and time; do not assume it records every needed camera parameter.
5. Record resolution, FOV setting, display aspect ratio, and any VR/head-tracking or camera zoom in use. The first image will determine whether plate solving is practical or whether targeted external-system markers are a better route.

External star/system references are essential. A shot showing only local bodies can test their geometry but cannot establish galactic orientation. If catalogue star identification is inadequate, use visible external-system target markers in overlapping, registered views. An off-screen edge indicator is not a direct screen-plane bearing and should not be treated as one.

For a stronger follow-up, obtain an independent view or another stable location and reserve some body/reference directions as checks rather than fit inputs. Only after Vega has a validated mapping should we test a second system for universality. No screenshot-based alignment has been performed yet.

## Remaining avenues and stopping point

The inspected Canonn history, SrvSurvey implementation/tests, and Day/Night model have yielded useful local-geometry or calibration evidence but no fixed orbital-to-galactic mapping. Repeating the same broad web queries is now low yield. That does not mean every community or archived discussion has been exhausted.

Useful remaining independent work includes generalizing the barycentre rule on additional discriminatory systems, checking fresh simultaneous journals, tracing whether Stellar Forge root orientation is encoded in accessible data, and searching specific archived threads if new references identify them. Any claim of a universal mapping needs actual sky-facing validation.

**A controlled Vega capture is now the most useful next external measurement.** The lack of free-space ship XYZ is manageable with the near-Trikora approach; it does not require an uncontrolled tour through multiple viewpoints. The current limitation is obtaining enough identifiable external and local directions with reliable timestamps and projection information.

No production orbital code has been changed. The research scripts and fixtures are isolated under `docs/research`; the technical accuracy statement has been narrowed so it does not overstate what the current app implements.

## Vega screenshot experiment: 2026-11-14 evening Pacific / 2026-11-15 UTC

**New result:** seven user-provided cockpit screenshots reject the current common-frame reconstruction for the view from Trikora. They strongly support the candidate correction, but do not yet establish an orbital-to-galactic rotation. A roughly 0.05-degree angular discrepancy remains between the candidate and the image measurements.

### Evidence and provenance

The original PNGs are on the user's Desktop, named `Screenshot 2026-11-14 at 9.<time> PM.png` (the actual filenames contain a narrow no-break space before PM). They are read-only inputs; no resized or annotated substitute is used for pixel measurements. The inspection tool displayed smaller previews, but the extraction scripts read the original **4112 × 2658** pixels.

[Image manifest](fixtures/vega-capture-manifest.json) records exact filenames, SHA-256 hashes, byte counts, dimensions, camera confirmation and relevant display settings. Images have not been copied into the repository. Their local source directory is recorded in the manifest; the numeric evidence can be analysed without distributing the full images.

The user confirms `<FOV>56.249001</FOV>`, ship cockpit, no headset/VR, and no headlook. The local graphics settings independently contain that FOV and a configured display size of **2560 × 1600**. The relationship between nominal FOV and effective projection must therefore be measured rather than assumed.

| Index | Desktop filename time (Pacific) | HUD time (UTC) | Selected target | Altitude | Latitude / longitude |
| --- | --- | --- | --- | --- | --- |
| 0 | 21:19:52 | 05:19:52 | Vega 2 | 970 m | −36.8636 / −10.1373 |
| 1 | 21:20:05 | 05:20:05 | Vega 2, approximately centred | 970 m | −36.8636 / −10.1373 |
| 2 | 21:20:15 | 05:20:15 | Vega; camera approximately unchanged from index 1 | 970 m | −36.8636 / −10.1373 |
| 3 | 21:20:42 | 05:20:42 | Vega, approximately centred | 970 m | −36.8636 / −10.1376 |
| 4 | 21:22:12 | 05:22:12 | Vega 2, approximately centred | 7.75 km | −36.8678 / −10.1431 |
| 5 | 21:22:33 | 05:22:33 | Vega 2; Vega approximately centred, rolled view | 7.75 km | −36.8678 / −10.1433 |
| 6 | 21:22:54 | 05:22:54 | Vega 2; Vega approximately centred, different roll | 7.75 km | −36.8678 / −10.1434 |

The HUD identifies **Trikora**, and the selected distances are **3,744 ls to Vega** and **4,330 ls to Vega 2**. These are rounded display measurements, not precise ranges. The current journal independently records arrival in Vega at `2026-11-15T05:13:26Z`, Trikora approach at `05:17:22Z`, and Vega's galactic `StarPos = [-21.90625, 8.125, 9]` ly. No journal `Screenshot` events were found in the inspected capture interval; timestamps are associated using filename date/local time and the matching HUD clock, not an assumed screenshot event.

[Reduced journal scans](fixtures/vega-capture-scans.json) preserve only the four bodies needed for this calculation: Vega, Vega 2, Tracy's Havan and Trikora. The latest available orbital scans are from `03:00:07Z`, about 2 hours 20 minutes before the captures; phases are propagated to each capture time. They are not simultaneous scans taken during the screenshot sequence.

### Independent local-geometry checks

[Geometry calculation](vega-capture-geometry.mjs) and [its output](vega-capture-geometry-results.json) evaluate both conventions at each capture time. The baseline is checked against the actual shared `absolutePosition()` implementation for all four bodies at all seven epochs, to within one metre. The candidate follows the previously documented inherited orbit-frame and axial-tilt convention; Vega does not require the experimental root-binary exception.

At `05:20:15Z`, using Trikora's centre as the observer:

| Quantity | Current application solver | Candidate correction | Screenshot evidence |
| --- | ---: | ---: | ---: |
| Range to Vega | 3,747.732 ls | 3,743.608 ls | 3,744 ls |
| Range to Vega 2 | 1,981.260 ls | 4,329.768 ls | 4,330 ls |
| Vega–Vega 2 separation | 7.9824° | 24.5079° | Approximately 24.55–24.56° from fitted image projection |

The current solver can fit many distances measured from the arrival star while placing bodies at incorrect relative directions. The new observer location is particularly informative: its range to Vega 2 differs by thousands of light-seconds between the two conventions. This is why the earlier roughly 2.14-ls Vega arrival-range RMS did not reveal the full practical error.

There is also a coarse check requiring neither camera calibration nor orbital reconstruction. Image 1 centres Vega 2 with heading **54°**, pitch **33°**; image 3 centres Vega with heading **26°**, pitch **46°**. Applying the spherical separation formula gives **25.02°**. These integer readouts, slight centring offsets, and 37-second time difference limit precision. This check independently rejects an 8° separation, but cannot resolve a 0.05° residual.

For the candidate's stellar directions, ignoring the observer's displacement from Trikora's centre contributes less than **0.00009°** at these altitudes. The 970-m versus 7.75-km observations therefore do not provide a useful long baseline for stellar triangulation. Their changes of camera orientation are useful for projection calibration. Unknown ship XYZ is not the dominant uncertainty in this experiment.

### Empirical screenshot projection

[Extraction script](vega-capture-extract.py) detects compact neutral-bright image components, constructs SIFT descriptors at several neighbourhood sizes and orientations, and matches them between views. It does not identify their catalogue names. Homography RANSAC rejects mismatched points; duplicate descriptors at one source point are collapsed. The retained pixel correspondences and measured local-star centres are in [the image-points fixture](fixtures/vega-capture-image-points.json).

The useful pairs are **0→1**, **1→4**, and **5→6**, with **91**, **346**, and **190** unique source-point correspondences. Initial attempts at other pairs either had too few matches or converged on cockpit/HUD-dominated motion inconsistent with a sky rotation. Those pairs were excluded, not treated as successful measurements. A conventional automatic SIFT-keypoint pass also produced too few reliable correspondences; descriptors evaluated around star-like components worked substantially better. Future automation needs an explicit sky/cockpit classifier and objective acceptance criteria, rather than this manually reviewed pair selection.

[Projection fit](vega-capture-projection.py) fits shared horizontal/vertical focal lengths and principal point, plus a separate rotation for each pair. It uses a pinhole pure-rotation model with zero skew and no fitted lens distortion:

`p₂ ∼ K R K⁻¹ p₁`.

Alternating correspondences are reserved from the nonlinear fit. They were used in the earlier RANSAC correspondence-selection stage, so this is a holdout from parameter fitting, not an entirely blind image dataset. No orbital direction, predicted angular separation, known background-star coordinate, or assumed 56.249001° projection is used as a fit constraint.

[Fit results](vega-capture-projection-results.json):

- `fx = 2160.63 px`, `fy = 2234.68 px`.
- Principal point approximately `(2055.29, 1327.46)` in the original 4112 × 2658 images, close to their centre `(2056, 1329)`.
- Reserved-point reprojection RMS: **0.65 px**, **0.74 px**, **0.76 px** for the three pairs.
- Seven measured Vega–Vega 2 separations span **24.5532°–24.5612°**, with mean **24.5578°**. Extra decimal places are retained for reproducibility, not a claim of absolute accuracy at that level.

The fitted anisotropy is informative. `fx/fy = 0.966864`, while the ratio of screenshot enlargement factors from the configured resolution is `(4112/2560)/(2658/1600) = 0.966892`. Undoing those factors gives native focal lengths **1345.14 px** and **1345.18 px**, nearly identical. This is strong evidence consistent with unequal horizontal/vertical image scaling relative to the configured game resolution. It is an inference from the fit and settings, not a verified account of every stage in the game's display pipeline.

Those effective focal lengths correspond to approximately **61.48° vertical** and **87.16° horizontal** fields over the captured frame. Why that differs from the stored FOV value remains unresolved; possible viewport or cockpit-camera conventions must be checked before treating a settings-file FOV as a calibrated camera. The empirical fit avoids relying on that assumption here.

Local-star centres are intensity-weighted neutral cores inside small, manually identified image regions. Orange target brackets and cyan reticles are excluded by the intensity criterion. This improves repeatability but is not a validated model of star bloom, close visual companions, anti-aliasing or colour-management effects.

### What has and has not been resolved

1. **Current local geometry is falsified for this view.** This is now supported by actual game screenshots from a known nearby body, not merely community arrival-range comparisons.
2. **The proposed correction has strong new support.** It agrees with both rounded ranges and the gross angular geometry. It is not yet certified as an exact universal reconstruction.
3. **A roughly 0.05° angular residual remains.** The candidate predicts about 24.508°, while the image-derived mean is about 24.558°. Repeatability across views is better than that difference, but correlated projection error, star-core measurement bias, scan precision/phase drift, and remaining frame-convention error have not been separated. Do not explain the difference away using the much smaller near-Trikora position bound.
4. **The screenshots can be registered with useful subpixel residuals.** That solves relative camera registration for the accepted pairs; it does not identify an absolute galactic attitude.
5. **External orientation and handedness are still open.** The two local directions and many unnamed stars do not, by themselves, establish catalogue correspondences. No background star in these captures has yet been independently assigned a catalogue identity, and no orbital-to-galactic matrix has been fitted.
6. **Different systems and return visits remain untested.** Even a successful Vega sky alignment would need independent bodies, views and another system before claiming a universal transform.

A targeted next capture was requested while the user is near Trikora: external-system target markers for **Sol** and **Altair**, preferably with Vega and Vega 2 also visible. If an external target is outside the view, overlapping views connecting a centred target back to the local references can transfer its direction. Off-screen edge arrows cannot be used as calibrated bearings. Two well-separated external directions provide the galactic reference; extra references should be reserved to test a fitted solution. Catalogue matching of the existing starfield remains an alternative avenue and has **not** been exhausted or completed in this pass.

### Reproduction

The original-image extraction requires the Desktop files and OpenCV, NumPy and SciPy. The frozen pixel-data fit requires only NumPy and SciPy; the geometry calculation uses the existing JavaScript shared solver.

```sh
node docs/research/vega-capture-geometry.mjs
python docs/research/vega-capture-projection.py
python docs/research/vega-capture-extract.py /path/to/screenshots /tmp/vega-image-points.json
```

The measurement environment used NumPy 2.0.2, SciPy 1.13.1 and opencv-python-headless 5.0.0.93 in a temporary virtual environment. No application dependency or production orbital implementation was changed for this experiment.

## External-reference calibration: Sol, Altair, Sirius, and Tracy's Havan

### Status and scope of the result

The later captures establish an **empirical alignment for Vega**, using the candidate hierarchical orbital model. They discriminate two separate ambiguities:

1. **Catalogue to camera parity:** Sol and Altair alone admit both orthogonal parity choices. Sirius, held out from that fit, favours one by approximately **0.05° versus 5.52°**.
2. **Candidate orbital frame to catalogue parity:** Vega and Vega 2 likewise admit two choices if handedness is not assumed. A third local direction, Tracy's Havan, favours one by approximately **0.67° versus 26.45°**, using a deliberately coarse HUD attitude transfer.

This is sufficient to select the empirical Vega mapping at the precision of this experiment. It is **not** a derivation of a universal transformation from journal fields. No second system, independently changed orbital epoch, or return visit has tested whether this matrix generalises. No production orbital calculation or background-star rendering has been changed by this research update.

The player's missing system XYZ did not prevent this measurement. Staying near Trikora bounded the missing observer displacement. It remains important for nearby targets: the bound for Tracy's Havan is about **0.032°**, rather than the less-than-0.00009° bound for the two distant local stars. The HUD range to Tracy's Havan is **10.2 ls**, consistent with the candidate's approximately **10.163 ls**.

### Captures and provenance

The [manifest](fixtures/vega-capture-manifest.json) now inventories **25 original screenshots**, including dimensions, byte sizes, and SHA-256 hashes. Original files remain on the user's Desktop; the repository stores numeric measurements, not copies of the screenshots. Indices below are zero-based manifest indices. All listed clocks are UTC on 2026-11-15; filenames use the previous Pacific evening.

| Index | UTC clock | Use in this update |
| --- | --- | --- |
| 7 | 05:32:17 | Earlier Sol target, near the first Trikora site |
| 9 | 05:33:59 | Earlier Sol, Vega, and Vega 2 together |
| 10 | 05:34:37 | Vega selected, checking marker versus visible star core |
| 11 | 05:36:36 | Earlier Altair dashed marker below the horizon; sky remains visible above it |
| 16 | 05:43:12 | New-site Vega, Vega 2, and Sol connection |
| 17 | 05:43:23 | Intermediate Sol view connecting the local stars to later external views |
| 21 | 05:45:53 | Altair above the horizon |
| 22 | 05:46:13 | Sol, reference camera for the external fit |
| 23 | 05:46:56 | Sirius, reserved from fitting the external alignment |
| 24 | 05:50:28 | Tracy's Havan below the horizon; filename ends 9.50.29 PM |

The retaken set is near latitude **−64.078°**, longitude **−12.736°**, altitude roughly **684–700 m**. The Tracy image is near latitude **−64.0782°**, longitude **−12.7373°**, altitude **400 m**. This is a different surface location from the earlier set. Headings from the two sites must not be treated as one unchanging local north/up basis. The primary fit uses image registration within each set, not that assumption.

The user reported no cockpit movement when adding Sirius. The images nevertheless contain a measured **7.166°** change of sky orientation between the Sol and Sirius frames, also consistent with their displayed pitches. We therefore estimate this rotation from overlapping stars; we do not assume identical pixels represent identical directions across those two images. This does not require or imply headlook: the earlier confirmation of normal cockpit view, no VR, and no headlook remains the camera configuration used here.

Selected Vega 2 in image 15 provides an additional identity check for the reddish source subsequently measured in image 16. Other new images were inventoried but are not additional independent fit constraints. More images do not automatically mean more independent reference directions.

The external coordinates used, in catalogue light-years, are:

| System | X | Y | Z | Provenance |
| --- | ---: | ---: | ---: | --- |
| Vega | −21.90625 | 8.125 | 9 | Local `FSDJump`, 05:13:26 UTC |
| Sol | 0 | 0 | 0 | Catalogue coordinate origin |
| Altair | −12.3125 | −2.75 | 11 | [EDSM system API](https://www.edsm.net/api-v1/system?systemName=Altair&showCoordinates=1) |
| Sirius | 6.25 | −1.28125 | −5.75 | [EDSM system API](https://www.edsm.net/api-v1/system?systemName=Sirius&showCoordinates=1) |

The Altair and Sirius responses were retrieved during the investigation and returned `coordsLocked: true`. The web page reader could not open these API responses; direct HTTP retrieval succeeded. That retrieval issue is not evidence of API unavailability or poor latency. No new API performance benchmark was conducted here. A locked coordinate is not an uncertainty estimate or proof that the renderer uses identical internal precision. The general [EDSM API documentation](https://www.edsm.net/en/api-v1) and earlier API measurements remain the relevant sources for integration design.

### Image registration and bearing measurement

The same independently fitted intrinsic matrix `K` from the first seven images is retained. It is not adjusted to make the external catalogue or candidate orbital directions agree.

The [external extraction script](vega-external-extract.py) uses compact, approximately neutral-bright components as candidate stars. Approximate HUD headings/pitches and manually estimated roll seed a nearest-neighbour search. A three-ray rotation RANSAC rejects inconsistent pairs, then a robust nonlinear pixel reprojection fit estimates the final rotation. The named target directions, their catalogue coordinates, and the candidate orbital positions are **not** constraints on that rotation fit. Matching is limited to manually reviewed upper-image regions to avoid terrain and most cockpit geometry. The source/target point lists are frozen in [the external image-points fixture](fixtures/vega-external-image-points.json).

| Camera transfer | Correspondences | All-point RMS | Alternating-point holdout RMS |
| --- | ---: | ---: | ---: |
| 7 → 11 | 75 | 0.918 px | 0.829 px |
| 7 → 9 | 25 | 1.022 px | 1.436 px |
| 21 → 22 | 303 | 0.840 px | 0.904 px |
| 22 → 23 | 231 | 0.784 px | 0.809 px |
| 21 → 23 | 183 | 0.754 px | 0.748 px |
| 16 → 17 | 205 | 0.801 px | 0.777 px |
| 17 → 22 | 255 | 0.837 px | 0.831 px |

As with the initial projection fit, the alternating points were involved in correspondence selection before being withheld from parameter fitting. These are diagnostic holdouts, not an entirely blind validation dataset. The direct 21 → 23 rotation and the route through image 22 close to approximately **0.000586°**. This is a useful relative-consistency check, not an absolute celestial-accuracy bound.

The original attempt to register 8 → 9 had only nine accepted matches and was excluded. The nearly unchanged 9 → 10 view produced many matches but was not used as an independent sky-rotation constraint because fixed cockpit features could dominate. Frozen fixtures include only the accepted registration paths above.

Target brackets are measured from their orange arcs. Their pixel coordinates are converted into unit camera rays, with **x right, y down, z forward**. A small circle on the unit sphere lies in a plane; the normal of a least-squares plane through the arc rays estimates the central bearing. This avoids blindly using the centre of a perspective-distorted screen ellipse. It is still a **measurement model**, not a verified description of Frontier's HUD implementation.

That distinction matters. Checks against visible star cores find bracket-to-core differences of approximately **0.071° for Vega**, **0.075° for Altair**, and **0.050° for Sirius**. Bracket radii also vary slightly between captures. HUD projection, arc selection, glow/core centroid bias, and screenshot calibration have not been separated. Do not describe this method as independently validated to one pixel or assume the 0.05° Sirius residual is the complete error budget.

Replacing the Altair and Sirius bracket bearings with their visible-core bearings gives **0.064° versus 5.523°** for the Sirius parity check. Thus the parity decision survives this alternative measurement, even though the absolute precision needs more work. Sol retains its marker bearing in that sensitivity calculation; no bright source was assumed to be Sol without an identity check.

### External fit and the Sirius check

For each external system, the catalogue ray is `normalize(targetCoords − VegaCoords)`. Fit an orthogonal mapping from the Sol and Altair catalogue rays to their measured rays in camera 22. An initial proper rotation is fitted with vector alignment; reflection through the catalogue Sol/Altair plane gives the other parity choice with the same two-target fit quality. Sirius is then predicted by each mapping without participating in that fit.

| Separation | Measured | Catalogue | Difference |
| --- | ---: | ---: | ---: |
| Sol–Altair | 40.14140° | 40.06315° | +0.07825° |
| Sol–Sirius | 5.63874° | 5.62317° | +0.01557° |
| Altair–Sirius | 45.12359° | 45.03626° | +0.08733° |

The proper `det=+1` catalogue-to-camera branch misses Sirius by **5.51553°**. The `det=−1` branch misses by **0.05041°**. Both fit Sol and Altair with approximately **0.03913°** residual per target because their observed separation is not exactly the catalogue separation.

The determinant statement is specific to the numeric coordinate definitions above. It is not a claim that the physical sky is mirrored or that every renderer should apply a hard-coded mirror. Changing the definition of a camera or renderer axis changes this bookkeeping. The matrices and their direction of application are preserved in [the complete alignment results](vega-external-alignment-results.json).

### Orbital fit and Tracy's Havan check

Transfer the fitted external orientation from camera 22 through 17 to 16. Convert the observed Vega and Vega 2 rays into catalogue axes. Compare those with candidate orbital directions at **05:43:12 UTC**, using Trikora's centre as the observer approximation.

The observed stellar separation is **24.54444°**; the candidate is approximately **24.50717°**. A rotation cannot eliminate that separation mismatch. The best two-direction fit leaves approximately **0.01864°** per star, and a reflected orbital-frame fit has the same two-star residual.

The additional Tracy image shows the dashed marker below the horizon, rather than an off-screen edge arrow. Its centre is approximately `(1898.80, 1471.05)` in the original PNG. The displayed ship heading is **240°**, pitch **−23°**; roll is estimated at about **+1.5°** from the pitch-ladder slope. The reference Sol image has heading **113°**, pitch **9°**, approximately level roll. These rounded values transfer the Tracy bearing to the external frame **coarsely**, without pretending that terrain provides a registered starfield.

The candidate is propagated to the actual Tracy HUD clock, **05:50:28 UTC**. Comparing the two orbital parity predictions gives:

| Orbital-to-catalogue branch | Nominal Tracy discrepancy | Declared attitude sensitivity range |
| --- | ---: | ---: |
| `det=+1` | 0.674° | 0.137°–4.280° |
| `det=−1` | 26.449° | 22.738°–30.187° |

The sensitivity calculation perturbs both views' headings and pitches by ±1° and both rolls by ±2°, evaluating all corner combinations. These ranges are **not confidence intervals or exhaustive bounds**. They show that plausible rounding/roll uncertainty is small compared with the roughly **26.02°** separation between the mirror predictions. Body rotation between these nearby-in-time views is neglected for this coarse check; precise refinement would require accounting for it and the observer's displacement.

The supported empirical mapping, applying **column vectors** as `galacticDirection = M × candidateLocalDirection`, is approximately:

```text
M = [[ 0.897707, -0.440592, -0.000555],
     [-0.339153, -0.690220, -0.639196],
     [ 0.281242,  0.574000, -0.769043]]
```

This matrix belongs to the candidate's exact local basis, including its root axial-tilt treatment. It is not directly a Three.js camera matrix, and cannot be pasted into the current uncorrected solver to repair its relative body positions. All 48 signed axis permutations were also checked: the best still misses the two stellar directions by about **43.84°** and **38.66°**. A simple axis swap/sign change is insufficient for this candidate basis in Vega.

### Repeatability, unresolved issues, and implementation implications

The earlier set provides an independent acquisition at another Trikora surface location. With external parity now selected by Sirius, its reconstructed stellar bearings differ from the later set by approximately **0.102°** and **0.106°**. These are raw comparisons across different capture epochs and sites, not fully propagated model residuals. The old Sol transfer between images 7 and 9 differs from the directly measured marker by **0.0471°**. The old Sol–Altair separation is **40.1077°**, versus **40.1414°** in the later set. These differences argue against claiming a formal 0.05° absolute accuracy from the favourable Sirius check alone.

The result supports a practical route to **in-system** rendering: reconstruct coherent local positions, establish the orbital-to-catalogue mapping, and transform external catalogue directions back into the renderer's local basis. Missing live ship coordinates do not affect an orrery camera's ability to render external directions once that basis is known. A separate galactic map is not required by this experiment. However, a Vega-calibrated demonstration and an automatically correct feature for arbitrary systems are different milestones.

Still open:

- **Universality:** Is `M` common to systems, dependent on root-star orientation, or system-specific? One calibrated system cannot answer this. A second system with a known observer body and three external references is the most direct discriminatory next experiment. It should test the Vega matrix before fitting a new one.
- **Independent local precision:** Tracy discriminates parity but is not a subdegree star-registered validation. A sky-overlap sequence connecting that target, or another well-separated third local body, would improve the local geometry test.
- **Error budget:** Effective FOV differs from the configured number; bracket/core bearings disagree; repeatability is about a tenth of a degree. Possible causes include HUD/world projection differences, unmodelled distortion, centroid/arc bias, catalogue coordinate precision, and remaining orbital convention/phase errors. No one cause has been established.
- **Time validation:** A later epoch with measurable orbital motion would test whether the fitted constant orientation predicts motion, rather than merely fitting this configuration.
- **General hierarchies:** The root-binary rule identified in the earlier catalogue audit remains experimentally unverified by this single-star-root Vega session.
- **Automation:** These scripts use manually reviewed image regions, target seeds, and approximate attitudes. A general calibration tool needs objective rejection of cockpit/terrain matches, robust target identity, and explicit handling of ambiguous fits.
- **Data precision:** `coordsLocked` and many displayed decimal digits do not supply an error model. Whether the skybox uses more precise coordinates than the exposed catalogue is unverified; apparent residuals must not be assigned to coordinate quantisation without evidence.

No research avenue is being declared exhausted. The community-source audit has yielded implementation and convention provenance but not a verified universal galactic mapping. Additional source archaeology, anonymous-star catalogue matching, another system, and a return visit remain available. The present session has supplied enough evidence to settle the two parity choices for this Vega fit; additional travel was not needed to extract that result.

### Reproduction and validation of this update

[The analysis script](vega-external-alignment.py) refits rotations from frozen correspondences, recomputes target bearings from frozen arc pixels, evaluates both external and local parity branches, computes the Sirius holdout and Tracy sensitivity checks, and reports all residuals as JSON. It requires NumPy and SciPy, and works without access to the original Desktop images.

```sh
node docs/research/vega-capture-geometry.mjs
python docs/research/vega-external-alignment.py
python docs/research/vega-external-extract.py /path/to/screenshots /tmp/vega-new.json --set new
python docs/research/vega-external-extract.py /path/to/screenshots /tmp/vega-old.json --set old
python docs/research/vega-external-extract.py /path/to/screenshots /tmp/vega-tracy.json --set tracy
```

To regenerate the committed geometry/results files, redirect the first two commands to their corresponding `*-results.json` files. The extraction output is a measurement subset for the selected acquisition; it does not overwrite the provenance-rich combined fixture. Visible-core validation seeds are also preserved in that fixture and use the same 29 × 29 neutral-core centroid procedure.

The old and new extraction runs reproduced their frozen registration point lists, target-arc pixels, and local-star centres exactly. The shared baseline geometry assertions still pass. Numeric replay retains finite-value/rotation checks and rejects non-finite JSON output. The subpixel image-registration errors are evidence of relative image consistency; the external and local holdouts carry the separate physical validation burden described above.

## Second-system test prepared: Altair / Darkes Hollow

Prepared later on the same Pacific evening, before receiving any Altair calibration screenshots. The user proposed Sol because of remembered constellation rendering. The located [firsthand Galaxy Map report](https://www.reddit.com/r/EliteDangerous/comments/36c0lb/the_galaxy_map_will_show_the_constellations/) and [later player observations](https://www.reddit.com/r/EliteDangerous/comments/1cpsikn) describe constellation-line overlays around Sol in the **Galaxy Map**. They do not establish a cockpit overlay or a distinct Sol-only star-position renderer. The user's follow-up acknowledged the map distinction. The plan therefore returns to Altair.

Sol would still be a useful independent check through familiar star patterns. [Chris Hanson's firsthand plate-solving account](https://alphapixeldev.com/celestial-vision-navigation-elite-dangerous-dark-wheel-station/) reports successful Hipparcos matches for Sol screenshots; that precedent was already recorded in the initial checkpoint. It does not make Sol necessary for the next transfer experiment. The cited Frontier rendering discussion was attempted directly but returned HTTP 403; no claim about the current rendering implementation is inferred from that failed access. A direct EDSM request for the literal system name `Deneb` returned `[]`; no coordinate was guessed, and Deneb is not used in the selected plan.

### Site and source selection

[EDSM's Altair record](https://www.edsm.net/api-v1/system?systemName=Altair&showCoordinates=1&showId=1) identifies system address **306253399220** at `[-12.3125, -2.75, 11]`, approximately **14.64 ly** from Vega. The [Spansh dump](https://spansh.co.uk/api/dump/306253399220) supplies the bodies and orbital epochs. Direct HTTP retrieval succeeded after the sandbox's network lookup failed. The projected body inputs and raw-response hash are preserved in [the frozen plan fixture](fixtures/altair-transfer-plan.json).

**Observation body: Darkes Hollow**, radius approximately **3,352.7 km**, catalogue gravity **0.47 g**, about **667 ls** from Altair. It is listed as landable. Stay no more than **10 km above its surface**. No landing is required. All five planets in this catalogue orbit Altair directly, so this experiment avoids introducing an untested root-binary convention.

The site comparison also considered Altair 1 and Lowing's Rock. Darkes Hollow gives a useful angular spread between the two local references and, under the frozen transfer hypothesis, a manageable connection to the external references. The plan does **not** assume the hypothesised external directions are correct when identifying actual targets.

### Frozen prediction and capture sequence

The [prediction script](altair-transfer-prediction.mjs) carries over the exact supported `det=+1` Vega orbital-to-galactic matrix, frozen in the new fixture with the SHA-256 of its source result file. It uses the same positive inclination, negative node/periapsis, and inherited primary axial-tilt convention. It fits no new orientation. The simple direct-parent hierarchy is asserted explicitly, and missing orbital data causes failure.

At the planning epoch **2026-11-15 06:15 UTC** (22:15 Pacific on November 14), the hypothesis predicts:

| Local target, seen near Darkes Hollow | Range | Separation from Sol | From Epsilon Indi | From Sirius |
| --- | ---: | ---: | ---: | ---: |
| Altair | 666.671 ls | 50.039° | 90.769° | 54.909° |
| Biggs Colony | 2,169.045 ls | 32.499° | 24.181° | 32.249° |

Altair–Biggs Colony separation is about **75.7°**. The maximum observer-offset contribution is below **0.001°** for both local references at the specified altitude. These are planning predictions, not observed agreements. The body geometry must be propagated to each actual screenshot clock.

Use **Sol and Epsilon Indi** to fit camera attitude, with **Sirius held out**. Their catalogue coordinates come from the earlier recorded origin, [Epsilon Indi Spansh dump](https://spansh.co.uk/api/dump/908486251218), and [Sirius EDSM response](https://www.edsm.net/api-v1/system?systemName=Sirius&showCoordinates=1), respectively. The external separations are approximately **40.87°** (Sol–Epsilon Indi), **6.10°** (Sol–Sirius), and **36.70°** (Epsilon Indi–Sirius). Sirius separates the two external parity predictions by about **8.49°**, despite being fairly close to Sol on the sky.

The user-facing capture instructions are:

1. Remain near one spot on Darkes Hollow, preferably with Altair above the horizon, within 10 km of the surface.
2. Keep the confirmed FOV and normal centred cockpit view, with no headlook or zoom change.
3. Capture **Altair, Biggs Colony, Sol, Epsilon Indi, and Sirius**, each selected at least once so its identity is explicit.
4. Add overlapping views when turning between targets, ideally retaining about half a screen of shared background stars. All five targets need not be in one frame.
5. Retain the HUD clock, location/altitude and target range where visible. A below-horizon on-screen target bracket is usable, but include sky in bridging views when possible. An off-screen edge arrow is not a calibrated bearing.

Darkes Hollow's catalogue rotation period is about **0.598 days**, so rounded HUD headings from separated capture times must not be treated as an unchanged inertial basis. Prefer measured starfield rotation. Surface proximity bounds translation; it does not remove body rotation or camera rotation.

### Evaluation fixed before observing the result

First check the external reference geometry and Sirius holdout, then apply the **unchanged Vega matrix** to predict the two local directions at the actual capture epochs. Fit only the necessary screenshot camera rotations/attitude. Do not fit a replacement orbital-to-galactic matrix until the frozen prediction's residuals have been recorded.

As practical screening thresholds, an external holdout below **0.2°** with stable starfield registration would permit the local transfer comparison. Local errors below roughly **0.25°** would be compatible with transfer at this session's demonstrated precision. A systematic local error above **1°**, with independently satisfactory external checks, would strongly contradict the unchanged-matrix hypothesis. Intermediate or externally inconsistent results require a measurement/model audit; these thresholds are operational decisions, not formal statistical confidence limits.

Fresh local journal scans may update orbital phases and improve input provenance. Such updates must be recorded and evaluated with the same formula and matrix; unexplained sign, axis, or orientation changes would constitute a different hypothesis. Even agreement in Altair would establish two-system support, not universality across arbitrary generated and binary hierarchies.

[Full planning predictions](altair-transfer-prediction-results.json) include direction vectors, pair angles, source roles, and position-error contributions. Reproduce the saved epoch or evaluate a subsequent capture time with:

```sh
node docs/research/altair-transfer-prediction.mjs
node docs/research/altair-transfer-prediction.mjs 2026-11-15T06:30:00Z
```

No Altair screenshot result has been incorporated into this planning section.

## Altair transfer result and local geometry limits

Recorded after the user supplied ten new screenshots and then challenged the interpretation of the result. **The unchanged Vega matrix fails in Altair, but this does not isolate the fault to the galactic transform.** The user explicitly identified two issues: external directions can be correct while our orbital calculations are wrong, and we have never compared the in-game orrery directly with ours. Both are valid limitations. Earlier conversational wording that the local geometry was "correct" or "preserved" should be read only as agreement with the particular measured separations, not validation of the complete local system.

### Capture provenance and measurement procedure

[The Altair manifest](fixtures/altair-capture-manifest.json) records original filenames, SHA-256 hashes, dimensions, file sizes, selected targets, and manually read HUD clocks. The ten images are **4112 × 2658**, recorded at **06:20:13–06:22:34 UTC on November 15**, the same Pacific evening. Screenshot index 3 is named `10.21.35 PM` but displays **06:21:36**; its HUD clock is retained. Original PNGs were read without modification. Temporary thumbnails and HUD crops were used for inspection only; numerical measurements use original-resolution pixels.

[The minimal journal fixture](fixtures/altair-capture-journal.json) records arrival in Altair at **06:13:25**, the Darkes Hollow scan at **06:16:45**, and approach to that body at **06:18:39**. Its `StarPos` matches the catalogue. The screenshots show approximately **330 m altitude**, latitude **−25.7147°**, longitude **21.2599°**, with very small changes during the sequence. The conservative predeclared 10 km altitude bound is retained in the prediction calculations.

| Image index | HUD clock | Selected target / role |
| --- | --- | --- |
| 0 | 06:20:13 | Biggs Colony, local target |
| 1 | 06:20:34 | Sol, external fit target |
| 2 | 06:20:57 | Sirius, external holdout |
| 3 | 06:21:36 | Epsilon Indi, bridge view |
| 4 | 06:21:39 | Epsilon Indi, external fit target |
| 5 | 06:21:52 | Epsilon Indi, bridge view |
| 6 | 06:21:58 | Epsilon Indi, bridge view |
| 7 | 06:22:22 | Altair selected, bridge view |
| 8 | 06:22:28 | Altair selected, bridge view |
| 9 | 06:22:34 | Altair visible, local target |

[The extraction script](altair-capture-extract.py) uses the empirical Vega camera intrinsics unchanged. Approximate integer HUD attitudes seed star matching only. Final relative rotations use matched sky pixels, so Darkes Hollow's rotation does not have to be inferred from rounded headings. Target bearings use the same spherical small-circle arc model as the Vega experiment. This remains a measurement hypothesis, not a verified Frontier HUD formula.

Thirteen overlap pairs succeed, retaining **78–358** correspondences each, with **0.689–0.887 px RMS** reprojection error. Alternating-point fit holdouts give **0.737–0.922 px RMS**; correspondence selection already used these points, so this is not a fully blind image holdout. A direct 7→9 registration finds only three inliers and is **rejected**; the measured 7→8→9 chain is used instead. Four redundant sky loops close within **0.0026–0.0242°**. These checks validate image consistency, not the orbital model.

Image 1 is the reference camera. The primary transfer paths are 0→1 for Biggs, 4→1 for Epsilon Indi, 2→1 for Sirius, and 9→8→7→4→1 for Altair. An alternative path through images 6 and 3 changes Altair's transferred bearing by **0.0310°**. Alternative Epsilon transfer changes its bearing by **0.0049°**.

### External sky passes independently of the orbital solver

The external directions come from the system-coordinate sources in the frozen plan, not local orbital elements. Sol and Epsilon Indi fit camera attitude; Sirius is withheld from that fit and distinguishes parity.

| External pair | Measured separation | Catalogue separation |
| --- | ---: | ---: |
| Sol–Epsilon Indi | 40.93086° | 40.87113° |
| Sol–Sirius | 6.12464° | 6.10101° |
| Epsilon Indi–Sirius | 36.74340° | 36.69956° |

The supported `det=−1` catalogue-to-camera branch misses Sirius by **0.02060°**; the other branch misses by **8.51097°**. This passes the predeclared external screening threshold. It establishes a measured sky frame for comparing the local predictions. It does **not** establish that the local-body calculations are correct.

### Frozen transfer fails before any new local fit

The exact matrix and catalogue inputs in [the pre-capture plan](fixtures/altair-transfer-plan.json) are retained. [The replay](altair-transfer-analysis.py) propagates local geometry separately to each target's HUD epoch and records the unchanged-matrix residuals before calculating any diagnostic replacement matrix.

| Local target | HUD range | Predicted range | Frozen direction error |
| --- | ---: | ---: | ---: |
| Biggs Colony, 06:20:13 | 2,169 ls | 2,169.08273 ls | **11.61764°** |
| Altair, 06:22:34 | 667 ls | 666.67085 ls | **138.98902°** |

Some direct angular comparisons also expose the mismatch without relying on a choice of global camera basis:

| Pair | Measured separation | Frozen prediction |
| --- | ---: | ---: |
| Biggs–Sol | 29.59774° | 32.49991° |
| Biggs–Epsilon Indi | 35.31380° | 24.18012° |
| Altair–Sol | 100.34550° | 50.03328° |
| Altair–Epsilon Indi | 63.76737° | 90.76366° |

The measured **Altair–Biggs** separation is **75.78599°**, compared with **75.68544°** from the two local predictions at their respective capture epochs: a **0.10055°** discrepancy. Predicted local motion over the 141-second interval is only **0.00195°** for Altair's direction and **0.00057°** for Biggs. These are useful constraints on this configuration, not proof of all local positions or planes.

The conservative near-body observer-offset bounds are **0.000964°** for Altair and **0.000296°** for Biggs. Unknown ship position within this bound cannot explain the failed transfer.

### Sensitivity checks and diagnostic fits

- Neutral visible-core centroids differ from target-arc bearings by **0.0398–0.0611°**. Replacing the Sol, Sirius, and local target brackets with those cores, while retaining Epsilon Indi's bracket, gives a Sirius holdout of **0.00645°** and local errors of **11.58918° / 139.03909°**. This is a sensitivity check, not a claim of 0.006° absolute accuracy.
- The alternate starfield chain leaves Altair's frozen error at **138.96774°**.
- The fresh Darkes Hollow scan differs from the older propagated catalogue phase by approximately **−0.00000927°**. Recomputing with the fresh journal inputs leaves the direction errors effectively unchanged. The journal update is explicitly optional in the prediction script; it does not modify the frozen plan.
- A diagnostic two-body Altair fit, performed **after** recording the failure, can fit each direction to **0.05027°**. This is expected when their pair separation already nearly agrees. It provides no additional local-body holdout. Both local parity branches fit equally well; neither is independently selected in this system. The proper-rotation fit differs from the Vega matrix by **162.54°**, but interpreting that as a physical system orientation would be premature.

### User's orbital-calculation hypothesis: bounded exploratory audit

In response to the user's observation, [a two-system convention generator](two-system-conventions.mjs) and [evaluation script](two-system-conventions.py) test **864 configurations / 1,728 parity branches**. This is an exploratory analysis **after seeing Altair**, not another predeclared blind test.

The grid covers all eight signs of inclination/node/periapsis; positive or reversed propagated orbital phase; no inherited orbital basis, inherited plane basis without periapsis, or full inherited orbital basis; independently omitted/positive/negative root and child axial tilt; and tilt before or after the body's orbital basis. All offsets use the actual shared Kepler implementation. Assertions reproduce both the earlier production baseline and the original experimental Vega candidate, preventing silent changes to the meaning of those cases.

Every variant is fitted to the two Vega stellar directions only, then applied in Altair without an Altair matrix fit. The measured local pair separations in both systems provide additional checks, and Tracy supplies its previously qualified coarse Vega check.

- **432 branches** agree with both measured local separations to within an exploratory **0.25°** limit.
- **36 branches** also fall within **5°** of the nominal coarse Tracy bearing. These thresholds are screening choices, not confidence intervals; the Tracy threshold is intentionally permissive.
- The best branch satisfying both screens still misses the Altair directions by approximately **10.32° and 136.35°**.
- Even removing those screens does not produce a good transfer: the best minimax direction error is approximately **84.19°**, and that variant badly fails the local geometry checks.

[The complete results](two-system-conventions-results.json) retain every evaluated branch. No searched variant resolves the discrepancy. This rejects this finite family of simple convention repairs as a sufficient explanation. It does **not** exhaust orbital-rendering errors, prove an undocumented per-system rotation, validate the experimental hierarchy generally, or show that these fits describe motion correctly over time. The near-planar Altair system and the small number of local target bearings leave important degeneracies.

### What must be checked next

**Priority: directly compare the in-game orrery and the app's orrery.** This has not happened. In particular, the experimental research solver is not the current app renderer: their behaviour must be compared separately rather than silently treating the research improvement as a shipped fix.

A useful next capture set is a paused or time-recorded in-game orrery overview of Altair with identifiable bodies, then another view from a substantially different elevation. Compare corresponding app positions at the same simulated epoch, fitting only view orientation and scale. Check body ordering, relative distances, orbital-plane directions, phase along each orbit, and hierarchy. Orbit lines alone do not establish body phase. A single perspective can hide depth/reflection errors, so one attractive visual match is insufficient. Altair's near-planar geometry makes a second Vega comparison valuable for testing nested parent frames, but no additional travel is requested until the existing inputs and an initial direct comparison have been assessed.

Retain three separate questions:

1. Does the production app reproduce the local system shown in-game?
2. Does the experimental orbital correction reproduce that local system and its change over time?
3. Once local geometry is independently supported, how is its basis related to galactic directions?

The external sky measurements answer part of question 3's measurement problem. They do not answer questions 1 or 2. The unchanged Vega transfer hypothesis has been exhausted by this experiment; the broader calculation and frame investigations have not. Per-system empirical calibration remains a possible research demonstration, but is not yet a verified general rendering feature. A galactic-map scope change is not required by this result.

### Artifacts and reproduction

[Full Altair results](altair-transfer-analysis-results.json) contain registrations and their holdouts, arc fits, external parity tests, local directions, separate capture-epoch predictions, ranges, alternate paths, core sensitivity, fresh-journal sensitivity, and explicitly labelled post-test fits. [Frozen numeric measurements](fixtures/altair-capture-image-points.json) permit replay without the original screenshots.

```sh
# Requires Node plus Python NumPy/SciPy; extraction additionally requires OpenCV.
python docs/research/altair-transfer-analysis.py
python docs/research/two-system-conventions.py
python docs/research/altair-capture-extract.py /path/to/screenshots /tmp/altair-extracted.json
node docs/research/altair-transfer-prediction.mjs
node docs/research/altair-transfer-prediction.mjs 2026-11-15T06:22:34Z --fresh-journal
```

The original planning-epoch output must remain identical after adding the optional journal check. These research files do not modify the production orbital solver or implement a starfield.

Validation completed: both numeric analysis outputs reproduce byte-for-byte; re-extraction reproduces the frozen pixel measurements exactly; all ten original screenshot hashes match; the default planning output is unchanged; and `git diff --check` passes. No application test run was needed for these research-only additions.

## Direct Altair orrery comparison

The user supplied three **in-game orrery** screenshots at **06:35:47, 06:35:57 and 06:37:44 UTC on November 15** (November 14 Pacific evening), noting that Altair contains no nested bodies. This is useful: it isolates the basic orbital-position convention before testing parent-frame inheritance.

**Result:** the current production position calculation does not reproduce the pictured local system. The existing experimental candidate reproduces the measured body arrangement much more closely after fitting only a camera. This is stronger local evidence than the earlier two-target cockpit separation, but remains specific to this simple hierarchy and short observation interval.

[View the standalone comparison figure](altair-orrery-comparison.svg). Blue rings are measured game markers; crosses and curves are calculated positions and orbits. The grey points in the first view are independent samples of the game orbit outlines. This is an analytical rendering from the real production position function, **not a screenshot of a running app**. That distinction prevents a comparison of mathematical positions from silently claiming to validate every stage of the UI.

### Inputs and production path

[The measurement fixture](fixtures/altair-orrery-image-points.json) records original PNG filenames, SHA-256 hashes, dimensions, manually read clocks, identity-reviewed marker seeds, and extracted centres. The first image shows Altair, planets 1 and 2, and Darkes Hollow; the other two show all six bodies, including Biggs Colony and Lowing's Rock. Some body names/icons overlap station markers. The body centres were reviewed at original resolution, with an approximate **3-original-pixel** centroid allowance. This is an allowance for the measurement procedure, not a calibrated statistical uncertainty.

[The extraction script](altair-orrery-extract.py) uses small colour/neutral-brightness masks around manually identified markers. Original PNGs remain unchanged. Manual orbit-outline samples come from the first 1600 × 1034 inspection preview, with approximately **2 preview pixels** selection allowance, and never enter a fit.

[The geometry script](altair-orrery-geometry.mjs) invokes the actual `scenePosition(nodes, id, timestamp, true)` function in `ui/src/scene-builder.js`. That uses `absolutePosition` and the shared Kepler calculation with the production positive inclination, ascending-node and periapsis inputs. The community backfill mapping also preserves these input signs. The comparison uses the same frozen Altair catalogue for both models, propagated to each screenshot's clock. It is explicitly in **true-distance mode**: compact mode deliberately compresses distances and cannot be judged by a metric-scale overlay.

The experimental comparison uses positive inclination and negative ascending node/periapsis, with the previously defined primary axial-tilt treatment. No catalogue field, body phase or date is adjusted to improve the match. Altair's direct-star children mean that this dataset cannot test the proposed nested inheritance rule. In addition, applying primary tilt is a common rotation here, which the free camera absorbs; these map views do not validate that tilt's absolute relation to galactic axes.

### Fitted camera, independent checks, and results

The map's camera is not assumed to share the cockpit projection. Original pixels are normalized to the configured display's **1600:1000 aspect**, and each view/model gets seven camera parameters: three rotation parameters, one uniform scale, two image translations, and one perspective-depth parameter. No per-body translation, arbitrary 2D affine transform, anisotropic scale, orbital-element adjustment, time adjustment, or galactic matrix is fitted.

The screen model is:

```text
q = R × positionAU
screenXY = scale × q.xy / (1 + inverseDepth × q.z) + translation
```

The depth denominator stays positive for every body. Eighty deterministic initial rotations are tried per full fit. These numerical fits do not prove a global optimizer theorem; the very large differences, independent orbit outlines, multiple views, and held-out markers make the conclusion more substantial than one optimized screenshot.

| View and observed bodies | Production marker RMS | Experimental marker RMS | Experimental maximum marker error |
| --- | ---: | ---: | ---: |
| 06:35:47, four inner bodies | 3.970 px | 0.115 px | 0.186 px |
| 06:35:57, all six bodies | **223.098 px** | **1.398 px** | 2.371 px |
| 06:37:44, all six bodies | **124.710 px** | **1.103 px** | 1.500 px |

All table values are **original 4112 × 2658 screenshot pixels**, not preview pixels. The first four-marker view alone has only eight measurements against seven camera parameters, so its tiny experimental residual must not be advertised as independent subpixel accuracy. Indeed, the production fit almost matches those four markers by choosing a very different camera, while badly distorting the projected orbit shapes.

That ambiguity is exposed by the **unfitted orbit-outline samples**:

| First-view orbit | Production outline RMS | Experimental outline RMS |
| --- | ---: | ---: |
| Altair 1 | 25.128 preview px | 1.079 preview px |
| Altair 2 | 34.190 preview px | 1.485 preview px |
| Darkes Hollow | 55.408 preview px | 0.873 preview px |

These are distances to the nearest projected curve segment, so they do not assume a phase for the selected outline point. The experimental model's maximum point discrepancy is approximately **2.45 preview pixels**. The manually sampled outlines are much less precise than the marker centroids but clearly distinguish the two models.

For each full-system view, the camera is also refitted to **five markers**, predicting the excluded sixth. Experimental held-out errors are approximately **0.40–8.14 original pixels** in the second view and **1.06–22.87 pixels** in the third. The largest is Lowing's Rock in the shallow third view: extrapolating an outer marker from the other five poorly constrains perspective. These errors exceed the nominal centroid allowance, so they should not be hidden behind the small all-marker fit residuals. Production held-out errors span approximately **53.8–3332 pixels** and **24.5–3337 pixels**, respectively. All individual errors and fits are retained in [the numeric report](altair-orrery-analysis-results.json).

### Interpretation and remaining work

The user's concern was justified: **there is a local orbital-calculation error in the production path, independently of galactic alignment.** A camera/view change alone does not reconcile production body placement and orbit outlines with these images. The experimental sign convention is strongly favoured for Altair's current configuration. The all-body match includes the visibly tilted Biggs orbit and the outer Lowing's Rock position, not just the two cockpit targets used earlier.

However:

- This does not validate nested parent frames, barycentre conventions, or all systems. **Vega's in-game orrery is the next discriminating local comparison**, because it adds nested geometry that Altair lacks.
- Unknown map camera orientation leaves absolute global orientation and mirror conventions unanchored. The map comparison does not itself connect the system to the galactic sky.
- The captured time span is too short to validate orbital motion over a meaningful fraction of an orbit.
- The external Vega-matrix failure was already evaluated using the experimental candidate, not the production positive-sign baseline. Fixing the demonstrated production discrepancy therefore does not automatically make that old transfer succeed. The candidate now has stronger local support in Altair; its cross-system sky relation still needs explanation.
- These analytical comparisons verify the production position path on the captured inputs. A later integration must separately check live data ingestion, complete renderer orbit paths, scale-mode behaviour, and regression cases.

No production orbital formula has been changed in this update. Promoting the experimental hierarchy wholesale before the nested-system comparison would exceed what these screenshots establish.

### Reproduction

The replay uses Node and the existing UI/shared dependencies, plus Python NumPy/SciPy; extraction additionally uses Pillow. No external service is required once the frozen fixtures are present.

```sh
node docs/research/altair-orrery-geometry.mjs
python docs/research/altair-orrery-extract.py /path/to/screenshots /tmp/altair-orrery-points.json
python docs/research/altair-orrery-analysis.py
python docs/research/altair-orrery-plot.py
```

The figure generator reads the saved results, so regenerate the analysis report before regenerating the figure after any intentional input change. The original screenshots are not copied into the repository.

Validation completed: marker re-extraction and full camera-fit replay reproduce the saved fixtures/results byte-for-byte; all three PNG hashes match; the generated SVG parses and was rendered for visual inspection; `git diff --check` passes. These research-only changes do not require app regression tests.


## Direct running-app screenshots: discrepancy visibly confirmed

The user then supplied two new images at **06:50:35 UTC** (in-game orrery) and **06:50:39 UTC** (running app). [The manifest](fixtures/altair-live-comparison-manifest.json) records their dimensions, hashes, and displayed game-year timestamps. These are distinct from the earlier three game-only screenshots and the calculated comparison figure.

The app explicitly shows **Fully to scale / TRUE DISTANCES AND SIZES / LIVE / 1×**. In the game, Altair 1 is left of the star, Altair 2 is below and slightly right, and Darkes Hollow is above-right. In the app, 1 and 2 are almost opposite across the star, while Darkes is above-right. The two cameras are not identical, so screen angles are not direct physical angles; nevertheless, this is the visible production discrepancy identified by the earlier calculation/outline comparison. Four seconds of clock difference cannot explain the large displacement for these months-long orbits.

**Communication correction:** the ~1-pixel agreement previously reported belonged to the experimental research calculation after a fitted camera. It was not agreement of the running app, and the correction has not been implemented in the production solver. The new screenshots directly confirm that the actual app still displays the wrong relative placement. Do not describe the app as matching the game or ask for more captures as though this visible mismatch were resolved. Local production placement must be corrected and rechecked before declaring an accurate galactic background feature.


The additional **06:52:05 UTC** in-game overview exposes all five planets at once. Biggs Colony and Lowing's Rock both appear above Altair, with Lowing's modestly farther left; in the **06:50:39** app image, Lowing's lies much farther upper-left relative to Biggs. These are screen-layout observations, not deprojected physical angles, because the cameras differ. Alongside the inner-body mismatch and the earlier quantitative multi-view comparison, they confirm that the visible discrepancy affects the full configuration, not only bodies 1 and 2. The wider image is added to the same manifest. No more screenshots are needed merely to establish that the running app is wrong; all five planets should be included when checking the eventual correction.


## Production angle correction and source-data audit

The user asked to inspect the actual calculation and possible stale data, then reported that the reloaded application appeared fixed, while correctly reserving confirmation in other systems.

### Source selection and freshness

A read-only connection to the local watcher's WebSocket obtained the current Altair journal tree. The local community-data endpoint returned ready responses from all three enabled providers. Replaying `mergeCommunityBodies` on those inputs produced no diagnostics. [The saved audit](altair-source-audit-results.json) records the selected elements, source, quality, phase epoch, provider response times and comparisons to the pre-capture catalogue. The sanitized inputs are retained in `shared/test/fixtures/altair-live-orbits.json`; commander identity and unrelated snapshot details are excluded.

| Body | Selected orbital source | Selected phase epoch (UTC) |
| --- | --- | --- |
| Altair 1 | Spansh | Nov 12 10:32:00 |
| Altair 2 | Spansh | Nov 12 10:32:00 |
| Darkes Hollow | Journal | Nov 15 06:16:45 |
| Biggs Colony | Spansh | Nov 13 16:46:07 |
| Lowing's Rock | Spansh | Nov 12 10:32:00 |

These dates are 2026 journal time; the displayed 3312 year is a formatting offset and is not fed into orbital propagation. The four Spansh-selected planets' propagated phases exactly match the previously frozen catalogue at the screenshot comparison epoch. The fresh journal Darkes phase differs from the older catalogue prediction by only **0.00000927°**. The new Spansh response has now also incorporated that same fresh Darkes scan. These findings do not support stale data as the cause of the observed large mismatch.

Loading three providers does not create three independent phase solutions. The merger first prefers a complete element set with an epoch, using source precedence journal > Spansh > EDGIS > EDSM, then falls back to approximate data only if no complete set exists. It selects the entire element set, not a mixture of angles and epochs from different providers. EDSM and EDGIS are approximate for all five Altair planets in this capture and do not supply the selected orbits. An older complete record can be propagated forward; its age alone does not mean that the body is frozen at its scan position. Record update time is deliberately not used as the mean-anomaly epoch. Source uncertainty remains relevant in other systems lacking complete data.

### Calculation error and bounded fix

The application passed Elite's raw ascending node and argument of periapsis directly into a standard astronomical rotation. [Canonn's documented sign-convention correction](https://github.com/canonn-science/canonn-signals/commit/d0f67811f21cbecde743e54ee235f2f73a0b0130) negates both angles while retaining inclination. Its pinned [source file](https://github.com/canonn-science/canonn-signals/blob/d0f67811f21cbecde743e54ee235f2f73a0b0130/src/app/data/orbital-relations.service.ts) was fetched directly and inspected again. This is consistent with the independent Altair screenshot comparison; community implementation alone is not being treated as observational proof.

For a circular equatorial orbit, the correction is especially clear:

```text
previous displayed longitude: M + ascendingNode + periapsis
corrected Elite longitude:    M - ascendingNode - periapsis
```

`shared/src/elite-orbit.js` now provides a common conversion and offset wrapper. Raw provider/journal values remain unchanged. The application uses this wrapper in true-distance and compressed body positions, orbit-curve sampling, moving local orbit detail, and orbit-aligned camera presets. Phase, epoch, orbital period and inclination are preserved. The generic standard `keplerianOffset` function remains unchanged, preserving mathematical tests and the explicit convention experiments.

This change does **not** introduce the experimental nested parent-frame/axial-tilt inheritance model or root-binary rule. Those are distinct hypotheses with evidence and limitations recorded above; Altair cannot verify them. Consequently, this should be described as the confirmed base-angle fix, not a complete orbital or galactic-frame solution.

### Verification and running application

A regression fixture stores the original game marker measurements and the camera poses established before this correction. The common root axial tilt in the research candidate is absorbed into the fixed camera, which does not alter any relative body position. The test calls the actual scene builder and scene updater with the captured journal-plus-provider merge, at each of the three game screenshot epochs, in both distance and realistic modes. It does not refit the camera after changing production code.

Before the correction, the new test failed on Altair 1 with a **273.81-pixel** discrepancy. Afterward, **every captured marker is within 3 original pixels**, including the outer planets. Additional tests cover the analytic circular-orbit sign example, reverse motion with signed period, source-element immutability, complete-set source selection, and phase agreement across different epochs. Existing curve attachment, close-up precision, playback, compact positioning and orbit-plane tests were updated to use the Elite geometry wrapper where they represent game elements; generic Kepler tests remain standard-coordinate tests.

Full `npm test`: **375 passed, 1 optional live-network test skipped, 0 failures**. Watcher integration tests needed local socket access; the ordinary sandbox run could not bind their servers, so the full suite was rerun with that access. UI production build passed. The existing bundle-size advisory remains; it is unrelated to the angle correction.

The running Brave orrery tab was reloaded after the build, all three providers completed loading, and the corrected system was framed and viewed. The user subsequently said it looked like the fix worked, with other systems still to be confirmed. No assertion of an independent exact pixel fit to this live browser view is made—the quantitative regression uses the recorded game screenshots and fixed camera parameters.

### Historical replay and next validation

`legacy-orbit-position.mjs` freezes the former production baseline from commit `8f95d28f9303d045755ade36c6e0c8e9d9d3bcbd`, solely for research replay. The earlier Vega geometry and catalogue audit still reproduce their saved results. The Altair comparison script defaults to that historical baseline so its saved before/after evidence is not silently reinterpreted; `node docs/research/altair-orrery-geometry.mjs --current-production` explicitly selects today's renderer. Earlier tables and the figure labelled production refer to **before this fix**.

Next validation should include Vega or another known nested hierarchy, followed by binary/barycentre cases. Compare local placement before resuming absolute galactic-frame claims. The earlier frozen Vega-to-Altair matrix failure remains valid: it already used the experimental sign convention, so this production patch alone does not resolve it.

## Vega follow-up: Trikora and inherited parent frames

### User observation and constraint

After the base-angle fix, the user reported that Vega's main bodies and group 2 looked correct, but Trikora appeared at approximately 7 o'clock in the app versus 5 o'clock in the game. Asked whether group 2 agreement included its individual bodies, the user explicitly answered **yes, the individual moons also match**. This is a qualitative observation without a newly measured pair of game/app camera poses. It must be retained as a constraint, not rewritten as confirmation that every nested body was wrong.

No new Vega screenshot comparison was available during this change. The clock-angle report motivates the investigation but does not, on its own, distinguish a physical frame error from projection. In particular, the reported agreement of group 2 warranted testing whether a planet-only inheritance rule was appropriate rather than immediately applying a blanket rotation.

### Source/phase check

A local watcher snapshot at **2026-11-15 07:14:37.603 UTC** and responses from all three providers were merged with the production merger. All real orbiting Vega bodies selected complete **journal** element sets at **03:00:07 UTC**, with no merge diagnostics. Tracy and Trikora's Spansh phase epochs and propagated phases matched the selected journal exactly. EDGIS/EDSM approximate element sets were not selected. At snapshot time, Tracy's mean anomaly was approximately 20.38046552° and Trikora's 220.74009393°. There is no evidence here for a stale phase causing the reported shift.

[The sanitized journal fixture](../../shared/test/fixtures/vega-journal-orbits.json) retains geometry, timestamps, raw axial tilts and recorded arrival distances, excluding commander identity and session details. The community catalogue may incorporate the same journal observations: agreement between those providers is **not an independent physical measurement**.

### Quantitative frame comparison

[The new replay](vega-parent-frame-audit.mjs) compares four models without fitting any orbital angles: the post-Altair common-frame calculation, orbital inheritance alone, orbital-plus-tilt inheritance restricted to planets, and orbital-plus-tilt inheritance for all ancestors. [The full numeric report](vega-parent-frame-results.json) records each physical body's range residual and system-XY azimuth. Belt-cluster pseudo-elements are excluded from physical distance claims.

| Trikora model | Arrival-distance error | Parent-relative azimuth in system XY at capture |
| --- | ---: | ---: |
| Common frame after sign fix | −171,020 km | −126.7° |
| Parent orbital orientation only | −34,715 km | −66.0° |
| Parent orbital orientation plus axial tilt | −1.8 km | −67.4° |

The final model changes the projected azimuth by approximately **59.3°**, close to the user's rough two-hour clock difference. This is a system-plane projection, **not an independently measured screen-angle prediction**. Tracy's raw periapsis is 299.320616° (negation is equivalent to +60.679384°); its axial tilt is −0.340957 radians. Both enter the rotation; rotating only by the periapsis is insufficient.

The planet-only model repairs Trikora but retains large errors around the brown dwarf Vega 2. Including Vega 2's orbital orientation and 1.033939-radian axial tilt changes its children's arrival-range errors from roughly **43,000–467,000 km** to **150–153 km**. Vega 2's own range already differs by approximately 151 km, so the remaining child residuals largely track the parent residual. This supports a shared hierarchy rule rather than a special case for planet-hosted moons.

The apparent group-2 agreement is still a visual question. At the captured epoch, the model changes system-XY azimuths of Vega 2 a and b by only approximately **1.2° and 4.1°**, but c, d and e move approximately **26.4°, 19.6° and 30.4°**, respectively. An unknown map projection cannot establish that these are the actual screen changes. Do not claim that the user's observation has been disproved, that group 2 is now visually validated, or that a range match uniquely establishes 3D geometry.

The pre-existing seven-system audit was also re-examined. Full orbital-plus-tilt inheritance greatly improves six systems; root-binary HIP 97950 remains a separate exception. The production regression now exercises the actual community merger and solver on the captured six-system data, including deeper and barycentre hierarchies. Maximum absolute range residual bounds are 0.009 ls for Sol, 0.1 ls for Bleia Dryiae XJ-R e4-1, 0.002 ls for Epsilon Indi, 0.0003 ls for 61 Cygni, 0.00002 ls for LHS 3447, and 0.0007 ls for Vega. These bounds acknowledge the existing catalogue precision/timing residuals; they are not claimed spatial accuracy guarantees.

### Production change and verification

`shared/src/orbital-frame.js` now centralizes root-to-body frame composition:

```text
offsetSystem = parentFrame · eliteKeplerianOffset(elements, time)
position = parentPosition + offsetSystem
childFrame = parentFrame · Rz(-ascendingNode) · Rx(inclination)
                        · Rz(-periapsis) · Rx(axialTilt)
```

Mean anomaly affects position only. Daily spin is not part of the child frame. The axial tilt of an unorbiting root is omitted as a common rigid rotation: this defines a system reference basis without changing existing primary-planet positions or Altair's fixed camera regression. This choice must be included in any future galactic calibration; a matrix fitted in the earlier research basis cannot be used without accounting for the root-basis difference.

The same hierarchy is used by absolute positions and compact per-level scaling. Orbit sampling and moving local-detail vertices are transformed in double precision before entering GPU buffers; true-distance curves retain their body-local origin. Selected-orbit presets include ancestor rotations, but exclude the selected body's own axial tilt, which applies to its children rather than its own orbit. No name, body ID, or Star/Planet-specific exception is introduced.

Provider filtering and adapters now retain `axialTilt` / `axial_tilt` as journal-style `raw.AxialTilt` in radians. Existing LFT 509 fixtures verify signed values across Spansh, EDSM and EDGIS. A journal zero remains authoritative over community tilt. Missing/nonfinite tilt defaults to zero in the frame calculation; incomplete data therefore remains a limitation rather than becoming an exact inferred value.

Validation includes analytic 90° nested rotations (distinguishing rotation order, axial tilt and erroneous mean-anomaly inheritance), measured Vega distances, six-system catalogue ranges, all three UI scale modes, sampled nested curves, moving attachment during positive/negative playback, and selected-orbit camera planes. The existing Altair fixed-camera image regressions continue to pass unchanged. Full suite: **387 passed, 1 optional live-network test skipped, 0 failures**. UI production build passes with the existing bundle-size advisory.

The local watcher was gracefully restarted with its existing configuration, and the Brave orrery tab was reloaded. The live Vega view rendered with Tracy's Havan selected and all three providers loaded. A read-only endpoint check verified that EDSM, Spansh and EDGIS each returned 12 finite axial tilts, including Tracy's −0.340957 radians. This verifies the running ingestion/build path, not a new in-game visual comparison. The historical seven-system audit still reproduces its saved report byte-for-byte; `git diff --check` passes.

### Still unresolved

- A matched Vega in-game/app comparison remains needed for the corrected Trikora placement and especially Vega 2's outer bodies. No fresh pixel-level visual validation is claimed here.
- Scalar arrival distances cannot determine every 3D orientation or handedness. The external-sky alignment problem remains open.
- HIP 97950's primary/root-binary reference convention is not implemented by this patch; the experimental special rule remains research-only.
- Missing axial tilt and approximate provider phase data can still affect nested placements. The inherited basis is only as complete as the selected ancestry data.
- Planet/ring surface orientation is separate from orbital-path orientation; this change does not validate physical surface spin or ring-plane rendering.
- The earlier frozen Vega-to-Altair galactic-matrix failure is not resolved by this patch: that investigation already used the inherited research model. Do not restart external-sky claims on the assumption that this local correction explains the transfer failure.

## Vertical parity: V886 Centauri and the Altair camera-depth audit

### New observations

The user subsequently reported that Vega was substantially better and that **the axial tilt matched for each orbital group**, then continued testing other systems before returning to skybox work. That is useful qualitative visual support for hierarchy inheritance, not a new pixel-measured fit.

In **V886 Centauri**, the user then found that relative placements appeared correct but above/below was reversed: body **10** was above the plane in the app and below it in the game when aligning a front/edge view. They also reported an opposite diagonal slope of orbit ellipses—top-left to bottom-right versus top-right to bottom-left. Both symptoms are compatible with a reflection across the reference plane. They are not corrected by changing orbital phase, and a camera rotation cannot generally replace a reflection of a noncoplanar configuration.

### Online evidence and its limits

- A [first-person comment by the SrvSurvey route-planner contributor](https://www.reddit.com/r/EliteDangerous/comments/1retmnl/comment/o7ur3po/) explicitly reports left-handed orbital coordinates in Elite. The [parent discussion](https://www.reddit.com/r/EliteDangerous/comments/1retmnl/so_uh_has_anyone_ever_noticed_that_sol_is_flipped/) concerns Sol's mirrored orbital layout. The contributor's implementation experience is relevant; the broader thread's comparison to real-world Solar System ephemerides is not being used as a precise validation of our model.
- [SrvSurvey's pinned orbital implementation](https://github.com/njthomson/SrvSurvey/blob/4739ae7bc6ae56715e85af39a906b671aadd2cef/SrvSurvey/game/OrbitalMechanics.cs) was fetched directly again. It negates inclination as well as node and periapsis before the standard Cartesian transform. Its comment identifies the conversion as matching the game's coordinate system. This supports the missing vertical reflection, though that implementation's additive parent handling does not validate our nested-frame model.
- [Canonn's pinned implementation](https://github.com/canonn-science/canonn-signals/blob/d0f67811f21cbecde743e54ee235f2f73a0b0130/src/app/data/orbital-relations.service.ts), also re-fetched, negates node/periapsis but **retains positive inclination**, matching our pre-reflection convention. Community code therefore does not unanimously settle the question; source conventions must be compared with observation.
- Targeted searches for orbital handedness, negative inclination and inverted orrery views found this directly relevant report. No new official Frontier specification unambiguously defining the complete orbital frame was established in this pass. This is not a claim that every forum/archive avenue has been exhausted.

### Current-system data check

A watcher snapshot at **2026-11-15 08:11:51.507 UTC**, merged with all three ready providers, had no merge diagnostics. The local tree contained only the main star, so the orbital hierarchy was community backfill. Physical body **V886 Centauri 10 has journal BodyID 64**, distinct from BodyID 10, which is V886 Centauri 1.

Body 10 selects complete Spansh elements at **2026-11-15 00:22:51 UTC**, with inclination **−48.616938°**, node **141.37491°**, periapsis **280.251473°**, and mean anomaly **241.454512°**. EDGIS agrees on its orientation angles; EDSM supplies the same inclination/periapsis but lacks complete phase/orientation. Its parent is the main star, so nested hierarchy cannot explain this particular error. At capture time the prior model places it at **+3148.2283 ls in system Z**; the corrected model places it at **−3148.2283 ls**, keeping X/Y unchanged. These are calculated coordinates, not an independently measured cockpit position.

[The sanitized V886 fixture](../../shared/test/fixtures/v886-vertical-parity.json) stores input geometry, selected-source metadata, and pre-reflection numerical outputs for regression. The latter are explicitly labelled solver outputs, **not observed game coordinates**. Two additional epochs are synthetic playback checks.

### Validation flaw discovered in the earlier Altair analysis

The original image fit used:

```text
pixelXY = scale * (R * position).xy / (1 + inverseDepth * (R * position).z) + translation
```

It constrained `R` to a proper rotation but allowed **either sign of inverseDepth**. All three best-fitting inherited candidate cameras had **negative** inverse depth: approximately −0.054706, −0.054871 and −0.042337 AU⁻¹. For a camera using right/down/forward axes and positive image scale, a forward-looking perspective camera requires nonnegative inverse depth. Allowing negative depth introduces a reflection ambiguity; the small residuals established improved relative geometry but did **not** validate the vertical parity of the rendered model. The original fixed-camera unit test preserved that ambiguity. This was a gap in our validation, not a new error in the user's comparison.

Let `F = diag(1,1,-1)`. Replacing world positions with `F p`, camera rotation with `F R F`, and inverse depth with its negative preserves every projected pixel. `F R F` still has determinant +1. This explains exactly how the previous fit concealed the reflection.

[The corrected audit script](altair-vertical-parity.py) refits both parities with **nonnegative depth**, positive scale and proper rotations, using 48 reproducible starting poses per case plus the algebraically converted historical camera for the reflected case. All bodies remain in front of the camera. No orbital values, timestamps or individual body offsets are fitted. [The numeric results](altair-vertical-parity-results.json) are:

| In-game screenshot (UTC) | Prior parity, RMS original pixels | Reflected parity, RMS original pixels |
| --- | ---: | ---: |
| 06:35:47, four bodies | 0.122 | 0.115 |
| 06:35:57, six bodies | 43.620 | 1.398 |
| 06:37:44, six bodies | 46.153 | 1.103 |

The four-marker view remains insufficiently discriminating: both parities also reproduce its independent inner-orbit outline samples at approximately 0.9–1.5 preview pixels. Those outline checks do **not** independently establish handedness. The two full-system images, including the out-of-plane geometry, distinguish the candidates strongly under the same physical camera model. These are corrected uses of existing captures, not new V886 screenshots, and the fit is not a proof of a unique global optimum.

### Consistent production correction

At the geometry boundary, inclination now changes sign along with node and periapsis. In inherited frames, **axial tilt also changes sign**:

```text
childFrame = parentFrame · Rz(-node) · Rx(-inclination)
                        · Rz(-periapsis) · Rx(-axialTilt)
```

This is mathematically equivalent to reflecting the complete former geometry across system XY, at every depth: `p_new = F p_old`. It preserves X/Y, all pairwise distances, orbital periods, phases and arrival-distance residuals. Flipping inclination while leaving inherited axial tilts unchanged would instead deform nested geometry and spoil the range agreement. Raw journal/provider fields remain unchanged; the generic standard astronomical Kepler solver remains unchanged.

Body positions, compact scaling, orbit curves, moving close-up detail, and selected-orbit camera frames already share the central angle/frame conversion, so all receive the correction. In an edge-on view where screen horizontal follows an in-plane direction and screen vertical follows system Z, the vertical component reverses and the projected diagonal slope reverses with it. At arbitrary oblique perspectives the screen transformation is more complex; a universal pixel-by-pixel vertical flip is not claimed.

The Altair test-camera fixture is converted **algebraically without refitting markers**, retaining the original measured pixels and scale/translation. Its depth is now positive and the test explicitly rejects nonpositive depth. With the camera corrected but production geometry unchanged, the test failed on Biggs Colony with a **203.13-pixel** discrepancy. After the geometry correction all captured markers remain within 3 original pixels.

Additional regression coverage pins the signed vertical coordinate analytically, checks front-view diagonal slopes in all three scale modes, and verifies that the complete V886 hierarchy (including barycentres and moons of moons) preserves XY and relative distances while reversing Z at three epochs. The prior six-system range regressions and nested-curve attachment/view tests continue to pass. Full suite: **390 passed, 1 optional live-network test skipped, 0 failures**. UI production build passes with the existing bundle advisory. Historical reports are retained; the Vega parent-frame replay now explicitly freezes its former positive-inclination basis so changing production convention cannot silently rewrite it.

The corrected UI bundle is ready. The user's active comparison view was deliberately not reloaded during this turn; a browser refresh loads the update. No live V886 visual confirmation or new screenshot fit is claimed yet.

### Remaining implications

This fixes a local reflection independently of the still-open galactic mapping. Any saved local-to-galactic transform must explicitly account for the revised coordinate basis (and the omitted common root tilt) before reuse. A consistently transformed calibration does not magically resolve the old cross-system transfer discrepancy. HIP 97950's special root-binary convention, missing provider data, and ring/surface orientation remain separate open issues.

## Timbalderis: circumbinary reference frames and an adaptive comparison grid

### Observations and data

The user confirmed that **V886 Centauri looked great after the vertical fix**, then reported a mismatch in Timbalderis. Their clarification was specific: **orbital group 1's A/B arrangement looks correct, while AB 1, AB 2 and AB 3 do not**. They later said C had looked wrong earlier but now looked correct. This patch does not move A, B or C, and no explanation of that earlier C appearance is established here.

The local snapshot at **2026-11-15 08:34:53.050 UTC** contained only a synthetic system root. All three community providers were ready (EDSM 42, Spansh 45, EDGIS 46 records), and the merge had no diagnostics. Complete Spansh orbital sets supply the hierarchy. The captured [public-provider fixture](../../shared/test/fixtures/spansh-timbalderis-orbits.json) includes source epochs and measured arrival ranges; its source is [Spansh's Timbalderis dump](https://spansh.co.uk/api/dump/8330323956442).

The relevant hierarchy is:

```text
ABC barycentre 0
├─ AB barycentre 1 — wide orbit relative to C, inclination −51.642367°
│  ├─ A (2) and B (3) — inner stellar binary, inclination 91.250241°
│  ├─ AB 1 (14), AB 2 (25), AB 3 (28), AB 4 (41)
│  └─ binary-planet group 53 → AB 5 (54), AB 6 (59)
└─ C (4)
```

The earlier inherited-frame solver correctly places A and B in their inner binary orbit, and correctly places B's own planets. However, the other children of barycentre 1 were using the enclosing AB–C orbital frame directly. Their circumbinary reference frame instead requires the inner stellar binary's orbital basis, specifically its first component A. This is the nested equivalent of the previously isolated HIP 97950 root-binary issue.

### Evidence for the reference rule

An initial comparison applied A's orbital basis to the non-A/B children of barycentre 1, without changing the pair, source elements, phase epochs, or axial tilt data. A comparison using B's basis was also tested: its opposite periapsis makes it a different phase-origin convention and it performed poorly (maximum affected range error approximately 192.26 ls). A's basis reduced the affected descendants' maximum error from **105.3973 ls to 0.0008133 ls**.

| Body | Previous arrival-range error (ls) | Corrected error (ls) |
| --- | ---: | ---: |
| B | −0.00001450 | −0.00001450 |
| C | −0.10510433 | −0.10510433 |
| AB 1 | −104.24816462 | +0.00012637 |
| AB 2 | −91.92356944 | −0.00036737 |
| AB 3 | +104.71521209 | +0.00009077 |
| AB 6 | +15.48897199 | −0.00081331 |

C's unchanged residual is measured against a range of approximately **254,190 ls**. It remains in the report rather than being concealed in the affected-body summary. These residuals reflect catalogue precision and epoch limitations as well as modelling accuracy; they are not universal spatial-error guarantees.

[The replay script](binary-frame-audit.mjs) compares a frozen pre-binary, post-parity solver with current production across **eight systems / 353 measured ranges**. [The report](binary-frame-results.json) retains every row and the spatial displacement introduced by the correction. HIP 97950's maximum range residual improves from approximately **677.630 ls to 0.001649 ls**. Results for Sol, Bleia Dryiae XJ-R e4-1, Epsilon Indi, 61 Cygni, LHS 3447 and Vega are unchanged. This replaces the former root-only experimental exception with a shared hierarchy rule.

### Generic implementation and safeguards

At a barycentre, look for a **unique measured stellar pair** among its immediate Star/Barycentre children. At least one component must be a star. Periods agree within a relative 10⁻⁶, eccentricities within 10⁻⁵, and inclination/node within 0.001°; periapsides must oppose within 0.001°. Nonfinite elements, zero periods, unresolved components, and approximate components lacking measured orientation do not qualify. Multiple candidate pairs produce no inferred correction.

The first component by Elite BodyID supplies the orbital basis to other children of the group. Map insertion order, system names, and specific body IDs are not hard-coded. Binary components themselves retain their previous enclosing frame. The reference contributes its **orbital basis only**, not its current mean anomaly, daily spin or axial tilt. The reference convention has strong support in these captured cases but remains something to test in additional multiple-star systems; it is not a published complete Frontier frame specification.

The shared hierarchy walk and parent-frame resolver both use this edge-specific reference, so absolute and compact positions, orbit lines, local curve detail and selected-orbit presets agree. Regression tests now include Timbalderis ranges, wrong/ambiguous pair rejection, map-order independence, and full orbit curves / playback / camera planes for its stars, circumbinary bodies, and nested descendants in all three scale modes. HIP 97950 joins the production range regressions.

### Square grid for view alignment

The user requested a toggleable square grid with progressively finer divisions while zooming, similar to the game's orrery. **View → System plane grid** now provides a system-axis-aligned grid; with **System reference plane → Top**, equal world-axis steps project to square screen cells. It is deliberately not labelled the galactic plane: absolute orbital-to-galactic alignment is still unresolved.

The renderer uses one four-vertex quad and an antialiased shader, with three blended levels separated by factors of ten. Zoom changes spacing and reveals smaller cells without generating an ever-growing collection of line meshes. The lattice remains aligned to system X/Y while the visible patch recentres in whole coarse-grid increments. Its edges and unresolved grazing-angle detail fade. Visibility is saved; the UI shows physical cell spacing in true-distance modes and display units in Compact. Rendering still follows the app's existing on-demand cadence.

The first version fixed the plane at system Z=0. The user then reported that it disappeared when zooming into orbital group 1. There is **no zoom-level cutoff**: at the investigation epoch that group sits approximately **25,559 ls below** the root plane, so a close camera can pass below it and face away from it. The fixed root plane is then outside/behind the camera's field of view.

The revised **Grid origin** control defaults to **Follow view centre**, translating the plane to the camera target's height while retaining system-axis orientation. This is a movable alignment aid, not a physical assertion that a galactic/system plane moves with the observer. **System centre** retains the original fixed Z=0 reference. Changing the view's selected-orbit reference does not rotate this system-axis grid; use the system-reference Top preset when square cells are required. Both grid settings are saved. A regression covers a group thousands of scene units off-plane while zooming from 100 to 0.001 scene units, ensuring the grid follows the target and keeps refining instead of retaining root-distance spacing.

### Verification and remaining work

The full suite after the binary/grid changes passed **399 tests**, with **1 optional live-network test skipped**. The close-up origin follow-up added one UI regression; the UI suite then passed **156 tests**, bringing the combined suite count to **400 passing / 1 skipped**. The production UI builds successfully; the existing bundle-size advisory remains.

The initial grid was checked in a separate Brave preview tab, preserving the user's comparison tab. A reserved GLSL identifier discovered during that check was corrected before the ready notice. The working grid was visually inspected from Top and Angled, and zooming changed the displayed fine spacing from 6.68 AU to 334 ls. The preview tab was then closed. The later follow-origin correction was built and its off-plane regression passed; a further UI check was not completed because the user was actively manipulating Brave and the isolated browser host was unavailable. No screenshot verification of that final close-up mode is claimed. The original comparison view was left under the user's control.

The numerical and qualitative evidence strongly supports the Timbalderis correction, but the user has not yet confirmed AB 1/2/3 after this patch. No new matched in-game screenshot fit was performed. Future checks should include more stellar pairs and ambiguous/missing pair data. Galactic mapping, the historical cross-system transfer failure, and physical ring/surface orientation remain separate research questions.

## V886 Centauri 10: ellipse-shape check before paired screenshots

The user subsequently confirmed Timbalderis looked fixed and returned to V886. Most of V886 appeared correct, but body 10's orbit still looked questionable. They asked whether the app draws circles or ellipses and offered to capture top-down game/app screenshots. Those captures have not yet been analysed at this checkpoint.

Current EDSM, Spansh and EDGIS responses agree on body 10's semimajor axis (approximately **9.400557 AU**), eccentricity (**0.171625**), inclination (**−48.616938°**) and periapsis (**280.251473°**). Spansh and EDGIS also agree on the node (**141.37491°**); EDSM does not supply it. These providers may share upstream observations and are not three independent physical validations. A read-only UI check confirmed the running app was in **Fully to scale**, so Compact's nonlinear radial compression was not responsible for this reported appearance.

The recorded conic has semiminor axis **9.261075 AU**, an axis ratio of **0.985162**, focus-to-centre offset **1.613371 AU**, periapsis distance **7.787187 AU**, and apoapsis distance **11.013928 AU**. It is nearly circular when viewed perpendicular to its own plane, despite a noticeable focus offset. Its roughly 48.6° inclination can produce a much more elongated projection when viewed from the system's top. A system-top view and a selected-orbit-top view are not interchangeable for comparison.

The renderer samples Keplerian positions rather than drawing a circle. It uses 96 full-orbit segments plus moving local detail around the body. An audit of actual scene/GPU vertices in both true-distance modes found the normalized ellipse-equation residual below **1.8×10⁻⁷**, with a closed curve and the star at a focus. Plane/focal-sum deviations are at Float32-scale relative to this ~1.4×10¹² m orbit. Straight segments between vertices still approximate the conic: maximum tested chord-midpoint deviation was about **0.007334 AU**, approximately **0.078% of the semimajor axis**. This can cause slight faceting at sufficient zoom; it is not evidence of an entirely different ellipse or orientation.

`ui/test/v886-orbit-shape.test.js` now checks the actual scene builder/updater against independent analytic ellipse and focal-sum identities at three epochs, and bounds segment approximation. Both tests pass. No production drawing formula was changed in this investigation. **Agreement with the input conic is not proof of agreement with the game's displayed orbital orientation.** The next comparison should include the main star, body 10's full outline and inner-body anchors in both images, with the app in Fully to scale and Top/System reference plane. The user's paired screenshots are the next evidence needed to distinguish projection, focus placement, plane orientation, and remaining model differences.

## V886 Centauri 10: paired screenshots isolate camera perspective

### Captures and observed difference

The next pair, taken on **2026-11-15 at 09:07:48 UTC (game) and 09:07:51 UTC (app)**, shows a near-top view centred on the main star. The user reports that relative body positions look reasonable but body 10's outline does not. The app capture visibly uses **Fully to scale**. The game image is 4112×2658; the app desktop capture is 3569×2080 and includes browser chrome/margins. Their framing and viewport sizes differ, so directly comparing pixel extents would be misleading. [The measurement fixture](fixtures/v886-camera-image-points.json) records filenames, SHA-256 hashes, dimensions, approximate inner-body centres, outline seed points and extracted points. Original screenshots remain with the user.

The screenshots show a real projected-outline difference. Our old curve extends disproportionately toward the lower right. Centering both cameras on the star constrains the look-at target, but does **not** constrain field of view or camera distance. With equal apparent scale on the reference plane, a wide-angle camera must sit closer; inclined portions approaching it grow more, while the far portions shrink. Body 10 reaches several AU above/below the plane and is much more sensitive to this than the nearly coplanar inner bodies.

### Measurement and model comparison

[The geometry exporter](v886-camera-geometry.mjs) uses the unchanged production hierarchy/Kepler solver and the existing V886 snapshot at the capture epoch. [The replayable Python audit](v886-camera-projection.py) fixes a top-view origin and separate X/Y scales from the star and bodies 5, 6, 7 and 9, then fits **only positive inverse camera distance** to eight alternating samples of body 10's outline. No orbital element, phase, orientation, inclination or eccentricity is fitted. The eight remaining outline samples are held out. Separate axis scales accommodate the roughly 4% difference visible in the image; this is a nuisance calibration, not proof of whether the difference originates in capture scaling, game projection or slight camera tilt.

Outline samples were selected manually in a 1600px-wide, aspect-preserving preview, then snapped to the nearest neutral-grey source pixel (RGB channel spread <8, green between 45 and 160). That extraction does not use the orbital model. Some samples near overlaid labels/icons are less reliable; the largest seed-to-pixel correction is about 6.5 preview pixels. Inner-body centres are approximate to about one preview pixel. These uncertainties are preserved, not represented as exact ground truth.

[Results](v886-camera-projection-results.json):

| Check | RMS error, pixels in 1600px-wide game preview |
| --- | ---: |
| Inner-body anchors after fitted projection | 0.30 |
| Eight outline samples used to estimate perspective | 1.92 |
| Eight held-out outline samples | 0.84 |
| Fixed 15° vertical FOV, all outline samples | 1.48 |
| Fixed 55° vertical FOV, same inner-body framing | 27.89 |
| Orthographic projection, same inner-body framing | 10.60 |

The estimated vertical FOV is **15.03°** under the stated top-view/viewport assumptions. A fixed 15° camera is therefore a well-supported practical match for this capture; a completely orthographic camera is less accurate. The maximum residual for fixed 15° is 4.78 preview pixels, with the larger residuals affected by the manual/occluded extraction. At native game screenshot scale, preview errors multiply by 4112/1600 = 2.57. These are geometric point-to-polyline distances, not image-wide pixel-difference scores.

Both the fit and held-out checks use the same screenshot. They strongly explain this outline discrepancy but do not independently validate every orbital parameter. In particular, the body-10 curve helps estimate the camera: it must not be presented as a wholly independent orbit validation. The old app camera's **55° vertical FOV is known from code**; this audit does not claim an independent camera fit to the app image. Its different viewport/framing would produce different raw residuals from the controlled 55° comparison above.

### Implementation and verification

The system camera now uses **15° vertical FOV**, defined once as `ORRERY_FOV_DEG` in `ui/src/camera.js`. Existing Fit System and Zoom to Body calculations already derive distance from the camera's effective FOV, so they continue to frame objects correctly with a more distant viewpoint. OrbitControls remains perspective-based. No orbital inputs, handedness, hierarchy transformations, ellipse geometry, or grid-plane offset changed in this step.

The camera tests now exercise the production FOV, including tiny-body framing/clipping, distant-system framing, moving-body following, pan/rotate controls and view presets. A screenshot regression projects the **actual scene's 96-segment GPU orbit path** using frozen inner-body scale/centre, the capture's viewport height and the production FOV, then compares it with all measured outline samples without refitting. Its tolerance allows measured extraction uncertainty; the old 55° camera fails it. **All 159 UI tests pass**, and the production UI build succeeds (existing bundle-size advisory remains). `git diff --check` passes. The updated live browser view has not been inspected or confirmed by the user yet; reload and a matching top/system-plane comparison are the next visual check.

### Remaining questions

- The approximate 15° match is inferred from this capture, not an official Frontier specification. More captures at different zooms and inclinations would test whether the game's map camera keeps that FOV fixed.
- Slight tilt and nonuniform screenshot/projection scaling remain partly degenerate. Their small residual effects should not motivate changes to the recorded orbit without further evidence.
- A camera adjustment is generic across systems and alters perspective in angled/close-up views too; those views should be checked during normal use.
- This finding resolves the large observed outline discrepancy under a supported camera model, but does not establish absolute orbital-to-galactic alignment or solve the earlier cross-system skybox calibration.

No new external sources were needed for this step: it uses the user's new captures, the previously captured provider data, the local rendering implementation, and explicit camera projection equations. Earlier source links and historical conclusions remain above for provenance.

### User confirmation and commit checkpoint

The user subsequently reported that the camera change **seemed to work**, with further checks in additional systems still planned, and requested that all current work be committed. The pre-commit validation completed with **403 passing tests and one optional live-network test skipped** across shared, watcher and UI workspaces. The first sandboxed run could not open the watcher's localhost test server; rerunning that workspace with localhost access passed all 126 watcher tests. The UI production build and whitespace checks also pass. This is a confirmation for V886's observed appearance, not a claim of completed multi-system visual validation.

## Grid clipping, unrestricted rotation and orientation cues

The user subsequently tested **V886 Centauri and Vega**, reporting both worked so far. They then reported slices disappearing/reappearing in the reference grid while changing angle, and occasional inability to lower the camera below the plane. They explicitly chose **unrestricted continuous 360° rotation**, then requested a rotating bottom-left XYZ legend and complementary grid colours above/below.

### Grid rendering

The previous shader expanded a two-triangle world-space quad. Its extent and recentering depended on rounded decade spacing, while camera far clipping depended on the system/body framing. The quad could extend beyond the far plane at large zoom ranges, and its bounds/fade region could jump at decade or anchor transitions. A corner-based finite patch is unnecessary for this reference overlay. These are identified rendering weaknesses consistent with the report; the user's exact intermittent frame sequence was not captured or reproduced on their hardware.

The replacement keeps a fixed screen quad and calculates the camera ray/plane intersection per fragment. The quad itself never crosses the camera's eye/far plane. Rays parallel to the plane, intersections behind the camera and intersections outside the clipping range do not draw. The visible plane fades before the far limit and toward the horizon using a distance continuous with zoom, independent of discrete grid levels. The existing three-level decade subdivision remains, with separate derivative filtering on each axis so a highly foreshortened axis does not erase the other set of lines.

Intersection coordinates are camera-relative in grid-step units. Only the camera XY phase modulo a coarse cell reaches the GPU, preventing loss of small-cell precision around distant bodies. Fragment depth is computed at the intersection, matching Three's logarithmic scene depth (with a conventional perspective-depth fallback). The grid remains depth-tested and does not write depth, preserving body occlusion. This changes neither the physical orbital geometry nor the meaning of the selected grid origin, and adds no zoom restriction. An exactly edge-on plane naturally has no visible area.

Above the plane (+Z), the grid uses muted blue `#497f9c`; below (−Z), complementary orange `#9c6649`. This is a navigation cue, not a galactic-orientation assertion. The UI still labels it **System plane grid** because a calibrated galactic frame remains unresolved.

### Rotation and legend

The old OrbitControls input model restricted polar angle to [0, π]. Top's screen-up Y axis made an in-plane direction a polar limit, explaining why a vertical drag could stop at the plane's edge after that preset. An initial narrow fix would have retained an upright polar model; the user instead explicitly requested continuous rotation through every direction.

`free-rotation.js` now applies screen-relative quaternion rotations to both camera offset and camera up. OrbitControls' own rotation inputs are disabled; its existing pan, keyboard and wheel/two-finger zoom remain. Single-touch rotation belongs to the new layer; the unmapped one-touch action explicitly clears the former two-finger state on release. Rotation preserves the target and distance and continues to follow moving bodies. Known view presets and Reset remain ways to restore orientation after flips. No changes to camera FOV or orbit conventions were needed.

The bottom-left SVG legend projects the fixed **system X/Y/Z axes** through the inverse camera orientation. Pan, zoom and FOV do not affect it. Solid positive arms have coloured X/Y/Z labels; negative arms are faint/dashed. Depth ordering changes with orientation. It is independent of selected-orbit presets so it continues to provide a stable system reference when viewing a tilted local orbit. The left panel's available height reserves space for it above the playback/status area.

### Validation and limits

The UI suite passes **164 tests**, including repeated full horizontal/vertical revolutions, upper/lower hemisphere crossings after every preset, moving-body following, pan/zoom, two-finger-to-one-finger transitions, legend top/bottom directions and ray/plane projection across distances from 1e−4 to 1e12 scene units. The ray reference is evaluated at the origin to avoid cancellation when unprojecting near-plane offsets at a distant body's coordinates.

An isolated headless Brave profile with software WebGL rendered nine grid cases: top, angled, below, shallow ±0.2°, a very large view, a close-up around an off-plane distant target, and another subdivision scale. Shader compilation and GL error checks passed, and the captures show blue/orange faces with no clipped triangular wedges. The built app was also inspected at 1440px and 640px widths; a real browser-input half-turn produced an upside-down view with the orange grid and correctly inverted legend. The test browser/profile were separate from the user's active comparison view. Software rendering verifies shader compilation and output, but does not establish that every native GPU/driver flicker scenario is resolved. The user's next normal-use check remains valuable.

## Sedna: full-orbit sampling must follow curvature, not time alone

The user observed that Sedna's outer orbit appeared smooth from a Sol-centred system overview, but its inner swing consisted of roughly six obvious straight lines. During playback, the curve smoothed as Sedna reached that region and became jagged again after it moved away. That second observation identifies the interaction between two existing mechanisms: a fixed **96 equal-time intervals** for the whole orbit, and extra moving samples concentrated around the current body. Equal-time spacing concentrates vertices near slow apoapsis and leaves long chords through rapid periapsis. The local refinement temporarily concealed those chords when Sedna was nearby. No geometric/orbital element change is needed to explain this behavior.

`orbit-path.js` now starts from the same phase anchors but recursively subdivides an interval when its quarter/midpoint probes deviate too far from the endpoint chord. The tolerance is **1e−4 of the displayed semimajor-axis scale**, with six subdivision levels as a safety/work bound. Probes use the same parent frame and display transform as the rendered orbit; Compact therefore refines its nonlinear displayed curve as well. The full-curve refinement is cached at construction and does not move away with the body. Actual phase values are retained for the nonuniform samples so playback can correctly merge them with the existing exact-body and geometrically spaced local knots. The dynamic GPU buffer is sized once and reused.

[The independent audit](sedna-orbit-sampling.mjs) compares actual scene/GPU polylines with **8192 points generated directly from eccentric anomaly**, using the frozen Sol provider fixture (Sedna eccentricity 0.854). No parameters are fitted. The [results](sedna-orbit-sampling-results.json) record errors relative to the displayed semimajor-axis scale:

| Mode | Old 96-interval maximum error | Refined maximum error | Vertices in captured rendered path |
| --- | ---: | ---: | ---: |
| Compact | 16.7331% | 0.0097895% | 322 |
| True distances | 1.97187% | 0.0099158% | 311 |
| Fully to scale | 1.97187% | 0.0099158% | 329 |

The old comparison isolates the full-orbit baseline; its extra moving local detail is not included, since it cannot improve distant parts of the curve. Refined counts include moving samples where applicable and differ with body-radius scaling. The true-distance error reduction is about **199×**. These are geometric errors, not measured screenshot pixels or a universal error guarantee. The [before/after inner-swing plot](sedna-orbit-sampling-comparison.svg) was generated from the actual polylines in the orbital plane and visually inspected; it is not an in-game screenshot.

A new regression places Sedna at **apoapsis** so local body refinement cannot hide poor sampling of the inner swing, then checks the whole curve against 4096 independent conic points in all three modes. Existing tests still cover exact body attachment, GPU rounding at distant close-ups, local tangent continuity during playback, nested parent frames, and V886's captured outline. The full UI suite passes **167 tests**, and the production UI builds. The work preserves the preceding uncommitted grid/free-rotation/axis changes.

This remains bounded geometric sampling, not camera-dependent tessellation. Extreme zoom into a distant portion of any polygonal path can still reveal chords; achieving a strict screen-pixel tolerance at every zoom would require view-dependent refinement. The present change addresses the large periapsis error visible in an ordinary system overview without changing orbital data or relying on the current body position.

## Progressive body labels and collapsed-group hints

The user requested that crowded orbital groups show their central star from a distance, then reveal child labels as the projected spacing becomes readable, allowing modest overlap. Both binary stars remain labelled for now. They also requested the game's small **+** cue for a collapsed group, disappearing when zoom reveals its bodies.

Label layout now operates in CSS pixels on the rendered camera projection in every scale mode. In-view stars and the selected body take priority; remaining labels are considered parent-first through invisible barycentres. Children need 32px projected separation from an in-view labelled parent to appear, but can remain visible down to 24px. If a parent is off-screen, its local children can still be inspected. Label rectangles permit 20% overlap for newly revealed labels and 35% for existing labels, with stable ID ordering and preference for already-visible siblings to reduce chatter. These are initial readability thresholds, not physical-distance cutoffs.

A separate small plus sprite is attached to a visible label when an otherwise hidden, in-view body lies within 48px of that representative body. It can move down the hierarchy: a stellar group's plus disappears as its planets become labelled, while a tighter planet/moon pair can retain its own plus. Off-screen and behind-camera bodies do not produce hints. The symbol indicates unresolved nearby labels, not a numeric body count or a discovery claim. Stars in a tightly overlapping binary remain individually labelled as requested; no combined binary naming policy is introduced.

The implementation preserves sphere geometry, orbit paths, location markers and picking. Selected labels bypass normal decluttering but still obey viewport/depth visibility. Labels keep their existing constant screen size; layout is only recalculated on a frame already required by camera/data/time changes, without introducing continuous rendering.

All **173 UI tests pass**, covering progressive parent/moon reveal, hint transfer/removal, binary stars, selected-body priority, invisible barycentres, off-screen parent handling, small overlap, stable reveal/hide thresholds and actual annotation projection. A software-WebGL browser check used the frozen Vega fixture centred on Vega 2: the distant group showed its central star with a plus; approaching revealed an outer child; close-up showed the main children and removed the central plus while the tighter Vega 2 d / d a pair retained one. The production UI build and whitespace checks pass. Threshold tuning across more systems and camera orientations remains a normal-use follow-up; dense stellar labels are intentionally exempt from decluttering in this first version.
