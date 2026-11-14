import {
  orbitalPeriod, useTimeReference, changePlaybackSpeed, togglePause, reverseTime,
  resetToNow, formatEdDateTime, playbackDescription, formatPlaybackSpeed,
} from './time-control.js';

export function bindTimePanel(tc, { getSelectedNode, onChange, root = document }) {
  const el = (id) => root.getElementById(id);
  const referenceButton = el('useTimeReferenceButton');
  let lastClockUpdate = -Infinity;

  function refresh() {
    el('timeReference').textContent = tc.reference?.name ?? 'Real-time seconds';
    el('playbackSpeed').textContent = formatPlaybackSpeed(tc);
    el('playbackDescription').textContent = playbackDescription(tc);
    el('timeStatus').textContent = tc.live ? 'Live' : tc.paused ? 'Paused' : tc.direction < 0 ? 'Reverse' : 'Forward';
    el('pauseTimeButton').textContent = tc.paused ? 'Resume' : 'Pause';
    el('pauseTimeButton').setAttribute('aria-pressed', String(tc.paused));
    el('reverseTimeButton').textContent = tc.direction < 0 ? 'Play forward' : 'Reverse';
    el('reverseTimeButton').setAttribute('aria-pressed', String(tc.direction < 0));
    referenceButton.disabled = orbitalPeriod(getSelectedNode()) === null;
    referenceButton.title = referenceButton.disabled
      ? 'An orbital period is needed to use this body as a time reference'
      : 'Start playback at one orbit every 30 seconds';
    el('edClock').textContent = formatEdDateTime(tc.simTimeMs);
  }

  function action(id, fn) {
    el(id).addEventListener('click', () => {
      fn();
      refresh();
      onChange();
    });
  }
  action('useTimeReferenceButton', () => useTimeReference(tc, getSelectedNode()));
  action('slowerTimeButton', () => changePlaybackSpeed(tc, 0.5));
  action('fasterTimeButton', () => changePlaybackSpeed(tc, 2));
  action('pauseTimeButton', () => togglePause(tc));
  action('reverseTimeButton', () => reverseTime(tc));
  action('nowButton', () => resetToNow(tc));

  return {
    refresh,
    // Update text independently of GPU rendering, at most 10 times/second.
    tick(now) {
      if (now - lastClockUpdate < 100) return;
      lastClockUpdate = now;
      const text = formatEdDateTime(tc.simTimeMs);
      if (el('edClock').textContent !== text) el('edClock').textContent = text;
      if (tc.paused && el('timeStatus').textContent !== 'Paused') refresh();
    },
  };
}
