// ─── Camada de dados — Supabase ───────────────────────────────────────────────
// Substitui completamente o localStorage
import { supabase } from './supabase.js';
import { normalizeFreeText } from './textNormalization.js';
import { registrarAcaoCritica, registrarErroOperacional } from './monitoring.js';

async function reportarErroDados(error, contexto = {}) {
  const erro = error instanceof Error ? error : new Error(error?.message || String(error || 'Erro desconhecido'));
  await registrarErroOperacional(erro, { categoria: 'dados', ...contexto });
  return erro;
}

// ── Equipamentos ──────────────────────────────────────────────────────────────
export async function carregarEquipamentos() {
  const { data, error } = await supabase
    .from('equipamentos')
    .select('*')
    .order('id', { ascending: true });
  if (error) { console.error('Erro ao carregar equipamentos:', error); return []; }

  const { data: consertos, error: erroConsertos } = await supabase
    .from('consertos_equipamentos')
    .select('*');
  const tabelaAindaNaoCriada = String(erroConsertos?.message || '').toLowerCase().includes('schema cache') || String(erroConsertos?.message || '').toLowerCase().includes('consertos_equipamentos');
  if (erroConsertos && !tabelaAindaNaoCriada) console.error('Erro ao carregar dados protegidos de conserto:', erroConsertos);
  const consertoPorEquipamento = new Map((consertos || []).map(item => [Number(item.equipamento_id), item]));

  return data.map(row => {
    const conserto = consertoPorEquipamento.get(Number(row.id));
    return mapEquipamento(conserto ? { ...row, ...conserto, id: row.id, __consertoCarregado: true } : row);
  });
}

export async function salvarEquipamento(item) {
  const row = desmapEquipamento(item);
  let equipamentoId = item.id;
  if (item.id) {
    const { error } = await supabase.from('equipamentos').update(row).eq('id', item.id);
    if (error) throw await reportarErroDados(error, { acao: 'salvar_equipamento', equipamentoId: item.id, status: item.status });
  } else {
    const { data, error } = await supabase.from('equipamentos').insert([row]).select().single();
    if (error) throw await reportarErroDados(error, { acao: 'criar_equipamento', categoriaEquipamento: item.categoria, status: item.status });
    equipamentoId = data.id;
  }
  await salvarConsertoProtegido(equipamentoId, item);
  return equipamentoId;
}

async function salvarConsertoProtegido(equipamentoId, item) {
  const dados = desmapConserto(item);
  const possuiDados = Object.entries(dados).some(([campo, valor]) => campo !== 'conserto_valor' ? Boolean(valor) : Number(valor) > 0);
  if (!possuiDados && !item.consertoProtegidoCarregado) return;

  if (item.consertoComunicadoPorGerente) {
    const { error } = await supabase.rpc('comunicar_conserto_gerente', {
      p_equipamento_id: equipamentoId,
      p_defeito: dados.conserto_defeito || '',
      p_solicitado_em: dados.conserto_solicitado_em,
    });
    if (error) throw await reportarErroDados(error, { acao: 'comunicar_conserto_gerente', equipamentoId });
    await registrarAcaoCritica({
      acao: 'comunicar_conserto_gerente',
      mensagem: 'Gerente comunicou equipamento para conserto.',
      contexto: { equipamentoId },
    });
    return;
  }

  if (!possuiDados) {
    const { error } = await supabase.from('consertos_equipamentos').delete().eq('equipamento_id', equipamentoId);
    if (error) throw new Error(error.message);
    return;
  }

  const { error } = await supabase
    .from('consertos_equipamentos')
    .upsert({ equipamento_id: equipamentoId, ...dados, atualizado_em: new Date().toISOString() }, { onConflict: 'equipamento_id' });
  if (error) throw await reportarErroDados(error, { acao: 'salvar_dados_conserto', equipamentoId });
  await registrarAcaoCritica({
    acao: 'salvar_dados_conserto',
    mensagem: 'Dados financeiros/operacionais do conserto foram atualizados.',
    contexto: { equipamentoId, pagamentoStatus: dados.conserto_pagamento_status },
  });
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
    if (error) {
      console.error('Erro ao atualizar ponto:', error);
      throw error;
    }
  } else {
    const { data, error } = await supabase.from('pontos').insert([row]).select().single();
    if (error) {
      console.error('Erro ao inserir ponto:', error);
      throw error;
    }
    return data.id;
  }
}

export async function excluirPonto(id) {
  const { error } = await supabase.from('pontos').delete().eq('id', id);
  if (error) console.error('Erro ao excluir ponto:', error);
}

