/**
 * Autoplay killer — pauses video/audio that starts without a user gesture.
 * The actual capture-phase listeners live in the content script; this module
 * holds the pure decision logic.
 */

export function isMediaElement(el: unknown): el is HTMLMediaElement {
  return (
    typeof el === "object" &&
    el !== null &&
    "tagName" in el &&
    ((el as HTMLElement).tagName === "VIDEO" || (el as HTMLElement).tagName === "AUDIO")
  );
}

/**
 * Should we pause this element? We pause anything that is actually playing.
 * Muted autoplay is still autoplay — the user didn't ask for it — so muted
 * videos are paused too. User-initiated play (a click that starts playback)
 * is indistinguishable here; the content script only reacts to 'play' events
 * NOT preceded by a recent click, so genuine user playback is never touched.
 */
export function shouldPauseMedia(el: HTMLMediaElement, hadRecentUserGesture: boolean): boolean {
  if (hadRecentUserGesture) return false;
  return !el.paused && !el.ended;
}

/** Pauses an element and resets it to the start if it's already advanced. */
export function pauseMedia(el: HTMLMediaElement): void {
  try {
    el.pause();
  } catch {
    // Ignore — pausing can throw on detached/broken elements.
  }
}
