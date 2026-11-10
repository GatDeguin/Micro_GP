export const audioLimits = { master: 1, music: 1.5, engines: 1.5, effects: 1.5 };
export type AudioChannel = keyof typeof audioLimits;
export type AudioSettings = Record<AudioChannel, number> & { muted: boolean };

export const defaultAudioSettings: AudioSettings = { master: 1, music: 1, engines: 1, effects: 1, muted: false };
const audioKey = 'micro-gp:audio';
const qualityKey = 'micro-gp:quality';

export function readAudioSettings(): AudioSettings {
  const settings = { ...defaultAudioSettings };
  try {
    const saved: Partial<AudioSettings> | null = JSON.parse(localStorage.getItem(audioKey) ?? 'null');
    for (const channel of Object.keys(audioLimits) as AudioChannel[]) {
      const value = saved?.[channel];
      if (typeof value === 'number' && Number.isFinite(value)) {
        settings[channel] = Math.max(0, Math.min(audioLimits[channel], value));
      }
    }
    settings.muted = saved?.muted === true;
  } catch { /* Audio still works without storage. */ }
  return settings;
}

export function saveAudioSettings(settings: AudioSettings) {
  try { localStorage.setItem(audioKey, JSON.stringify(settings)); } catch { /* Use the session settings. */ }
}

export function useLowQuality() {
  const mode = new URLSearchParams(location.search).get('quality');
  if (mode === 'low' || mode === 'full') return mode === 'low';
  try { return localStorage.getItem(qualityKey) === 'low'; } catch { return false; }
}

export function applyQuality(mode: 'low' | 'full') {
  try { localStorage.setItem(qualityKey, mode); } catch { /* The URL also carries the choice. */ }
  const url = new URL(location.href);
  url.searchParams.set('quality', mode);
  location.assign(url);
}
