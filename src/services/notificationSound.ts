export type NotificationSoundPreset = 'ding' | 'bell' | 'knock' | 'beep';

let audioContext: AudioContext | null = null;

const getAudioContext = () => {
  if (typeof window === 'undefined' || !window.AudioContext) return null;
  audioContext ??= new window.AudioContext();
  return audioContext;
};

// Browsers require a user gesture before allowing audio playback. Calling this
// from the first dashboard interaction unlocks the context for later orders.
export const unlockNotificationAudio = async () => {
  const context = getAudioContext();
  if (context?.state === 'suspended') await context.resume();
};

const tones: Record<NotificationSoundPreset, Array<{ frequency: number; duration: number; delay: number }>> = {
  ding: [
    { frequency: 880, duration: 0.18, delay: 0 },
    { frequency: 1320, duration: 0.28, delay: 0.12 },
  ],
  bell: [
    { frequency: 660, duration: 0.2, delay: 0 },
    { frequency: 990, duration: 0.45, delay: 0.14 },
  ],
  knock: [
    { frequency: 180, duration: 0.08, delay: 0 },
    { frequency: 150, duration: 0.08, delay: 0.13 },
  ],
  beep: [
    { frequency: 740, duration: 0.16, delay: 0 },
  ],
};

export const playNotificationSound = async (preset: NotificationSoundPreset = 'ding') => {
  const context = getAudioContext();
  if (!context) return;

  try {
    if (context.state === 'suspended') await context.resume();
  } catch {
    // Autoplay restrictions can reject resume; the next user interaction can
    // unlock the context through unlockNotificationAudio.
    return;
  }

  const now = context.currentTime;
  (tones[preset] ?? tones.ding).forEach(({ frequency, duration, delay }) => {
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const start = now + delay;
    const end = start + duration;

    oscillator.type = preset === 'knock'
      ? 'triangle'
      : preset === 'beep'
        ? 'square'
        : 'sine';
    oscillator.frequency.setValueAtTime(frequency, start);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(0.34, start + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, end);

    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start(start);
    oscillator.stop(end + 0.02);
  });
};
