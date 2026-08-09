import * as THREE from 'three';

// Ported from ed-space-tutor.html's makeLabel: a canvas-texture sprite. depthTest
// is off so labels always read over geometry, same as the prototype.
export function makeLabel(text, color) {
  const cv = document.createElement('canvas');
  const measureCtx = cv.getContext('2d');
  const fontSize = 22;
  measureCtx.font = `${fontSize}px Consolas, monospace`;
  cv.width = Math.ceil(measureCtx.measureText(text).width) + 16;
  cv.height = fontSize + 14;

  const ctx = cv.getContext('2d');
  ctx.font = `${fontSize}px Consolas, monospace`;
  ctx.fillStyle = color;
  ctx.fillText(text, 8, fontSize + 2);

  const texture = new THREE.CanvasTexture(cv);
  texture.minFilter = THREE.LinearFilter;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false }));
  sprite.scale.set(cv.width * 0.045, cv.height * 0.045, 1);
  return sprite;
}
