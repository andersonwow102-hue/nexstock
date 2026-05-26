const INICIOS = [
  "Pequenos avanços constroem grandes resultados.",
  "Organização hoje vira tranquilidade amanhã.",
  "A constância transforma trabalho em conquista.",
  "Cada detalhe bem cuidado fortalece o todo.",
  "Um passo claro vale mais que muita pressa.",
  "Seu esforço de hoje já prepara o próximo nível.",
  "Disciplina é a ponte entre ideia e resultado.",
  "Quem acompanha bem os detalhes decide melhor.",
  "Todo processo melhorado abre espaço para crescer.",
  "Foco no essencial faz o dia render mais.",
];

const MEIOS = [
  "Confie no processo",
  "Siga com atenção",
  "Faça bem o próximo passo",
  "Valorize o progresso",
  "Mantenha o ritmo",
  "Escolha com clareza",
  "Cuide do que depende de você",
  "Avance com propósito",
  "Transforme cuidado em resultado",
  "Continue construindo",
];

const FINAIS = [
  "o resultado aparece.",
  "hoje é um bom dia para avançar.",
  "a excelência nasce assim.",
  "cada movimento conta.",
  "o futuro agradece.",
];

function hashData(data) {
  let hash = 0;
  for (const caractere of data) hash = (hash * 31 + caractere.charCodeAt(0)) >>> 0;
  return hash;
}

export function getMensagemMotivacionalDoDia(data = new Date()) {
  const chave = [
    data.getFullYear(),
    String(data.getMonth() + 1).padStart(2, "0"),
    String(data.getDate()).padStart(2, "0"),
  ].join("-");
  const indice = hashData(chave) % (INICIOS.length * MEIOS.length * FINAIS.length);
  const inicio = INICIOS[indice % INICIOS.length];
  const meio = MEIOS[Math.floor(indice / INICIOS.length) % MEIOS.length];
  const final = FINAIS[Math.floor(indice / (INICIOS.length * MEIOS.length)) % FINAIS.length];
  return `${inicio} ${meio}; ${final}`;
}
