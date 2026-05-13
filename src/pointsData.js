// ─── Constantes de Pontos ─────────────────────────────────────────────────────
export const GERENTES = [
  "Alex SG","Maynarden","Maynarden Jussara","Queixo","Wene",
  "João Luis","Beu","Yago Mirorós","Yago IBT","Yago Lapão","Vitor América","Vitor"
];

// Cor única por gerente
export const GERENTE_CORES = {
  "Alex SG":          { bg:"rgba(77,142,240,0.15)",  color:"#4d8ef0", border:"rgba(77,142,240,0.3)"   },
  "Maynarden":        { bg:"rgba(34,211,122,0.15)",  color:"#22d37a", border:"rgba(34,211,122,0.3)"   },
  "Maynarden Jussara":{ bg:"rgba(157,110,245,0.15)", color:"#9d6ef5", border:"rgba(157,110,245,0.3)"  },
  "Queixo":           { bg:"rgba(245,197,66,0.15)",  color:"#f5c542", border:"rgba(245,197,66,0.3)"   },
  "Wene":             { bg:"rgba(240,82,82,0.15)",   color:"#f05252", border:"rgba(240,82,82,0.3)"    },
  "João Luis":        { bg:"rgba(249,115,22,0.15)",  color:"#f97316", border:"rgba(249,115,22,0.3)"   },
  "Beu":              { bg:"rgba(20,184,166,0.15)",  color:"#14b8a6", border:"rgba(20,184,166,0.3)"   },
  "Yago Mirorós":     { bg:"rgba(236,72,153,0.15)",  color:"#ec4899", border:"rgba(236,72,153,0.3)"   },
  "Yago IBT":         { bg:"rgba(239,68,68,0.15)",   color:"#ef4444", border:"rgba(239,68,68,0.3)"    },
  "Yago Lapão":       { bg:"rgba(168,85,247,0.15)",  color:"#a855f7", border:"rgba(168,85,247,0.3)"   },
  "Vitor América":    { bg:"rgba(6,182,212,0.15)",   color:"#06b6d4", border:"rgba(6,182,212,0.3)"    },
  "Vitor":            { bg:"rgba(132,204,22,0.15)",  color:"#84cc16", border:"rgba(132,204,22,0.3)"   },
};

export const MODALIDADES = [
  "Viapix","90 da Sorte","Play Bet","Máquina de Brindes","Jogo do Bicho","Lotobanca"
];

export const formatarReais = (v) =>
  Number(v||0).toLocaleString("pt-BR",{style:"currency",currency:"BRL"});

export const parseMoeda = (s) => {
  const n = parseFloat(String(s).replace(/[^\d,]/g,"").replace(",","."));
  return isNaN(n) ? 0 : n;
};

export const agoraStr = () =>
  new Date().toLocaleString("pt-BR",{day:"2-digit",month:"2-digit",year:"numeric",hour:"2-digit",minute:"2-digit"});

export const DBPontos = {
  carregar:     () => { try { const v=localStorage.getItem("sc_pontos");      return v?JSON.parse(v):[]; } catch { return []; } },
  salvar:       (v) => { try { localStorage.setItem("sc_pontos",JSON.stringify(v)); } catch {} },
  carregarHist: () => { try { const v=localStorage.getItem("sc_pontos_hist"); return v?JSON.parse(v):[]; } catch { return []; } },
  salvarHist:   (v) => { try { localStorage.setItem("sc_pontos_hist",JSON.stringify(v)); } catch {} },
};

export const pontoFormVazio = {
  nomeFantasia:"", nomeDono:"", telefone:"", gerente:"",
  modalidades:[], possuiDespesa:"", valorDespesa:"", observacao:""
};

export function validarPonto(form) {
  if (!form.nomeFantasia.trim())   return "Nome fantasia é obrigatório.";
  if (!form.nomeDono.trim())       return "Nome do dono é obrigatório.";
  if (!form.telefone.trim())       return "Telefone é obrigatório.";
  if (!form.gerente)               return "Gerente responsável é obrigatório.";
  if (form.modalidades.length===0) return "Selecione pelo menos uma modalidade.";
  if (!form.possuiDespesa)         return "Informe se o ponto possui despesa.";
  if (form.possuiDespesa==="sim" && (!form.valorDespesa || parseMoeda(form.valorDespesa)<=0))
                                   return "Informe o valor da despesa.";
  return null;
}