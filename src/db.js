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
export async function carregarPerfilAtual() {
  const { data: authData, error: authError } = await supabase.auth.getUser();
  const user = authData?.user;
  if (authError || !user) return { userId: '', nome: '', perfil: 'consulta' };
  let { data, error } = await supabase
    .from('perfis')
    .select('user_id,nome,perfil,gerente_nome,rotas_permitidas,login_nome,email_temporario,email_temporario_expira_em')
    .eq('user_id', user.id)
    .maybeSingle();
  if (error?.message?.includes('gerente_nome') || error?.message?.includes('rotas_permitidas') || error?.message?.includes('email_temporario') || error?.message?.includes('login_nome')) {
    const fallback = await supabase
      .from('perfis')
      .select('user_id,nome,perfil')
      .eq('user_id', user.id)
      .maybeSingle();
    data = fallback.data ? { ...fallback.data, gerente_nome: '', rotas_permitidas: [], login_nome: '', email_temporario: false, email_temporario_expira_em: null } : null;
    error = fallback.error;
  }
  if (error) {
    console.error('Erro ao carregar perfil atual:', error);
    return { userId: user.id, nome: user.email || '', perfil: 'consulta' };
  }
  return data
    ? { userId: data.user_id, nome: data.nome || user.email || '', perfil: data.perfil, gerenteNome: data.gerente_nome || '', rotasPermitidas: data.rotas_permitidas || [], loginNome: data.login_nome || '', emailTemporario: Boolean(data.email_temporario), emailTemporarioExpiraEm: data.email_temporario_expira_em || '' }
    : { userId: user.id, nome: user.email || '', perfil: 'consulta' };
}

export async function carregarPerfis() {
  let { data, error } = await supabase.from('perfis').select('user_id,nome,perfil,gerente_nome,rotas_permitidas,login_nome,email_temporario,email_temporario_expira_em,criado_em').order('nome', { ascending: true });
  if (error?.message?.includes('gerente_nome') || error?.message?.includes('rotas_permitidas') || error?.message?.includes('email_temporario') || error?.message?.includes('login_nome')) {
    const fallback = await supabase.from('perfis').select('user_id,nome,perfil,criado_em').order('nome', { ascending: true });
    data = fallback.data?.map(p => ({ ...p, gerente_nome: '', rotas_permitidas: [], login_nome: '', email_temporario: false, email_temporario_expira_em: null })) || [];
    error = fallback.error;
  }
  if (error) { console.error('Erro ao carregar perfis:', error); return []; }
  return data.map(p => ({ userId: p.user_id, nome: p.nome || 'Usuario', perfil: p.perfil, gerenteNome: p.gerente_nome || '', rotasPermitidas: p.rotas_permitidas || [], loginNome: p.login_nome || '', emailTemporario: Boolean(p.email_temporario), emailTemporarioExpiraEm: p.email_temporario_expira_em || '', criadoEm: p.criado_em }));
}

export async function salvarPerfil(perfil) {
  const rotasPermitidas = perfil.perfil === 'gerente' ? (perfil.rotasPermitidas || []) : [];
  const payload = { perfil: perfil.perfil, gerente_nome: perfil.gerenteNome || '', rotas_permitidas: rotasPermitidas };
  const { error } = await supabase.from('perfis').update(payload).eq('user_id', perfil.userId);
  if (error?.message?.includes('rotas_permitidas')) {
    const fallback = await supabase.from('perfis').update({ perfil: perfil.perfil, gerente_nome: perfil.gerenteNome || '' }).eq('user_id', perfil.userId);
    if (fallback.error) throw new Error(fallback.error.message);
    return;
  }
  if (error) throw new Error(error.message);
}

export async function redefinirAcessoUsuario({ userId, novoEmail, novaSenha }) {
  const { data, error } = await supabase.functions.invoke('redefinir-acesso-usuario', {
    body: { userId, novoEmail, novaSenha },
  });
  if (error) throw new Error(error.message);
  if (data?.error) throw new Error(data.error);
  return data;
}

export async function excluirAcessoUsuario({ userId }) {
  return gerenciarLogins({ action: 'excluir', userId });
}

