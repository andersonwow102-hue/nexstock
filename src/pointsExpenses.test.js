import test from "node:test";
import assert from "node:assert/strict";
import {
  aplicarResumoDespesaMes,
  criarAnaliseDespesasRede,
  filtrarPontosDespesasRede,
  listarDespesasPonto,
  valorDespesa,
} from "./pointsExpenses.js";

const pontos = [
  { id: 1, nomeFantasia: "Árvore Central", nomeDono: "Ana Souza", telefone: "1111", gerente: "Queixo", possuiDespesa: "sim", valorDespesa: 9999 },
  { id: 2, nomeFantasia: "Banca Norte", nomeDono: "Bruno Lima", telefone: "2222", gerente: "Queixo", possuiDespesa: "sim", valorDespesa: 9999 },
  { id: 3, nomeFantasia: "Casa Sul", nomeDono: "Caio Nobre", telefone: "3333", gerente: "Beu", possuiDespesa: "nao", valorDespesa: 0 },
];

const despesas = [
  { id: 1, pontoId: 1, competencia: "2026-08-01", descricao: "Energia", valorReal: 100, valorPrevisto: 80 },
  { id: 2, pontoId: 1, competencia: "2026-08", descricao: "Internet", valorReal: 0, valorPrevisto: 25 },
  { id: 3, pontoId: 3, competencia: "2026-08-01", descricao: "Apoio", valorReal: 50, valorPrevisto: 40 },
  { id: 4, pontoId: 1, competencia: "2026-07-01", descricao: "Outro mês", valorReal: 500, valorPrevisto: 500 },
  { id: 5, pontoId: null, gerente: "Gerente Queixo", rota: "Queixo", competencia: "2026-08-01", descricao: "Deslocamento", valorReal: 20, valorPrevisto: 20 },
  { id: 6, pontoId: null, gerente: "Gerente Beu", rota: "Beu", competencia: "2026-08-01", descricao: "Apoio", valorReal: 100, valorPrevisto: 100 },
  { id: 7, pontoId: null, gerente: "Gerente Jussara", rota: "Jussara", competencia: "2026-08-01", descricao: "Operação", valorReal: 200, valorPrevisto: 200 },
];

test("valor efetivo preserva a semântica real || previsto", () => {
  assert.equal(valorDespesa({ valorReal: 80, valorPrevisto: 30 }), 80);
  assert.equal(valorDespesa({ valorReal: 0, valorPrevisto: 30 }), 30);
  assert.equal(valorDespesa({ valorReal: 0, valorPrevisto: 0 }), 0);
});

test("resumo por competência soma lançamentos e ignora snapshot persistido", () => {
  const resumo = aplicarResumoDespesaMes(pontos, despesas, "2026-08");
  assert.equal(resumo[0].valorDespesa, 125);
  assert.equal(resumo[0].possuiDespesa, "sim");
  assert.equal(resumo[1].valorDespesa, 0);
  assert.equal(resumo[1].possuiDespesa, "nao");
  assert.equal(resumo[2].valorDespesa, 50);
});

test("análise consolida pontos e gerentes e ordena rotas pelo total", () => {
  const analise = criarAnaliseDespesasRede({ pontos, despesas, competencia: "2026-08" });
  assert.equal(analise.totalPontos, 175);
  assert.equal(analise.totalGerentes, 320);
  assert.equal(analise.totalGeral, 495);
  assert.deepEqual(analise.resumoRotas.map(item => item.rota), ["Jussara", "Beu", "Queixo"]);

  const queixo = analise.resumoRotas.find(item => item.rota === "Queixo");
  assert.deepEqual(
    { totalPontos: queixo.totalPontos, totalGerente: queixo.totalGerente, total: queixo.total, com: queixo.comDespesa, sem: queixo.semDespesa },
    { totalPontos: 125, totalGerente: 20, total: 145, com: 1, sem: 1 }
  );
  assert.deepEqual(queixo.despesasGerente.map(item => item.id), [5]);
  assert.equal(queixo.despesasGerente[0].pontoId, null);

  const jussara = analise.resumoRotas.find(item => item.rota === "Jussara");
  assert.equal(jussara.pontos, 0);
  assert.equal(jussara.total, 200);
});

