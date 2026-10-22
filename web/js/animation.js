// İskelet / anahtar kare animasyonlarının oynatılması
import * as THREE from 'three';

export class AnimationController extends EventTarget {
  constructor(viewer) {
    super();
    this.viewer = viewer;
    this.mixer = null;
    this.clips = [];
    this.action = null;
    this.index = -1;
    this.playing = false;
    this.loop = true;
    this.speed = 1;
    viewer.updaters.add(dt => this.update(dt));
  }

  get hasAnimation() { return this.clips.length > 0; }
  get duration() { return this.action ? this.action.getClip().duration : 0; }
  get time() { return this.action ? this.action.time : 0; }

  setModel(root, clips) {
    this.dispose();
    this.clips = (clips || []).filter(c => c && c.duration > 0 && c.tracks.length);
    this.clips.forEach((c, i) => { if (!c.name) c.name = `Animasyon ${i + 1}`; });
    if (root && this.clips.length) {
      this.mixer = new THREE.AnimationMixer(root);
      this.mixer.timeScale = this.speed;
      this.mixer.addEventListener('finished', () => {
        this.playing = false;
        this._emit('state');
      });
      this.select(0, true);
    }
    this._emit('clips');
    this._emit('state');
  }

  dispose() {
    if (this.mixer) {
      this.mixer.stopAllAction();
      this.mixer.uncacheRoot(this.mixer.getRoot());
    }
    this.mixer = null;
    this.action = null;
    this.clips = [];
    this.index = -1;
    this.playing = false;
  }

  select(i, autoplay = this.playing) {
    if (!this.mixer || !this.clips[i]) return;
    this.mixer.stopAllAction();
    this.index = i;
    this.action = this.mixer.clipAction(this.clips[i]);
    this._applyLoop();
    this.action.reset();
    this.action.play();
    this.action.paused = !autoplay;
    this.playing = autoplay;
    this.mixer.update(0);
    this.viewer.needsRender = true;
    this._emit('state');
  }

  play() {
    const a = this.action;
    if (!a) return;
    if (!this.loop && a.time >= this.duration - 1e-4) a.reset();
    a.enabled = true;
    a.paused = false;
    if (!a.isRunning()) a.play();
    this.playing = true;
    this._emit('state');
  }

  pause() {
    if (!this.action) return;
    this.action.paused = true;
    this.playing = false;
    this._emit('state');
  }

  toggle() {
    if (this.playing) this.pause(); else this.play();
  }

  seek(t) {
    const a = this.action;
    if (!a) return;
    a.enabled = true;
    a.time = THREE.MathUtils.clamp(t, 0, this.duration);
    this.mixer.update(0);
    this.viewer.needsRender = true;
    this._emit('time');
  }

  step(frames) {
    this.pause();
    this.seek(this.time + frames / 30);
  }

  setLoop(on) {
    this.loop = on;
    this._applyLoop();
    this._emit('state');
  }

  setSpeed(s) {
    this.speed = s;
    if (this.mixer) this.mixer.timeScale = s;
    this._emit('state');
  }

  _applyLoop() {
    if (!this.action) return;
    this.action.setLoop(this.loop ? THREE.LoopRepeat : THREE.LoopOnce, Infinity);
    this.action.clampWhenFinished = !this.loop;
  }

  update(dt) {
    if (!this.mixer || !this.playing) return false;
    this.mixer.update(dt);
    this._emit('time');
    return true;
  }

  _emit(type) {
    this.dispatchEvent(new Event(type));
  }
}
