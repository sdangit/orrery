// EDGIS uses journal-style SI units, unlike EDSM/Spansh's AU/day bodies.
// Adapt to the community input schema without assigning an epoch to updatetime.
export function mapEdgisBodies(bodies) {
  return bodies.filter((b) => b && ['Star', 'Planet', 'Barycenter'].includes(b.type)).map((b) => ({
    bodyId: b.body_id, name: b.body_name,
    type: b.type === 'Barycenter' ? 'Barycentre' : b.type,
    subType: b.type === 'Star' ? b.star_type : b.planet_class,
    parents: b.parents,
    semiMajorAxis: Number.isFinite(b.semi_major_axis) ? b.semi_major_axis / 149597870700 : undefined,
    orbitalPeriod: Number.isFinite(b.orbital_period) ? b.orbital_period / 86400 : undefined,
    orbitalEccentricity: b.eccentricity, orbitalInclination: b.orbital_inclination,
    argOfPeriapsis: b.periapsis, ascendingNode: b.ascending_node, meanAnomaly: b.mean_anomaly,
    axialTilt: b.axial_tilt,
    radius: Number.isFinite(b.radius) ? b.radius / 1000 : undefined,
    gravity: Number.isFinite(b.surface_gravity) ? b.surface_gravity / 9.80665 : undefined,
    solarMasses: b.stellar_mass, earthMasses: b.mass_em,
    surfaceTemperature: b.surface_temperature, distanceToArrival: b.distance_from_arrival_ls,
    isLandable: b.landable, terraformingState: b.terraform_state,
    atmosphereType: b.atmosphere_type, updateTime: b.updatetime,
    belts: bodies.filter(r => r?.type === 'StellarRing'
      && Object.values(r.parents?.[0] ?? {})[0] === b.body_id).map(r => ({
        name: r.body_name, type: { eRingClass_Icy: 'Icy', eRingClass_Rocky: 'Rocky',
          eRingClass_Metalic: 'Metallic', eRingClass_MetalRich: 'Metal Rich' }[r.ring_class],
        innerRadius: r.ring_inner_rad, outerRadius: r.ring_outer_rad,
      })),
    // Ring records may include synthetic negative IDs and duplicate real rows.
    // Attach only validated ring metadata, never render them as extra bodies.
    rings: [...new Map(bodies.filter((r) => r?.type === 'PlanetaryRing'
      && Object.values(r.parents?.[0] ?? {})[0] === b.body_id)
      .map((r) => [r.body_name, {
        name: r.body_name, type: { eRingClass_Icy: 'Icy', eRingClass_Rocky: 'Rocky',
          eRingClass_Metalic: 'Metallic', eRingClass_MetalRich: 'Metal Rich' }[r.ring_class],
        innerRadius: r.ring_inner_rad, outerRadius: r.ring_outer_rad,
      }])).values()],
  }));
}
