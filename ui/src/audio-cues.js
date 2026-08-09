// Optional short audio cues (off by default, per the handover doc) — plain
// Web Audio oscillator blips, no asset files. Two distinct pitches: a bright
// one for a first discovery, a lower one for new biological signals.
// Every call is wrapped so a missing/blocked AudioContext (autoplay policy,
// no output device) degrades to silence, never an error.

const CUE_FREQUENCIES = {
  discovery: 880,
  bio: 587,
};

export function createAudioCues() {
  let audioContext = null;

  function play(kind) {
    const frequency = CUE_FREQUENCIES[kind];
    if (!frequency) return;
    try {
      audioContext ??= new AudioContext();
      const oscillator = audioContext.createOscillator();
      const gain = audioContext.createGain();
      oscillator.type = 'sine';
      oscillator.frequency.value = frequency;
      const now = audioContext.currentTime;
      gain.gain.setValueAtTime(0.05, now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.35);
      oscillator.connect(gain);
      gain.connect(audioContext.destination);
      oscillator.start(now);
      oscillator.stop(now + 0.35);
    } catch {
      // Audio unavailable (autoplay policy, no device) — cues are strictly optional.
    }
  }

  return { play };
}
