export const PERFIS_DEVEDORES = Object.freeze(["gerente", "operador", "administrador", "consulta"]);

export function permissoesDevedores(perfil, perfilReal = true) {
  const valido = perfilReal && PERFIS_DEVEDORES.includes(perfil);
  return {
    acessar: valido,
    somenteLeitura: valido && perfil === "consulta",
    cadastrar: valido && perfil === "gerente",
    corrigirCadastro: valido && ["gerente", "administrador"].includes(perfil),
    negociar: valido && ["operador", "administrador"].includes(perfil),
    pagar: valido && ["operador", "administrador"].includes(perfil),
    substituirNegociacao: valido && ["operador", "administrador"].includes(perfil),
    estornar: valido && perfil === "administrador",
    corrigirAdministrativamente: valido && perfil === "administrador",
    excluirAdministrativamente: valido && perfil === "administrador",
  };
}

export function centavosDeEntrada(valor) {
  if (typeof valor === "number") return Number.isFinite(valor) ? Math.round(valor * 100) : 0;
  const texto = String(valor ?? "").replace(/\s/g, "").replace(/^R\$/i, "");
  if (!texto) return 0;
  const normalizado = texto.includes(",")
    ? texto.replace(/\./g, "").replace(",", ".")
    : texto;
  const numero = Number(normalizado);
  return Number.isFinite(numero) ? Math.round(numero * 100) : 0;
}

export function decimalDeCentavos(centavos) {
  return (Math.max(0, Number(centavos) || 0) / 100).toFixed(2);
}

export function formatarMoedaBR(valor) {
  const numero = typeof valor === "string" ? Number(valor) : Number(valor || 0);
  return (Number.isFinite(numero) ? numero : 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

export function formatarDataCivil(data) {
  const partes = String(data || "").slice(0, 10).split("-");
  if (partes.length !== 3) return "—";
  return `${partes[2]}/${partes[1]}/${partes[0]}`;
}

export function hojeEmSaoPaulo() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export function adicionarMesCivil(dataIso, meses) {
  const [ano, mes, dia] = String(dataIso).split("-").map(Number);
  if (!ano || !mes || !dia) return "";
  const indice = mes - 1 + meses;
  const novoAno = ano + Math.floor(indice / 12);
  const novoMes = ((indice % 12) + 12) % 12;
  const ultimoDia = new Date(Date.UTC(novoAno, novoMes + 1, 0)).getUTCDate();
  return `${novoAno}-${String(novoMes + 1).padStart(2, "0")}-${String(Math.min(dia, ultimoDia)).padStart(2, "0")}`;
}

export function preverParcelas(valor, quantidade, primeiroVencimento) {
  const total = centavosDeEntrada(valor);
  const parcelas = Number(quantidade);
  if (!Number.isInteger(parcelas) || parcelas < 1 || parcelas > 240 || total < parcelas) return [];
  const base = Math.floor(total / parcelas);
  return Array.from({ length: parcelas }, (_, indice) => ({
    numero: indice + 1,
    centavos: indice === parcelas - 1 ? total - base * (parcelas - 1) : base,
    valor: decimalDeCentavos(indice === parcelas - 1 ? total - base * (parcelas - 1) : base),
    vencimento: adicionarMesCivil(primeiroVencimento, indice),
  }));
}

export function criarChaveIdempotencia() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, caractere => {
    const aleatorio = Math.floor(Math.random() * 16);
    return (caractere === "x" ? aleatorio : (aleatorio & 0x3) | 0x8).toString(16);
  });
}

export function criarControleRequisicoes() {
  let sequencia = 0;
  return {
    iniciar() {
      sequencia += 1;
      return sequencia;
    },
    vigente(requisicao) {
      return requisicao === sequencia;
    },
    invalidar() {
      sequencia += 1;
    },
  };
}

export function mensagemErroDevedores(erro) {
  const codigo = String(erro?.code || erro?.status || "");
  const mensagem = String(erro?.message || erro || "Não foi possível concluir a operação.");
  if (codigo === "40001" || /vers[aã]o desatualizada|conflito de vers[aã]o/i.test(mensagem)) {
    return "Este registro foi alterado por outro usuário. Recarregue os dados e tente novamente.";
  }
  if (codigo === "42501" || /acesso negado|permiss|autoriz/i.test(mensagem)) {
    return "Seu perfil não tem autorização para executar esta ação.";
  }
  if (codigo === "P0002" || /não encontrad|nao encontrad/i.test(mensagem)) {
    return "O registro não foi encontrado ou não pertence ao seu escopo.";
  }
  if (codigo === "23505" || /já possui|ja possui|duplic/i.test(mensagem)) {
    return "A operação já foi registrada ou existe outro registro ativo.";
  }
  if (codigo === "22023" || codigo === "22003") return mensagem;
  return mensagem || "Não foi possível concluir a operação.";
}

export function situacaoApresentacao(situacao) {
  const chave = String(situacao || "aberta").toLowerCase();
  const rotulos = {
    aberta: "Aberta",
    negociada: "Negociada",
    parcialmente_paga: "Parcialmente paga",
    vencida: "Vencida",
    quitada: "Quitada",
    excluida: "Excluída administrativamente",
    pendente: "Pendente",
    paga: "Paga",
  };
  return rotulos[chave] || chave.replaceAll("_", " ");
}
