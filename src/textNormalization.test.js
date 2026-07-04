import test from "node:test";
import assert from "node:assert/strict";
import { normalizeText } from "./textNormalization.js";

test("normaliza texto totalmente em maiusculas sem quebrar siglas", () => {
  assert.equal(normalizeText("MENSAGEM PIX ENVIADA"), "Mensagem PIX enviada");
});

test("capitaliza texto totalmente em minusculas", () => {
  assert.equal(normalizeText("mensagem enviada para o gerente"), "Mensagem enviada para o gerente");
});

test("remove espacos duplicados", () => {
  assert.equal(normalizeText("texto   com    espacos"), "Texto com espacos");
});

test("corrige pontuacao e espacos", () => {
  assert.equal(normalizeText("ola ,mundo.tudo bem?sim"), "Ola, mundo. Tudo bem? Sim");
});

test("corrige palavras de alta confianca", () => {
  assert.equal(normalizeText("vc tambem nao respondeu"), "Você também não respondeu");
});

test("preserva siglas", () => {
  assert.equal(normalizeText("PIX CPF CNPJ API PDF"), "PIX CPF CNPJ API PDF");
});

test("preserva valores monetarios", () => {
  assert.equal(normalizeText("valor R$ 1.385,00,pago"), "Valor R$ 1.385,00, pago");
});

test("preserva odds", () => {
  assert.equal(normalizeText("odd 1.85, mercado 2.10"), "Odd 1.85, mercado 2.10");
});

test("preserva links", () => {
  assert.equal(normalizeText("acesse https://stock-on.com/login,agora"), "Acesse https://stock-on.com/login, agora");
});

test("preserva emails", () => {
  assert.equal(normalizeText("envie para gerente@stockon.com,hoje"), "Envie para gerente@stockon.com, hoje");
});

test("preserva nomes proprios ja capitalizados", () => {
  assert.equal(normalizeText("João Luis confirmou"), "João Luis confirmou");
});

test("preserva marcas", () => {
  assert.equal(normalizeText("Play Bet liberado"), "Play Bet liberado");
});

test("preserva clubes de futebol", () => {
  assert.equal(normalizeText("Flamengo venceu"), "Flamengo venceu");
});

test("preserva cidades", () => {
  assert.equal(normalizeText("Lapão recebeu o app"), "Lapão recebeu o app");
});

test("preserva produtos", () => {
  assert.equal(normalizeText("iPhone 15 cadastrado"), "iPhone 15 cadastrado");
});

test("preserva emojis", () => {
  assert.equal(normalizeText("ok 😊,tudo certo"), "Ok 😊, tudo certo");
});
