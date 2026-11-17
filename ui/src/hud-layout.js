/** Panel visibility is independent of selection and incoming journal updates. */
export function bindHudLayout({ root = document, storage = localStorage,
  isNarrow = () => root.documentElement.classList.contains('hud-narrow') } = {}) {
  const el = (id) => root.getElementById(id);
  let systemOpen = storage.getItem('orrery.systemPanelOpen') !== 'false';
  let bodyOpen = true;
  let hasSelection = false;
  let settingsOpen = false;
  let legendOpen = storage.getItem('orrery.legendVisible') === 'true';
  let playbackOpen = false;
  let settingsOpener = el('settingsToggle');
  let systemBeforeSettings = false;
  let systemBeforeLegend = false;

  function expanded(id, value) { el(id).setAttribute('aria-expanded', String(value)); }
  function render() {
    if (isNarrow() && (settingsOpen || legendOpen)) systemOpen = false;
    el('systemPanel').hidden = !systemOpen;
    el('bodyDrawer').hidden = !hasSelection || !bodyOpen || settingsOpen || legendOpen;
    el('settingsPanel').hidden = !settingsOpen || legendOpen;
    el('legend').hidden = !legendOpen;
    el('playbackDetails').hidden = !playbackOpen;
    el('bodyToggle').disabled = !hasSelection;
    expanded('systemToggle', systemOpen);
    expanded('bodyToggle', !el('bodyDrawer').hidden);
    expanded('settingsToggle', !el('settingsPanel').hidden);
    expanded('legendToggle', legendOpen);
    expanded('playbackToggle', playbackOpen);
    el('playbackToggle').textContent = playbackOpen ? 'Less ▾' : 'More ▴';
  }
  function saveLegend() { storage.setItem('orrery.legendVisible', String(legendOpen)); }
  function hideLegend() { legendOpen = false; saveLegend(); }
  function makeRoomOnNarrowScreen() { if (isNarrow()) systemOpen = false; }
  function closeSettings() {
    settingsOpen = false;
    if (isNarrow() && systemBeforeSettings) {
      systemOpen = true;
      bodyOpen = false;
    }
    render();
    settingsOpener.focus();
  }
  function openSettings(opener, field) {
    if (!settingsOpen) systemBeforeSettings = systemOpen || (legendOpen && systemBeforeLegend);
    settingsOpener = opener;
    settingsOpen = true;
    hideLegend();
    makeRoomOnNarrowScreen();
    render();
    el(field ?? 'closeSettingsButton').focus();
  }
  function closeLegend() {
    hideLegend();
    if (isNarrow() && systemBeforeLegend && !settingsOpen) {
      systemOpen = true;
      bodyOpen = false;
    }
    render();
    el('legendToggle').focus();
  }
  function click(id, fn) { el(id).addEventListener('click', fn); }
  function toggleSystem() {
    systemOpen = !systemOpen;
    storage.setItem('orrery.systemPanelOpen', String(systemOpen));
    if (systemOpen && isNarrow()) { bodyOpen = false; settingsOpen = false; hideLegend(); }
    render();
  }
  click('systemToggle', toggleSystem);
  click('collapseSystemButton', () => { toggleSystem(); el('systemToggle').focus(); });
  click('bodyToggle', () => {
    const wasVisible = !el('bodyDrawer').hidden;
    bodyOpen = !wasVisible;
    settingsOpen = false;
    hideLegend();
    if (bodyOpen) makeRoomOnNarrowScreen();
    render();
  });
  click('closeDetailButton', () => { bodyOpen = false; render(); el('bodyToggle').focus(); });
  click('settingsToggle', () => {
    if (settingsOpen && !legendOpen) closeSettings();
    else openSettings(el('settingsToggle'));
  });
  click('closeSettingsButton', closeSettings);
  click('activitySettingsButton', () => openSettings(el('activitySettingsButton'), 'modeSelect'));
  click('dataSettingsButton', () => openSettings(el('dataSettingsButton'), 'edsmToggle'));
  click('legendToggle', () => {
    if (legendOpen) { closeLegend(); return; }
    systemBeforeLegend = systemOpen;
    legendOpen = true;
    makeRoomOnNarrowScreen();
    saveLegend(); render();
    if (legendOpen) el('closeLegendButton').focus();
  });
  click('closeLegendButton', closeLegend);
  click('playbackToggle', () => { playbackOpen = !playbackOpen; render(); });
  // Using an orbital reference benefits from seeing its meaning immediately.
  click('useTimeReferenceButton', () => { playbackOpen = true; render(); });
  const resize = () => {
    // Crossing the responsive breakpoint must also reconcile already-open panels.
    if (isNarrow() && (!el('bodyDrawer').hidden || settingsOpen || legendOpen)) systemOpen = false;
    render();
  };
  root.defaultView?.addEventListener('resize',resize);
  root.defaultView?.addEventListener('orrery-ui-scale',resize);
  root.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || event.defaultPrevented) return;
    if (legendOpen) closeLegend();
    else if (settingsOpen) closeSettings();
    else return;
    event.preventDefault();
  });
  render();
  return {
    selectionChanged(selected, { reveal = false } = {}) {
      hasSelection = selected;
      if (!selected) bodyOpen = false;
      else if (reveal) {
        bodyOpen = true; settingsOpen = false; hideLegend(); makeRoomOnNarrowScreen();
      }
      if (isNarrow() && systemOpen) bodyOpen = false;
      render();
    },
  };
}

/** Account for wrapped toolbars and expanded playback without fixed offsets. */
export function observeHudSize(root = document) {
  const measure = () => {
    for (const [id, variable] of [['viewToolbar', '--toolbar-height'], ['timeControls', '--playback-height']]) {
      root.documentElement.style.setProperty(variable, `${root.getElementById(id).getBoundingClientRect().height}px`);
    }
  };
  const observer = new ResizeObserver(measure);
  observer.observe(root.getElementById('viewToolbar'));
  observer.observe(root.getElementById('timeControls'));
  measure();
  return observer;
}
