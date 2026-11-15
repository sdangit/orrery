// Emits current production positions/curves for a reproducible camera audit.
import { readFileSync } from 'node:fs';
import { absolutePosition, eliteKeplerianOffset, parentOrbitFrame, transformVector } from '../../shared/src/index.js';
const input = JSON.parse(readFileSync(new URL('../../shared/test/fixtures/v886-vertical-parity.json', import.meta.url)));
const evidence = JSON.parse(readFileSync(new URL('./fixtures/v886-camera-image-points.json', import.meta.url)));
const nodes = new Map(input.nodes.map(n => [n.id,n]));
const vec = p => [p.x,p.y,p.z].map(v => v/149597870700);
const body = nodes.get(evidence.outlineBodyId);
console.log(JSON.stringify({
  bodies: evidence.bodyCentres.map(({ id }) => vec(absolutePosition(nodes,id,Date.parse(evidence.timestamp)))),
  orbit: Array.from({ length: 721 }, (_,i) => vec(transformVector(parentOrbitFrame(nodes,body.id),
    eliteKeplerianOffset(body.elements,body.elements.epochMs+i/720*body.elements.orbitalPeriodSec*1000)))),
}));
