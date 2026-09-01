import {
  isPwaInstalled,
  requestPwaInstallation,
  resolvePwaInstallState,
} from "./pwaInstallState.js";

function createSnapshot(installed, promptAvailable) {
  return Object.freeze({
    installed,
    promptAvailable,
    state: resolvePwaInstallState({ installed, promptAvailable }),
  });
}

export function createPwaInstallCoordinator() {
  const subscribers = new Set();
  let initialized = false;
  let windowRef = null;
  let navigatorRef = null;
  let displayMode = null;
  let installedByEvent = false;
  let deferredPrompt = null;
  let snapshot = createSnapshot(false, false);

  function installedNow() {
    return installedByEvent || isPwaInstalled({
      displayModeStandalone: Boolean(displayMode?.matches),
      navigatorStandalone: navigatorRef?.standalone === true,
    });
  }

  function publishSnapshot() {
    const nextSnapshot = createSnapshot(installedNow(), Boolean(deferredPrompt));
    if (
      snapshot.installed === nextSnapshot.installed
      && snapshot.promptAvailable === nextSnapshot.promptAvailable
      && snapshot.state === nextSnapshot.state
    ) return;

    snapshot = nextSnapshot;
    subscribers.forEach((subscriber) => subscriber());
  }

  function handleBeforeInstallPrompt(event) {
    event.preventDefault();
    deferredPrompt = event;
    publishSnapshot();
  }

  function handleAppInstalled() {
    installedByEvent = true;
    deferredPrompt = null;
    publishSnapshot();
  }

  function initialize(environment = {}) {
    if (initialized) return true;

    windowRef = environment.windowRef || globalThis.window;
    navigatorRef = environment.navigatorRef || globalThis.navigator;
    if (!windowRef?.addEventListener) return false;

    displayMode = windowRef.matchMedia?.("(display-mode: standalone)") || null;
    windowRef.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    windowRef.addEventListener("appinstalled", handleAppInstalled);
    if (displayMode?.addEventListener) displayMode.addEventListener("change", publishSnapshot);
    else displayMode?.addListener?.(publishSnapshot);
    initialized = true;
    publishSnapshot();
    return true;
  }

  function subscribe(subscriber) {
    subscribers.add(subscriber);
    return () => subscribers.delete(subscriber);
  }

  async function consumePrompt() {
    const promptToConsume = deferredPrompt;
    deferredPrompt = null;
    publishSnapshot();
    return requestPwaInstallation(promptToConsume);
  }

  function destroy() {
    if (initialized) {
      windowRef.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
      windowRef.removeEventListener("appinstalled", handleAppInstalled);
      if (displayMode?.removeEventListener) displayMode.removeEventListener("change", publishSnapshot);
      else displayMode?.removeListener?.(publishSnapshot);
    }

    initialized = false;
    windowRef = null;
    navigatorRef = null;
    displayMode = null;
    installedByEvent = false;
    deferredPrompt = null;
    snapshot = createSnapshot(false, false);
    subscribers.clear();
  }

  return {
    consumePrompt,
    destroy,
    getSnapshot: () => snapshot,
    initialize,
    subscribe,
  };
}

const pwaInstallCoordinator = createPwaInstallCoordinator();

export const initializePwaInstallCoordinator = (environment) => pwaInstallCoordinator.initialize(environment);
export const subscribePwaInstall = (subscriber) => pwaInstallCoordinator.subscribe(subscriber);
export const getPwaInstallSnapshot = () => pwaInstallCoordinator.getSnapshot();
export const consumePwaInstallPrompt = () => pwaInstallCoordinator.consumePrompt();
