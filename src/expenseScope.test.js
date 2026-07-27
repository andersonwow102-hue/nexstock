import test from "node:test";
import assert from "node:assert/strict";
import {
  isManagerExpense,
  expenseBelongsToManager,
  expenseBelongsToRoute,
} from "./expenseScope.js";

test("identifica despesa própria do gerente sem ponto", () => {
  assert.equal(isManagerExpense({ pontoId:null, gerente:"Alex", rota:"Alex" }), true);
  assert.equal(isManagerExpense({ pontoId:10, gerente:"Alex", rota:"Alex" }), false);
});

test("compara gerente ignorando caixa e acentos", () => {
  assert.equal(expenseBelongsToManager({ pontoId:null, gerente:"João Luís" }, "joao luis"), true);
});

test("inclui despesas do ponto e do gerente na rota correta", () => {
  const ids = new Set([10, 11]);
  assert.equal(expenseBelongsToRoute({ pontoId:10 }, "Alex", "Alex", ids), true);
  assert.equal(expenseBelongsToRoute({ pontoId:null, gerente:"Alex", rota:"Alex" }, "Alex", "Alex", ids), true);
  assert.equal(expenseBelongsToRoute({ pontoId:null, gerente:"Alex", rota:"Jussara" }, "Alex", "Alex", ids), false);
});