async function mensagemErroFuncao(error) {
  const response = error?.context;
  if (response?.clone) {
    try {
      const body = await response.clone().json();
      if (body?.error) return body.error;
      if (body?.message) return body.message;
    } catch {
      try {
        const text = await response.clone().text();
        if (text) return text;
      } catch {
        // Mantem a mensagem padrao abaixo.
      }
    }
  }
  return error?.message || 'Erro inesperado na Edge Function.';
}

export async function gerenciarLogins(payload = { action: 'listar' }) {
  const { data, error } = await supabase.functions.invoke('gerenciar-logins', {
    body: payload,
  });
  if (error) {
    const detalhe = await mensagemErroFuncao(error);
    const fetchFalhou = detalhe.toLowerCase().includes('failed to send');
    throw new Error(fetchFalhou
      ? 'A função gerenciar-logins não respondeu. Confirme se ela foi publicada no Supabase Edge Functions com o nome exatamente gerenciar-logins.'
      : detalhe);
  }
  if (data?.error) throw new Error(data.error);
  return data;
}

export async function resolverEmailPorLogin(login) {
  const valor = String(login || '').trim().toLowerCase();
  if (!valor) return '';
  const { data, error } = await supabase.rpc('email_por_login', { login_input: valor });
  if (error) throw new Error(error.message);
  return data || '';
}

export async function carregarDespesasMensais() {
  const { data, error } = await supabase.from('despesas_mensais').select('*').order('competencia', { ascending: false }).order('id', { ascending: false });
  if (error) { console.error('Erro ao carregar despesas mensais:', error); return []; }
  return data.map(mapDespesaMensal);
}

export async function salvarDespesaMensal(despesa) {
  const row = {
    ponto_id: Number(despesa.pontoId), competencia: despesa.competencia,
    descricao: despesa.descricao.trim(), tipo: despesa.tipo,
    valor_previsto: Number(despesa.valorPrevisto) || 0, valor_real: Number(despesa.valorReal) || 0,
    observacao: despesa.observacao || '',
  };
  if (despesa.id) {
    const { error } = await supabase.from('despesas_mensais').update(row).eq('id', despesa.id);
    if (error) throw new Error(error.message);
    return despesa.id;
  }
  const { data, error } = await supabase.from('despesas_mensais').insert([row]).select().single();
  if (error) throw new Error(error.message);
  return data.id;
}

