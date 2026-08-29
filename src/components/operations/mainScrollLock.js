const scrollLockStates = new WeakMap();

export function acquireMainScrollLock(ownerDocument = globalThis.document) {
  if (!ownerDocument?.documentElement) return () => {};

  let state = scrollLockStates.get(ownerDocument);
  if (!state) {
    const root = ownerDocument.documentElement;
    const main = ownerDocument.querySelector(".main");
    state = {
      root,
      main,
      tokens: new Set(),
      rootOverflowY: root.style.overflowY,
      mainOverflowY: main?.style.overflowY ?? "",
    };
    scrollLockStates.set(ownerDocument, state);
  }

  const token = Symbol("main-scroll-lock");
  state.tokens.add(token);
  state.root.style.overflowY = "hidden";
  if (state.main) state.main.style.overflowY = "hidden";

  let released = false;
  return () => {
    if (released) return;
    released = true;

    const current = scrollLockStates.get(ownerDocument);
    if (!current || !current.tokens.delete(token) || current.tokens.size) return;

    current.root.style.overflowY = current.rootOverflowY;
    if (current.main) current.main.style.overflowY = current.mainOverflowY;
    scrollLockStates.delete(ownerDocument);
  };
}
