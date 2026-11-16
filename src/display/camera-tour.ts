import type { RaceSnapshot } from '../shared/protocol.ts';
import type { ViewMode } from './race-views';

const modes: readonly ViewMode[] = ['general', 'chase', 'trackside', 'broadcast'];

export function lobbyCameraTour() {
  let started: number | undefined;
  let course: string | undefined;
  let revision = -1;
  return (now: number, phase: RaceSnapshot['phase'], selected: ViewMode, selection: number, courseId: string): ViewMode => {
    if (phase !== 'demo') { started = undefined; return selected; }
    if (started === undefined || course !== courseId || revision !== selection) {
      started = now;
      course = courseId;
      revision = selection;
    }
    const step = Math.floor(Math.max(0, now - started) / 4000);
    return modes[(modes.indexOf(selected) + step) % modes.length];
  };
}
