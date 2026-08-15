import { supabase } from "./supabase.js";
import { decimalDeCentavos, mensagemErroDevedores } from "./devedoresUtils.js";

const LIMITE_SEGURO = 1000;

async function executar(consulta) {
  const { data, error } = await consulta;
  if (error) {
    const erro = new Error(mensagemErroDevedores(error));
    erro.code = error.code;
    erro.cause = error;
    throw erro;
  }
  return data || [];
}

export async function carregarDevedores() {
  const [relatorios, dividas, resumos, modalidades] = await Promise.all([
    executar(supabase.from("devedores_relatorios").select("id,gerente_responsavel_id,gerente_nome_snapshot,tipo,nome,nome_fantasia,endereco,numero,complemento,bairro,cidade,estado,telefone,observacoes_cadastrais,criado_em,atualizado_em,versao").order("atualizado_em", { ascending: false }).limit(LIMITE_SEGURO)),
    executar(supabase.from("devedores_dividas").select("id,relatorio_id,gerente_responsavel_id,gerente_nome_snapshot,valor_original,modalidade_id,modalidade_nome_snapshot,data_registro,observacoes_originais,criado_em,atualizado_em,versao").order("atualizado_em", { ascending: false }).limit(LIMITE_SEGURO)),
    executar(supabase.from("devedores_dividas_resumo").select("divida_id,relatorio_id,gerente_responsavel_id,valor_original,negociacao_id,forma_pagamento,valor_negociado,total_pago,saldo_restante,evolucao_percentual,situacao").limit(LIMITE_SEGURO)),
    executar(supabase.from("devedores_modalidades").select("id,nome,ativo").eq("ativo", true).order("nome")),
  ]);
  const relatorioPorId = new Map(relatorios.map(item => [Number(item.id), item]));
  const resumoPorDivida = new Map(resumos.map(item => [Number(item.divida_id), item]));
  return {
    modalidades,
    limiteAtingido: relatorios.length === LIMITE_SEGURO || dividas.length === LIMITE_SEGURO,
    itens: dividas.map(divida => ({
      ...divida,
      relatorio: relatorioPorId.get(Number(divida.relatorio_id)) || null,
      resumo: resumoPorDivida.get(Number(divida.id)) || {
        divida_id: divida.id,
        valor_original: divida.valor_original,
        total_pago: 0,
        saldo_restante: divida.valor_original,
        evolucao_percentual: 0,
        situacao: "aberta",
      },
    })).filter(item => item.relatorio),
  };
}

export async function carregarDetalheDevedor(dividaId) {
  const [divida, resumo, negociacoes, parcelas, pagamentos, estornos, historico] = await Promise.all([
    executar(supabase.from("devedores_dividas").select("id,relatorio_id,gerente_responsavel_id,gerente_nome_snapshot,valor_original,modalidade_id,modalidade_nome_snapshot,data_registro,observacoes_originais,criado_em,atualizado_em,versao,relatorio_snapshot").eq("id", dividaId).limit(1)),
    executar(supabase.from("devedores_dividas_resumo").select("divida_id,relatorio_id,gerente_responsavel_id,valor_original,negociacao_id,forma_pagamento,valor_negociado,total_pago,saldo_restante,evolucao_percentual,situacao").eq("divida_id", dividaId).limit(1)),
    executar(supabase.from("devedores_negociacoes").select("id,divida_id,negociacao_anterior_id,forma_pagamento,valor_negociado,data_prevista_quitacao,quantidade_parcelas,primeiro_vencimento,observacoes,situacao,motivo_substituicao,criado_por,criado_por_nome_snapshot,criado_por_perfil_snapshot,criado_em,substituida_por,substituida_em,versao").eq("divida_id", dividaId).order("criado_em", { ascending: false })),
    executar(supabase.from("devedores_parcelas_resumo").select("id,negociacao_id,divida_id,numero,valor,vencimento,valor_pago,saldo,situacao").eq("divida_id", dividaId).order("numero")),
    executar(supabase.from("devedores_pagamentos").select("id,divida_id,negociacao_id,parcela_id,valor,data_pagamento,observacao,registrado_por,registrado_por_nome_snapshot,registrado_por_perfil_snapshot,registrado_em").eq("divida_id", dividaId).order("registrado_em", { ascending: false })),
    executar(supabase.from("devedores_pagamentos_estornos").select("id,pagamento_id,divida_id,motivo,estornado_por,estornado_por_nome_snapshot,estornado_por_perfil_snapshot,estornado_em").eq("divida_id", dividaId).order("estornado_em", { ascending: false })),
    executar(supabase.from("devedores_historico").select("id,relatorio_id,divida_id,entidade,entidade_id,acao,dados_anteriores,dados_novos,motivo,usuario_id,usuario_nome_snapshot,perfil_snapshot,correlation_id,criado_em").eq("divida_id", dividaId).order("criado_em", { ascending: false }).limit(LIMITE_SEGURO)),
  ]);
  if (!divida[0]) throw new Error("Dívida não encontrada ou fora do seu escopo.");
  return { divida: divida[0], resumo: resumo[0] || null, negociacoes, parcelas, pagamentos, estornos, historico };
}

