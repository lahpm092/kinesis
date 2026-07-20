// FIELD scene — small mono text sprite (canvas-backed, redrawn only when
// the string actually changes).
import * as THREE from 'three';

const CW = 512;
const CH = 128;

export class TextSprite {
  constructor({ color = '#EFE4CB', height = 1.0, opacity = 0.95 } = {}) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = CW;
    this.canvas.height = CH;
    this.ctx = this.canvas.getContext('2d');
    this.color = color;
    this.tex = new THREE.CanvasTexture(this.canvas);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    this.tex.anisotropy = 2;
    this.mat = new THREE.SpriteMaterial({
      map: this.tex,
      transparent: true,
      opacity,
      depthWrite: false,
    });
    this.sprite = new THREE.Sprite(this.mat);
    this.sprite.scale.set(height * (CW / CH), height, 1);
    this.sprite.renderOrder = 10;
    this.sprite.visible = false;
    this.last = null;
  }

  set(text) {
    if (text === this.last) return;
    this.last = text;
    const x = this.ctx;
    x.clearRect(0, 0, CW, CH);
    x.font = '500 46px ui-monospace, "SF Mono", Menlo, monospace';
    try { x.letterSpacing = '8px'; } catch (_) { /* older engines */ }
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    x.fillStyle = this.color;
    x.fillText(text, CW / 2, CH / 2 + 2);
    this.tex.needsUpdate = true;
  }
}
