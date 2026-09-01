import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createPwaInstallCoordinator } from "./components/pwa/pwaInstallCoordinator.js";
import {
  isPwaInstalled,
  PWA_INSTALL_STATES,
  requestPwaInstallation,
  resolvePwaInstallState,
} from "./components/pwa/pwaInstallState.js";

const root = new URL("../", import.meta.url);

function read(path) {
  return fs.readFileSync(new URL(path, root), "utf8");
}

class FakeEventTarget {
  constructor() {
    this.listeners = new Map();
  }

  addEventListener(type, listener) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type).add(listener);
  }

  removeEventListener(type, listener) {
    this.listeners.get(type)?.delete(listener);
  }

  emit(type, event = {}) {
    this.listeners.get(type)?.forEach((listener) => listener(event));
  }
}

test("estado PWA prioriza modo instalado e expõe prompt somente quando capturado", () => {
  assert.equal(isPwaInstalled(), false);
  assert.equal(isPwaInstalled({ displayModeStandalone: true }), true);
  assert.equal(isPwaInstalled({ navigatorStandalone: true }), true);
  assert.equal(resolvePwaInstallState(), PWA_INSTALL_STATES.UNAVAILABLE);
  assert.equal(resolvePwaInstallState({ promptAvailable: true }), PWA_INSTALL_STATES.AVAILABLE);
  assert.equal(resolvePwaInstallState({ installed: true, promptAvailable: true }), PWA_INSTALL_STATES.INSTALLED);
});

test("acionamento usa o prompt real uma vez e normaliza a escolha do navegador", async () => {
  let calls = 0;
  const accepted = await requestPwaInstallation({
    prompt: async () => { calls += 1; },
    userChoice: Promise.resolve({ outcome: "accepted", platform: "web" }),
  });
  assert.equal(calls, 1);
  assert.deepEqual(accepted, { outcome: "accepted", platform: "web" });

  const dismissed = await requestPwaInstallation({
    prompt: async () => { calls += 1; },
    userChoice: Promise.resolve({ outcome: "dismissed" }),
  });
  assert.deepEqual(dismissed, { outcome: "dismissed", platform: "" });
  assert.deepEqual(await requestPwaInstallation(null), { outcome: PWA_INSTALL_STATES.UNAVAILABLE, platform: "" });
});

test("coordenador preserva prompt capturado antes da montagem do componente", async () => {
  const windowRef = new FakeEventTarget();
  const displayMode = new FakeEventTarget();
  displayMode.matches = false;
  windowRef.matchMedia = () => displayMode;
  const coordinator = createPwaInstallCoordinator();
  let prevented = false;
  let promptCalls = 0;

  assert.equal(coordinator.initialize({ windowRef, navigatorRef: { standalone: false } }), true);
  windowRef.emit("beforeinstallprompt", {
    preventDefault: () => { prevented = true; },
    prompt: async () => { promptCalls += 1; },
    userChoice: Promise.resolve({ outcome: "accepted", platform: "web" }),
  });

  assert.equal(prevented, true);
  assert.equal(coordinator.getSnapshot().state, PWA_INSTALL_STATES.AVAILABLE);

  let updatesAfterMount = 0;
  const unsubscribe = coordinator.subscribe(() => { updatesAfterMount += 1; });
  const choice = await coordinator.consumePrompt();
  assert.deepEqual(choice, { outcome: "accepted", platform: "web" });
  assert.equal(promptCalls, 1);
  assert.equal(coordinator.getSnapshot().state, PWA_INSTALL_STATES.UNAVAILABLE);
  assert.equal(updatesAfterMount, 1);

  windowRef.emit("appinstalled");
  assert.equal(coordinator.getSnapshot().state, PWA_INSTALL_STATES.INSTALLED);
  unsubscribe();
  coordinator.destroy();
});