export async function cadastrarDevedor(dados) {
  return executar(supabase.rpc("devedores_cadastrar_relatorio_divida", {
    p_tipo: dados.tipo,
    p_nome: dados.nome,
    p_nome_fantasia: dados.nomeFantasia || null,
    p_endereco: dados.endereco,
    p_numero: dados.numero,
    p_complemento: dados.complemento || null,
    p_bairro: dados.bairro || null,
    p_cidade: dados.cidade,
    p_estado: dados.estado,
    p_telefone: dados.telefone,
    p_observacoes_cadastrais: dados.observacoesCadastrais || null,
    p_valor_original: decimalDeCentavos(dados.valorOriginalCentavos),
    p_modalidade_id: Number(dados.modalidadeId),
    p_data_registro: dados.dataRegistro,
    p_observacoes_originais: dados.observacoesOriginais || null,
  }));
}

export async function corrigirCadastroGerente(dados) {
  return executar(supabase.rpc("devedores_corrigir_relatorio_gerente", {
    p_relatorio_id: dados.relatorioId,
    p_versao_esperada: dados.versaoRelatorio,
    p_nome: dados.nome,
    p_nome_fantasia: dados.nomeFantasia || null,
    p_endereco: dados.endereco,
    p_numero: dados.numero,
    p_complemento: dados.complemento || null,
    p_bairro: dados.bairro || null,
    p_cidade: dados.cidade,
    p_estado: dados.estado,
    p_telefone: dados.telefone,
    p_observacoes_cadastrais: dados.observacoesCadastrais || null,
  }));
}

export async function corrigirCadastroAdmin(dados) {
  return executar(supabase.rpc("devedores_corrigir_fase1_admin", {
    p_divida_id: dados.dividaId,
    p_versao_relatorio: dados.versaoRelatorio,
    p_versao_divida: dados.versaoDivida,
    p_tipo: dados.tipo,
    p_nome: dados.nome,
    p_nome_fantasia: dados.nomeFantasia || null,
    p_endereco: dados.endereco,
    p_numero: dados.numero,
    p_complemento: dados.complemento || null,
    p_bairro: dados.bairro || null,
    p_cidade: dados.cidade,
    p_estado: dados.estado,
    p_telefone: dados.telefone,
    p_observacoes_cadastrais: dados.observacoesCadastrais || null,
    p_valor_original: decimalDeCentavos(dados.valorOriginalCentavos),
    p_modalidade_id: Number(dados.modalidadeId),
    p_data_registro: dados.dataRegistro,
    p_observacoes_originais: dados.observacoesOriginais || null,
    p_motivo: dados.motivo,
  }));
}

function argumentosNegociacao(dados) {
  return {
    p_divida_id: dados.dividaId,
    p_versao_esperada: dados.versaoEsperada,
    p_forma_pagamento: dados.formaPagamento,
    p_valor_negociado: decimalDeCentavos(dados.valorCentavos),
    p_data_prevista_quitacao: dados.formaPagamento === "vista" ? dados.dataPrevista : null,
    p_quantidade_parcelas: dados.formaPagamento === "parcelada" ? Number(dados.quantidadeParcelas) : null,
    p_primeiro_vencimento: dados.formaPagamento === "parcelada" ? dados.primeiroVencimento : null,
    p_observacoes: dados.observacoes || null,
    p_idempotencia: dados.idempotencia,
  };
}

export function criarNegociacao(dados) {
  return executar(supabase.rpc("devedores_criar_negociacao", argumentosNegociacao(dados)));
}

export function substituirNegociacao(dados) {
  return executar(supabase.rpc("devedores_substituir_negociacao", {
    ...argumentosNegociacao(dados),
    p_motivo: dados.motivo,
  }));
}

export function corrigirNegociacaoAdmin(dados) {
  return executar(supabase.rpc("devedores_corrigir_negociacao_admin", {
    ...argumentosNegociacao(dados),
    p_motivo: dados.motivo,
  }));
}

export function registrarPagamento(dados) {
  return executar(supabase.rpc("devedores_registrar_pagamento", {
    p_negociacao_id: dados.negociacaoId,
    p_parcela_id: dados.parcelaId || null,
    p_versao_esperada: dados.versaoEsperada,
    p_valor: decimalDeCentavos(dados.valorCentavos),
    p_data_pagamento: dados.dataPagamento,
    p_observacao: dados.observacao || null,
    p_idempotencia: dados.idempotencia,
  }));
}

export function estornarPagamento(dados) {
  return executar(supabase.rpc("devedores_estornar_pagamento", {
    p_pagamento_id: dados.pagamentoId,
    p_versao_esperada: dados.versaoEsperada,
    p_motivo: dados.motivo,
    p_idempotencia: dados.idempotencia,
  }));
}

export const contratoEscritaDevedores = Object.freeze([
  "devedores_cadastrar_relatorio_divida",
  "devedores_corrigir_relatorio_gerente",
  "devedores_corrigir_fase1_admin",
  "devedores_criar_negociacao",
  "devedores_substituir_negociacao",
  "devedores_corrigir_negociacao_admin",
  "devedores_registrar_pagamento",
  "devedores_estornar_pagamento",
]);
