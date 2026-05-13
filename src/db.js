// ─── Camada de dados — Supabase ───────────────────────────────────────────────
// Substitui completamente o localStorage
import { supabase } from './supabase.js';

// ── Equipamentos ──────────────────────────────────────────────────────────────
export async function carregarEquipamentos() {
  const { data, error } = await supabase
    .from('equipamentos')
    .select('*')
    .order('id', { ascending: true });
  if (error) { console.error('Erro ao carregar equipamentos:', error); return []; }
  return data.map(mapEquipamento);
}

export async function salvarEquipamento(item) {
  const row = desmapEquipamento(item);
  if (item.id) {
    const { error } = await supabase.from('equipamentos').update(row).eq('id', item.id);
    if (error) console.error('Erro ao atualizar equipamento:', error);
  } else {
    const { data, error } = await supabase.from('equipamentos').insert([row]).select().single();
    if (error) { console.error('Erro ao inserir equipamento:', error); return null; }
    return data.id;
  }
}

export async function excluirEquipamento(id) {
  const { error } = await supabase.from('equipamentos').delete().eq('id', id);
  if (error) console.error('Erro ao excluir equipamento:', error);
}

// ── Pontos ────────────────────────────────────────────────────────────────────
export async function carregarPontos() {
  const { data, error } = await supabase
    .from('pontos')
    .select('*')
    .order('id', { ascending: true });
  if (error) { console.error('Erro ao carregar pontos:', error); return []; }
  return data.map(mapPonto);
}

export async function salvarPonto(ponto) {
  const row = desmapPonto(ponto);
  if (ponto.id) {
    const { error } = await supabase.from('pontos').update(row).eq('id', ponto.id);
    if (error) console.error('Erro ao atualizar ponto:', error);
  } else {
    const { data, error } = await supabase.from('pontos').insert([row]).select().single();
    if (error) { console.error('Erro ao inserir ponto:', error); return null; }
    return data.id;
  }
}

export async function excluirPonto(id) {
  const { error } = await supabase.from('pontos').delete().eq('id', id);
  if (error) console.error('Erro ao excluir ponto:', error);
}

// ── Histórico Equipamentos ────────────────────────────────────────────────────
export async function carregarHistoricoEquipamentos() {
  const { data, error } = await supabase
    .from('historico_equipamentos')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(1000);
  if (error) { console.error('Erro ao carregar histórico:', error); return []; }
  return data.map(h => ({
    id: h.id, tipo: h.tipo, itemId: h.item_id, itemNome: h.item_nome,
    categoria: h.categoria, qtdAntes: h.qtd_antes, qtdDepois: h.qtd_depois,
    responsavel: h.responsavel, observacao: h.observacao, data: h.data,
  }));
}

export async function adicionarHistoricoEquipamento(h) {
  const { error } = await supabase.from('historico_equipamentos').insert([{
    tipo: h.tipo, item_id: h.itemId, item_nome: h.itemNome,
    categoria: h.categoria, qtd_antes: h.qtdAntes, qtd_depois: h.qtdDepois,
    responsavel: h.responsavel, observacao: h.observacao, data: h.data,
  }]);
  if (error) console.error('Erro ao inserir histórico equipamento:', error);
}

export async function limparHistoricoEquipamentos() {
  const { error } = await supabase.from('historico_equipamentos').delete().neq('id', 0);
  if (error) console.error('Erro ao limpar histórico:', error);
}

// ── Histórico Pontos ──────────────────────────────────────────────────────────
export async function carregarHistoricoPontos() {
  const { data, error } = await supabase
    .from('historico_pontos')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(500);
  if (error) { console.error('Erro ao carregar histórico pontos:', error); return []; }
  return data.map(h => ({ id: h.id, tipo: h.tipo, nome: h.nome, gerente: h.gerente, observacao: h.observacao, data: h.data }));
}

export async function adicionarHistoricoPonto(h) {
  const { error } = await supabase.from('historico_pontos').insert([{
    tipo: h.tipo, nome: h.nome, gerente: h.gerente, observacao: h.observacao, data: h.data,
  }]);
  if (error) console.error('Erro ao inserir histórico ponto:', error);
}

// ── Mappers (banco → app) ─────────────────────────────────────────────────────
function mapEquipamento(row) {
  return {
    id: row.id, nome: row.nome, categoria: row.categoria,
    quantidade: row.quantidade, status: row.status, minimo: row.minimo,
    observacao: row.observacao || '', localizacao: row.localizacao || '',
    responsavel: row.responsavel || '', patrimonio: row.patrimonio || '',
    dataCadastro: row.data_cadastro || '',
  };
}

function desmapEquipamento(item) {
  return {
    nome: item.nome, categoria: item.categoria, quantidade: item.quantidade,
    status: item.status, minimo: item.minimo, observacao: item.observacao || '',
    localizacao: item.localizacao || '', responsavel: item.responsavel || '',
    patrimonio: item.patrimonio || '', data_cadastro: item.dataCadastro || '',
  };
}

function mapPonto(row) {
  return {
    id: row.id, nomeFantasia: row.nome_fantasia, nomeDono: row.nome_dono,
    telefone: row.telefone, gerente: row.gerente,
    modalidades: row.modalidades || [],
    possuiDespesa: row.possui_despesa, valorDespesa: Number(row.valor_despesa) || 0,
    observacao: row.observacao || '',
  };
}

function desmapPonto(ponto) {
  return {
    nome_fantasia: ponto.nomeFantasia, nome_dono: ponto.nomeDono,
    telefone: ponto.telefone, gerente: ponto.gerente,
    modalidades: ponto.modalidades || [],
    possui_despesa: ponto.possuiDespesa, valor_despesa: ponto.valorDespesa || 0,
    observacao: ponto.observacao || '',
  };
}