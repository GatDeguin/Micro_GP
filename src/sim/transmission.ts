import type { TransmissionView } from '../shared/protocol.ts';

const GEARS = [
  { up: 2.75, down: 0, redline: 3.42, torque: 1.13 },
  { up: 4.67, down: 2.11, redline: 5.58, torque: 1.11 },
  { up: 6.43, down: 3.80, redline: 7.72, torque: 1.07 },
  { up: 8.84, down: 5.48, redline: 10.10, torque: 1.00 },
  { up: Infinity, down: 7.96, redline: 12.80, torque: 0.98 },
] as const;
const SHIFT_SECONDS = 0.066;
const IDLE = 0.15;

function gearAt(speed: number) {
  return speed < 0 ? -1 : speed === 0 ? 0 : GEARS.findIndex(ratio => speed < ratio.up) + 1;
}

export class AutomaticTransmission {
  private gear: number;
  private serial = 0;
  private remainingCut = 0;
  private powered = false;
  private kickdownHold = false;

  constructor(speed: number) {
    this.gear = gearAt(speed);
  }

  private select(gear: number) {
    if (this.gear === gear) return;
    this.remainingCut = this.gear > 0 && gear > 0 ? SHIFT_SECONDS : 0;
    this.gear = gear;
    this.serial++;
    this.kickdownHold = false;
  }

  step(speed: number, gas: boolean, brake: boolean, reversing: boolean, dt: number) {
    const demandRises = gas && !this.powered;
    this.powered = gas;
    if (!gas) this.kickdownHold = false;
    this.remainingCut = Math.max(0, this.remainingCut - dt);

    const rolling = Math.abs(speed);
    if (reversing) {
      this.select(-1);
    } else if (rolling < 0.018) {
      this.select(gas || brake ? 1 : 0);
    } else if (this.gear <= 0) {
      this.select(1);
    } else if (this.remainingCut === 0) {
      const ratio = GEARS[this.gear - 1];
      const lower = GEARS[this.gear - 2];
      // The lower gear needs headroom before a new request for power can engage it.
      const kickdown = demandRises && lower !== undefined && rolling < lower.up - 0.22;
      if (this.gear > 1 && (rolling < ratio.down || kickdown)) {
        this.select(this.gear - 1);
        this.kickdownHold = kickdown;
      } else if (rolling >= ratio.up + (this.kickdownHold ? 0.40 : 0)) {
        this.select(this.gear + 1);
      }
    }

    const ratio = GEARS[this.gear - 1];
    return ratio ? ratio.torque * (1 - (this.remainingCut / SHIFT_SECONDS) ** 2) : 0;
  }

  neutralize() {
    this.select(0);
    this.powered = false;
  }

  relocate(speed: number) {
    this.select(gearAt(speed));
    this.remainingCut = 0;
    this.powered = false;
    this.kickdownHold = false;
    return this;
  }

  view(speed: number): TransmissionView {
    const redline = this.gear === -1 ? 2.26 : GEARS[this.gear - 1]?.redline;
    const rev = redline ? Math.min(1, IDLE + (1 - IDLE) * Math.abs(speed) / redline) : IDLE;
    return { gear: this.gear, rev, shift: this.serial };
  }
}