export async function excluirDespesaMensal(id) {
  const { error } = await supabase.from('despesas_mensais').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

export async function carregarMensagensInternas(gerenteNome = '') {
  let query = supabase
    .from('mensagens_internas')
    .select('*')
    .order('created_at', { ascending: true })
    .limit(500);
  if (gerenteNome) query = query.eq('gerente_nome', gerenteNome);
  const { data, error } = await query;
  if (error) {
    console.error('Erro ao carregar mensagens internas:', error);
    return [];
  }
  return data.map(mapMensagemInterna);
}

export async function enviarMensagemInterna({ perfilAtual, gerenteNome, mensagem, destinoTipo }) {
  const texto = String(mensagem || '').trim();
  if (!texto) throw new Error('Digite uma mensagem antes de enviar.');
  if (!gerenteNome) throw new Error('Selecione o gerente da conversa.');
  const row = {
    remetente_id: perfilAtual.userId,
    remetente_nome: perfilAtual.nome || perfilAtual.loginNome || perfilAtual.perfil || 'Usuário',
    remetente_perfil: perfilAtual.perfil || 'consulta',
    gerente_nome: gerenteNome,
    destino_tipo: destinoTipo,
    mensagem: texto,
  };
  const { data, error } = await supabase.from('mensagens_internas').insert([row]).select().single();
  if (error) throw new Error(error.message);
  return mapMensagemInterna(data);
}

export async function marcarMensagensInternasLidas({ ids = [] }) {
  const lista = ids.filter(Boolean);
  if (lista.length === 0) return;
  const { error } = await supabase
    .from('mensagens_internas')
    .update({ lida_em: new Date().toISOString() })
    .in('id', lista);
  if (error) console.error('Erro ao marcar mensagens como lidas:', error);
}

// ── Chaves PIX e avisos para gerentes ────────────────────────────────────────
export async function carregarPixChaves() {
  const { data, error } = await supabase
    .from('pix_chaves')
    .select('*')
    .order('criado_em', { ascending: false });
  if (error) {
    console.error('Erro ao carregar chaves PIX:', error);
    return [];
  }
  return data.map(mapPixChave);
}

export async function salvarPixChave(chave) {
  const row = {
    nome: String(chave.nome || '').trim(),
    tipo: chave.tipo || 'Chave PIX',
    chave: String(chave.chave || '').trim(),
    banco: String(chave.banco || '').trim(),
    observacao: String(chave.observacao || '').trim(),
    ativa: chave.ativa !== false,
  };
  if (!row.nome || !row.chave) throw new Error('Informe o nome da conta e a chave PIX.');

  if (chave.id) {
    const { data, error } = await supabase
      .from('pix_chaves')
      .update({ ...row, atualizado_em: new Date().toISOString() })
      .eq('id', chave.id)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return mapPixChave(data);
  }

  const { data, error } = await supabase
    .from('pix_chaves')
    .insert([row])
    .select()
    .single();
  if (error) throw new Error(error.message);
  return mapPixChave(data);
}

export async function excluirPixChave(id) {
  const { error } = await supabase.from('pix_chaves').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

export async function carregarPixEnvios() {
  const { data, error } = await supabase
    .from('pix_envios')
    .select('*')
    .order('enviado_em', { ascending: false })
    .limit(100);
  if (error) {
    console.error('Erro ao carregar avisos PIX:', error);
    return [];
  }
  return data.map(mapPixEnvio);
}

// ── Fechamento de rotas ──────────────────────────────────────────────────────
export async function carregarFechamentosRotas() {
  const { data, error } = await supabase
    .from('fechamentos_rotas')
    .select('*')
    .order('atualizado_em', { ascending: false });
  if (error) {
    console.error('Erro ao carregar fechamentos de rotas:', error);
    return [];
  }
  return data.map(mapFechamentoRota);
}

export async function salvarFechamentoRota({ gerente, rota, competencia, dia = '', modalidades = [] }) {
  const rows = modalidades.map(m => ({
    gerente,
    rota,
    competencia,
    dia: dia || '',
    modalidade: m.modalidade,
    entrada: Number(m.entrada) || 0,
    comissao: Number(m.comissao) || 0,
    saida: Number(m.saida) || 0,
    saldo_bruto: Number(m.saldoBruto) || 0,
    atualizado_em: new Date().toISOString(),
  }));
  if (!gerente || !rota || !competencia) throw new Error('Selecione gerente, rota e competência para salvar o fechamento.');
  if (rows.length === 0) throw new Error('Nenhuma modalidade informada para salvar.');

  const { data, error } = await supabase
    .from('fechamentos_rotas')
    .upsert(rows, { onConflict: 'gerente,rota,competencia,dia,modalidade' })
    .select();
  if (error) {
    const msg = String(error.message || '');
    if (msg.includes('fechamentos_rotas') || msg.includes('schema cache')) {
      throw new Error('A tabela fechamentos_rotas ainda não existe no Supabase. Rode a migração de fechamento e tente novamente.');
    }
    throw new Error(error.message);
  }
  return data.map(mapFechamentoRota);
}

export async function enviarPixParaGerente({ chave, gerente, rota, mensagem }) {
  if (!chave?.chave) throw new Error('Selecione uma chave PIX.');
  if (!gerente) throw new Error('Selecione o gerente que receberá o aviso.');
  const row = {
    pix_chave_id: typeof chave.id === 'number' ? chave.id : null,
    pix_nome: chave.nome,
    pix_tipo: chave.tipo,
    pix_chave: chave.chave,
    pix_banco: chave.banco || '',
    gerente,
    rota: rota || '',
    mensagem: String(mensagem || '').trim(),
  };
  const { data, error } = await supabase
    .from('pix_envios')
    .insert([row])
    .select()
    .single();
  if (error) {
    const msg = String(error.message || '');
    if (msg.includes('pix_envios') || msg.includes('schema cache')) {
      throw new Error('A tabela de avisos PIX ainda não existe no Supabase. Rode o SQL pix_envios_cartoes.sql no SQL Editor e tente novamente.');
    }
    throw new Error(error.message);
  }
  return mapPixEnvio(data);
}

function mapDespesaMensal(row) {
  return {
    id: row.id, pontoId: row.ponto_id, competencia: row.competencia,
    descricao: row.descricao, tipo: row.tipo,
    valorPrevisto: Number(row.valor_previsto) || 0, valorReal: Number(row.valor_real) || 0,
    observacao: row.observacao || '', criadoEm: row.criado_em || '',
  };
}

function mapPixChave(row) {
  return {
    id: row.id,
    nome: row.nome || '',
    tipo: row.tipo || 'Chave PIX',
    chave: row.chave || '',
    banco: row.banco || '',
    observacao: row.observacao || '',
    ativa: row.ativa !== false,
    criadoEm: row.criado_em || '',
    atualizadoEm: row.atualizado_em || '',
  };
}

function mapPixEnvio(row) {
  return {
    id: row.id,
    pixChaveId: row.pix_chave_id,
    pixNome: row.pix_nome || '',
    pixTipo: row.pix_tipo || 'Chave PIX',
    pixChave: row.pix_chave || '',
    pixBanco: row.pix_banco || '',
    gerente: row.gerente || '',
    rota: row.rota || '',
    mensagem: row.mensagem || '',
    enviadoEm: row.enviado_em || '',
  };
}

function mapFechamentoRota(row) {
  return {
    id: row.id,
    gerente: row.gerente || '',
    rota: row.rota || '',
    competencia: row.competencia || '',
    dia: row.dia || '',
    modalidade: row.modalidade || '',
    entrada: Number(row.entrada) || 0,
    comissao: Number(row.comissao) || 0,
    saida: Number(row.saida) || 0,
    saldoBruto: Number(row.saldo_bruto) || 0,
    atualizadoEm: row.atualizado_em || '',
  };
}

function mapMensagemInterna(row) {
  return {
    id: row.id,
    remetenteId: row.remetente_id,
    remetenteNome: row.remetente_nome || '',
    remetentePerfil: row.remetente_perfil || '',
    gerenteNome: row.gerente_nome || '',
    destinoTipo: row.destino_tipo || '',
    mensagem: row.mensagem || '',
    lidaEm: row.lida_em || '',
    criadoEm: row.created_at || '',
  };
}

function mapEquipamento(row) {
  return {
    id: row.id, nome: row.nome, categoria: row.categoria,
    quantidade: 1, status: normalizarStatus(row.status), minimo: row.minimo,
    observacao: row.observacao || '', localizacao: row.localizacao || '',
    responsavel: row.responsavel || '', patrimonio: row.patrimonio || '',
    dataCadastro: row.data_cadastro || '',
    gerenteResponsavel: row.gerente_responsavel || '',
    transferenciaStatus: row.transferencia_status || '',
    transferenciaEnviadaEm: row.transferencia_enviada_em || '',
    transferenciaRecebidaEm: row.transferencia_recebida_em || '',
  };
}

function desmapEquipamento(item) {
  return {
    nome: item.nome, categoria: item.categoria, quantidade: 1,
    status: item.status, minimo: item.minimo, observacao: item.observacao || '',
    localizacao: item.localizacao || '', responsavel: item.responsavel || '',
    patrimonio: item.patrimonio || '', data_cadastro: item.dataCadastro || '',
    gerente_responsavel: item.gerenteResponsavel || '',
    transferencia_status: item.transferenciaStatus || '',
    transferencia_enviada_em: item.transferenciaEnviadaEm || null,
    transferencia_recebida_em: item.transferenciaRecebidaEm || null,
  };
}

function normalizarStatus(status) {
  if (status === 'Disponível' || status === 'Em rota' || status === 'Em conserto') return status;
  if (status === 'Em uso') return 'Em rota';
  return 'Em conserto';
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
