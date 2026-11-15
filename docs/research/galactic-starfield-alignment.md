# Galactic starfield alignment research

Recorded 2026-11-14, America/Los_Angeles. This is a checkpoint of the investigation before further research, not a completed alignment specification. Some captured HTTP timestamps fall on 2026-11-15 UTC, the same local evening.

**Continuation available:** [Orbital frame audit and screenshot calibration](galactic-frame-followup.md) records subsequent numerical findings that challenge the common-frame assumption, a candidate hierarchical transform, and actual screenshot calibration without known ship XYZ. Vega captures establish an empirical alignment; the subsequent Altair experiment rejects transferring that matrix unchanged. A subsequent direct Altair orrery comparison confirmed a production local-position discrepancy; the node/periapsis sign fix has now been implemented and checked against all captured Altair markers. A live-source audit did not find stale data responsible. Nested geometry and a universal galactic mapping remain unvalidated. The original checkpoint below is retained as the record of what was known before those experiments.

The objective is to show real external systems, including landmarks such as Sol and Sagittarius A*, in their correct directions behind Orrery's local planetary system. The user prefers solving this within the existing orrery. A separate galactic-map feature would materially change the app's scope and is not the preferred solution.

**Current finding:** the data and APIs needed to locate other systems relative to the current system are available. Community projects also implement Elite-specific orbital geometry. What has not yet been verified is the transformation connecting those reconstructed local orbits to the galactic sky for arbitrary systems. This is an unresolved research question, not evidence that the feature is impossible or that the community has never solved it.

The expanded community search also identified a concrete discrepancy between Orrery's orbital-angle handling and other implementations. That requires validation before we can claim accurately aligned background stars. No orbital correction or catalogue starfield has been implemented as part of this investigation.

## Reading guide

