import test from "node:test";
import assert from "node:assert/strict";
import { acquireMainScrollLock } from "./components/operations/mainScrollLock.js";

function fakeDocument({ rootOverflowY = "", mainOverflowY = "", withMain = true } = {}) {
  const main = withMain ? { style: { overflowY: mainOverflowY } } : null;
  return {
    document: {
      documentElement: { style: { overflowY: rootOverflowY } },
      querySelector: selector => selector === ".main" ? main : null,
    },
    main,
  };
}

test("o lock aplica e restaura exatamente o scroll principal", () => {
  const { document, main } = fakeDocument({ rootOverflowY: "auto", mainOverflowY: "scroll" });
  const release = acquireMainScrollLock(document);

  assert.equal(document.documentElement.style.overflowY, "hidden");
  assert.equal(main.style.overflowY, "hidden");

  release();
  assert.equal(document.documentElement.style.overflowY, "auto");
  assert.equal(main.style.overflowY, "scroll");
});

test("locks sobrepostos só restauram depois da última liberação, em qualquer ordem", () => {
  for (const reverse of [false, true]) {
    const { document, main } = fakeDocument();
    const releaseA = acquireMainScrollLock(document);
    const releaseB = acquireMainScrollLock(document);
    const [first, last] = reverse ? [releaseB, releaseA] : [releaseA, releaseB];

    first();
    assert.equal(document.documentElement.style.overflowY, "hidden");
    assert.equal(main.style.overflowY, "hidden");

    last();
    assert.equal(document.documentElement.style.overflowY, "");
    assert.equal(main.style.overflowY, "");
  }
});

test("a função de liberação é idempotente e documentos ficam isolados", () => {
  const one = fakeDocument();
  const two = fakeDocument({ rootOverflowY: "visible", mainOverflowY: "auto" });
  const releaseOne = acquireMainScrollLock(one.document);
  const releaseTwo = acquireMainScrollLock(two.document);

  releaseOne();
  releaseOne();
  assert.equal(one.document.documentElement.style.overflowY, "");
  assert.equal(two.document.documentElement.style.overflowY, "hidden");

  releaseTwo();
  assert.equal(two.document.documentElement.style.overflowY, "visible");
  assert.equal(two.main.style.overflowY, "auto");
});

test("o lock suporta documento sem main, estado inicialmente bloqueado e SSR", () => {
  const withoutMain = fakeDocument({ rootOverflowY: "hidden", withMain: false });
  const release = acquireMainScrollLock(withoutMain.document);
  assert.equal(withoutMain.document.documentElement.style.overflowY, "hidden");
  release();
  assert.equal(withoutMain.document.documentElement.style.overflowY, "hidden");
  assert.doesNotThrow(() => acquireMainScrollLock(undefined)());
});