// ── Senhas e aplicativos das modalidades ────────────────────────────────────
export async function carregarGerenteModalidadeAcessos() {
  const { data, error } = await supabase
    .from('gerente_modalidade_acessos')
    .select('*')
    .order('gerente', { ascending: true })
    .order('modalidade', { ascending: true });
  if (error) {
    console.error('Erro ao carregar senhas das modalidades:', error);
    return [];
  }
  return data.map(mapGerenteModalidadeAcesso);
}

export async function salvarGerenteModalidadeAcesso(acesso) {
  const gerente = String(acesso.gerente || '').trim();
  const modalidade = String(acesso.modalidade || '').trim();
  if (!gerente) throw new Error('Selecione o gerente.');
  if (!modalidade) throw new Error('Selecione a modalidade.');
  const { data: authData } = await supabase.auth.getUser();
  const row = {
    gerente,
    modalidade,
    login: String(acesso.login || '').trim(),
    senha: String(acesso.senha || '').trim(),
    link: String(acesso.link || '').trim(),
    observacao: normalizeFreeText(acesso.observacao || ''),
    atualizado_em: new Date().toISOString(),
    atualizado_por: authData?.user?.id || null,
  };
  const { data, error } = await supabase
    .from('gerente_modalidade_acessos')
    .upsert(row, { onConflict: 'gerente,modalidade' })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return mapGerenteModalidadeAcesso(data);
}

export async function excluirGerenteModalidadeAcesso(id) {
  const { error } = await supabase.from('gerente_modalidade_acessos').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

export async function carregarModalidadeApps() {
  const { data, error } = await supabase
    .from('modalidade_apps')
    .select('*')
    .order('modalidade', { ascending: true })
    .order('app_tipo', { ascending: true });
  if (error) {
    console.error('Erro ao carregar apps das modalidades:', error);
    return [];
  }
  return data.map(mapModalidadeApp);
}

export async function enviarModalidadeApp({ modalidade, appTipo = 'padrao', arquivo, linkExterno = '' }) {
  const nomeModalidade = String(modalidade || '').trim();
  const tipoApp = nomeModalidade === '90 da Sorte' ? String(appTipo || 'terminal').trim() : 'padrao';
  const urlExterna = String(linkExterno || '').trim();
  if (!nomeModalidade) throw new Error('Selecione a modalidade.');
  if (!arquivo && !urlExterna) throw new Error('Selecione um APK ou informe o link externo.');
  if (arquivo && urlExterna) throw new Error('Use apenas uma opção: arquivo APK ou link externo.');
  if (urlExterna) {
    let url;
    try {
      url = new URL(urlExterna);
    } catch {
      throw new Error('Informe um link externo válido.');
    }
    if (url.protocol !== 'https:') throw new Error('O link externo precisa começar com https://.');
  }
  const nomeArquivo = arquivo ? String(arquivo.name || '').trim() : `App ${nomeModalidade}`;
  if (arquivo && !nomeArquivo.toLowerCase().endsWith('.apk')) throw new Error('Envie um arquivo APK válido.');
  const { data: authData } = await supabase.auth.getUser();
  let caminho = '';
  if (arquivo) {
    const seguro = nomeArquivo.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9._-]+/g, '-');
    const pasta = nomeModalidade.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9]+/g, '-').toLowerCase();
    const subpasta = tipoApp.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9]+/g, '-').toLowerCase();
    caminho = `${pasta}/${subpasta}/${Date.now()}-${seguro}`;
    const { error: uploadError } = await supabase.storage
      .from('modalidade-apps')
      .upload(caminho, arquivo, {
        upsert: true,
        contentType: arquivo.type || 'application/vnd.android.package-archive',
      });
    if (uploadError) throw await reportarErroDados(uploadError, { acao: 'upload_apk_modalidade', modalidade: nomeModalidade, appTipo: tipoApp });
  }
  const row = {
    modalidade: nomeModalidade,
    app_tipo: tipoApp,
    app_nome: nomeArquivo,
    storage_path: caminho,
    download_url: urlExterna,
    tamanho: Number(arquivo?.size) || 0,
    tipo: arquivo?.type || 'application/vnd.android.package-archive',
    atualizado_em: new Date().toISOString(),
    atualizado_por: authData?.user?.id || null,
  };
  const { data, error } = await supabase
    .from('modalidade_apps')
    .upsert(row, { onConflict: 'modalidade,app_tipo' })
    .select()
    .single();
  if (error) throw await reportarErroDados(error, { acao: 'registrar_apk_modalidade', modalidade: nomeModalidade, appTipo: tipoApp });
  await registrarAcaoCritica({
    acao: 'upload_apk_modalidade',
    mensagem: 'APK de modalidade atualizado.',
    contexto: { modalidade: nomeModalidade, appTipo: tipoApp, tamanho: Number(arquivo.size) || 0 },
  });
  return mapModalidadeApp(data);
}

