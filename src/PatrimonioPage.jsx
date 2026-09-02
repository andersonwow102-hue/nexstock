import { useEffect, useMemo, useState } from "react";
import { OperationIcon } from "./components/operations/OperationsUI.jsx";
import "./patrimonio-v1/patrimonio-v1.css";
import "./PatrimonioPage.css";

const EMPTY = Object.freeze({ catalogo: [], campanhas: [], lotes: [], patrimonios: [], eventos: [] });
const MUTATIONS_ENABLED = false;
const STATUS = Object.freeze({
  disponivel: "Disponível",
  vinculado: "Vinculado",
  aplicado: "Aplicado",
  conferido: "Conferido",
  anulado: "Anulado",
  baixado: "Baixado",
});

function Icon({ name, size = 17 }) {
  return <OperationIcon name={name} size={size} />;
}

function EmptyState({ role }) {
  return (
    <section className="pv-real-empty" aria-labelledby="patrimonio-empty-title">
      <span><Icon name="tag" size={28} /></span>
      <small>ESTRUTURA PATRIMONIAL PRONTA</small>
      <h2 id="patrimonio-empty-title">Patrimônio ainda não iniciado.</h2>
      <p>A estrutura está pronta. A implantação começa quando uma campanha for criada.</p>
      <div className="pv-real-empty__flow" aria-label="Próximas etapas">
        <span><strong>01</strong> Campanha</span><i />
        <span><strong>02</strong> Lote</span><i />
        <span><strong>03</strong> Implantação</span><i />
        <span><strong>04</strong> Conferência</span>
      </div>
      <button className="pv-button pv-button--primary" disabled={!MUTATIONS_ENABLED} type="button">
        <Icon name="plus" /> Criar primeira campanha
      </button>
      <small className="pv-real-gate">Implantação ainda não liberada para o perfil {role || "atual"}.</small>
    </section>
  );
}

function ReadOnlyLedger({ records }) {
  return (
    <section className="pv-ledger" aria-labelledby="patrimonio-ledger-title">
      <header className="pv-ledger-head"><div><small>FONTE OFICIAL · LEITURA RLS</small><h2 id="patrimonio-ledger-title">Inventory Ledger patrimonial</h2></div><span><strong>{records.length}</strong> registros</span></header>
      <div className="pv-ledger-scroll"><table><thead><tr><th>Patrimônio</th><th>Equipamento</th><th>Referência anterior</th><th>Posição atual</th><th>Situação</th></tr></thead>
        <tbody>{records.map((record) => <tr key={record.public_id}>
          <td data-label="Patrimônio"><strong>{record.codigo}</strong><small>ID público protegido</small></td>
          <td data-label="Equipamento"><strong>{record.equipamento_nome || "Etiqueta livre"}</strong><small>{record.equipamento_categoria || "Sem vínculo"}</small></td>
          <td data-label="Referência anterior"><strong>{record.referencias_anteriores?.[0]?.codigo || "—"}</strong><small>{record.referencias_anteriores?.length ? "Histórico preservado" : "Sem referência"}</small></td>
          <td data-label="Posição atual"><strong>{record.equipamento_localizacao || "Estoque / não vinculado"}</strong><small>{record.equipamento_status || "—"}</small></td>
          <td data-label="Situação"><span className={`pv-state is-${record.situacao}`}>{STATUS[record.situacao] || record.situacao}</span><small>{record.campanha_codigo || record.lote_codigo || "Fluxo direto"}</small></td>
        </tr>)}</tbody>
      </table></div>
    </section>
  );
}

export default function PatrimonioPage({ perfilAtual, theme = "escuro", loadData }) {
  const [data, setData] = useState(EMPTY);
  const [status, setStatus] = useState("loading");
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    setStatus("loading");
    if (typeof loadData !== "function") {
      setError("Fonte de leitura patrimonial não configurada.");
      setStatus("error");
      return undefined;
    }
    loadData().then((result) => {
      if (!active) return;
      setData(result);
      setStatus("ready");
    }).catch((reason) => {
      if (!active) return;
      setError(reason?.message || "Não foi possível carregar o controle patrimonial.");
      setStatus("error");
    });
    return () => { active = false; };
  }, [loadData]);

  const summary = useMemo(() => ({
    campanhas: data.campanhas.length,
    lotes: data.lotes.length,
    emitidos: data.patrimonios.length,
    disponiveis: data.patrimonios.filter((item) => item.situacao === "disponivel").length,
    vinculados: data.patrimonios.filter((item) => item.situacao === "vinculado").length,
    aplicados: data.patrimonios.filter((item) => item.situacao === "aplicado").length,
    conferidos: data.patrimonios.filter((item) => item.situacao === "conferido").length,
  }), [data]);
  const empty = status === "ready" && !data.campanhas.length && !data.lotes.length && !data.patrimonios.length;

  return (
    <div className="patrimonio-v1-app pv-real-page" data-theme={theme}>
      <section className="pv-page-head">
        <div><p>EQUIPAMENTOS <span>/</span> CONTROLE PATRIMONIAL</p><h1>Patrimônio</h1><span>Identidade física, implantação e conferência em uma leitura única.</span></div>
        <button className="pv-button pv-button--primary" disabled={!MUTATIONS_ENABLED} type="button"><Icon name="plus" />Nova campanha</button>
      </section>
      <div className="pv-real-readonly"><Icon name="shield" /><span><strong>Leitura operacional.</strong> A implantação ainda não está habilitada; nenhuma ação desta tela gera NP ou altera dados.</span></div>
      {status === "loading" ? <section className="pv-real-state" role="status"><span className="patrimonio-deep-link-pulse" /><h2>Carregando estrutura patrimonial</h2><p>Consultando somente as fontes permitidas ao seu perfil.</p></section> : null}
      {status === "error" ? <section className="pv-real-state is-error" role="alert"><Icon name="alert" size={25} /><h2>Leitura patrimonial indisponível</h2><p>{error}</p></section> : null}
      {status === "ready" ? <>
        {!empty ? <section aria-label="Resumo patrimonial" className="pv-summary-strip">
          {[[summary.campanhas,"Campanhas"],[summary.lotes,"Lotes"],[summary.emitidos,"Emitidos"],[summary.disponiveis,"Disponíveis"],[summary.vinculados,"Vinculados"],[summary.aplicados,"Aplicados"],[summary.conferidos,"Conferidos"]].map(([value,label]) => <div key={label}><strong>{value}</strong><span>{label}</span><small>dados reais</small></div>)}
        </section> : null}
        {empty ? <EmptyState role={perfilAtual?.perfil} /> : <ReadOnlyLedger records={data.patrimonios} />}
        <section className="pv-real-catalog" aria-label="Catálogo patrimonial"><div><small>CATÁLOGO ATIVO</small><h2>{data.catalogo.length} categorias operacionais</h2></div><p>{data.catalogo.filter((item) => item.patrimoniavel).length} patrimoniáveis · {data.catalogo.filter((item) => !item.patrimoniavel).map((item) => item.nome).join(", ") || "nenhuma exceção"} fora da emissão de NP.</p></section>
      </> : null}
    </div>
  );
}
