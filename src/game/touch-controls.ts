/** Capability detection deliberately avoids user-agent strings and screen-width guesses. */
export function wantsTouchControls(mode: string, coarse: boolean, noHover: boolean, touchPoints: number) {
  return mode === 'touch' || (mode !== 'desktop' && (coarse || (noHover && touchPoints > 0)));
}

export function stickVector(x: number, y: number, radius: number) {
  const distance = Math.hypot(x, y);
  const magnitude = Math.min(1, Math.max(0, (distance / radius - .12) / .88));
  return { strafe: distance ? x / distance * magnitude : 0, forward: distance ? -y / distance * magnitude : 0 };
}

/** A half-screen swipe turns 180 degrees at the default setting, in either orientation. */
export function touchLookScale(width: number, sensitivity: number, zoomed: boolean) {
  return Math.PI * 2 / Math.max(320, width) * (sensitivity / .00225) * (zoomed ? .37 : 1);
}

interface Actions {
  action: (code: string, key?: string) => void;
  look: (x: number, y: number) => void;
  pause: () => void;
  changed: () => void;
}

/** Independent pointer ownership lets movement, aiming and actions work simultaneously. */
export class TouchControls {
  readonly root = document.createElement('div');
  enabled = false;
  forward = 0;
  strafe = 0;
  sprint = false;
  private active = false;
  private mode = 'auto';
  private coarse = matchMedia('(pointer: coarse)');
  private noHover = matchMedia('(hover: none)');
  private abort = new AbortController();
  private stickId?: number;
  private lookId?: number;
  private originX = 0;
  private originY = 0;
  private radius = 48;
  private lookX = 0;
  private lookY = 0;
  private stick: HTMLElement;
  private knob: HTMLElement;
  private lookZone: HTMLElement;
  private sprintButton: HTMLButtonElement;

  constructor(private actions: Actions) {
    this.root.className = 'touch-controls';
    const button = (label: string, code: string) => `<button type="button" data-code="${code}">${label}</button>`;
    this.root.innerHTML = `<div class="touch-look" aria-label="Swipe to look"><span>SWIPE TO LOOK</span></div>
      <div class="touch-menu">${button('Scores', 'Tab')}${button('Pause', 'Escape')}</div>
      <div class="touch-move"><button type="button" class="touch-sprint" aria-pressed="false">Sprint</button><div class="touch-stick" role="group" aria-label="Drag to move"><i></i><span>MOVE</span></div></div>
      <div class="touch-actions">${button('Zoom', 'KeyF')}${button('Photo', 'KeyE')}${button('Switch', 'KeyQ')}${button('Throw', 'KeyG')}${button('Jump', 'Space')}${button('123', 'Keypad')}</div>
      <div class="touch-keypad" aria-label="Opponent number" hidden>${[1,2,3,4,5,6,7,8,9].map(n => button(String(n), `Digit${n}`)).join('')}${button('Delete', 'Backspace')}${button('0', 'Digit0')}${button('TAG', 'Enter')}</div>`;
    document.getElementById('game-hud')!.append(this.root);
    this.stick = this.root.querySelector('.touch-stick')!;
    this.knob = this.stick.querySelector('i')!;
    this.lookZone = this.root.querySelector('.touch-look')!;
    this.sprintButton = this.root.querySelector('.touch-sprint')!;
    const options = { signal: this.abort.signal };
    this.coarse.addEventListener('change', () => this.detect(), options);
    this.noHover.addEventListener('change', () => this.detect(), options);
    // Real touch use also enables controls on hybrid laptops in automatic mode.
    document.addEventListener('pointerdown', e => {
      if (e.pointerType === 'touch' && this.mode === 'auto' && !this.enabled) this.setEnabled(true);
    }, { ...options, capture: true });
    this.root.addEventListener('contextmenu', e => e.preventDefault(), options);
    this.stick.addEventListener('pointerdown', e => {
      if (!this.active || this.stickId !== undefined) return;
      e.preventDefault();
      const rect = this.stick.getBoundingClientRect();
      this.originX = rect.left + rect.width / 2; this.originY = rect.top + rect.height / 2;
      this.radius = rect.width * .34;
      this.stickId = e.pointerId;
      this.stick.setPointerCapture(e.pointerId);
      this.move(e);
    }, options);
    this.stick.addEventListener('pointermove', e => this.move(e), options);
    this.lookZone.addEventListener('pointerdown', e => {
      if (e.pointerType === 'mouse' || !this.active || this.lookId !== undefined) return;
      e.preventDefault(); this.lookId = e.pointerId;
      this.lookX = e.clientX; this.lookY = e.clientY;
      this.lookZone.setPointerCapture(e.pointerId);
    }, options);
    this.lookZone.addEventListener('pointermove', e => {
      if (this.lookId !== e.pointerId || !this.active) return;
      this.actions.look(e.clientX - this.lookX, e.clientY - this.lookY);
      this.lookX = e.clientX; this.lookY = e.clientY;
    }, options);
    for (const name of ['pointerup', 'pointercancel', 'lostpointercapture'] as const) {
      this.root.addEventListener(name, e => {
        if (e.pointerId === this.stickId) { this.stickId = undefined; this.forward = this.strafe = 0; this.knob.style.transform = ''; }
        if (e.pointerId === this.lookId) this.lookId = undefined;
      }, options);
    }
    const bindPress = (button: HTMLButtonElement, press: () => void) => {
      button.addEventListener('pointerdown', e => {
        if (!this.active || e.button !== 0) return;
        e.preventDefault();
        press();
      }, options);
      // Keyboard and assistive-technology activation has no pointer click count.
      button.addEventListener('click', e => { if (this.active && e.detail === 0) press(); }, options);
    };
    bindPress(this.sprintButton, () => {
      this.sprint = !this.sprint;
      this.sprintButton.setAttribute('aria-pressed', String(this.sprint));
    });
    this.root.querySelectorAll<HTMLButtonElement>('[data-code]').forEach(button => {
      bindPress(button, () => {
        if (!this.active) return;
        const code = button.dataset.code!;
        if (code === 'Escape') { this.actions.pause(); return; }
        if (code === 'Keypad') {
          const pad = this.root.querySelector<HTMLElement>('.touch-keypad')!;
          pad.hidden = !pad.hidden;
          button.setAttribute('aria-expanded', String(!pad.hidden));
          return;
        }
        this.actions.action(code, code.startsWith('Digit') ? code.slice(5) : undefined);
      });
    });
    this.detect();
  }

