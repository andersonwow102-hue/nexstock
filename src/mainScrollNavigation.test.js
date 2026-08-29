import test from "node:test";
import assert from "node:assert/strict";
import { handleMainScrollKey } from "./components/operations/mainScrollNavigation.js";

function createEvent(key, overrides = {}) {
  const calls = [];
  const main = {
    clientHeight: 800,
    scrollHeight: 2800,
    scrollTop: 500,
    scrollTo: options => {
      calls.push(options);
      main.scrollTop = options.top;
    },
  };
  const event = {
    key,
    currentTarget: main,
    target: main,
    preventDefault: () => calls.push("prevented"),
    ...overrides,
  };
  return {
    calls,
    event,
    main,
  };
}

test("PageDown e PageUp percorrem o scroll principal por uma página confortável", () => {
  const down = createEvent("PageDown");
  handleMainScrollKey(down.event);
  assert.deepEqual(down.calls, ["prevented", { top: 1180, behavior: "auto" }]);

  const up = createEvent("PageUp");
  handleMainScrollKey(up.event);
  assert.deepEqual(up.calls, ["prevented", { top: 0, behavior: "auto" }]);
});

test("Home e End alcançam os limites exatos", () => {
  const home = createEvent("Home");
  handleMainScrollKey(home.event);
  assert.equal(home.main.scrollTop, 0);

  const end = createEvent("End");
  handleMainScrollKey(end.event);
  assert.equal(end.main.scrollTop, 2000);
});

test("campos editáveis, modificadores e outras teclas permanecem intactos", () => {
  const editable = createEvent("PageDown", { target: { closest: () => ({ tagName: "INPUT" }) } });
  handleMainScrollKey(editable.event);
  assert.deepEqual(editable.calls, []);

  const modified = createEvent("End", { ctrlKey: true });
  handleMainScrollKey(modified.event);
  assert.deepEqual(modified.calls, []);

  const unrelated = createEvent("ArrowDown");
  handleMainScrollKey(unrelated.event);
  assert.deepEqual(unrelated.calls, []);
});

test("descendentes e main bloqueado deixam o navegador escolher o scroll correto", () => {
  const descendant = createEvent("PageDown", { target: { closest: () => null } });
  handleMainScrollKey(descendant.event);
  assert.deepEqual(descendant.calls, []);

  const locked = createEvent("End");
  locked.main.style = { overflowY: "hidden" };
  handleMainScrollKey(locked.event);
  assert.deepEqual(locked.calls, []);
});
