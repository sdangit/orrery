import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSystemBrowser } from '../src/system-browser.js';
const reply = (name) => ({ edsm: {status:'ready', systemName:name, systemAddress:'2557619442410', bodies:[{bodyId:0}]} });
function harness(fetchBodies, providers=['edsm','spansh']) {
  const displays=[], states=[];
  const browser=createSystemBrowser({fetchBodies,getProviders:()=>providers,demo:{systemName:'Demo'},
    onDisplay:(...args)=>displays.push(args),onState:s=>states.push(s)});
  return {browser,displays,states};
}
test('name lookup resolves address before Spansh and preserves latest live system during browsing', async () => {
  const requests=[];
  const {browser,displays}=harness(async request=>{
    requests.push(request);
    return request.providers[0]==='edsm'?reply('HIP 97950'):{spansh:{status:'ready',bodies:[{bodyId:1}]}};
  });
  browser.live({systemName:'Live A'});
  await browser.search(' HIP 97950 ');
  assert.equal(requests[0].systemName,'HIP 97950');
  assert.equal(requests[0].systemAddress,undefined);
  assert.equal(requests[1].systemAddress,'2557619442410');
  assert.deepEqual(displays.at(-1)[0].nodes,[]); // no personal scans disguised as community data
  assert.ok(displays.at(-1)[1].spansh);
  browser.live({systemName:'Live B'});
  assert.equal(displays.at(-1)[0].systemName,'HIP 97950');
  browser.returnToLive();
  assert.equal(displays.at(-1)[0].systemName,'Live B');
  assert.equal(displays.at(-1)[1],null);
});
test('explicit search uses EDSM with auto-backfill disabled, without contacting Spansh', async () => {
  let calls=0;
  const {browser}=harness(async()=>{calls++;return reply('Sol')},[]);
  await browser.search('Sol');
  assert.equal(calls,1);
  assert.equal(browser.browsing,true);
});
test('missing data and provider failures retain current display; Spansh failure retains EDSM', async () => {
  const {browser,displays,states}=harness(async request=>request.providers[0]==='edsm'?reply('Sol'):null);
  await browser.search('Sol');
  assert.equal(displays.at(-1)[1].spansh.status,'unavailable');
  const bad=harness(async()=>null);
  bad.browser.live({systemName:'Live'});
  await bad.browser.search('unknown');
  assert.equal(bad.displays.length,1);
  assert.match(bad.states.at(-1).message,/No system data/);
  await bad.browser.search(' ');
  assert.match(bad.states.at(-1).message,/Enter a system/);
});
test('new searches and returning live prevent stale in-flight lookups from taking over', async () => {
  const jobs=[];
  const {browser,displays}=harness((request,{signal})=>new Promise(resolve=>jobs.push({resolve,signal})),[]);
  const first=browser.search('First');
  const second=browser.search('Second');
  assert.equal(jobs[0].signal.aborted,true);
  jobs[1].resolve(reply('Second')); await second;
  jobs[0].resolve(reply('First')); await first;
  assert.equal(displays.length,1);
  assert.equal(displays[0][0].systemName,'Second');
  const third=browser.search('Third');
  browser.live({systemName:'Latest'});
  browser.returnToLive();
  jobs[2].resolve(reply('Third')); await third;
  assert.equal(displays.at(-1)[0].systemName,'Latest');
  assert.equal(browser.browsing,false);
});