  private move(e: PointerEvent) {
    if (e.pointerId !== this.stickId || !this.active) return;
    const x = e.clientX - this.originX, y = e.clientY - this.originY;
    const vector = stickVector(x, y, this.radius);
    this.forward = vector.forward; this.strafe = vector.strafe;
    const scale = Math.min(1, this.radius / (Math.hypot(x, y) || 1));
    this.knob.style.transform = `translate(${x * scale}px, ${y * scale}px)`;
  }
  configure(mode: string) { if (mode !== this.mode) { this.mode = mode; this.detect(); } }
  private detect() { this.setEnabled(wantsTouchControls(this.mode, this.coarse.matches, this.noHover.matches, navigator.maxTouchPoints)); }
  private setEnabled(value: boolean) {
    const changed = value !== this.enabled;
    this.enabled = value;
    document.getElementById('game-hud')!.classList.toggle('touch-layout', value);
    this.root.hidden = !value || !this.active;
    if (changed) { this.reset(); this.actions.changed(); }
  }
  setActive(active: boolean) { this.active = active; this.root.hidden = !active || !this.enabled; if (!active) this.reset(); }
  reset() {
    const stickId = this.stickId, lookId = this.lookId;
    this.stickId = this.lookId = undefined;
    if (stickId !== undefined && this.stick.hasPointerCapture(stickId)) this.stick.releasePointerCapture(stickId);
    if (lookId !== undefined && this.lookZone.hasPointerCapture(lookId)) this.lookZone.releasePointerCapture(lookId);
    this.forward = this.strafe = 0; this.sprint = false;
    this.knob.style.transform = '';
    this.sprintButton.setAttribute('aria-pressed', 'false');
    this.root.querySelector<HTMLElement>('.touch-keypad')!.hidden = true;
    this.root.querySelector('[data-code="Keypad"]')!.setAttribute('aria-expanded', 'false');
  }
  dispose() { this.reset(); this.abort.abort(); this.root.remove(); document.getElementById('game-hud')!.classList.remove('touch-layout'); }
}
