import { test, expect } from "@playwright/test";

const BASE_URL = process.env.STOCKON_URL || "https://nexstock-delta.vercel.app";
const LOGIN = process.env.STOCKON_LOGIN;
const PASSWORD = process.env.STOCKON_PASSWORD;

const pagesToCheck = [
  "Dashboard",
  "Equipamentos",
  "Pontos",
  "Senhas",
  "Fechamento",
  "Central de Acessos",
  "Gerenciar Logins",
  "Histórico",
];

async function layoutSnapshot(page, label) {
  await page.waitForTimeout(450);
  return page.evaluate((name) => {
    const viewport = document.documentElement.clientWidth;
    const docWidth = Math.max(document.documentElement.scrollWidth, document.body.scrollWidth);
    const offenders = [...document.querySelectorAll("body *")]
      .map((el) => {
        const rect = el.getBoundingClientRect();
        return {
          tag: el.tagName.toLowerCase(),
          className: String(el.className || "").slice(0, 120),
          text: String(el.innerText || el.getAttribute("aria-label") || "").replace(/\s+/g, " ").trim().slice(0, 90),
          left: Math.round(rect.left),
          right: Math.round(rect.right),
          width: Math.round(rect.width),
        };
      })
      .filter((item) => item.width > viewport + 2 || item.left < -2 || item.right > viewport + 2)
      .slice(0, 12);
    return { name, viewport, docWidth, overflow: docWidth - viewport, offenders };
  }, label);
}

async function closeDrawerIfOpen(page) {
  await page.keyboard.press("Escape").catch(() => {});
}

test("auditoria mobile das telas internas", async ({ page }, testInfo) => {
  test.setTimeout(90000);

  expect(LOGIN, "STOCKON_LOGIN precisa estar definido").toBeTruthy();
  expect(PASSWORD, "STOCKON_PASSWORD precisa estar definido").toBeTruthy();

  const diagnostics = { console: [], pageErrors: [], failedRequests: [] };
  page.on("console", (msg) => {
    if (["error", "warning"].includes(msg.type())) diagnostics.console.push(`${msg.type()}: ${msg.text()}`.slice(0, 500));
  });
  page.on("pageerror", (err) => diagnostics.pageErrors.push(String(err?.message || err).slice(0, 500)));
  page.on("requestfailed", (request) => {
    const url = request.url();
    if (!url.includes("googleapis.com") && !url.includes("fonts.gstatic.com")) {
      diagnostics.failedRequests.push(`${request.failure()?.errorText || "failed"} ${url}`.slice(0, 500));
    }
  });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(BASE_URL, { waitUntil: "networkidle" });

  const loginField = page.getByPlaceholder(/beu|email|login/i).first();
  if (await loginField.isVisible({ timeout: 5000 }).catch(() => false)) {
    await loginField.fill(LOGIN);
    await page.getByPlaceholder(/senha/i).fill(PASSWORD);
    await page.getByRole("button", { name: /entrar/i }).click();
    await page.waitForLoadState("networkidle").catch(() => {});
    await page.waitForTimeout(18000);
  } else {
    await page.waitForTimeout(2500);
  }

  const stillLoading = await page.locator("text=Carregando o sistema").isVisible().catch(() => false);
  if (stillLoading) {
    await page.screenshot({ path: `mobile-audit-${testInfo.project.name || "default"}-loading-stuck.png`, fullPage: true });
    throw new Error(`Login ficou preso no carregamento. Diagnostico: ${JSON.stringify(diagnostics, null, 2)}`);
  }

  const hasAppNavigation = await page.locator(".btn-hamburguer, .sidebar").first().isVisible({ timeout: 5000 }).catch(() => false);
  if (!hasAppNavigation) {
    await page.screenshot({ path: `mobile-audit-${testInfo.project.name || "default"}-blank-app.png`, fullPage: true });
    throw new Error(`Aplicativo não exibiu navegação após carregar. Diagnostico: ${JSON.stringify(diagnostics, null, 2)}`);
  }

  const results = [];
  results.push(await layoutSnapshot(page, "Login/Dashboard inicial"));
  await page.screenshot({ path: `mobile-audit-${testInfo.project.name}-dashboard.png`, fullPage: true });

  let checkedPages = 0;
  for (const label of pagesToCheck) {
    const hamburger = page.locator(".btn-hamburguer").first();
    if (await hamburger.isVisible().catch(() => false)) await hamburger.click();
    const nav = page.getByRole("button", { name: new RegExp(label, "i") }).first();
    if (!(await nav.isVisible().catch(() => false))) {
      results.push({ name: label, skipped: true, reason: "botao nao encontrado/visivel" });
      await closeDrawerIfOpen(page);
      continue;
    }
    await nav.click();
    await page.waitForLoadState("networkidle").catch(() => {});
    await closeDrawerIfOpen(page);
    results.push(await layoutSnapshot(page, label));
    checkedPages += 1;
    await page.screenshot({ path: `mobile-audit-${testInfo.project.name}-${label.replace(/\s+/g, "-").toLowerCase()}.png`, fullPage: true });
  }

  expect(checkedPages, "nenhuma página interna foi auditada").toBeGreaterThan(0);

  console.log(JSON.stringify(results, null, 2));
  const leaking = results.filter((item) => !item.skipped && item.overflow > 2);
  expect(leaking, `Telas com rolagem lateral: ${JSON.stringify(leaking, null, 2)}`).toEqual([]);
});
