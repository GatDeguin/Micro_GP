import { TRACK } from './track.ts';

export const safetyPanelSpacing = 1.48;
const sections = [
  { at: TRACK.anchors.hairpinApex, length: 15, tyres: true },
  { at: TRACK.anchors.sweepApex, length: 13, tyres: true },
  { at: TRACK.chicane.apexIn, length: 4.45, tyres: false },
  { at: TRACK.chicane.apexOut, length: 4.45, tyres: false },
];

function outerSide(s: number): -1 | 1 {
  const a = TRACK.sampleAt(s - 2.7), b = TRACK.sampleAt(s + 2.7);
  return a.dx * b.dz - a.dz * b.dx > 0 ? -1 : 1;
}

export const safetyPanels = sections.flatMap(({ at, length, tyres }) => {
  const side = outerSide(at);
  const count = Math.round(length / safetyPanelSpacing);
  return Array.from({ length: count }, (_, i) => ({
    s: TRACK.wrap(at + (i - (count - 1) / 2) * safetyPanelSpacing),
    side, tyres: tyres && i > 0 && i < count - 1 && i % 2 === 0,
  }));
});

export function safetyAt(s: number, side: number): 'rail' | 'tyres' | undefined {
  const panel = safetyPanels.find(panel => panel.side === side
    && Math.abs(TRACK.wrap(panel.s - s + TRACK.length / 2) - TRACK.length / 2) <= safetyPanelSpacing / 2);
  return panel ? panel.tyres ? 'tyres' : 'rail' : undefined;
}
