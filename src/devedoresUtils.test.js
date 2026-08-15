import assert from "node:assert/strict";
import test from "node:test";
import {
  adicionarMesCivil,
  centavosDeEntrada,
  formatarDataCivil,
  formatarMoedaBR,
  mensagemErroDevedores,
  permissoesDevedores,
  preverParcelas,
} from "./devedoresUtils.js";

test("matriz visual respeita os quatro perfis e bloqueia perfil inexistente", () => {
  assert.equal(permissoesDevedores("gerente").cadastrar, true);
  assert.equal(permissoesDevedores("gerente").pagar, false);
  assert.equal(permissoesDevedores("operador").negociar, true);
  assert.equal(permissoesDevedores("operador").estornar, false);
  assert.equal(permissoesDevedores("administrador").estornar, true);
  assert.equal(permissoesDevedores("consulta").somenteLeitura, true);
  assert.equal(permissoesDevedores("consulta").corrigirCadastro, false);
  assert.equal(permissoesDevedores("consulta", false).acessar, false);
});

test("moeda brasileira usa centavos inteiros", () => {
  assert.equal(centavosDeEntrada("R$ 1.234,56"), 123456);
  assert.equal(centavosDeEntrada("10,01"), 1001);
  assert.match(formatarMoedaBR("1234.56"), /1\.234,56/);
});

test("parcelas preservam soma e deixam ajuste na ultima", () => {
  const parcelas = preverParcelas("100,00", 3, "2026-01-31");
  assert.deepEqual(parcelas.map(item => item.centavos), [3333, 3333, 3334]);
  assert.equal(parcelas.reduce((soma, item) => soma + item.centavos, 0), 10000);
  assert.deepEqual(parcelas.map(item => item.vencimento), ["2026-01-31", "2026-02-28", "2026-03-31"]);
});

test("datas civis nao passam pelo timezone do navegador", () => {
  assert.equal(formatarDataCivil("2026-08-01"), "01/08/2026");
  assert.equal(adicionarMesCivil("2026-12-31", 2), "2027-02-28");
});

test("conflitos e autorizacao recebem mensagens compreensiveis", () => {
  assert.match(mensagemErroDevedores({ code: "40001" }), /alterado por outro usuário/i);
  assert.match(mensagemErroDevedores({ code: "42501" }), /não tem autorização/i);
});
