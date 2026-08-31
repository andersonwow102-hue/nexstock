import { useMemo } from "react";
import HistoricoTimelinePage from "./HistoricoTimelinePage.jsx";
import "./styles/foundations.css";
import "./styles/command-flow.css";
import "./HistoricoTimelinePreview.css";

const EQUIPMENT_NAMES = [
  "TERMINAL 0142",
  "TV HQ 32 BALCÃO",
  "IMPRESSORA TÉRMICA 08",
  "TABLET OPERACIONAL 12",
  "PDV TOUCHSCREEN 04",
];

const POINT_NAMES = ["Vale Azul", "São José", "Jardim América", "Praça Central"];

function minutesAgo(minutes) {
  return new Date(Date.now() - minutes * 60_000).toISOString();
}

function buildFixtures() {
  const equipmentHistory = Array.from({ length: 54 }, (_, index) => {
    const id = index + 1;
    const type = ["ponto", "edicao", "cadastro", "conserto", "envio_gerente", "disponivel"][index % 6];
    const point = POINT_NAMES[index % POINT_NAMES.length];
    const observations = {
      ponto: `Origem: Estoque interno | Destino: ${point}`,
      edicao: "Status: Disponível→Em rota",
      cadastro: "Equipamento cadastrado",
      conserto: "Operador aprovou e encaminhou para conserto | Defeito: tela sem imagem | Forma de pagamento: PIX | PIX conserto: dado-oculto",
      envio_gerente: `Enviado para gerente: Rota ${(index % 8) + 1}`,
      disponivel: "Disponibilizar",
    };
    return {
      id,
      tipo: type,
      itemId: 1000 + id,
      itemNome: EQUIPMENT_NAMES[index % EQUIPMENT_NAMES.length],
      categoria: ["Terminais", "Televisões", "Impressoras", "Tablets", "PDV Touchscreen"][index % 5],
      qtdAntes: type === "cadastro" ? 0 : 1,
      qtdDepois: type === "cadastro" ? 1 : 1,
      responsavel: index % 3 === 0 ? `Rota ${(index % 8) + 1}` : "",
      observacao: observations[type],
      data: new Date(Date.now() - index * 95 * 60_000).toLocaleString("pt-BR"),
      createdAt: minutesAgo(index * 95),
    };
  });

  const pointHistory = Array.from({ length: 22 }, (_, index) => ({
    id: index + 1,
    tipo: index % 2 === 0 ? "edicao" : "cadastro",
    nome: POINT_NAMES[index % POINT_NAMES.length],
    gerente: `Rota ${(index % 8) + 1}`,
    observacao: index % 2 === 0 ? "Ponto editado" : "Ponto cadastrado",
    data: new Date(Date.now() - (index * 210 + 42) * 60_000).toLocaleString("pt-BR"),
    createdAt: minutesAgo(index * 210 + 42),
  }));

  return { equipmentHistory, pointHistory };
}

function PreviewShell({ light, initialExpandedId, initialFiltersOpen }) {
  const fixtures = useMemo(() => buildFixtures(), []);
  return (
    <div className={`app operations-shell command-flow-shell module-historico history-preview-app${light ? " tema-claro" : ""}`}>
      <aside className="sidebar history-preview-sidebar" aria-label="Identificação da prévia">
        <div className="history-preview-brand"><span>N</span><strong>NEPTERA</strong></div>
        <div className="history-preview-note"><b>PREVIEW LOCAL</b><span>Fixture isolada</span><span>Zero escrita</span></div>
      </aside>
      <main className="main history-preview-main">
        <HistoricoTimelinePage
          equipmentHistory={fixtures.equipmentHistory}
          pointHistory={fixtures.pointHistory}
          initialExpandedId={initialExpandedId}
          initialFiltersOpen={initialFiltersOpen}
          onExportExcel={() => {}}
          onExportPdf={() => {}}
        />
      </main>
    </div>
  );
}

export default function HistoricoTimelinePreviewApp() {
  const params = useMemo(() => new URLSearchParams(window.location.search), []);
  const light = params.get("theme") !== "dark";
  const viewport = params.get("viewport") || "desktop";
  const initialExpandedId = params.get("expanded") === "1" ? "equipment:1" : null;
  const initialFiltersOpen = params.get("filters") === "open";

  if(viewport === "mobile"){
    const embeddedUrl = new URL(window.location.href);
    embeddedUrl.searchParams.set("viewport", "embedded");
    return (
      <main className={`history-preview-stage${light ? " tema-claro" : ""}`}>
        <div className="history-preview-device-label">390 × 844 · preview local</div>
        <iframe title="Histórico operacional em viewport mobile" src={embeddedUrl.toString()} />
      </main>
    );
  }

  return <PreviewShell light={light} initialExpandedId={initialExpandedId} initialFiltersOpen={initialFiltersOpen} />;
}
