export function resolveOrbitBrightness(value) {
  if (value === null || value === undefined || value === '') return 1;
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.min(4, number)) : 1;
}

export function bindOrbitSettings({ onChange, root = document, storage = localStorage }) {
  const slider = root.getElementById('orbitBrightness');
  const output = root.getElementById('orbitBrightnessValue');
  const key = 'orrery.orbitBrightness';
  let brightness = resolveOrbitBrightness(storage.getItem(key));
  function refresh() {
    const percent = Math.round(brightness * 100);
    slider.value = String(percent);
    output.textContent = percent === 0 ? 'Off' : `${percent}%`;
    slider.setAttribute('aria-valuetext', output.textContent);
  }
  function update(value) {
    brightness = resolveOrbitBrightness(value);
    storage.setItem(key, String(brightness));
    refresh();
    onChange(brightness);
  }
  slider.addEventListener('input', () => update(Number(slider.value) / 100));
  root.getElementById('resetOrbitBrightness').addEventListener('click', () => update(1));
  refresh();
  return { get brightness() { return brightness; } };
}