test("edição derivada da despesa do gerente altera somente os totais correspondentes", () => {
  const atualizadas = despesas.map(item => item.id === 5 ? { ...item, valorReal: 40, valorPrevisto: 40 } : item);
  const antes = criarAnaliseDespesasRede({ pontos, despesas, competencia: "2026-08" });
  const depois = criarAnaliseDespesasRede({ pontos, despesas: atualizadas, competencia: "2026-08" });
  const rotaAntes = antes.resumoRotas.find(item => item.rota === "Queixo");
  const rotaDepois = depois.resumoRotas.find(item => item.rota === "Queixo");

  assert.equal(depois.totalPontos, antes.totalPontos);
  assert.equal(depois.totalGerentes, antes.totalGerentes + 20);
  assert.equal(depois.totalGeral, antes.totalGeral + 20);
  assert.equal(rotaDepois.totalPontos, rotaAntes.totalPontos);
  assert.equal(rotaDepois.totalGerente, rotaAntes.totalGerente + 20);
  assert.equal(rotaDepois.total, rotaAntes.total + 20);
  assert.equal(atualizadas.find(item => item.id === 5).id, 5);
  assert.equal(atualizadas.find(item => item.id === 5).competencia, "2026-08-01");
});

test("filtros de rota, situação e busca preservam ordenação financeira", () => {
  const { pontosCompetencia } = criarAnaliseDespesasRede({ pontos, despesas, competencia: "2026-08" });
  assert.deepEqual(
    filtrarPontosDespesasRede({ pontos: pontosCompetencia, rota: "Queixo" }).map(ponto => ponto.id),
    [1, 2]
  );
  assert.deepEqual(
    filtrarPontosDespesasRede({ pontos: pontosCompetencia, situacao: "com" }).map(ponto => ponto.id),
    [1, 3]
  );
  assert.deepEqual(
    filtrarPontosDespesasRede({ pontos: pontosCompetencia, situacao: "sem" }).map(ponto => ponto.id),
    [2]
  );
  assert.deepEqual(
    filtrarPontosDespesasRede({ pontos: pontosCompetencia, busca: "arvore" }).map(ponto => ponto.id),
    [1]
  );
  assert.deepEqual(
    filtrarPontosDespesasRede({ pontos: pontosCompetencia, busca: "caio nobre" }).map(ponto => ponto.id),
    [3]
  );
  assert.deepEqual(
    filtrarPontosDespesasRede({ pontos: pontosCompetencia, rota: "Queixo", situacao: "com", busca: "ana souza" }).map(ponto => ponto.id),
    [1]
  );
});

test("ranking de rotas usa nome como desempate de totais iguais", () => {
  const pontosEmpatados = [
    { id: 10, nomeFantasia: "Unidade Z", nomeDono: "Zoe", gerente: "Zeta" },
    { id: 11, nomeFantasia: "Unidade A", nomeDono: "Alice", gerente: "Alfa" },
  ];
  const despesasEmpatadas = [
    { id: 10, pontoId: 10, competencia: "2026-08-01", valorReal: 10 },
    { id: 11, pontoId: 11, competencia: "2026-08-01", valorReal: 10 },
  ];
  const analise = criarAnaliseDespesasRede({ pontos: pontosEmpatados, despesas: despesasEmpatadas, competencia: "2026-08" });
  assert.deepEqual(analise.resumoRotas.map(item => item.rota), ["Alfa", "Zeta"]);
});

test("detalhe contém somente o ponto e a competência selecionados", () => {
  const detalhe = listarDespesasPonto({ despesas, pontoId: 1, competencia: "2026-08" });
  assert.deepEqual(detalhe.map(item => item.descricao), ["Energia", "Internet"]);
  assert.ok(detalhe.every(item => item.pontoId === 1));
  assert.ok(detalhe.every(item => !item.gerente));
});
