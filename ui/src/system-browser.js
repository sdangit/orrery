/** Browsing never replaces the latest live snapshot or alters watcher state. */
export function createSystemBrowser({ fetchBodies, getProviders, onDisplay, onState, demo }) {
  let latest = demo;
  let browsing = false;
  let generation = 0;
  let controller;
  const cancel = () => { generation++; controller?.abort(); };
  return {
    get browsing() { return browsing; },
    live(snapshot) {
      latest = snapshot;
      if (!browsing) onDisplay(snapshot, null);
    },
    returnToLive() {
      cancel(); browsing = false;
      onState({ loading: false, browsing, message: '' });
      onDisplay(latest, null);
    },
    async search(input) {
      const name = input.trim();
      cancel();
      const token = generation;
      if (!name || name.length > 128 || /[\x00-\x1f\x7f]/.test(name)) {
        onState({ loading: false, browsing, message: 'Enter a system name (up to 128 characters).' });
        return;
      }
      controller = new AbortController();
      const requestController = controller;
      const signal = requestController.signal;
      const timeout = setTimeout(() => requestController.abort(), 20000);
      onState({ loading: true, browsing, message: `Finding ${name} via EDSM…` });
      try {
        const data = await fetchBodies({ systemName: name, providers: ['edsm'] }, { signal });
        if (token !== generation) return;
        const edsm = data?.edsm;
        if (edsm?.status !== 'ready' || !edsm.bodies.length || !edsm.systemAddress) {
          onState({ loading: false, browsing, message: edsm?.status === 'rate-limited'
            ? 'EDSM rate limited the request. Try again later.'
            : 'No system data returned by EDSM. Check the name and watcher connection.' });
          return;
        }
        const systemName = edsm.systemName || name;
        const systemAddress = edsm.systemAddress;
        if (getProviders().includes('spansh')) {
          onState({ loading: true, browsing, message: `Loading ${systemName} from Spansh…` });
          const extra = await fetchBodies({ systemName, systemAddress, providers: ['spansh'] }, { signal });
          if (token !== generation) return;
          data.spansh = extra?.spansh ?? { status: 'unavailable', bodies: [] };
        }
        browsing = true;
        onState({ loading: false, browsing, message: 'Browsing community data. Live journal updates continue in the background.' });
        onDisplay({ systemName, systemAddress, nodes: [] }, data);
      } catch {
        if (token === generation) onState({ loading: false, browsing, message: 'System lookup failed. Try again.' });
      } finally { clearTimeout(timeout); }
    },
  };
}
