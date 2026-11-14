// A system root can be a barycentre, and map order depends on scan order.
// Only identify the arrival star when the available data is unambiguous.
export function primaryStarId(nodes) {
  const stars = [...nodes.values()].filter((node) => node.kind === 'Star' && Number.isInteger(node.id) && node.id >= 0);
  const markedStars = stars.filter((node) => node.isMainStar === true);
  if (markedStars.length > 0) return markedStars.length === 1 ? markedStars[0].id : null;
  const arrivalStars = stars.filter((node) => node.isMainStar !== false && node.raw?.DistanceFromArrivalLS === 0);
  if (arrivalStars.length === 1) return arrivalStars[0].id;
  return null;
}