export async function obterLinkDownloadModalidadeApp(app) {
  if (app?.downloadUrl) return app.downloadUrl;
  if (!app?.storagePath) throw new Error('App sem arquivo disponível.');
  const { data, error } = await supabase.storage
    .from('modalidade-apps')
    .createSignedUrl(app.storagePath, 60 * 10, { download: app.appNome || true });
  if (error) throw new Error(error.message);
  return data.signedUrl;
}

export async function carregarPontoModalidadeAcessos() {
  const { data, error } = await supabase
    .from('ponto_modalidade_acessos')
    .select('*')
    .order('ponto_id', { ascending: true })
    .order('modalidade', { ascending: true });
  if (error) {
    console.error('Erro ao carregar acessos das modalidades:', error);
    return [];
  }
  return data.map(mapPontoModalidadeAcesso);
}

export async function salvarPontoModalidadeAcessos(pontoId, acessos = []) {
  if (!pontoId) throw new Error('Selecione um ponto para salvar os acessos.');
  const { data: authData } = await supabase.auth.getUser();
  const linhas = acessos
    .map(acesso => ({
      ponto_id: Number(pontoId),
      modalidade: String(acesso.modalidade || '').trim(),
      login: String(acesso.login || '').trim(),
      senha: String(acesso.senha || '').trim(),
      observacao: normalizeFreeText(acesso.observacao || ''),
      atualizado_em: new Date().toISOString(),
      atualizado_por: authData?.user?.id || null,
    }))
    .filter(acesso => acesso.modalidade && (acesso.login || acesso.senha || acesso.observacao));

  const { error: deleteError } = await supabase
    .from('ponto_modalidade_acessos')
    .delete()
    .eq('ponto_id', Number(pontoId));
  if (deleteError) throw new Error(deleteError.message);

  if (linhas.length === 0) return [];

  const { data, error } = await supabase
    .from('ponto_modalidade_acessos')
    .insert(linhas)
    .select();
  if (error) throw new Error(error.message);
  return data.map(mapPontoModalidadeAcesso);
}