- [Scope and decisions](#scope-and-decisions)
- [Current application data and rendering](#current-application-data-and-rendering)
- [Coordinate frames and the missing transformation](#coordinate-frames-and-the-missing-transformation)
- [Sol orbital evidence](#sol-orbital-evidence)
- [Community orbital implementations](#community-orbital-implementations)
- [Community sky alignment work](#community-sky-alignment-work)
- [Nearby system APIs and measurements](#nearby-system-apis-and-measurements)
- [Implementation direction](#implementation-direction)
- [Open questions and issues](#open-questions-and-issues)
- [Validation and research continuation](#validation-and-research-continuation)
- [Source register](#source-register)
- [Evidence and workspace state](#evidence-and-workspace-state)

The companion [evidence file](galactic-starfield-evidence.json) preserves compact API observations, selected Sol fields, request parameters, and hashes of the downloaded material. Local code links describe the working tree at this checkpoint; external `main` and `master` links may change.

## Scope and decisions

The discussion progressed through related but distinct questions:

1. Does the app know the player's position? Distinguish the current system's galactic coordinates from the ship's free-space position inside that system.
2. Does the exploration panel show first footfall? A separate, small UI change was authorized and implemented earlier in this session.
3. Can real nearby systems and major landmarks replace or augment the decorative background stars?
4. Can the orbital reconstruction be aligned accurately with galactic coordinates?
5. Has the community already documented, implemented, or calibrated that relationship?

The user explicitly suggested official Frontier forum posts, Archive.org captures, Reddit, and Canonn Research as sources. Developer accounts, firsthand observations, and inspectable implementations are valuable evidence. Each still needs to be evaluated for the particular claim it supports.

Decisions and constraints established so far:

- Preserve the orrery's focus; do not treat a new galactic-map screen as the default answer.
- Prefer real positions and explicit uncertainty to a visually plausible but unverified orientation.
- A bundled landmark catalogue and an optional nearby-system catalogue are compatible ideas.
- Remote catalogue access should fit the app's existing optional community-data model.
- No community outreach, issue filing, or messages to other people have been authorized or sent.
- The request to capture this analysis takes precedence over further research. This checkpoint was assembled from already retrieved material and local code, without starting a new external investigation.

## Current application data and rendering

### Current system location

[`watcher/src/system-model.js`](../../watcher/src/system-model.js) handles arrival/location events and retains `StarPos` as `systemContext.starPos`. The inspected snapshot builder does not forward this field to the UI. Thus the watcher already has a useful current-system galactic position, but exposing it through the snapshot is an implementation task for the proposed background.

`StarPos` is the system's position in the galaxy, not a continuously updated ship position within the system. It should not be presented as the latter.

The earlier code inspection found journal and `NavRoute.json` processing, not a live `Status.json` reader. The user also checked `Status.json` and confirmed it does not provide the ship's current free-space coordinates. Surface latitude/longitude and body context are separate data and cannot be treated as a universal ship XYZ vector. The [Frontier journal manual](https://hosting.zaonce.net/community/journal/v37/Journal_Manual_v37.pdf) and existing [technical notes](../../TECHNICAL.md) provide context, but the manual version inspected is v37 and should not be treated as an exhaustive survey of every subsequent game update.

An accurate background direction measured from the system origin is still useful without live ship coordinates. Whether camera translation or very wide-system parallax should affect it is a separate design question.

### Decorative starfield

[`ui/src/starfield.js`](../../ui/src/starfield.js) currently creates 1,200 randomly distributed points on a unit sphere. It uses a separate scene and camera, copies the main camera's world quaternion, field of view, aspect, and zoom, and ignores camera translation. This produces a decorative sky at infinity.

That separation is a natural place for catalogue directions and landmark markers. However, copying the camera rotation cannot establish the missing relationship between the orbital axes and galactic axes. The point coordinates must first be expressed in a verified compatible frame.

The current random stars are not a catalogue and should not be assigned real identities. A future design must decide whether to replace them or clearly distinguish decorative points from accurately placed systems.

### Orbital reconstruction

[`shared/src/kepler.js`](../../shared/src/kepler.js) computes a Keplerian offset using the usual combined perifocal rotation. In `keplerianOffset`, inclination, argument of periapsis, and ascending node enter with their supplied signs. Its conventional reference plane is XY, with Z perpendicular to it.

[`watcher/src/body-tree.js`](../../watcher/src/body-tree.js) maps journal angles into these fields without sign inversion. [`shared/src/community-backfill.js`](../../shared/src/community-backfill.js) likewise maps the inspected community orbital fields without those inversions.

[`shared/src/orbit-position.js`](../../shared/src/orbit-position.js) obtains a system-relative body position by adding the body's offset and ancestor offsets. It does not rotate a child's reference axes by the parent's orbital orientation while walking the chain.

[`TECHNICAL.md`](../../TECHNICAL.md) asserts a common system-wide orbital reference frame and directly additive offsets. That describes the intended model, but the assertion is not itself proof of an orientation relative to the galaxy. Its broad orbital-accuracy statement also deserves review in light of the angle-convention discrepancy below.

Do not conflate these two questions:

- Are parent-relative orbital offsets expressed in common axes and therefore directly additive?
- How are those axes oriented relative to the galactic coordinate system?

The second does not follow from the first.

### Display scaling

The app can compress each parent-relative offset before summing the hierarchy. This is useful for navigation but is not a physical observer geometry. Even with correct sky orientation, compressed body layouts cannot promise the same apparent body-to-star alignments a real observer would see.

Validation of angular relationships must use physical positions, then a documented camera pose. Body-radius exaggeration, compressed separation, camera focus, and sky-at-infinity behavior need to remain distinct concepts.

### First footfall change already made

The exploration details now include a First footfall row in [`ui/index.html`](../../ui/index.html), populated by `fmtFootfall` in [`ui/src/data-panel.js`](../../ui/src/data-panel.js):

| Recorded body data | Display |
| --- | --- |
| Planet, not explicitly non-landable, `WasFootfalled: true` | Claimed |
| Planet, not explicitly non-landable, `WasFootfalled: false` | Unclaimed |
| Eligible planet but missing footfall flag | Unknown |
| Non-planet or explicitly non-landable | Em dash |

The tooltip describes the status at the time of the recorded scan. It does not claim a live global status or identify the first-footfall commander. Earlier validation passed the three existing data-panel tests, the Vite build, and an ad hoc six-case rendering check. This checkpoint does not rerun or broaden that verification.

## Coordinate frames and the missing transformation

### Galactic positions

Elite system coordinates use a Sol-centred Cartesian frame. The community coordinate-conversion discussion describes positive Y above the galactic plane, positive Z approximately toward the galactic centre, and the game's X convention relative to astronomical galactic longitude. Its supplied conversion is:

```text
x = -r cos(b) sin(l)
y =  r sin(b)
z =  r cos(b) cos(l)
```

Here `l` is galactic longitude, `b` is galactic latitude, and `r` is distance. One prose comment repeats `x` on the third line, but the author's later MATLAB code correctly uses `z`. Use the code and verify against known coordinates, rather than copying the typo. [Coordinate conversion discussion](https://www.reddit.com/r/EliteDangerous/comments/18mpxss/xyz_coordinates_in_the_galaxy_map/).

The discussion supplies examples for Polaris, Altair, and Sagittarius A*, and conversions to/from equatorial right ascension and declination. These are useful checks on catalogue axes. They do not establish the local orbital reference frame of a procedural system.

For current system position `G0` and target system position `Gt`, both in the same galactic frame:

```text
galacticDisplacement = Gt - G0
distanceLy = length(galacticDisplacement)
galacticDirection = galacticDisplacement / distanceLy
```

The current system itself must be excluded before normalizing a zero vector. Subtraction and normalization solve the relative catalogue direction; they do not determine how to place that direction behind the local orbit model.

### Transformation to the rendered orbital frame

Let `Q` map the verified orbital reference axes into the galactic axes. If both frames have already been converted to the same handedness, `Q` is a rotation; otherwise the complete mapping may also contain a reflection or axis permutation.

For an orthogonal mapping:

```text
directionInOrbitalFrame = transpose(Q) * galacticDirection
```

Any further mapping from orbital coordinates into Three.js scene coordinates must be included consistently. A global change of labels such as swapping Y and Z is not sufficient evidence that `Q` is known.

**Unresolved:** is `Q` a single fixed convention for all systems, a deterministic per-system orientation, a special convention for Sol and other authored systems, or something recoverable from fields not yet identified? No answer has been verified.

### What the orbital elements do and do not establish

Inclination and ascending node describe an orbital plane relative to some reference plane and reference direction. Argument of periapsis orients the ellipse within that plane; mean anomaly determines phase at an epoch. Knowing those values allows reconstruction relative to their defined reference frame.

They do not tell us what the reference frame means merely by having familiar astronomical field names. The source conventions, angle directions, epoch handling, parent hierarchy, and external orientation all have to agree.

The primary star's scalar `AxialTilt` cannot by itself specify a complete three-dimensional system orientation. Even a pole direction leaves a choice of reference direction within the plane unless another constraint fixes it. This is a geometric inference, not a claim that Frontier necessarily uses stellar spin to orient systems.

### Why route and collision validation are insufficient

Rotating or reflecting all body coordinates together preserves inter-body distances. Consequently, a route optimizer can produce the correct visit order while an associated sky orientation is wrong. Collision predictions can likewise be correct without establishing absolute galactic alignment.

These tools remain valuable evidence for relative orbital reconstruction. Their successful outputs must not be promoted into proof of a system-to-galaxy transform.

## Sol orbital evidence

The inspected [Spansh Sol dump](https://spansh.co.uk/api/dump/10477373803) has Sol coordinates `(0, 0, 0)`. Its top-level system fields contain catalogue position and other metadata, but no explicitly identified system-orientation matrix, quaternion, or complete root-frame angles. This is a finding about the inspected response, not a claim about every possible API or hidden game state.

Selected values from that response:

| Body | Orbital inclination | Ascending node | Argument of periapsis | Axial tilt as returned |
| --- | ---: | ---: | ---: | ---: |
| Sol | Absent | Absent | Absent | -0.219615 |
| Mercury | 7.0 | 48.331001 | 29.124 | 0.036826 |
| Earth | 0.0 | -11.260999 | 114.207832 | 0.401426 |
| Moon | -23.434999 | 5.145 | 0.0 | 0.11671 |
| Mars | 1.85 | 49.562 | 286.536985 | 0.439648 |
| Neptune | 1.767975 | 131.782971 | 273.219421 | 0.494277 |

The first three angle columns are the orbital values used as degrees in the inspected implementations. Axial tilt is preserved here as raw data; do not silently treat it as the same angular unit. Unit verification belongs in implementation work.

Earth at zero inclination, alongside Mercury and Mars at familiar small inclinations, suggests an ecliptic-like reference for the authored Sol planets rather than direct inclination to the galactic plane. This is a hypothesis supported by the pattern, not a recovered game transform.

The Moon's values are an additional caution against assuming every journal orbital field can be interpreted as a conventional real-world ephemeris parameter without checking the game's conventions and parent frame.

Sol could provide a calibration case because its real sky and planetary geometry are familiar. It cannot alone establish that every procedural system shares its external orientation. Any candidate transform needs independent systems and times as held-out checks.

## Community orbital implementations

### Canonn collision prediction

[EDMC-Canonn `collision.py`](https://github.com/canonn-science/EDMC-Canonn/blob/master/canonn/collision.py) contains a 3D Keplerian collision predictor ported from Canonn Signals. Its state-vector function:

- Solves Kepler's equation and calculates orbital-plane coordinates.
- Negates ascending node and argument of periapsis.
- Retains the supplied inclination sign.
- Rotates the orbital-plane coordinates into a shared frame.

The comments explicitly identify the node/periapsis signs as an Elite/Spansh convention. This is direct implementation evidence, not independent in-game confirmation made during this investigation.

[Canonn Signals `orbital-relations.core.ts`](https://github.com/canonn-science/canonn-signals/blob/main/src/app/data/orbital-relations.core.ts) contains the corresponding calculations. Its [calculation note](https://github.com/canonn-science/canonn-signals/blob/main/docs/orbital-calculation-test.md) also calls out the sign convention.

The calculation note is not uniformly current or authoritative: it describes a fixed-point iteration and calls it a simplified Newton method, whereas the inspected current core contains Newton–Raphson. Fixed-point iteration and Newton–Raphson are different methods. Treat the note as supporting context and inspect executable code and actual validation rather than relying on its approval marks.

The [EDMC-Canonn release notes](https://github.com/canonn-science/EDMC-Canonn/releases) describe replacing an older two-dimensional apoapsis/periapsis heuristic with a three-dimensional orbit-crossing/contact-window model. That establishes the project's intent and implementation history; no Canonn solver was executed locally during this research.

No galactic-frame transformation was identified in the inspected collision code.

### SrvSurvey route optimization

The chain of relevant discussions is:

1. [Issue 875](https://github.com/njthomson/SrvSurvey/issues/875), requesting a planet visit-order optimizer and referring to Elite Observatory Evaluator as an existing example.
2. [PR 884](https://github.com/njthomson/SrvSurvey/pull/884), implementing a Kepler solver, parent accumulation, and route calculation.
3. [PR 1023](https://github.com/njthomson/SrvSurvey/pull/1023), a successor draft with additional validation and hierarchy handling.

The inspected PR 884 file is available at a pinned revision: [`OrbitalMechanics.cs` at 7eb0d19](https://github.com/njthomson/SrvSurvey/blob/7eb0d19ffa0339ca6b1e5a822dd2ea8cc77d6c59/SrvSurvey/game/OrbitalMechanics.cs).

It negates inclination and ascending node, uses `2π - argumentOfPeriapsis`, leaves mean anomaly with positive time progression, and sums parent-relative vectors recursively. The author reports manually testing a handful of systems against the in-game orrery, with more edge-case testing needed. This is author-reported verification, not a reproduced result here.

The main-branch tree inspected earlier did not contain this feature; PR code must not be described as a confirmed released SrvSurvey capability. The successor PR description includes better barycentre reconstruction, invalid-data rejection, route optimization changes, and tests, while still calling for runtime coverage. Its complete successor implementation was not audited during this research.

A Reddit participant who describes implementing SrvSurvey visit ordering independently discusses Elite's left-handed orbital conventions in [the Sol-flipping thread](https://www.reddit.com/r/EliteDangerous/comments/1retmnl/so_uh_has_anyone_ever_noticed_that_sol_is_flipped/). That firsthand report led to the source inspection. The Reddit identity and GitHub identity were not independently linked beyond the contextual connection.

### Comparison with Orrery

| Implementation inspected | Inclination input | Node input | Periapsis input | Mean anomaly progression |
| --- | --- | --- | --- | --- |
| Orrery `keplerianOffset` and current mappers | Unchanged | Unchanged | Unchanged | Forward |
| Canonn state-vector code | Unchanged | Negated | Negated | Forward in the surrounding model |
| SrvSurvey PR 884 | Negated | Negated | `2π - angle` | Forward |

For otherwise identical inputs and formulas, changing only the inclination sign between the latter two conventions reflects the output Z coordinate while retaining X and Y. Such a reflection does not change pairwise distances. This is an algebraic inference from the inspected formulas and helps explain why both can be useful to distance-based tools.

The difference between Orrery and these implementations deserves direct testing. Do not blindly copy signs: a renderer's basis, additional rotations, and expected motion direction may differ. The immediate action is a convention audit with explicit vectors and observed geometry, not an unverified production patch.

### Other implementations considered

- [Elite G19s Companion](https://github.com/MagicMau/EliteG19s): the inspected repository exposed a README rather than the orbital implementation. Its FAQ discusses approximations and missing phase information, which may reflect an older journal schema. It cannot settle current alignment capability.
- [EDDiscovery](https://github.com/EDDiscovery/EDDiscovery) and [EliteDangerousCore](https://github.com/EDDiscovery/EliteDangerousCore): repository trees were inspected for leads. No relevant orbital-to-galactic implementation was identified. This was not a complete code audit and is not evidence of absence.
- [EDGIS](https://github.com/elitedangereuse/edgis): inspected `api/static/js/sysmap.js` and `api/systems.py` in the repository. The system-map code inspected is a schematic layout, not a demonstrated solution to this alignment problem. Its orbital API fields did not expose a root orientation identified by this investigation.
- Elite Observatory Evaluator is mentioned by the SrvSurvey request as providing route optimization. Its algorithm and availability were not independently inspected; the issue's description of it as closed source is a lead, not an independently verified current status.

## Community sky alignment work

### Sol appears mirrored discussion

The [Reddit Sol thread](https://www.reddit.com/r/EliteDangerous/comments/1retmnl/so_uh_has_anyone_ever_noticed_that_sol_is_flipped/) reports apparently mirrored apsidal/orbital geometry despite Polaris and the broad Sol tilt appearing sensible. It also contains the SrvSurvey contributor's handedness report.

These observations reinforce the need to check signs and sky orientation separately. The original screenshots and conclusions were not independently reconstructed here. Do not treat a statement that Sol looks flipped as a measured full transform or a confirmed game defect.

### Catalogue coordinates to astronomical sky coordinates

The [2023 coordinate-conversion discussion](https://www.reddit.com/r/EliteDangerous/comments/18mpxss/xyz_coordinates_in_the_galaxy_map/) provides forward and inverse equations for Elite Cartesian coordinates and equatorial sky coordinates, including known-star examples. This is a useful route to validating sky catalogue directions from Sol.

It solves a catalogue coordinate conversion. It does not explain how each system's local orbital reference plane is embedded in that catalogue frame.

### Screenshot plate solving

Chris Hanson's [celestial vision navigation account](https://alphapixeldev.com/celestial-vision-navigation-elite-dangerous-dark-wheel-station/) reports matching Elite screenshots to a stellar catalogue, including Sol and Alpha Centauri examples. It demonstrates a possible observational route to recovering sky attitude. It does not supply the missing universal orbital transform.

Its analysis of a menu image also warns against treating promotional/menu imagery as an unmodified scientific observation. For validation, prefer ordinary in-game captures with known system, time, and viewing geometry.

### Archived Frontier rendering explanation

The live thread [Seam in skybox but FD said no skybox](https://forums.frontier.co.uk/threads/seam-in-skybox-but-fd-said-no-skybox.37904/) returned HTTP 403 through the web reader. The Archive.org availability endpoint identified a capture, and its HTML was successfully retrieved with a direct HTTP request.

In post 9, dated August 28, 2014, Frontier developer Ben Parry explains that the skybox is rendered during hyperspace and that stars are separate billboards. [Archived thread, capture 2025-08-30 04:25:52 UTC](https://web.archive.org/web/20250830042552/https://forums.frontier.co.uk/threads/seam-in-skybox-but-fd-said-no-skybox.37904/).

This is primary developer evidence about rendering architecture at that time. It gives no system-orientation matrix, orbital reference-plane definition, or guarantee that the current implementation is unchanged.

### Nahla Tracker

[The author's Reddit description](https://www.reddit.com/r/EliteDangerous/comments/1ugfowd/a_555day_calendar_as_nahla_tracker_moves_to_v10/) describes tracking a moon's sun, parent body, and galactic band through observations at a specific location. The author explicitly discusses the difficulty of generalizing a local sky tracker and the need for manual observations.

Related firsthand logbooks:

- [Making a live sky tracker](https://inara.cz/elite/cmdr-logbook-entry/440263/90443/).
- [Nahla calendar and tracker update](https://inara.cz/elite/cmdr-logbook-entry/440263/96360/).

This is evidence that community members have attempted closely related sky-geometry work. Its site-specific phases and terrain issues do not establish a system-wide galactic alignment. Terrain occlusion, planetary spin orientation, and local-system frame orientation are distinct unknowns.

Claims in discussion comments about how many decimal places APIs expose should not override actual raw responses. The Spansh samples inspected here retain more than two decimal places in several orbital fields.

### Elite Day Night Calculator

[Elite Day/Night](https://eddaynight.de/) was discovered through the Nahla discussion. Its [methodology](https://eddaynight.de/about) and [observation guide](https://eddaynight.de/observations/guide) describe fitting predictions from timed surface observations, coordinates, solar elevation, and optionally heading.

The [public repository](https://github.com/LouisH99/Elite-Dangerous-Day-Night-Calculator) describes the model as experimental and explicitly calls for validation against real observations. This is a useful calibration precedent, not proof that an off-the-shelf galactic alignment solution exists. The README was inspected; the model implementation was not yet audited.

## Nearby system APIs and measurements

### EDSM sphere search

The [EDSM API v1 documentation](https://www.edsm.net/en/api-v1) documents `sphere-systems` with a named system or Cartesian centre, a radius, and response options such as coordinates and primary-star metadata. The inspected documentation gives a default radius of 50 ly and a maximum of 100 ly, with `minRadius` available.

No result-count parameter was found in that documented interface. A radius query can therefore return many records; sort and cap locally if needed. Do not assume response order is nearest-first. Dense regions need particular attention.

Example equivalent request for the tested 25 ly query:

```sh
curl --get 'https://www.edsm.net/api-v1/sphere-systems' \
  --data-urlencode 'systemName=Sol' \
  --data-urlencode 'radius=25' \
  --data-urlencode 'showId=1' \
  --data-urlencode 'showCoordinates=1' \
  --data-urlencode 'showPrimaryStar=1'
```

The captured response contains names, IDs, coordinates, distances, and primary-star classifications. The sampled headers include `Cache-Control: max-age=86400` and permissive cross-origin access. Those headers describe that response, not an uptime or future compatibility guarantee.

### Spansh search

[Spansh's published API documentation](https://docs.spansh.co.uk/) was inspected, including its embedded OpenAPI data. The extracted specification listed `/dump/{id64}`, `/system/{id64}`, `/body/{id64}`, and `/station/{marketId}`. It did not document the nearby search used by the public website.

The [Spansh systems search interface](https://spansh.co.uk/systems) and its downloaded JavaScript client exposed a search request containing `filters`, `sort`, `size`, zero-based `page`, and a reference system or coordinates. A real POST to `/api/systems/search` succeeded with:

```json
{
  "filters": { "distance": { "min": 0, "max": 50 } },
  "sort": [{ "distance": { "direction": "asc" } }],
  "size": 100,
  "page": 0,
  "reference_system": "Sol"
}
```

The response contained a total count, 100 results, coordinates, distance, and substantial additional body/station metadata. This is an observed working public-client endpoint, not a documented API contract established by the specification inspected.

The initial results included Sol and an anomalous record named `Test` at `(-1, 0, 0)`. Do not infer the cause, and do not quietly treat every returned record as a trustworthy visible star. Record validation and provenance are needed.

### Measured responses

These are individual requests made during this session, not a benchmark suite, percentile latency, or a service-level promise. Times are the earlier captured curl total durations. Byte sizes and counts were rechecked from the saved response files for this checkpoint.

| Service and query | HTTP | Returned records | Reported total | Response bytes | Total time |
| --- | ---: | ---: | ---: | ---: | ---: |
| EDSM, Sol within 25 ly | 200 | 175 | Array length 175 | 41,042 | 1.774804 s |
| EDSM, Sol within 50 ly | 200 | 1,252 | Array length 1,252 | 301,635 | 3.791854 s |
| Spansh, Sol within 50 ly, first 100 | 200 | 100 | 1,239 | 2,405,350 | 2.130604 s |

The differences in total counts were not investigated. Do not assume identical catalogue coverage, filtering, boundary treatment, or data freshness. These measurements do not compare equivalent payloads: the Spansh search response is much richer and larger.

No dense-core search, systematic cache-hit/cache-miss comparison, cancellation test, rate-limit study, browser latency measurement, or repeated latency distribution was performed. The recorded timings alone do not establish acceptable performance everywhere.

### Data and visibility limits

Nearby catalogue membership is not the same as apparent visibility. A nearby dim star may be less visible than a much more distant luminous one. A bounded sphere plus a landmark list is a useful reference layer, but it is not a complete reconstruction of Elite's visible sky or a photometric model.

Primary-star classifications can guide a restrained visual treatment. They do not by themselves provide accurate apparent magnitudes, extinction, unresolved multiple-star brightness, or the game's exact billboard sizes.

Sol and Sagittarius A* are useful directional landmarks. Calling every landmark a visible background star would be misleading, particularly for objects such as Sagittarius A*. Use an appropriate marker/label concept if visibility is not established.

## Implementation direction

This is a proposed design, not implemented work or a final provider commitment.

1. Forward valid current-system coordinates through the watcher snapshot, with clear handling for missing data and system changes.
2. Maintain a small, versioned landmark catalogue with source, coordinates, and identity. Always-loaded landmarks provide an offline reference layer.
3. Optionally request nearby catalogue systems on system changes, cache results, and bound rendered points and labels.
4. Resolve all catalogue directions in one documented galactic convention.
5. Apply an explicitly verified mapping into the orbital/rendering frame.
6. Integrate the resulting directions into the existing separate background scene.
7. Expose whether an alignment is verified, calibrated for a particular system, or approximate. Do not silently label arbitrary orientation as accurate.

EDSM was the provisional first choice for a lightweight nearby layer because its sampled payload is smaller and its sphere endpoint is documented. Spansh supplies explicit page size/count and richer metadata, but its inspected search contract and payload overhead need more consideration. Both choices should be revisited after catalogue and frame requirements are clearer.

Implementation concerns to preserve:

- Use system identity and coordinates for request/cache keys; invalidate on actual system changes.
- Avoid refetching on every journal update or render frame.
- Cancel or disregard stale requests after moving to another system.
- Separate remote fetch failures from existing local-system rendering.
- Preserve offline and opt-out behavior.
- Deduplicate landmarks and nearby results using reliable identities, with a documented fallback.
- Validate finite coordinates, exclude the current system, and handle zero-length vectors.
- Use high-precision CPU arithmetic for subtracting galactic coordinates; convert to normalized rendering vectors afterward.
- Bound label count and avoid obscuring the local body view.
- Ensure camera roll, zoom, and panning behave coherently with a sky at infinity.
- Keep physical camera/observer position separate from display compression.
- Review provider attribution, endpoint stability, caching, and rate expectations before shipping.
- Do not equate the journal time-warp slider with a supported time evolution of the whole stellar catalogue.

## Open questions and issues

| ID | Question or issue | Current evidence | What would resolve it |
| --- | --- | --- | --- |
| F1 | What reference plane/direction do Elite orbital elements use? | Sol suggests an ecliptic-like authored convention; app documentation asserts a common local frame | Primary definition or reproducible observation across multiple systems |
| F2 | Is the orbital-to-galactic mapping universal? | No verified mapping identified | Fit a candidate in one system and predict independent systems without refitting |
| F3 | Are Sol or other authored systems special cases? | Sol's orbital values resemble familiar astronomical values | Compare procedural single-star and multi-star systems with known sky directions |
| F4 | Which angle signs should Orrery use? | Current code differs from Canonn and SrvSurvey | Explicit numerical comparison plus in-game phase and angular-position checks |
| F5 | Are parent-relative offsets directly additive in all supported hierarchies? | Orrery and inspected SrvSurvey code do this | Nested moons and barycentres checked against observed geometry |
| F6 | Is system orientation encoded indirectly in an ID/seed or other data? | No such derivation found | Existing community derivation or a tested deterministic relationship |
| F7 | Can orientation be recovered from a practical number of observations? | Plate solving and site-specific sky trackers provide precedents | A repeatable acquisition method and measured residuals |
| F8 | Can a calibrated orientation be reused after relog, return, and time advance? | Not tested | Repeat measurements across those conditions |
| F9 | Is there an already published community solution missed by search? | Several relevant projects found; searches incomplete | Targeted source/history/forum investigation |
| A1 | Which nearby API has acceptable performance in dense regions? | Three Sol-area requests only | Bounded trials, payload measurement, cache and failure behavior |
| A2 | Is Spansh search a supported long-term integration surface? | Public frontend uses it; inspected API specification omits it | Provider documentation or a clearly supported alternative |
| A3 | Why do EDSM and Spansh counts differ? | 1,252 vs 1,239 for sampled 50 ly searches | Coverage, boundary, and identity comparison |
| A4 | How should anomalous catalogue records be handled? | Spansh result named `Test` observed | Provenance review and robust validation policy |
| V1 | What constitutes a star versus a reference marker? | Catalogue direction does not establish visibility | Product decision with a documented visual distinction |
| V2 | What apparent brightness/colour model is appropriate? | Primary-star type is available; complete photometry not established | Defined data requirements and explicit visual approximation |
| V3 | Does sky translation/parallax matter for wide systems or camera travel? | Current sky ignores translation | Error analysis based on physical observer positions and chosen accuracy target |
| V4 | How should compressed mode communicate sky relationships? | Compression changes local apparent geometry | Clear display semantics and validation in physical mode |
| D1 | Are source orbital timestamps and units interpreted consistently? | Several services and raw journal fields differ in representation | Field-by-field fixtures and propagation comparisons |
| D2 | Should technical accuracy claims be narrowed now? | Existing documentation is stronger than this research establishes | Complete convention audit and update claims to match evidence |

## Validation and research continuation

### First audit the local orbital convention

Build a small comparison harness using the same raw elements and epochs for Orrery, Canonn, and the inspected SrvSurvey equations. Record every basis change explicitly.

Use nonzero inclination, node, periapsis, eccentricity, and mean anomaly. Zero-angle or circular-only tests can hide sign mistakes. Compare more than one time so a static reflection or camera choice cannot conceal reversed progression. Include nested bodies and barycentres after single-orbit behavior is understood.

Report separately:

- Radial distance and orbital shape.
- Phase and direction of motion over time.
- Relative body positions and distances.
- Global handedness and axis orientation.
- Alignment with external sky directions.

Existing mathematical unit tests can establish internal consistency while still accepting the wrong game convention. New tests should be tied to independently meaningful fixtures or observations, not merely copy an implementation's output into expected values.

### Establish an observational alignment case

A possible experiment, not yet performed:

1. Choose a system with reliable journal orbital elements and identifiable external reference systems.
2. Record game time, journal epoch, system identity, body identities, and the observer/camera geometry.
3. Obtain several independent local-body directions and external sky directions. A known or constrained observer position is necessary to interpret local-body sight lines.
4. Solve for the candidate orientation, including any required basis reflection.
5. Predict other body/star relationships not used to fit it, at another time if possible.
6. Repeat in a procedural single-star system and a multi-star/barycentre system.

Two non-collinear vector correspondences can mathematically constrain a rigid orientation once handedness is fixed. Real screenshots add unknown projection, observer location, measurement error, and potentially mirrored imagery; therefore this statement is not a promise that two casual screenshots suffice.

Plate solving can recover sky attitude from catalogue stars, but connecting that attitude to the local model still requires known body geometry or observer constraints. A targeted external system marker may offer a simpler reference than identifying dim stars, subject to in-game behavior and visibility. Both are hypotheses to test.

Acceptance should require repeatable predictions with recorded residuals, not a single visually plausible match. Select an angular error threshold before declaring success; none has been agreed yet.

### Continue community research with the concrete leads

- Trace the history and rationale for Canonn's sign corrections and look for observations or fixtures associated with them.
- Inspect the full SrvSurvey successor PR and its tests; check whether any diagnostics retain observed geometry rather than only distances.
- Follow the Elite Observatory/Evaluator lead without assuming route accuracy implies sky alignment.
- Inspect Elite Day/Night's model for which orientation parameters it fits and which it assumes.
- Follow Nahla Tracker's later parallax and sky-phase work for reusable observation methods.
- Search Frontier discussions for definitions of the orbital reference plane, ascending-node zero direction, Stellar Forge system orientation, and handedness.
- Prefer targeted Archive.org retrieval for known thread URLs. Broad searches have been unreliable.
- Keep historical advice about missing mean anomaly/ascending node separate from current journal schemas.

### Search and retrieval limitations

Broad web queries combining Elite, orbit, reference frame, galactic alignment, and Canonn frequently returned unrelated material or failed to surface Frontier threads. Repository tree inspection was more useful for finding inspectable code, but it does not substitute for a full audit.

An initial Archive.org CDX query with an interior wildcard for orbital thread URLs returned an empty list. That is not evidence that no relevant captures exist; the query pattern itself may not have been appropriate. A broader prefix query with a URL filter timed out after 30 seconds. The targeted availability lookup and capture retrieval for the skybox thread succeeded.

The web reader could not directly open that Wayback capture, but direct curl retrieval did. Retain this distinction when continuing; a tool-specific failure is not proof that an archive is unavailable.

## Source register

The status column records the depth of inspection at this checkpoint. A link is not an endorsement of every assertion on the page. Sources listed as leads have not established findings above.

| Source | Inspection status and relevance |
| --- | --- |
| [Frontier Journal Manual v37](https://hosting.zaonce.net/community/journal/v37/Journal_Manual_v37.pdf) | Inspected orbital event definitions; no galactic orientation field identified there; historical version caveat |
| [Community exploration-event reference](https://doc.elitedangereuse.fr/Exploration/) | Schema reference surfaced for Scan and ScanBaryCentre; use Frontier definitions and captured events where possible |
| [EDSM API v1](https://www.edsm.net/en/api-v1) | Documentation inspected; sphere endpoint exercised |
| [EDSM sphere endpoint](https://www.edsm.net/api-v1/sphere-systems?systemName=Sol&radius=25&showId=1&showCoordinates=1&showPrimaryStar=1) | Actual 25 ly response measured; 50 ly variant also measured |
| [Spansh API documentation](https://docs.spansh.co.uk/) | HTML and embedded OpenAPI inspected |
| [Spansh system search](https://spansh.co.uk/systems) | Public client inspected; search POST exercised |
| [Spansh Sol dump](https://spansh.co.uk/api/dump/10477373803) | Full response retrieved; selected field evidence retained |
| [Canonn collision implementation](https://github.com/canonn-science/EDMC-Canonn/blob/master/canonn/collision.py) | Source inspected for signs and coordinate calculation |
| [Canonn Signals orbital core](https://github.com/canonn-science/canonn-signals/blob/main/src/app/data/orbital-relations.core.ts) | Source inspected for state-vector convention and shared frame |
| [Canonn orbital calculation note](https://github.com/canonn-science/canonn-signals/blob/main/docs/orbital-calculation-test.md) | Read; some solver prose differs from current code |
| [Canonn feature list](https://github.com/canonn-science/canonn-signals/blob/main/features.md) | Feature context, not proof of external alignment |
| [EDMC-Canonn releases](https://github.com/canonn-science/EDMC-Canonn/releases) | Implementation-history context |
| [SrvSurvey issue 875](https://github.com/njthomson/SrvSurvey/issues/875) | Read; route request and Evaluator lead |
| [SrvSurvey PR 884](https://github.com/njthomson/SrvSurvey/pull/884) | Description, comments, and orbital file patch inspected |
| [Pinned SrvSurvey orbital file](https://github.com/njthomson/SrvSurvey/blob/7eb0d19ffa0339ca6b1e5a822dd2ea8cc77d6c59/SrvSurvey/game/OrbitalMechanics.cs) | Exact revision underlying the comparison |
| [SrvSurvey PR 1023](https://github.com/njthomson/SrvSurvey/pull/1023) | Description inspected; complete successor code not audited |
| [Sol flipping Reddit thread](https://www.reddit.com/r/EliteDangerous/comments/1retmnl/so_uh_has_anyone_ever_noticed_that_sol_is_flipped/) | Firsthand reports and contributor lead; geometry not independently reproduced |
| [Elite coordinate conversions](https://www.reddit.com/r/EliteDangerous/comments/18mpxss/xyz_coordinates_in_the_galaxy_map/) | Examples and conversion code read; not an orbital-frame definition |
| [Frontier skybox thread](https://forums.frontier.co.uk/threads/seam-in-skybox-but-fd-said-no-skybox.37904/) | Live reader returned 403; source recovered through archive |
| [Archived Frontier skybox thread](https://web.archive.org/web/20250830042552/https://forums.frontier.co.uk/threads/seam-in-skybox-but-fd-said-no-skybox.37904/) | Retrieved and read; Ben Parry post 9 is the relevant developer explanation |
| [Chris Hanson celestial vision navigation](https://alphapixeldev.com/celestial-vision-navigation-elite-dangerous-dark-wheel-station/) | Firsthand plate-solving account read; external-attitude precedent |
| [Nahla Tracker Reddit update](https://www.reddit.com/r/EliteDangerous/comments/1ugfowd/a_555day_calendar_as_nahla_tracker_moves_to_v10/) | Author explanation and comments read; observational calibration precedent |
| [Nahla initial sky-tracker logbook](https://inara.cz/elite/cmdr-logbook-entry/440263/90443/) | Earlier investigation consulted; local sky and empirical phase work |
| [Nahla later logbook](https://inara.cz/elite/cmdr-logbook-entry/440263/96360/) | Related update surfaced; detailed later model work remains a follow-up |
| [Elite Day/Night methodology](https://eddaynight.de/about) | Read; observation-fitted model |
| [Elite Day/Night guide](https://eddaynight.de/observations/guide) | Read; practical HUD observation procedure |
| [Elite Day/Night repository](https://github.com/LouisH99/Elite-Dangerous-Day-Night-Calculator) | README read; model source not yet audited |
| [Elite G19s](https://github.com/MagicMau/EliteG19s) | README/FAQ and repository tree inspected; relevant implementation not available in inspected tree |
| [EDDiscovery](https://github.com/EDDiscovery/EDDiscovery) | Tree reconnaissance only |
| [EliteDangerousCore](https://github.com/EDDiscovery/EliteDangerousCore) | Tree reconnaissance only |
| [EDGIS](https://github.com/elitedangereuse/edgis) | Selected API and schematic-map source inspected |
| [CMDR HD41117](https://www.hd41117.com/) | Search lead concerning Sol orrery time offsets; not validated or adopted |
| [Canonn Python research presentation](https://pymalta.org/meetups/2017-07-27/galaxies_mysteries.pdf) | Search lead; not read in detail |
| [KOI 232 catalogue edit history](https://edastro.com/gec/editlog/1924) | Search lead mentioning successful collision predictions; not independent proof of galactic alignment |
| [JPL Horizons manual](https://ssd.jpl.nasa.gov/horizons/manual.html) | Potential astronomical reference-frame comparison; not a definition of Elite's conventions |

## Evidence and workspace state

### Durable checkpoint files

- This analysis: `docs/research/galactic-starfield-alignment.md`.
- Compact observations and provenance: [`galactic-starfield-evidence.json`](galactic-starfield-evidence.json).

The evidence file preserves selected data and hashes rather than vendoring whole websites, multi-megabyte API bodies, or third-party source trees. It contains no player journal contents or credentials. Source hashes identify the retrieved bytes; they are not a substitute for retaining those bytes and do not guarantee future URLs will return the same content.

### Temporary research material

The following local `/tmp` files were used during this investigation. They are useful if still available, but are not durable repository artifacts:

| Group | Temporary files |
| --- | --- |
| EDSM | `orrery-edsm-docs.html`, `orrery-edsm-nearby.json`, `orrery-edsm-nearby50.json`, `orrery-edsm-nearby.headers` |
| Spansh | `orrery-spansh-docs.html`, `orrery-spansh-openapi.json`, `orrery-spansh-systems.html`, `orrery-spansh-gui.js`, `orrery-spansh-query.json`, `orrery-spansh-nearby.json`, `orrery-sol-dump.json` |
| SrvSurvey | `orrery-srvsurvey-tree.json`, `orrery-srv-orbit-issues.json`, `orrery-srv-comments.json`, `orrery-srv-files.json` |
| Canonn | `orrery-canonn-tree.json`, `orrery-canonn-signals-tree.json`, `orrery-canonn-collision.json` (Python despite extension), `orrery-canonn-orbits.ts`, `orrery-canonn-orbital-test.md` |
| Frontier archive | `orrery-forum-archive.json`, `orrery-forum-orbital-cdx.json`, `orrery-frontier-skybox.html` |
| Other reconnaissance | `orrery-g19-repo.json`, `orrery-g19-tree.json`, `orrery-edd-tree.json`, `orrery-edcore-tree.json`, `orrery-edgis-tree.json`, `orrery-edgis-sysmap.js`, `orrery-edgis-systems.py`, `orrery-github-frame-issues.json` |

The Spansh client asset inspected was [this hashed JavaScript bundle](https://spansh.co.uk/assets/elite-dangerous-gui-cbc763d9064128c5ce18abeee0f3c843.js). Asset hashes and frontend internals can change; rediscover the current bundle from the systems page if that URL stops working.

### Repository state and next edits

The working branch is `feat/first-footfall`, created earlier from then-current `origin/macos`. The workspace already contains substantial unrelated tracked and untracked changes from ongoing app work. This capture adds documentation and evidence only; it does not stage, commit, push, rewrite existing changes, or change orbital behavior.

Follow [`AGENTS.md`](../../AGENTS.md) and [`CONTRIBUTING.md`](../../CONTRIBUTING.md) for subsequent code work: `origin` is `sdangit/orrery`, `upstream` is `TerjeRu/orrery`, fork changes target `macos`, and `main` remains aligned with upstream. Do not bundle unrelated working-tree changes into a research or alignment commit by accident.

The appropriate resumption point is the convention audit and targeted source tracing above. The corrected conclusion remains: useful community foundations exist; a universal orbital-to-galactic alignment has not yet been established by this investigation.
