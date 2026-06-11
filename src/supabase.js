import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_KEY;

const MARCADOR_RECUPERACAO = 'stockon_recuperacao_senha';

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: {
    detectSessionInUrl: (_url, params) => {
      if (params.type === 'recovery') sessionStorage.setItem(MARCADOR_RECUPERACAO, '1');
      return true;
    },
  },
});

export function recuperacaoIniciada() {
  return sessionStorage.getItem(MARCADOR_RECUPERACAO) === '1';
}

export function limparRecuperacao() {
  sessionStorage.removeItem(MARCADOR_RECUPERACAO);
}
