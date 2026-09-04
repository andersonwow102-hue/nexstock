import React from "react";
import { createRoot } from "react-dom/client";
import PatrimonioPage from "../PatrimonioPage.jsx";
import { OperationIcon } from "../components/operations/OperationsUI.jsx";
import "../styles/foundations.css";
import "../styles/command-flow.css";
import "../App.css";
import "./preview.css";

const empty = Object.freeze({ catalogo: [
  { codigo: "terminais", nome: "Terminais", patrimoniavel: true, ordem: 1 },
  { codigo: "televisoes", nome: "Televisões", patrimoniavel: true, ordem: 2 },
  { codigo: "carregadores", nome: "Carregadores", patrimoniavel: true, ordem: 3 },
  { codigo: "impressoras", nome: "Impressoras", patrimoniavel: true, ordem: 4 },
  { codigo: "tablets", nome: "Tablets", patrimoniavel: true, ordem: 5 },
  { codigo: "maquina_brindes", nome: "Máquina de Brindes", patrimoniavel: false, ordem: 6 },
  { codigo: "noteiro", nome: "Noteiro", patrimoniavel: true, ordem: 7 },
  { codigo: "pdv_touchscreen", nome: "PDV Touchscreen", patrimoniavel: true, ordem: 8 },
  { codigo: "totens", nome: "Totens", patrimoniavel: true, ordem: 9 },
], campanhas: [], lotes: [], patrimonios: [], eventos: [] });
const loadEmpty = async () => empty;
const contextualBatch = Object.freeze({
  ...empty,
  campanhas: [{ id: "campanha-local", nome: "Implantação Patrimonial NEPTERA 2026", situacao: "ativa" }],
  lotes: [{
    id: "lote-local",
    codigo: "PAT-202609-0001",
    nome_amigavel: "Piloto Estoque — Etapa 1",
    campanha_nome: "Implantação Patrimonial NEPTERA 2026",
    contexto: "Estoque interno",
    contexto_label: "Estoque interno",
    demanda_contexto_no_preparo: 19,
    quantidade: 5,
    situacao: "preparado",
    geradas: 0,
    disponiveis: 0,
    vinculadas: 0,
    aplicadas: 0,
    conferidas: 0,
    anuladas: 0,
  }],
});

export function Preview() {
  const params = new URLSearchParams(window.location.search);
  const theme = params.get("tema") === "escuro" ? "escuro" : "claro";
  const role = ["administrador", "operador", "gerente", "consulta"].includes(params.get("perfil")) ? params.get("perfil") : "administrador";
  const hasBatch = params.get("cenario") === "lote";
  const loadData = async () => hasBatch ? contextualBatch : empty;
  return <div className={`preview-shell${theme === "claro" ? " tema-claro" : ""}`}><main><header className="preview-equipment-head"><div><small>CONTROLE DE EQUIPAMENTOS</small><h1>Equipamentos</h1></div><span>Prévia segura · {role}</span></header><nav aria-label="Visualização de equipamentos" className="preview-equipment-tabs">{[["package","Lista"],["activity","Resumo"],["history","Movimentações"],["tag","Patrimônio"]].map(([icon,label]) => <button aria-current={label === "Patrimônio" ? "page" : undefined} className={label === "Patrimônio" ? "is-active" : ""} key={label} type="button"><OperationIcon name={icon} size={16}/>{label}</button>)}</nav><PatrimonioPage loadData={loadData} perfilAtual={{ perfil: role }} theme={theme} /></main><aside>DEV · COMPONENTE REAL · {hasBatch ? "LOTE CONTEXTUAL" : "ESTADO VAZIO"}</aside></div>;
}

if (import.meta.env.DEV) createRoot(document.getElementById("root")).render(<Preview />);
