import * as Sentry from '@sentry/react';
import { supabase } from './supabase.js';

const SENSITIVE_KEYWORDS = [
  'senha',
  'password',
  'pass',
  'token',
  'secret',
  'authorization',
  'cookie',
  'pix',
  'chave',
  'cpf',
  'cnpj',
  'telefone',
  'phone',
  'email',
  'gerente',
  'nome',
  'responsavel',
  'remetente',
  'destino',
  'arquivo',
  'nota',
  'url',
  'link',
];

const MAX_TEXT_LENGTH = 600;
const MAX_STACK_LENGTH = 3000;

function isSensitiveKey(key = '') {
  const lower = String(key).toLowerCase();
  return SENSITIVE_KEYWORDS.some((word) => lower.includes(word));
}

function trimText(value, limit = MAX_TEXT_LENGTH) {
  const text = String(value ?? '');
  return text.length > limit ? `${text.slice(0, limit)}...` : text;
}

export function sanitizeForLog(value, depth = 0) {
  if (value == null) return value;
  if (depth > 3) return '[limite]';
  if (typeof value === 'string') return trimText(value);
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (value instanceof Error) {
    return {
      name: value.name,
      message: trimText(value.message),
      stack: trimText(value.stack || '', MAX_STACK_LENGTH),
    };
  }
  if (Array.isArray(value)) return value.slice(0, 20).map((item) => sanitizeForLog(item, depth + 1));
  if (typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).slice(0, 40).map(([key, item]) => [
        key,
        isSensitiveKey(key) ? '[protegido]' : sanitizeForLog(item, depth + 1),
      ]),
    );
  }
  return trimText(value);
}

export function setupSentry() {
  const dsn = import.meta.env.VITE_SENTRY_DSN;
  if (!dsn) return false;

  Sentry.init({
    dsn,
    environment: import.meta.env.VITE_APP_ENV || import.meta.env.MODE || 'production',
    sendDefaultPii: false,
    integrations: [
      Sentry.browserTracingIntegration(),
      Sentry.replayIntegration({
        maskAllText: true,
        blockAllMedia: true,
      }),
    ],
    beforeSend(event) {
      if (event.request) {
        delete event.request.cookies;
        delete event.request.headers;
      }
      if (event.extra) event.extra = sanitizeForLog(event.extra);
      if (event.contexts) event.contexts = sanitizeForLog(event.contexts);
      return event;
    },
    tracesSampleRate: import.meta.env.PROD ? 0.1 : 1,
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: import.meta.env.PROD ? 0.15 : 1,
  });

  return true;
}

export async function registrarLogInterno({
  nivel = 'info',
  categoria = 'frontend',
  acao = '',
  mensagem = '',
  erro = null,
  contexto = {},
} = {}) {
  try {
    const errorLike = erro instanceof Error ? erro : null;
    const payload = {
      p_nivel: nivel,
      p_categoria: categoria,
      p_acao: acao,
      p_mensagem: trimText(mensagem || errorLike?.message || ''),
      p_contexto: sanitizeForLog({
        ...contexto,
        url: window.location.pathname,
        userAgent: navigator.userAgent,
      }),
      p_erro_nome: errorLike?.name || '',
      p_erro_mensagem: trimText(errorLike?.message || ''),
      p_erro_stack: trimText(errorLike?.stack || '', MAX_STACK_LENGTH),
    };

    const { error } = await supabase.rpc('registrar_system_log', payload);
    if (error) throw error;

    if (['erro', 'critico'].includes(String(nivel))) {
      supabase.functions.invoke('enviar-alerta-operacional', {
        body: {
          nivel,
          categoria,
          acao,
          mensagem: payload.p_mensagem,
          erro: {
            nome: payload.p_erro_nome,
            mensagem: payload.p_erro_mensagem,
          },
          contexto: payload.p_contexto,
        },
      }).catch(() => {});
    }
  } catch (logError) {
    console.warn('Falha ao registrar log interno:', logError);
  }
}

export async function registrarErroOperacional(erro, contexto = {}) {
  Sentry.captureException(erro, { extra: sanitizeForLog(contexto) });
  await registrarLogInterno({
    nivel: 'erro',
    categoria: contexto.categoria || 'frontend',
    acao: contexto.acao || 'erro_operacional',
    mensagem: contexto.mensagem || erro?.message || 'Erro operacional capturado.',
    erro,
    contexto,
  });
}

export async function registrarAcaoCritica({ acao, mensagem, contexto = {}, nivel = 'info', categoria = 'operacao' }) {
  await registrarLogInterno({ nivel, categoria, acao, mensagem, contexto });
}
