import * as THREE from 'three';

// Ported from the original prototype's makeLabel: a canvas-texture sprite. depthTest
// is off so labels always read over geometry, same as the prototype.
export function labelPixelRatio(labelScale = 1, dpr = globalThis.devicePixelRatio ?? 1) {
  return Math.min(4,Math.max(1,dpr*labelScale));
}

function labelTexture(text, color, pixelRatio) {
  const cv = document.createElement('canvas');
  const measureCtx = cv.getContext('2d');
  const fontSize = 22;
  const font = `${fontSize}px Consolas, "JetBrains Mono", "Cascadia Mono", monospace`;
  measureCtx.font = font;
  const width = Math.ceil(measureCtx.measureText(text).width) + 16;
  const height = fontSize + 14;
  cv.width = Math.ceil(width*pixelRatio);
  cv.height = Math.ceil(height*pixelRatio);

  const ctx = cv.getContext('2d');
  ctx.setTransform(pixelRatio,0,0,pixelRatio,0,0);
  ctx.font = font;
  ctx.fillStyle = color;
  ctx.fillText(text, 8, fontSize + 2);

  const texture = new THREE.CanvasTexture(cv);
  texture.minFilter = THREE.LinearFilter;
  return { texture,width,height };
}

export function makeLabel(text, color, { pixelRatio = labelPixelRatio() } = {}) {
  const { texture,width,height } = labelTexture(text,color,pixelRatio);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false }));
  sprite.scale.set(width * 0.045, height * 0.045, 1);
  sprite.userData.labelSource = { text,color,pixelRatio };
  return sprite;
}

/** Refresh only text textures; camera, geometry and selection stay untouched. */
export function refreshLabelTextures(updatables, pixelRatio) {
  for (const entry of updatables.values()) for (const sprite of [entry.label,entry.labelHint]) {
    const source = sprite?.userData.labelSource;
    if (!source || source.pixelRatio === pixelRatio) continue;
    const { texture } = labelTexture(source.text,source.color,pixelRatio);
    sprite.material.map.dispose();
    sprite.material.map = texture;
    source.pixelRatio = pixelRatio;
  }
}