// ── Histórico Equipamentos ────────────────────────────────────────────────────
export async function carregarHistoricoEquipamentos({ strict = false } = {}) {
  const { data, error } = await supabase
    .from('historico_equipamentos')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(1000);
  if (error) {
    console.error('Erro ao carregar histórico:', error);
    if (strict) throw new Error('Não foi possível carregar o histórico de equipamentos.');
    return [];
  }
  return data.map(h => ({
    id: h.id, tipo: h.tipo, itemId: h.item_id, itemNome: h.item_nome,
    categoria: h.categoria, qtdAntes: h.qtd_antes, qtdDepois: h.qtd_depois,
    responsavel: h.responsavel, observacao: normalizeFreeText(h.observacao || ''), data: h.data,
    createdAt: h.created_at || null,
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
export async function carregarHistoricoPontos({ strict = false } = {}) {
  const { data, error } = await supabase
    .from('historico_pontos')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(500);
  if (error) {
    console.error('Erro ao carregar histórico pontos:', error);
    if (strict) throw new Error('Não foi possível carregar o histórico de pontos.');
    return [];
  }
  return data.map(h => ({ id: h.id, tipo: h.tipo, nome: h.nome, gerente: h.gerente, observacao: h.observacao, data: h.data, createdAt: h.created_at || null }));
}

export async function adicionarHistoricoPonto(h) {
  const { error } = await supabase.from('historico_pontos').insert([{
    tipo: h.tipo, nome: h.nome, gerente: h.gerente, observacao: normalizeFreeText(h.observacao || ''), data: h.data,
  }]);
  if (error) console.error('Erro ao inserir histórico ponto:', error);
}

// ── Mappers (banco → app) ─────────────────────────────────────────────────────
export async function carregarPerfilAtual() {
  const { data: authData, error: authError } = await supabase.auth.getUser();
  const user = authData?.user;
  if (authError || !user) return { userId: '', nome: '', perfil: 'consulta', perfilReal: false };
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
    return { userId: user.id, nome: user.email || '', email: user.email || '', perfil: 'consulta', perfilReal: false };
  }
  return data
    ? { userId: data.user_id, nome: data.nome || user.email || '', email: user.email || '', perfil: data.perfil, perfilReal: true, gerenteNome: data.gerente_nome || '', rotasPermitidas: data.rotas_permitidas || [], loginNome: data.login_nome || '', emailTemporario: Boolean(data.email_temporario), emailTemporarioExpiraEm: data.email_temporario_expira_em || '' }
    : { userId: user.id, nome: user.email || '', email: user.email || '', perfil: 'consulta', perfilReal: false };
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
    ponto_id: despesa.pontoId ? Number(despesa.pontoId) : null,
    gerente: normalizeFreeText(despesa.gerente || '') || null,
    rota: normalizeFreeText(despesa.rota || '') || null,
    competencia: despesa.competencia,
    descricao: normalizeFreeText(despesa.descricao || ''), tipo: despesa.tipo,
    valor_previsto: Number(despesa.valorPrevisto) || 0, valor_real: Number(despesa.valorReal) || 0,
    observacao: normalizeFreeText(despesa.observacao || ''),
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

export async function carregarProrrogacoesDespesas() {
  const { data, error } = await supabase
    .from('prorrogacoes_despesas')
    .select('*')
    .order('expira_em', { ascending: false });
  if (error) throw new Error(error.message);
  return (data || []).map(row => ({
    id: row.id,
    gerente: row.gerente || '',
    competencia: String(row.competencia || '').slice(0, 7),
    expiraEm: row.expira_em || '',
    ativo: row.ativo !== false,
    observacao: row.observacao || '',
    criadoEm: row.criado_em || '',
  }));
}

export async function salvarProrrogacaoDespesa({ gerente, competencia, expiraEm, observacao = '' }) {
  const payload = {
    gerente,
    competencia: `${competencia}-01`,
    expira_em: expiraEm,
    ativo: true,
    observacao: normalizeFreeText(observacao),
    atualizado_em: new Date().toISOString(),
  };
  const { data: existente, error: erroConsulta } = await supabase
    .from('prorrogacoes_despesas')
    .select('id')
    .ilike('gerente', gerente)
    .eq('competencia', payload.competencia)
    .maybeSingle();
  if (erroConsulta) throw new Error(erroConsulta.message);
  const consulta = existente?.id
    ? supabase.from('prorrogacoes_despesas').update(payload).eq('id', existente.id)
    : supabase.from('prorrogacoes_despesas').insert([payload]);
  const { data, error } = await consulta.select().single();
  if (error) throw new Error(error.message);
  return {
    id: data.id,
    gerente: data.gerente,
    competencia: String(data.competencia || '').slice(0, 7),
    expiraEm: data.expira_em,
    ativo: data.ativo !== false,
    observacao: data.observacao || '',
    criadoEm: data.criado_em || '',
  };
}

export async function encerrarProrrogacaoDespesa(id) {
  const { error } = await supabase
    .from('prorrogacoes_despesas')
    .update({ ativo: false, atualizado_em: new Date().toISOString() })
    .eq('id', id);
  if (error) throw new Error(error.message);
}

export async function carregarSolicitacoesModalidade() {
  const { data, error } = await supabase
    .from('solicitacoes_modalidade')
    .select('*')
    .order('criado_em', { ascending: false })
    .limit(300);
  if (error) {
    console.error('Erro ao carregar solicitações de modalidade:', error);
    return [];
  }
  return data.map(mapSolicitacaoModalidade);
}

export async function criarSolicitacaoModalidade({ ponto, perfilAtual, modalidade, acao, detalhe }) {
  const texto = normalizeFreeText(detalhe || '');
  if (!ponto?.id) throw new Error('Selecione um ponto válido.');
  if (!modalidade) throw new Error('Selecione a modalidade.');
  if (!texto) throw new Error('Explique o que precisa ser feito.');
  const gerenteNome = perfilAtual?.gerenteNome || perfilAtual?.nome || '';
  const row = {
    ponto_id: Number(ponto.id),
    ponto_nome: ponto.nomeFantasia,
    gerente: gerenteNome,
    rota: ponto.gerente,
    modalidade,
    acao,
    detalhe: texto,
    criado_por: perfilAtual?.userId || null,
  };
  const { data, error } = await supabase
    .from('solicitacoes_modalidade')
    .insert([row])
    .select()
    .single();
  if (error) throw new Error(error.message);
  return mapSolicitacaoModalidade(data);
}

export async function concluirSolicitacaoModalidade(id) {
  const { data, error } = await supabase
    .from('solicitacoes_modalidade')
    .update({ status: 'concluida', concluido_em: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return mapSolicitacaoModalidade(data);
}

export async function carregarSolicitacoesStatusPonto() {
  const { data, error } = await supabase
    .from('solicitacoes_status_ponto')
    .select('*')
    .order('solicitado_em', { ascending: false })
    .limit(300);
  if (error) {
    if (String(error.message || '').includes('solicitacoes_status_ponto')) return [];
    throw new Error(error.message);
  }
  return (data || []).map(mapSolicitacaoStatusPonto);
}

export async function carregarHistoricoStatusPonto(pontoId) {
  const id = Number(pontoId);
  if (!Number.isFinite(id) || id <= 0) return [];

  const { data, error } = await supabase
    .from('historico_status_pontos')
    .select('*')
    .eq('ponto_id', id)
    .order('criado_em', { ascending: false })
    .limit(50);
  if (error) throw new Error(error.message);
  return (data || []).map(mapHistoricoStatusPonto);
}

export async function solicitarDesativacaoPonto({ pontoId, motivo }) {
  const { data, error } = await supabase.rpc('solicitar_desativacao_ponto', {
    p_ponto_id: pontoId,
    p_motivo: String(motivo || '').trim(),
  });
  if (error) throw new Error(error.message);
  return mapSolicitacaoStatusPonto(data);
}

export async function decidirDesativacaoPonto({ solicitacaoId, aprovar, motivoDecisao = '' }) {
  const { data, error } = await supabase.rpc('decidir_desativacao_ponto', {
    p_solicitacao_id: solicitacaoId,
    p_aprovar: Boolean(aprovar),
    p_motivo_decisao: String(motivoDecisao || '').trim() || null,
  });
  if (error) throw new Error(error.message);
  return mapSolicitacaoStatusPonto(data);
}

export async function reativarPonto({ pontoId, motivo }) {
  const { data, error } = await supabase.rpc('reativar_ponto', {
    p_ponto_id: pontoId,
    p_motivo: String(motivo || '').trim(),
  });
  if (error) throw new Error(error.message);
  return mapPonto(data);
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
    mensagem: normalizeFreeText(texto),
  };
  const { data, error } = await supabase.from('mensagens_internas').insert([row]).select().single();
  if (error) throw await reportarErroDados(error, { acao: 'enviar_mensagem_interna', destinoTipo, gerenteNome });
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
    observacao: normalizeFreeText(chave.observacao || ''),
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

export async function salvarFechamentoRota({ gerente, rota, competencia, dia = '', modalidades = [], enviarAoGerente = true, subtrairDespesasPlayBet = 0, ajudaCusto = 0, comissaoExtra = 0 }) {
  const atualizadoEm = new Date().toISOString();
  const enviadoEm = enviarAoGerente ? atualizadoEm : null;
  const valorPlayBet = Math.max(0, Number(subtrairDespesasPlayBet) || 0);
  const valorAjudaCusto = Math.max(0, Number(ajudaCusto) || 0);
  const normalizarEscopo = valor => String(valor || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
  const comissaoExtraPermitida = normalizarEscopo(gerente) === 'yago' && ['miroros', 'ibitita'].includes(normalizarEscopo(rota));
  const valorComissaoExtra = comissaoExtraPermitida ? Math.max(0, Number(comissaoExtra) || 0) : 0;
  const rows = modalidades.map(m => ({
    gerente,
    rota,
    competencia,
    dia: dia || '',
    modalidade: m.modalidade,
    entrada: Number(m.entrada) || 0,
    comissao: Number(m.comissao) || 0,
    comissao_automatica: m.comissaoAutomatica !== false,
    percentual_comissao: Math.max(0, Number(m.percentualComissao) || 0),
    saida: Number(m.saida) || 0,
    saldo_bruto: Number(m.saldoBruto) || 0,
    subtrair_despesas_play_bet: valorPlayBet,
    ajuda_custo: valorAjudaCusto,
    comissao_extra: valorComissaoExtra,
    enviado_em: enviadoEm,
    finalizado_em: null,
    finalizado_por: null,
    gerente_visualizado_em: null,
    gerente_visualizado_por: null,
    gerente_confirmado_em: null,
    gerente_confirmado_por: null,
    atualizado_em: atualizadoEm,
  }));
  if (!gerente || !rota || !competencia) throw new Error('Selecione gerente, rota e competência para salvar o fechamento.');
  if (rows.length === 0) throw new Error('Nenhuma modalidade informada para salvar.');

  const { error: statusError } = await supabase
    .from('fechamentos_rotas')
    .update({
      enviado_em: enviadoEm,
      subtrair_despesas_play_bet: valorPlayBet,
      ajuda_custo: valorAjudaCusto,
      comissao_extra: valorComissaoExtra,
      finalizado_em: null,
      finalizado_por: null,
      gerente_visualizado_em: null,
      gerente_visualizado_por: null,
      gerente_confirmado_em: null,
      gerente_confirmado_por: null,
      atualizado_em: atualizadoEm,
    })
    .eq('gerente', gerente)
    .eq('rota', rota)
    .eq('competencia', competencia)
    .eq('dia', dia || '');
  if (statusError) {
    throw await reportarErroDados(statusError, { acao: 'atualizar_status_fechamento_rota', gerente, rota, competencia, dia });
  }

  const { data, error } = await supabase
    .from('fechamentos_rotas')
    .upsert(rows, { onConflict: 'gerente,rota,competencia,dia,modalidade' })
    .select();
  if (error) {
    const msg = String(error.message || '');
    if (msg.includes('fechamentos_rotas') || msg.includes('schema cache')) {
      throw new Error('A tabela fechamentos_rotas ainda não existe no Supabase. Rode a migração de fechamento e tente novamente.');
    }
    throw await reportarErroDados(error, { acao: 'salvar_fechamento_rota', gerente, rota, competencia, dia });
  }
  await registrarAcaoCritica({
    acao: 'salvar_fechamento_rota',
    mensagem: enviarAoGerente ? 'Fechamento de rota enviado ao gerente.' : 'Fechamento de rota salvo como rascunho.',
    contexto: { gerente, rota, competencia, dia, modalidades: rows.length, enviarAoGerente },
  });
  return data.map(mapFechamentoRota);
}

export async function registrarVisualizacaoFechamento({ gerente, rota, competencia, dia = '' }) {
  const { data, error } = await supabase.rpc('registrar_visualizacao_fechamento', {
    p_gerente: gerente,
    p_rota: rota,
    p_competencia: competencia,
    p_dia: dia || '',
  });
  if (error) throw new Error(error.message);
  return (data || []).map(mapFechamentoRota);
}

export async function confirmarFechamentoGerente({ gerente, rota, competencia, dia = '' }) {
  const { data, error } = await supabase.rpc('confirmar_fechamento_gerente', {
    p_gerente: gerente,
    p_rota: rota,
    p_competencia: competencia,
    p_dia: dia || '',
  });
  if (error) throw await reportarErroDados(error, { acao: 'confirmar_fechamento_gerente', gerente, rota, competencia, dia });
  await registrarAcaoCritica({
    acao: 'confirmar_fechamento_gerente',
    mensagem: 'Gerente confirmou fechamento.',
    contexto: { gerente, rota, competencia, dia },
  });
  return (data || []).map(mapFechamentoRota);
}

export async function finalizarPrestacaoRota({ gerente, rota, competencia, dia = '' }) {
  if (!gerente || !rota || !competencia) throw new Error('Selecione gerente, rota e competência para finalizar.');
  const { data: authData } = await supabase.auth.getUser();
  const payload = {
    finalizado_em: new Date().toISOString(),
    finalizado_por: authData?.user?.id || null,
    atualizado_em: new Date().toISOString(),
  };
  const { data, error } = await supabase
    .from('fechamentos_rotas')
    .update(payload)
    .eq('gerente', gerente)
    .eq('rota', rota)
    .eq('competencia', competencia)
    .eq('dia', dia || '')
    .select();
  if (error) throw await reportarErroDados(error, { acao: 'finalizar_prestacao_rota', gerente, rota, competencia, dia });
  await registrarAcaoCritica({
    acao: 'finalizar_prestacao_rota',
    mensagem: 'Prestacao de contas finalizada pelo administrativo.',
    contexto: { gerente, rota, competencia, dia },
  });
  return data.map(mapFechamentoRota);
}

export async function enviarPixParaGerente({ chave, gerente, rota, mensagem }) {
  if (!chave?.chave) throw new Error('Selecione uma chave PIX.');
  if (!gerente) throw new Error('Selecione o gerente que receberá o aviso.');
  const { data: authData } = await supabase.auth.getUser();
  const row = {
    pix_chave_id: typeof chave.id === 'number' ? chave.id : null,
    pix_nome: chave.nome,
    pix_tipo: chave.tipo,
    pix_chave: chave.chave,
    pix_banco: chave.banco || '',
    gerente,
    rota: rota || '',
    mensagem: normalizeFreeText(mensagem || ''),
    enviado_por: authData?.user?.id || null,
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
    throw await reportarErroDados(error, { acao: 'enviar_pix_para_gerente', gerente, rota });
  }
  await registrarAcaoCritica({
    acao: 'enviar_pix_para_gerente',
    mensagem: 'Chave PIX enviada para consulta do gerente.',
    contexto: { gerente, rota, pixChaveId: chave.id || null },
  });
  return mapPixEnvio(data);
}

function mapDespesaMensal(row) {
  return {
    id: row.id, pontoId: row.ponto_id, competencia: row.competencia,
    gerente: normalizeFreeText(row.gerente || ''), rota: normalizeFreeText(row.rota || ''),
    descricao: normalizeFreeText(row.descricao || ''), tipo: row.tipo,
    valorPrevisto: Number(row.valor_previsto) || 0, valorReal: Number(row.valor_real) || 0,
    observacao: normalizeFreeText(row.observacao || ''), criadoEm: row.criado_em || '',
  };
}

function mapPixChave(row) {
  return {
    id: row.id,
    nome: row.nome || '',
    tipo: row.tipo || 'Chave PIX',
    chave: row.chave || '',
    banco: row.banco || '',
    observacao: normalizeFreeText(row.observacao || ''),
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
    mensagem: normalizeFreeText(row.mensagem || ''),
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
    comissaoAutomatica: row.comissao_automatica !== false,
    percentualComissao: Number(row.percentual_comissao) || 0,
    saida: Number(row.saida) || 0,
    saldoBruto: Number(row.saldo_bruto) || 0,
    subtrairDespesasPlayBet: Number(row.subtrair_despesas_play_bet) || 0,
    ajudaCusto: Number(row.ajuda_custo) || 0,
    comissaoExtra: Number(row.comissao_extra) || 0,
    atualizadoEm: row.atualizado_em || '',
    enviadoEm: row.enviado_em || '',
    finalizadoEm: row.finalizado_em || '',
    finalizadoPor: row.finalizado_por || '',
    gerenteVisualizadoEm: row.gerente_visualizado_em || '',
    gerenteVisualizadoPor: row.gerente_visualizado_por || '',
    gerenteConfirmadoEm: row.gerente_confirmado_em || '',
    gerenteConfirmadoPor: row.gerente_confirmado_por || '',
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
    mensagem: normalizeFreeText(row.mensagem || ''),
    lidaEm: row.lida_em || '',
    criadoEm: row.created_at || '',
  };
}

function mapEquipamento(row) {
  return {
    id: row.id, nome: row.nome, categoria: row.categoria,
    quantidade: 1, status: normalizarStatus(row.status), minimo: row.minimo,
    observacao: normalizeFreeText(row.observacao || ''), localizacao: row.localizacao || '',
    responsavel: row.responsavel || '', patrimonio: row.patrimonio || '',
    dataCadastro: row.data_cadastro || '',
    gerenteResponsavel: row.gerente_responsavel || '',
    transferenciaStatus: row.transferencia_status || '',
    transferenciaEnviadaEm: row.transferencia_enviada_em || '',
    transferenciaRecebidaEm: row.transferencia_recebida_em || '',
    consertoDefeito: normalizeFreeText(row.conserto_defeito || ''),
    consertoAssistencia: row.conserto_assistencia || '',
    consertoPrevisao: row.conserto_previsao || '',
    consertoPix: row.conserto_pix || '',
    consertoValor: Number(row.conserto_valor) || 0,
    consertoNotaNome: row.conserto_nota_nome || '',
    consertoNotaArquivo: row.conserto_nota_arquivo || '',
    consertoSolicitadoEm: row.conserto_solicitado_em || '',
    consertoSolicitadoPor: row.conserto_solicitado_por || '',
    consertoFormaPagamento: row.conserto_forma_pagamento || '',
    consertoRetiradaEm: row.conserto_retirada_em || '',
    consertoPagamentoStatus: row.conserto_pagamento_status || '',
    consertoPagamentoSolicitadoEm: row.conserto_pagamento_solicitado_em || '',
    consertoPagamentoSolicitadoPor: row.conserto_pagamento_solicitado_por || '',
    consertoPagamentoConfirmadoEm: row.conserto_pagamento_confirmado_em || '',
    consertoPagamentoConfirmadoPor: row.conserto_pagamento_confirmado_por || '',
    consertoProtegidoCarregado: Boolean(row.__consertoCarregado),
  };
}

function desmapEquipamento(item) {
  return {
    nome: item.nome, categoria: item.categoria, quantidade: 1,
    status: item.status, minimo: item.minimo, observacao: normalizeFreeText(item.observacao || ''),
    localizacao: item.localizacao || '', responsavel: item.responsavel || '',
    patrimonio: item.patrimonio || '', data_cadastro: item.dataCadastro || '',
    gerente_responsavel: item.gerenteResponsavel || '',
    transferencia_status: item.transferenciaStatus || '',
    transferencia_enviada_em: item.transferenciaEnviadaEm || null,
    transferencia_recebida_em: item.transferenciaRecebidaEm || null,
  };
}

function desmapConserto(item) {
  return {
    conserto_defeito: normalizeFreeText(item.consertoDefeito || '') || null,
    conserto_assistencia: item.consertoAssistencia || null,
    conserto_previsao: item.consertoPrevisao || null,
    conserto_pix: item.consertoPix || null,
    conserto_valor: Number(item.consertoValor) || 0,
    conserto_nota_nome: item.consertoNotaNome || null,
    conserto_nota_arquivo: item.consertoNotaArquivo || null,
    conserto_solicitado_em: item.consertoSolicitadoEm || null,
    conserto_solicitado_por: item.consertoSolicitadoPor || null,
    conserto_forma_pagamento: item.consertoFormaPagamento || null,
    conserto_retirada_em: item.consertoRetiradaEm || null,
    conserto_pagamento_status: item.consertoPagamentoStatus || null,
    conserto_pagamento_solicitado_em: item.consertoPagamentoSolicitadoEm || null,
    conserto_pagamento_solicitado_por: item.consertoPagamentoSolicitadoPor || null,
    conserto_pagamento_confirmado_em: item.consertoPagamentoConfirmadoEm || null,
    conserto_pagamento_confirmado_por: item.consertoPagamentoConfirmadoPor || null,
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
    observacao: normalizeFreeText(row.observacao || ''),
    situacaoOperacional: row.situacao_operacional || 'ativo',
    situacaoAlteradaEm: row.situacao_alterada_em || '',
    desativadoEm: row.desativado_em || '',
    versaoOperacional: Number(row.versao_operacional) || 1,
  };
}

function mapGerenteModalidadeAcesso(row) {
  return {
    id: row.id,
    gerente: row.gerente || '',
    modalidade: row.modalidade || '',
    login: row.login || '',
    senha: row.senha || '',
    link: row.link || '',
    observacao: normalizeFreeText(row.observacao || ''),
    criadoEm: row.criado_em || '',
    atualizadoEm: row.atualizado_em || '',
    atualizadoPor: row.atualizado_por || '',
  };
}

function mapModalidadeApp(row) {
  return {
    id: row.id,
    modalidade: row.modalidade || '',
    appTipo: row.app_tipo || 'padrao',
    appNome: row.app_nome || '',
    storagePath: row.storage_path || '',
    downloadUrl: row.download_url || '',
    tamanho: Number(row.tamanho) || 0,
    tipo: row.tipo || '',
    criadoEm: row.criado_em || '',
    atualizadoEm: row.atualizado_em || '',
    atualizadoPor: row.atualizado_por || '',
  };
}

function mapPontoModalidadeAcesso(row) {
  return {
    id: row.id,
    pontoId: row.ponto_id,
    modalidade: row.modalidade || '',
    login: row.login || '',
    senha: row.senha || '',
    observacao: normalizeFreeText(row.observacao || ''),
    criadoEm: row.criado_em || '',
    atualizadoEm: row.atualizado_em || '',
    atualizadoPor: row.atualizado_por || '',
  };
}

function mapSolicitacaoModalidade(row) {
  return {
    id: row.id,
    pontoId: row.ponto_id,
    pontoNome: row.ponto_nome || '',
    gerente: row.gerente || '',
    rota: row.rota || '',
    modalidade: row.modalidade || '',
    acao: row.acao || 'bloquear',
    detalhe: normalizeFreeText(row.detalhe || ''),
    status: row.status || 'pendente',
    criadoPor: row.criado_por || '',
    criadoEm: row.criado_em || '',
    concluidoEm: row.concluido_em || '',
  };
}

function mapSolicitacaoStatusPonto(row) {
  return {
    id: row.id,
    pontoId: row.ponto_id,
    pontoNome: row.ponto_nome || '',
    gerente: row.gerente || '',
    acao: row.acao || 'desativar',
    motivo: normalizeFreeText(row.motivo || ''),
    status: row.status || 'pendente',
    solicitadoPor: row.solicitado_por || '',
    solicitadoEm: row.solicitado_em || '',
    decididoPor: row.decidido_por || '',
    decididoEm: row.decidido_em || '',
    motivoDecisao: normalizeFreeText(row.motivo_decisao || ''),
    versaoPonto: Number(row.versao_ponto) || 1,
  };
}

function mapHistoricoStatusPonto(row) {
  return {
    id: row.id,
    pontoId: row.ponto_id,
    solicitacaoId: row.solicitacao_id ?? null,
    acao: row.acao || '',
    estadoAnterior: row.estado_anterior || '',
    estadoPosterior: row.estado_posterior || '',
    motivo: normalizeFreeText(row.motivo || ''),
    usuarioId: row.usuario_id || '',
    perfil: row.perfil || '',
    criadoEm: row.criado_em || '',
  };
}

function desmapPonto(ponto) {
  return {
    nome_fantasia: String(ponto.nomeFantasia || '').trim().replace(/\s+/g, ' ').toLocaleUpperCase('pt-BR'), nome_dono: ponto.nomeDono,
    telefone: ponto.telefone, gerente: ponto.gerente,
    modalidades: ponto.modalidades || [],
    possui_despesa: ponto.possuiDespesa, valor_despesa: ponto.valorDespesa || 0,
    observacao: normalizeFreeText(ponto.observacao || ''),
  };
}
