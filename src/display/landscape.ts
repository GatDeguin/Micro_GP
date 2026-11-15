type LockableOrientation = ScreenOrientation & {
  lock?: (orientation: 'landscape') => Promise<void>;
};

let rotating = false;

export async function preferLandscape() {
  if (rotating || !matchMedia('(pointer: coarse) and (orientation: portrait) and (max-width: 900px)').matches) return;
  const orientation: LockableOrientation | undefined = screen.orientation;
  if (!orientation?.lock) return;

  rotating = true;
  const root = document.documentElement;
  let enteredFullscreen = false;
  try {
    if (!document.fullscreenElement && document.fullscreenEnabled) {
      await root.requestFullscreen();
      enteredFullscreen = document.fullscreenElement === root;
    }
    await orientation.lock('landscape');
  } catch {
    // The menu's rotation hint also works in browsers without orientation locking.
    if (enteredFullscreen && document.fullscreenElement === root) {
      await document.exitFullscreen().catch(() => {});
    }
  } finally {
    rotating = false;
  }
}
