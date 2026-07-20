import { bus } from './bus.js';

// Master timeline for the study. All scenes render against clock.t (seconds
// in clip time, 0..duration). Scenes with their own <video> keep it synced
// via bus 'time'/'seek' events.
class Clock {
  constructor() {
    this.t = 0;
    this.duration = 10.4;
    this.rate = 1;
    this.playing = false;
    this._last = null;
    this._tick = this._tick.bind(this);
    requestAnimationFrame(this._tick);
  }
  setDuration(d) { this.duration = d; }
  play() { this.playing = true; this._last = null; }
  pause() { this.playing = false; }
  toggle() { this.playing ? this.pause() : this.play(); }
  seek(t) {
    this.t = Math.max(0, Math.min(this.duration, t));
    bus.emit('seek', this.t);
    bus.emit('time', this.t);
  }
  _tick(now) {
    if (this.playing) {
      if (this._last != null) {
        this.t += ((now - this._last) / 1000) * this.rate;
        if (this.t >= this.duration) this.t = 0; // loop the study
        bus.emit('time', this.t);
      }
      this._last = now;
    } else {
      this._last = null;
    }
    requestAnimationFrame(this._tick);
  }
}

export const clock = new Clock();
