import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bindDisplaySettings, resolveDisplayScale, watchPixelRatio } from '../src/display-settings.js';

function setup(values = new Map()) {
  const elements=new Map(),classes=new Set(),styles=new Map(),changes=[];
  const view=new EventTarget();view.innerWidth=1440;view.innerHeight=900;
  const root={ defaultView:view,documentElement:{ style:{setProperty:(k,v)=>styles.set(k,v)},
    classList:{toggle:(key,on)=>on?classes.add(key):classes.delete(key)} },getElementById(id) {
    if (!elements.has(id)) elements.set(id,{value:'',textContent:'',addEventListener(type,fn){this[type]=fn;},setAttribute(){}});
    return elements.get(id);
  } };
  const settings=bindDisplaySettings({root,storage:{getItem:k=>values.get(k),setItem:(k,v)=>values.set(k,v)},onChange:v=>changes.push(v)});
  return {settings,el:root.getElementById,classes,styles,changes,view};
}

test('UI and body-label scales preview independently, persist, and reset together', () => {
  const values=new Map(),ui=setup(values);
  ui.el('uiScale').value='150';ui.el('uiScale').input();
  assert.equal(ui.settings.uiScale,1.5);assert.equal(ui.settings.labelScale,1);
  assert.equal(ui.styles.get('--ui-scale'),'1.5');assert.ok(ui.classes.has('hud-wrap'));
  ui.el('labelScale').value='200';ui.el('labelScale').input();
  assert.equal(ui.settings.uiScale,1.5);assert.equal(ui.settings.labelScale,2);
  const restored=setup(values);
  assert.equal(restored.el('uiScaleValue').textContent,'150%');
  assert.equal(restored.el('labelScaleValue').textContent,'200%');
  restored.el('resetDisplaySizes').click();
  assert.equal(setup(values).settings.uiScale,1);assert.equal(setup(values).settings.labelScale,1);
});

test('responsive layout uses available space after UI scaling, including monitor/window changes', () => {
  const ui=setup(new Map([['orrery.uiScale','2']]));
  assert.equal(ui.classes.has('hud-narrow'),false);
  ui.view.innerWidth=1280;ui.view.dispatchEvent(new Event('resize'));
  assert.equal(ui.classes.has('hud-narrow'),true);
  ui.view.innerWidth=3840;ui.view.innerHeight=2160;ui.view.dispatchEvent(new Event('resize'));
  assert.equal(ui.classes.has('hud-narrow'),false);assert.equal(ui.classes.has('hud-short'),false);
});

test('invalid settings are bounded and a changed DPR re-arms the monitor listener', () => {
  for (const value of [null,'','NaN','Infinity']) assert.equal(resolveDisplayScale(value),1);
  assert.equal(resolveDisplayScale(0),.75);assert.equal(resolveDisplayScale(10),2);assert.equal(resolveDisplayScale(10,3),3);
  const queries=[];let changed=0;
  const view={devicePixelRatio:1,matchMedia(text){const query=new EventTarget();query.text=text;queries.push(query);return query;}};
  const dispose=watchPixelRatio(()=>changed++,view);
  view.devicePixelRatio=2;queries[0].dispatchEvent(new Event('change'));
  assert.equal(changed,2);assert.equal(queries[1].text,'(resolution: 2dppx)');
  queries[0].dispatchEvent(new Event('change'));assert.equal(changed,2);
  dispose();queries[1].dispatchEvent(new Event('change'));assert.equal(changed,2);
});
