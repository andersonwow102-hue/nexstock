import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  calcularFechamentoPreview,
  criarFechamentoPreview,
  FECHAMENTO_PREVIEW_SCENARIOS,
} from "./fechamentoPreviewData.js";

const srcDir = path.dirname(fileURLToPath(import.meta.url));
const read = (arquivo) => fs.readFileSync(path.join(srcDir, arquivo), "utf8");

test("fixture local cobre os cinco estados solicitados com dados exclusivamente simulados", () => {
  assert.deepEqual(FECHAMENTO_PREVIEW_SCENARIOS.map((cenario) => cenario.id), ["A", "B", "C", "D", "E"]);
  for (const id of ["A", "B", "C", "D", "E"]) {
    const fixture = criarFechamentoPreview(id, new Date("2026-08-28T12:00:00Z"));
    assert.equal(fixture.id, id);
    assert.equal(fixture.competencia, "2026-07");
    assert.equal(fixture.gerente, "Marina Valente");
    assert.equal(fixture.rota, "Circuito Norte");
    assert.ok(fixture.rotas.length >= 5);
    assert.ok(Array.isArray(fixture.pontos));
    assert.ok(Array.isArray(fixture.equipamentos));
    assert.ok(Array.isArray(fixture.despesas));
  }
  assert.equal(criarFechamentoPreview("A").despesas.length, 0);
  assert.equal(criarFechamentoPreview("B").etapa, 3);
  assert.equal(criarFechamentoPreview("C").status.classe, "rascunho");
  assert.equal(criarFechamentoPreview("D").status.titulo, "Pronto para envio");
  assert.equal(criarFechamentoPreview("E").status.classe, "confirmado");
});

test("fixture reproduz exatamente as fórmulas auditadas do Fechamento", () => {
  const fixture = criarFechamentoPreview("C", new Date("2026-08-28T12:00:00Z"));
  const despesasSistema = fixture.despesas.reduce((soma, item) => soma + item.valorReal, 0);
  const calculo = calcularFechamentoPreview({
    valores: fixture.valores,
    despesasSistema,
    playBet: fixture.ajustes.playBet,
    ajudaCusto: fixture.ajustes.ajudaCusto,
    comissaoExtra: fixture.ajustes.comissaoExtra,
  });

  assert.equal(calculo.totais.entradas, 54100);
  assert.equal(calculo.totais.comissoes, 6252);
  assert.equal(calculo.totais.saidas, 34000);
  assert.equal(calculo.totais.saldoBruto, 13848);
  assert.equal(calculo.totais.despesasSistema, 2860);
  assert.equal(calculo.totais.despesasFinais, 2690);
  assert.equal(calculo.totais.saldoFinal, 11158);
  assert.equal(calculo.totais.comissaoGerente, 1115.8);
  assert.equal(calculo.totais.saldoRepassar, 10042.2);
});

test("comissão do gerente continua limitada a saldo final positivo", () => {
  const valores = {
    "90-da-sorte": { entrada: "100", saida: "500", comissaoAutomatica: true },
    viapix: { entrada: "0", comissao: "0", saida: "0", comissaoAutomatica: false },
    lotobanca: { entrada: "0", saida: "0", comissaoAutomatica: true },
  };
  const calculo = calcularFechamentoPreview({ valores, despesasSistema: 50, playBet: 0, ajudaCusto: 0, comissaoExtra: 0 });
  assert.equal(calculo.totais.saldoBruto, -410);
  assert.equal(calculo.totais.saldoFinal, -460);
  assert.equal(calculo.totais.comissaoGerente, 0);
  assert.equal(calculo.totais.saldoRepassar, -460);
});

test("entrada DEV do Fechamento não importa autenticação, banco, Supabase ou monitoramento", () => {
  const main = read("main.jsx");
  const preview = read("FechamentoPreviewApp.jsx");
  const fixture = read("fechamentoPreviewData.js");
  const workbench = read("FechamentoWorkbench.jsx");

  assert.match(main, /import\.meta\.env\.DEV[\s\S]*previewFechamento/);
  assert.match(main, /previewFechamento \? iniciarPreviewFechamento\(\) : iniciarAplicacao\(\)/);
  assert.doesNotMatch(main, /import App from|from ["']\.\/monitoring\.js["']/);
  for (const [nome, fonte] of [["preview", preview], ["fixture", fixture], ["workbench", workbench]]) {
    assert.doesNotMatch(fonte, /from\s+["'][^"']*(?:db|supabase|monitoring)\.js["']/i, `${nome} encostou em infraestrutura real`);
  }
  assert.match(preview, /PRÉVIA LOCAL · DADOS SIMULADOS/);
  assert.match(preview, /nenhum dado saiu do navegador/i);
});
