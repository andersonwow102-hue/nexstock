export const PWA_INSTALL_STATES = Object.freeze({
  AVAILABLE: "available",
  INSTALLED: "installed",
  UNAVAILABLE: "unavailable",
});

export function isPwaInstalled({ displayModeStandalone = false, navigatorStandalone = false } = {}) {
  return Boolean(displayModeStandalone || navigatorStandalone);
}

export function resolvePwaInstallState({ installed = false, promptAvailable = false } = {}) {
  if (installed) return PWA_INSTALL_STATES.INSTALLED;
  if (promptAvailable) return PWA_INSTALL_STATES.AVAILABLE;
  return PWA_INSTALL_STATES.UNAVAILABLE;
}

export async function requestPwaInstallation(deferredPrompt) {
  if (!deferredPrompt || typeof deferredPrompt.prompt !== "function") {
    return { outcome: PWA_INSTALL_STATES.UNAVAILABLE, platform: "" };
  }

  await deferredPrompt.prompt();
  const choice = await Promise.resolve(deferredPrompt.userChoice);

  return {
    outcome: choice?.outcome === "accepted" ? "accepted" : "dismissed",
    platform: typeof choice?.platform === "string" ? choice.platform : "",
  };
}