test("menu oferece instalação sem expor o APK legado", () => {
  const app = read("src/App.jsx");
  const sidebar = app.slice(app.indexOf('<div className="sidebar-utilities"'), app.indexOf('<div className="sidebar-version"'));
  const component = read("src/components/pwa/PwaInstallControl.jsx");
  const coordinator = read("src/components/pwa/pwaInstallCoordinator.js");

  assert.match(app, /import PwaInstallControl from "\.\/components\/pwa\/PwaInstallControl\.jsx"/);
  assert.match(sidebar, /<PwaInstallControl icon=\{<Icon name="download" \/>\} \/>/);
  assert.doesNotMatch(sidebar, /downloads\/stock-on|Stock-ON\.apk|sidebar-app-download/);
  assert.match(component, /useSyncExternalStore/);
  assert.match(component, /consumePwaInstallPrompt\(\)/);
  assert.match(component, /label: "Instalar NEPTERA"/);
  assert.match(component, /state === PWA_INSTALL_STATES\.UNAVAILABLE[\s\S]*?setFeedback\(copy\.help\)/);
  assert.match(component, /disabled=\{busy \|\| state === PWA_INSTALL_STATES\.INSTALLED\}/);
  assert.doesNotMatch(component, /addEventListener|beforeinstallprompt|appinstalled/);
  assert.match(coordinator, /windowRef\.addEventListener\("beforeinstallprompt"/);
  assert.match(coordinator, /windowRef\.addEventListener\("appinstalled"/);
  assert.match(coordinator, /event\.preventDefault\(\)/);
  assert.match(component, /<button[\s\S]*type="button"/);
  assert.match(component, /Use o menu do navegador/);
  assert.doesNotMatch(component, /\.apk|stock-on|nexstock/i);
});

test("registro força verificação do service worker e preview PWA permanece DEV-only", () => {
  const main = read("src/main.jsx");
  const preview = read("src/PwaInstallPreviewApp.jsx");

  const coordinatorInit = main.indexOf("initializePwaInstallCoordinator();");
  assert.ok(coordinatorInit > -1 && coordinatorInit < main.indexOf("async function iniciarAplicacao"));
  assert.match(main, /import \{ initializePwaInstallCoordinator \} from "\.\/components\/pwa\/pwaInstallCoordinator\.js"/);
  assert.match(main, /import\.meta\.env\.DEV && parametros\.get\("preview"\) === "pwa"/);
  assert.match(main, /await import\("\.\/PwaInstallPreviewApp\.jsx"\)/);
  assert.match(main, /register\("\/sw\.js", \{ updateViaCache: "none" \}\)/);
  assert.match(main, /registration\.update\(\)/);
  assert.match(preview, /if \(!import\.meta\.env\.DEV\) return null/);
  assert.match(preview, /fetch\("\/manifest\.webmanifest", \{ cache: "no-store"/);
  assert.match(preview, /data-preview-mode="safe-local"/);
  assert.match(preview, /Nenhum APK é baixado/);
  assert.doesNotMatch(preview, /supabase|db\.js|localStorage|sessionStorage/i);
});

test("manifesto mantém identidade estável NEPTERA e cache atualiza somente namespaces gerenciados", () => {
  const manifest = JSON.parse(read("public/manifest.webmanifest"));
  const worker = read("public/sw.js");

  assert.equal(manifest.id, "/");
  assert.equal(manifest.name, "NEPTERA");
  assert.equal(manifest.short_name, "NEPTERA");
  assert.ok(manifest.icons.every((icon) => icon.src.startsWith("/brand/neptera/icons/")));
  assert.match(worker, /CACHE_NAME = 'neptera-shell-v2'/);
  assert.match(worker, /MANAGED_CACHE_PREFIXES = \['neptera-shell-', 'stock-on-shell-'\]/);
  assert.match(worker, /MANAGED_CACHE_PREFIXES\.some\(prefix => key\.startsWith\(prefix\)\)/);
  assert.match(worker, /url\.pathname === '\/manifest\.webmanifest'/);
  assert.match(worker, /url\.pathname\.startsWith\('\/brand\/neptera\/'\)/);
  assert.match(worker, /url\.pathname\.startsWith\('\/downloads\/'\)/);
  assert.match(worker, /needsFreshIdentity \? networkFirst\(event\.request\) : cacheFirst\(event\.request\)/);
  assert.doesNotMatch(worker, /keys\.filter\(key => key !== CACHE_NAME\)\.map/);
});

test("headers exigem revalidação de manifesto, ícones e downloads", () => {
  const config = JSON.parse(read("vercel.json"));
  const expectedSources = ["/sw.js", "/manifest.webmanifest", "/brand/neptera/icons/(.*)", "/downloads/(.*)"];

  for (const source of expectedSources) {
    const route = config.headers.find((item) => item.source === source);
    assert.ok(route, `header ausente para ${source}`);
    assert.ok(route.headers.some((header) => header.key === "Cache-Control" && header.value === "public, max-age=0, must-revalidate"));
  }
  assert.doesNotMatch(JSON.stringify(config), /Stock-ON\.apk|filename=Stock-ON/i);
});
