/** Fullscreen the document so the canvas, HUD, and dialogs stay together. */
export function setupFullscreen() {
  const root = document.documentElement as HTMLElement & { webkitRequestFullscreen?: () => Promise<void> | void };
  const doc = document as Document & { webkitFullscreenElement?: Element; webkitExitFullscreen?: () => Promise<void> | void };
  const active = () => !!(doc.fullscreenElement || doc.webkitFullscreenElement);
  const sync = () => document.querySelectorAll<HTMLButtonElement>('[data-fullscreen]').forEach(button => {
    button.textContent = active() ? '⤢ Exit full screen' : '⤢ Full screen';
    button.setAttribute('aria-pressed', String(active()));
  });
  const notice = document.createElement('div');
  notice.className = 'fullscreen-notice';
  notice.setAttribute('role', 'status');
  notice.hidden = true;
  document.body.append(notice);
  let timer: ReturnType<typeof setTimeout>;
  document.addEventListener('click', async event => {
    if (!(event.target instanceof Element) || !event.target.closest('[data-fullscreen]')) return;
    try {
      if (active()) {
        if (doc.exitFullscreen) await doc.exitFullscreen();
        else await doc.webkitExitFullscreen?.();
      } else if (root.requestFullscreen) await root.requestFullscreen({ navigationUI: 'hide' });
      else if (root.webkitRequestFullscreen) await root.webkitRequestFullscreen();
      else throw new Error('unsupported');
      notice.hidden = true;
    } catch {
      notice.textContent = 'Full screen is unavailable in this browser. On iPhone, use Share → Add to Home Screen, then open the saved app for an edge-to-edge view.';
      notice.hidden = false;
      clearTimeout(timer);
      timer = setTimeout(() => { notice.hidden = true; }, 9000);
    }
    sync();
  });
  document.addEventListener('fullscreenchange', sync);
  document.addEventListener('webkitfullscreenchange', sync);
  sync();
}
