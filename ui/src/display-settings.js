export function resolveDisplayScale(value, maximum = 2) {
  if (value == null || value === '') return 1;
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(.75,Math.min(maximum,number)) : 1;
}

export function bindDisplaySettings({ onChange, root = document, storage = localStorage }) {
  const el = id => root.getElementById(id);
  const keys = { uiScale:'orrery.uiScale',labelScale:'orrery.labelScale' };
  const values = { uiScale:resolveDisplayScale(storage.getItem(keys.uiScale)),
    labelScale:resolveDisplayScale(storage.getItem(keys.labelScale),3) };
  function layout() {
    const html=root.documentElement, view=root.defaultView;
    html.style.setProperty('--ui-scale',String(values.uiScale));
    html.classList.toggle('hud-wrap',view.innerWidth/values.uiScale<=1100);
    html.classList.toggle('hud-narrow',view.innerWidth/values.uiScale<=700);
    html.classList.toggle('hud-short',view.innerHeight/values.uiScale<=650);
  }
  function refresh() {
    layout();
    for (const key of Object.keys(keys)) {
      const text=`${Math.round(values[key]*100)}%`;
      el(key).value=String(Math.round(values[key]*100));
      el(`${key}Value`).textContent=text;
      el(key).setAttribute('aria-valuetext',text);
    }
  }
  function update() {
    for (const key of Object.keys(keys)) storage.setItem(keys[key],String(values[key]));
    refresh();
    root.defaultView.dispatchEvent(new Event('orrery-ui-scale'));
    onChange?.({ ...values });
  }
  for (const key of Object.keys(keys)) el(key).addEventListener('input',() => {
    values[key]=resolveDisplayScale(Number(el(key).value)/100,key==='labelScale'?3:2);
    update();
  });
  el('resetDisplaySizes').addEventListener('click',() => {
    values.uiScale=values.labelScale=1;
    update();
  });
  root.defaultView.addEventListener('resize',layout);
  refresh();
  return { get uiScale() { return values.uiScale; },get labelScale() { return values.labelScale; } };
}

/** A monitor/DPI change need not change the viewport's CSS dimensions. */
export function watchPixelRatio(onChange, view = window) {
  let query;
  function changed() {
    query?.removeEventListener('change',changed);
    query=view.matchMedia(`(resolution: ${view.devicePixelRatio}dppx)`);
    query.addEventListener('change',changed);
    onChange();
  }
  changed();
  return () => query?.removeEventListener('change',changed);
}
