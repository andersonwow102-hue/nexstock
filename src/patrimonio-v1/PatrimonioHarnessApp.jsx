import { useEffect, useMemo, useRef, useState } from "react";
import Icon from "./Icons.jsx";
import { buildLabelPrintJob, buildQrPayload } from "./integrationPoints.js";
import { createAssetQr } from "./patrimonioPdf.js";
import {
  CATEGORIES,
  PATRIMONY_FILTERS,
  batchItems,
  batchProgress,
  createPatrimonyFixture,
  filterInventory,
  formatNp,
  generateSimulatedBatch,
  inventorySummary,
  markDeployment,
  nextNpNumber,
  patrimonyClass,
  prepareBatchPreview,
  resolveAssetByCode,
  updateBatchStatus,
} from "./model.js";

const MODES = Object.freeze([
  { value: "overview", label: "Visão geral", icon: "ledger" },
  { value: "batches", label: "Lotes", icon: "layers" },
  { value: "deployment", label: "Implantação", icon: "deploy" },
]);

const EMPTY_FILTERS = Object.freeze({ category: "", patrimony: "all", readiness: "all" });
const READINESS_LABELS = Object.freeze({
  ready: "Apto",
  review: "Em revisão",
  coded: "Codificado",
  legacy: "Legado",
  non_asset: "Fora de escopo",
});
const DEPLOYMENT_LABELS = Object.freeze({
  pendente: "Sem código",
  etiqueta_pendente: "Etiqueta pendente",
  aplicado: "Aplicado",
  conferido: "Conferido",
  legado: "Legado",
  fora_escopo: "Não patrimoniável",
});
const BATCH_STATUS_LABELS = Object.freeze({
  labels_pending: "Etiquetas pendentes",
  labels_ready: "Etiquetas prontas",
  in_progress: "Em implantação",
  complete: "Concluído",
});

function readInitialParams() {
  const params = new URLSearchParams(window.location.search);
  const mode = params.get("modo");
  const theme = params.get("tema");
  const demoState = params.get("estado");
  return {
    mode: MODES.some((item) => item.value === mode) ? mode : "overview",
    theme: theme === "escuro" ? "escuro" : "claro",
    demoState: ["dados", "vazio", "erro"].includes(demoState) ? demoState : "dados",
  };
}

function syncParams({ mode, theme, demoState }) {
  const params = new URLSearchParams(window.location.search);
  params.set("modo", mode);
  params.set("tema", theme);
  if (demoState === "dados") params.delete("estado");
  else params.set("estado", demoState);
  window.history.replaceState(null, "", `${window.location.pathname}?${params.toString()}`);
}

function RovingTabs({ label, value, options, onChange, className = "" }) {
  const refs = useRef([]);
  function handleKeyDown(event, index) {
    if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const previous = event.key === "ArrowLeft" || event.key === "ArrowUp";
    const nextIndex = event.key === "Home"
      ? 0
      : event.key === "End"
        ? options.length - 1
        : (index + (previous ? -1 : 1) + options.length) % options.length;
    onChange(options[nextIndex].value);
    refs.current[nextIndex]?.focus();
  }
  return (
    <div aria-label={label} className={`pv-roving-tabs ${className}`} role="tablist">
      {options.map((option, index) => (
        <button
          aria-selected={value === option.value}
          className={value === option.value ? "is-active" : ""}
          key={option.value}
          onClick={() => onChange(option.value)}
          onKeyDown={(event) => handleKeyDown(event, index)}
          ref={(node) => { refs.current[index] = node; }}
          role="tab"
          tabIndex={value === option.value ? 0 : -1}
          type="button"
        >
          {option.icon ? <Icon name={option.icon} size={17} /> : null}
          <span>{option.label}</span>
        </button>
      ))}
    </div>
  );
}

function DevBar({ theme, onTheme, demoState, onDemoState }) {
  return (
    <header className="pv-devbar">
      <div className="pv-brand">
        <img alt="" src="/brand/neptera/icons/neptera-favicon-48.png" />
        <span><strong>NEPTERA</strong><small>EQUIPAMENTOS · PATRIMÔNIO</small></span>
      </div>
      <div className="pv-local-seal"><Icon name="shield" size={15} /><span>DEV LOCAL · MEMÓRIA DA SESSÃO</span></div>
      <div className="pv-lab-controls">
        <label><span>Estado</span><select onChange={(event) => onDemoState(event.target.value)} value={demoState}><option value="dados">Dados</option><option value="vazio">Vazio</option><option value="erro">Erro</option></select></label>
        <div aria-label="Tema" className="pv-theme-switch" role="group">
          <button aria-pressed={theme === "claro"} onClick={() => onTheme("claro")} title="Tema claro" type="button"><Icon name="sun" size={15} /><span>Claro</span></button>
          <button aria-pressed={theme === "escuro"} onClick={() => onTheme("escuro")} title="Tema escuro" type="button"><Icon name="moon" size={15} /><span>Escuro</span></button>
        </div>
      </div>
    </header>
  );
}

function PageHead({ onPrepare }) {
  return (
    <section className="pv-page-head">
      <div>
        <p>EQUIPAMENTOS <span>/</span> PATRIMÔNIO</p>
        <h1>Patrimônio</h1>
        <span>Numere, implante e confira etiquetas sem perder o vínculo técnico.</span>
      </div>
      <button className="pv-button pv-button--primary" onClick={onPrepare} type="button"><Icon name="tag" />Preparar lote</button>
    </section>
  );
}

function DeploymentRange({ summary, items, activeBatch }) {
  const progress = batchProgress(items, activeBatch);
  const next = nextNpNumber(items);
  const totalScope = Math.max(1, summary.ready + summary.npEmitted + summary.npApplied + summary.npVerified);
  const segments = [
    { key: "ready", label: "Candidatos", value: summary.ready, tone: "ready" },
    { key: "emitted", label: "Emitidos", value: summary.npEmitted, tone: "emitted" },
    { key: "applied", label: "Aplicados", value: summary.npApplied, tone: "applied" },
    { key: "verified", label: "Conferidos", value: summary.npVerified, tone: "verified" },
  ];
  return (
    <section className="pv-range" aria-label="Faixa de implantação patrimonial">
      <header>
        <div><small>PRÓXIMA FAIXA NP</small><strong>{formatNp(next)}</strong><span>sequência local disponível</span></div>
        <div className="pv-range__contract"><span>{summary.eligible} patrimoniáveis</span><span>{summary.withPatrimony} com patrimônio</span></div>
      </header>
      <div className="pv-range__rail" aria-hidden="true">
        {segments.map((segment) => <i className={`is-${segment.tone}`} key={segment.key} style={{ flexGrow: segment.value / totalScope }} />)}
      </div>
      <div className="pv-range__legend">
        {segments.map((segment) => <span key={segment.key}><i className={`is-${segment.tone}`} /><strong>{segment.value}</strong>{segment.label}</span>)}
      </div>
      <div className="pv-range__exclusions"><span>FORA DA FAIXA NP</span><strong>{summary.legacy} legados preservados</strong><strong>{summary.review} em revisão</strong><strong>{summary.nonPatrimonial} não patrimoniáveis</strong></div>
      {activeBatch ? (
        <div className="pv-range__batch">
          <span><small>LOTE EM TRABALHO</small><strong>{activeBatch.id}</strong><em>{activeBatch.rangeLabel}</em></span>
          <div>
            <span><b>{progress.applied}</b> aplicados · <b>{progress.verified}</b> conferidos de {progress.total}</span>
            <i aria-label={`${progress.verifiedPercent}% conferido`} style={{ "--pv-applied": `${progress.appliedPercent}%`, "--pv-verified": `${progress.verifiedPercent}%` }} />
          </div>
        </div>
      ) : null}
    </section>
  );
}

function PatrimonyBadge({ item }) {
  const kind = patrimonyClass(item);
  const label = kind === "np" ? item.patrimonyCode : kind === "legacy" ? item.patrimonyCode : kind === "non_asset" ? "Não patrimoniável" : "Sem patrimônio";
  return <span className={`pv-code-badge is-${kind}`}>{label}</span>;
}

function Ledger({ items, query, onQuery, filters, onFilter, limit, onLimit, onSelect, searchRef }) {
  const filtered = useMemo(() => filterInventory(items, filters, query), [items, filters, query]);
  const rendered = filtered.slice(0, limit);
  return (
    <section className="pv-ledger" aria-labelledby="ledger-title">
      <header className="pv-ledger__toolbar">
        <div className="pv-search"><Icon name="search" /><input aria-label="Buscar no patrimônio" onChange={(event) => onQuery(event.target.value)} placeholder="Buscar patrimônio, equipamento ou ID técnico" ref={searchRef} value={query} /><kbd>/</kbd></div>
        <label><span>Patrimônio</span><select onChange={(event) => onFilter("patrimony", event.target.value)} value={filters.patrimony}>{PATRIMONY_FILTERS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
        <label><span>Categoria</span><select onChange={(event) => onFilter("category", event.target.value)} value={filters.category}><option value="">Todas</option>{CATEGORIES.map((category) => <option key={category}>{category}</option>)}</select></label>
        <label><span>Situação</span><select onChange={(event) => onFilter("readiness", event.target.value)} value={filters.readiness}><option value="all">Todas</option><option value="ready">Aptos</option><option value="review">Em revisão</option><option value="coded">Codificados</option></select></label>
        <label className="pv-limit"><span>Lote</span><select onChange={(event) => onLimit(Number(event.target.value))} value={limit}><option value="12">12</option><option value="24">24</option><option value="50">50</option></select></label>
      </header>
      <div className="pv-ledger__meta"><h2 id="ledger-title">Inventory Ledger</h2><span><strong>{filtered.length}</strong> registros no recorte · exibindo {rendered.length}</span></div>
      <div className="pv-ledger__scroll">
        <table>
          <thead><tr><th>Reg.</th><th>Equipamento</th><th>Categoria</th><th>Patrimônio</th><th>Posição</th><th>Estado / lote</th><th><span className="pv-sr-only">Ação</span></th></tr></thead>
          <tbody>
            {rendered.map((item, index) => (
              <tr key={item.id}>
                <td data-label="Registro"><span className="pv-register">{String(index + 1).padStart(3, "0")}</span></td>
                <td data-label="Equipamento"><strong>{item.name}</strong><small>{item.technicalId}</small></td>
                <td data-label="Categoria"><span>{item.category}</span></td>
                <td data-label="Patrimônio"><PatrimonyBadge item={item} /></td>
                <td data-label="Posição"><strong>{item.location}</strong><small>{item.eligibility === "eligible" ? "Escopo de implantação" : "Referência de inventário"}</small></td>
                <td data-label="Estado / lote"><span className={`pv-state is-${item.readiness}`}>{READINESS_LABELS[item.readiness]}</span><small>{item.batchId || DEPLOYMENT_LABELS[item.deploymentState]}</small></td>
                <td><button aria-label={`Abrir dossiê de ${item.name}`} className="pv-row-action" onClick={() => onSelect(item.id)} type="button">Dossiê <Icon name="chevron" size={15} /></button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!rendered.length ? <div className="pv-inline-empty"><Icon name="search" size={24} /><strong>Nenhum registro neste recorte</strong><span>Revise a busca ou os filtros de patrimônio.</span></div> : null}
    </section>
  );
}

function Dossier({ item, onClose, onQrRequest }) {
  const closeRef = useRef(null);
  useEffect(() => {
    if (!item) return undefined;
    closeRef.current?.focus();
    function handleEscape(event) { if (event.key === "Escape") onClose(); }
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [item, onClose]);
  if (!item) return null;
  return (
    <div className="pv-overlay" onMouseDown={(event) => event.target === event.currentTarget && onClose()} role="presentation">
      <aside aria-labelledby="dossier-title" aria-modal="true" className="pv-dossier" role="dialog">
        <header><span><small>DOSSIÊ PATRIMONIAL</small><h2 id="dossier-title">{item.name}</h2><p>{item.technicalId}</p></span><button aria-label="Fechar dossiê" onClick={onClose} ref={closeRef} type="button"><Icon name="close" /></button></header>
        <div className="pv-dossier__identity"><PatrimonyBadge item={item} /><span>{DEPLOYMENT_LABELS[item.deploymentState]}</span></div>
        <dl>
          <div><dt>ID técnico</dt><dd>{item.technicalId}</dd></div>
          <div><dt>Categoria</dt><dd>{item.category}</dd></div>
          <div><dt>Posição atual</dt><dd>{item.location}</dd></div>
          <div><dt>Elegibilidade</dt><dd>{item.eligibility === "eligible" ? "Elegível" : item.eligibility === "legacy" ? "Máquina legado" : "Não patrimoniável"}</dd></div>
          <div><dt>Estado</dt><dd>{READINESS_LABELS[item.readiness]}</dd></div>
          <div><dt>Lote</dt><dd>{item.batchId || "Ainda sem lote"}</dd></div>
        </dl>
        <section><small>NOTA DE CONTROLE</small><p>{item.note}</p></section>
        <footer>
          <button className="pv-button pv-button--quiet" disabled={!item.patrimonyCode} onClick={() => onQrRequest(item)} type="button"><Icon name="qr" />Abrir QR fictício</button>
          <button className="pv-button pv-button--primary" onClick={onClose} type="button">Concluir leitura</button>
        </footer>
      </aside>
    </div>
  );
}

function QrPreviewDialog({ preview, onClose }) {
  const closeRef = useRef(null);
  useEffect(() => {
    closeRef.current?.focus();
    function handleEscape(event) { if (event.key === "Escape") onClose(); }
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [onClose]);
  return (
    <div className="pv-overlay" onMouseDown={(event) => event.target === event.currentTarget && onClose()} role="presentation">
      <section aria-labelledby="qr-preview-title" aria-modal="true" className="pv-qr-preview" role="dialog">
        <header><span><small>QR FICTÍCIO · PUBLIC_ID</small><h2 id="qr-preview-title">{preview.item.patrimonyCode}</h2></span><button aria-label="Fechar QR fictício" onClick={onClose} ref={closeRef} type="button"><Icon name="close" /></button></header>
        <img alt={`QR fictício de ${preview.item.patrimonyCode}`} src={preview.dataUrl} />
        <p>{preview.item.name}</p>
        <code>{preview.payload}</code>
        <footer><button className="pv-button pv-button--primary" onClick={onClose} type="button">Concluir leitura</button></footer>
      </section>
    </div>
  );
}

function ExclusionLine({ label, value }) {
  return <li><span>{label}</span><strong>{value}</strong></li>;
}

function BatchPreviewDialog({ preview, confirmed, onConfirmed, onClose, onGenerate }) {
  const headingRef = useRef(null);
  useEffect(() => {
    headingRef.current?.focus();
    function handleEscape(event) { if (event.key === "Escape") onClose(); }
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [onClose]);
  return (
    <div className="pv-overlay" onMouseDown={(event) => event.target === event.currentTarget && onClose()} role="presentation">
      <section aria-labelledby="batch-preview-title" aria-modal="true" className="pv-batch-preview" role="dialog">
        <header><span><small>PREVIEW DO LOTE · SEM GRAVAÇÃO</small><h2 id="batch-preview-title" ref={headingRef} tabIndex="-1">Confirme a faixa antes de gerar</h2></span><button aria-label="Fechar preview" onClick={onClose} type="button"><Icon name="close" /></button></header>
        <div className="pv-preview-range"><span>FAIXA ESTIMADA</span><strong>{preview.rangeLabel}</strong><small>{preview.included.length} códigos previstos · sequência ainda não consumida</small></div>
        <div className="pv-preview-ledger">
          <section><header><span>Incluídos</span><strong>{preview.included.length}</strong></header><p>Elegíveis, sem código e aptos no recorte atual.</p><ol>{preview.included.slice(0, 6).map((item, index) => <li key={item.id}><code>{formatNp(preview.rangeStart + index)}</code><span>{item.name}<small>{item.technicalId}</small></span></li>)}</ol>{preview.included.length > 6 ? <em>+ {preview.included.length - 6} itens na mesma regra</em> : null}</section>
          <section><header><span>Excluídos</span><strong>{preview.excluded.length}</strong></header><p>Nenhum destes registros receberá código neste lote.</p><ul><ExclusionLine label="Patrimoniáveis com legado" value={preview.excludedCounts.alreadyCoded} /><ExclusionLine label="Em revisão" value={preview.excludedCounts.review} /><ExclusionLine label="Não patrimoniáveis" value={preview.excludedCounts.nonPatrimonial} /><ExclusionLine label="Além do limite" value={preview.excludedCounts.beyondLimit} /></ul></section>
        </div>
        <label className="pv-explicit-confirm"><input checked={confirmed} onChange={(event) => onConfirmed(event.target.checked)} type="checkbox" /><span><strong>Confirmo a geração simulada desta faixa</strong><small>O resultado existe somente em memória e repetir esta confirmação não duplica o lote.</small></span></label>
        <footer><button className="pv-button pv-button--quiet" onClick={onClose} type="button">Cancelar</button><button className="pv-button pv-button--primary" disabled={!confirmed || !preview.included.length} onClick={onGenerate} type="button"><Icon name="tag" />Gerar lote simulado</button></footer>
      </section>
    </div>
  );
}

function EmptyBatches({ onPrepare }) {
  return <section className="pv-empty-panel"><span><Icon name="layers" size={28} /></span><small>FILA DE IMPLANTAÇÃO</small><h2>Nenhum lote foi preparado</h2><p>Monte um recorte na visão geral e confira incluídos, excluídos e faixa estimada antes de gerar.</p><button className="pv-button pv-button--primary" onClick={onPrepare} type="button">Preparar primeiro lote</button></section>;
}

function BatchesView({ batches, items, activeBatchId, onPrepare, onLabels, onWork }) {
  if (!batches.length) return <EmptyBatches onPrepare={onPrepare} />;
  return (
    <section className="pv-batches" aria-labelledby="batches-title">
      <header><div><small>FILA LOCAL</small><h2 id="batches-title">Lotes de implantação</h2><p>Etiquetas e trabalho de campo avançam pela mesma faixa.</p></div><button className="pv-button pv-button--quiet" onClick={onPrepare} type="button"><Icon name="tag" />Novo lote</button></header>
      <div className="pv-batch-lines">
        {batches.map((batch) => {
          const progress = batchProgress(items, batch);
          return (
            <article className={activeBatchId === batch.id ? "is-active" : ""} key={batch.id}>
              <span className="pv-batch-register">{batch.id}</span>
              <div className="pv-batch-main"><small>{batch.createdLabel}</small><strong>{batch.rangeLabel}</strong><span>{batch.itemIds.length} etiquetas · {BATCH_STATUS_LABELS[batch.status]}</span></div>
              <div className="pv-batch-progress"><span><b>{progress.applied}</b> aplicados <i /> <b>{progress.verified}</b> conferidos</span><div><i style={{ width: `${progress.appliedPercent}%` }} /><b style={{ width: `${progress.verifiedPercent}%` }} /></div></div>
              <div className="pv-batch-actions"><button onClick={() => onLabels(batch)} type="button"><Icon name="printer" />{batch.status === "labels_pending" ? "Preparar etiquetas" : "Reabrir etiquetas"}</button><button className="is-primary" onClick={() => onWork(batch)} type="button"><Icon name="play" />Abrir trabalho</button></div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function DeploymentResult({ result, onQr }) {
  if (!result) return null;
  const tone = result.tone || "info";
  return (
    <div className={`pv-work-result is-${tone}`} role="status">
      <Icon name={tone === "success" ? "check" : tone === "warning" ? "alert" : "info"} />
      <span><strong>{result.title}</strong><small>{result.detail}</small></span>
      {result.item?.patrimonyCode ? <button onClick={() => onQr(result.item)} type="button"><Icon name="qr" size={15} />QR</button> : null}
    </div>
  );
}

function DeploymentView({ batches, items, activeBatch, onActiveBatch, onItems, onQrRequest }) {
  const [workMode, setWorkMode] = useState("apply");
  const [code, setCode] = useState("");
  const [result, setResult] = useState(null);
  const inputRef = useRef(null);
  const progress = batchProgress(items, activeBatch);
  const rows = batchItems(items, activeBatch);

  useEffect(() => { setResult(null); setCode(""); }, [activeBatch?.id, workMode]);

  function submit(event) {
    event.preventDefault();
    const resolution = resolveAssetByCode(items, code, activeBatch?.itemIds || []);
    if (resolution.status !== "found") {
      const messages = {
        invalid: ["Formato incompleto", "Digite o código completo ou exatamente os últimos 4 ou 6 dígitos."],
        not_found: ["Código fora deste lote", "Confira a faixa ativa e tente novamente."],
        ambiguous: ["Código ambíguo", "Use o patrimônio completo para escolher um único equipamento."],
      };
      const [title, detail] = messages[resolution.status] || messages.not_found;
      setResult({ tone: "warning", title, detail });
      return;
    }
    const item = resolution.item;
    if (workMode === "verify" && item.deploymentState === "etiqueta_pendente") {
      setResult({ tone: "warning", title: "Aplicação ainda pendente", detail: `${item.patrimonyCode} precisa passar primeiro pelo modo Aplicar.`, item });
      return;
    }
    const marked = markDeployment(items, item.id, workMode);
    onItems(marked.items);
    setResult({
      tone: marked.changed ? "success" : "info",
      title: marked.changed ? (workMode === "apply" ? "Etiqueta aplicada" : "Etiqueta conferida") : "Leitura já registrada",
      detail: marked.changed ? `${item.patrimonyCode} · ${item.name}` : "A operação é idempotente; nenhum registro foi duplicado.",
      item: { ...item, deploymentState: workMode === "apply" ? "aplicado" : "conferido" },
    });
    setCode("");
    inputRef.current?.focus();
  }

  if (!batches.length || !activeBatch) {
    return <section className="pv-empty-panel"><span><Icon name="deploy" size={28} /></span><small>TRABALHO DE CAMPO</small><h2>Prepare um lote para começar</h2><p>Aplicação e conferência ficam separadas assim que uma faixa for gerada.</p></section>;
  }
  return (
    <section className="pv-deployment" aria-labelledby="deployment-title">
      <header className="pv-work-head">
        <div><small>TRABALHO ATIVO</small><h2 id="deployment-title">{activeBatch.id}</h2><p>{activeBatch.rangeLabel}</p></div>
        <label><span>Selecionar lote</span><select onChange={(event) => onActiveBatch(event.target.value)} value={activeBatch.id}>{batches.map((batch) => <option key={batch.id} value={batch.id}>{batch.id} · {batch.rangeLabel}</option>)}</select></label>
      </header>
      <div className="pv-work-progress"><span><small>PROGRESSÃO DO LOTE</small><strong>{progress.verified} / {progress.total}</strong><em>conferidos</em></span><div><i style={{ width: `${progress.appliedPercent}%` }} /><b style={{ width: `${progress.verifiedPercent}%` }} /></div><p><span><i className="is-applied" />{progress.applied} aplicados</span><span><i className="is-verified" />{progress.verified} conferidos</span><span>{progress.pending} por aplicar</span></p></div>
      <div className="pv-workspace">
        <section className="pv-code-station" data-work-mode={workMode}>
          <RovingTabs className="pv-work-tabs" label="Etapa do trabalho" onChange={setWorkMode} options={[{ value: "apply", label: "Aplicar etiqueta", icon: "tag" }, { value: "verify", label: "Conferir etiqueta", icon: "check" }]} value={workMode} />
          <div className="pv-station-copy"><small>{workMode === "apply" ? "ETAPA 1 · APLICAÇÃO" : "ETAPA 2 · CONFERÊNCIA"}</small><h3>{workMode === "apply" ? "Registrar etiqueta aplicada" : "Confirmar etiqueta no equipamento"}</h3><p>{workMode === "apply" ? "Cole a etiqueta física e registre o código." : "Faça uma leitura independente depois da aplicação."}</p></div>
          <form onSubmit={submit}><label><span>Código patrimonial</span><div><input autoComplete="off" inputMode="text" onChange={(event) => setCode(event.target.value)} placeholder="NP-000059 ou últimos 4/6" ref={inputRef} value={code} /><button className="pv-button pv-button--primary" type="submit">{workMode === "apply" ? "Registrar aplicação" : "Confirmar leitura"}<Icon name="arrow" /></button></div><small>Código completo ou finais com exatamente 4 ou 6 dígitos.</small></label></form>
          <DeploymentResult onQr={onQrRequest} result={result} />
        </section>
        <aside className="pv-work-queue"><header><span><small>FILA DO LOTE</small><strong>{rows.length} etiquetas</strong></span><em>{workMode === "apply" ? "Aplicação" : "Conferência"}</em></header><ol>{rows.slice(0, 12).map((item) => <li className={`is-${item.deploymentState}`} key={item.id}><button onClick={() => { setCode(item.patrimonyCode); inputRef.current?.focus(); }} type="button"><code>{item.patrimonyCode}</code><span>{item.name}<small>{DEPLOYMENT_LABELS[item.deploymentState]}</small></span><i>{item.deploymentState === "conferido" ? <Icon name="check" size={14} /> : item.deploymentState === "aplicado" ? "A" : "·"}</i></button></li>)}</ol>{rows.length > 12 ? <p>+ {rows.length - 12} registros no lote</p> : null}</aside>
      </div>
    </section>
  );
}

function DemoState({ kind, onReset }) {
  if (kind === "erro") return <section className="pv-demo-state is-error" role="alert"><span><Icon name="alert" size={28} /></span><small>EXCEÇÃO VISUAL DO HARNESS</small><h2>A leitura local não foi montada</h2><p>Nenhuma fonte real foi consultada e nenhum dado foi alterado.</p><button className="pv-button pv-button--primary" onClick={onReset} type="button">Voltar aos dados fictícios</button></section>;
  return <section className="pv-demo-state"><span><Icon name="ledger" size={28} /></span><small>ESTADO VAZIO DO HARNESS</small><h2>Sem registros para exibir</h2><p>Use o seletor de estado para restaurar a fixture local.</p><button className="pv-button pv-button--primary" onClick={onReset} type="button">Restaurar leitura</button></section>;
}

export default function PatrimonioHarnessApp({ onPdfRequest, onQrRequest } = {}) {
  const initial = useMemo(() => readInitialParams(), []);
  const [mode, setMode] = useState(initial.mode);
  const [theme, setTheme] = useState(initial.theme);
  const [demoState, setDemoState] = useState(initial.demoState);
  const [items, setItems] = useState(() => createPatrimonyFixture());
  const [batches, setBatches] = useState([]);
  const [activeBatchId, setActiveBatchId] = useState("");
  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [limit, setLimit] = useState(24);
  const [selectedId, setSelectedId] = useState("");
  const [preview, setPreview] = useState(null);
  const [previewConfirmed, setPreviewConfirmed] = useState(false);
  const [toast, setToast] = useState("");
  const [qrPreview, setQrPreview] = useState(null);
  const searchRef = useRef(null);

  const summary = useMemo(() => inventorySummary(items), [items]);
  const selectedItem = items.find((item) => item.id === selectedId) || null;
  const activeBatch = batches.find((batch) => batch.id === activeBatchId) || batches[0] || null;

  useEffect(() => syncParams({ mode, theme, demoState }), [mode, theme, demoState]);
  useEffect(() => {
    if (!toast) return undefined;
    const timeout = window.setTimeout(() => setToast(""), 3400);
    return () => window.clearTimeout(timeout);
  }, [toast]);
  useEffect(() => {
    function handleShortcut(event) {
      if (event.key !== "/" || ["INPUT", "SELECT", "TEXTAREA"].includes(document.activeElement?.tagName)) return;
      event.preventDefault();
      setMode("overview");
      window.requestAnimationFrame(() => searchRef.current?.focus());
    }
    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, []);

  function changeFilter(key, value) {
    setFilters((current) => ({ ...current, [key]: value }));
  }

  function openPreview() {
    setPreview(prepareBatchPreview(items, filters, query, limit));
    setPreviewConfirmed(false);
  }

  function generateBatch() {
    const generated = generateSimulatedBatch({ items, batches }, preview);
    if (!generated.batch) return;
    setItems(generated.items);
    setBatches(generated.batches);
    setActiveBatchId(generated.batch.id);
    setPreview(null);
    setPreviewConfirmed(false);
    setMode("batches");
    setToast(generated.reused ? `${generated.batch.id} já existia; nenhuma duplicação criada.` : `${generated.batch.id} gerado em memória.`);
  }

  async function prepareLabels(batch) {
    const request = buildLabelPrintJob(batch, items);
    try {
      await onPdfRequest?.(request);
      setBatches((current) => updateBatchStatus(current, batch.id, "labels_ready"));
      setToast(`PDF fictício de ${request.labels.length} etiquetas preparado localmente.`);
    } catch {
      setToast("Não foi possível preparar o PDF fictício desta faixa.");
    }
  }

  function openWork(batch) {
    setBatches((current) => updateBatchStatus(current, batch.id, "in_progress"));
    setActiveBatchId(batch.id);
    setMode("deployment");
  }

  async function requestQr(item) {
    const payload = buildQrPayload(item);
    try {
      const qr = await createAssetQr(item.publicId);
      const result = { ...qr, item };
      await onQrRequest?.(result);
      setQrPreview(result);
      setToast(`${item.patrimonyCode}: QR fictício preparado localmente.`);
    } catch {
      setToast("Não foi possível preparar o QR fictício.");
    }
  }

  return (
    <div className="patrimonio-v1-app" data-demo-state={demoState} data-harness="safe-local" data-theme={theme}>
      <a className="pv-skip-link" href="#pv-main">Ir para o conteúdo</a>
      <DevBar demoState={demoState} onDemoState={setDemoState} onTheme={setTheme} theme={theme} />
      <main id="pv-main">
        <PageHead onPrepare={openPreview} />
        <div className="pv-safety-note"><Icon name="shield" size={17} /><span><strong>Ambiente isolado.</strong> Fixtures fictícias, ações em memória e nenhum backend conectado.</span></div>
        <RovingTabs className="pv-mode-tabs" label="Modos de Patrimônio" onChange={setMode} options={MODES} value={mode} />
        <DeploymentRange activeBatch={activeBatch} items={items} summary={summary} />
        <div className="pv-content" role="tabpanel">
          {demoState !== "dados" ? <DemoState kind={demoState} onReset={() => setDemoState("dados")} /> : mode === "overview" ? <Ledger filters={filters} items={items} limit={limit} onFilter={changeFilter} onLimit={setLimit} onQuery={setQuery} onSelect={setSelectedId} query={query} searchRef={searchRef} /> : mode === "batches" ? <BatchesView activeBatchId={activeBatch?.id} batches={batches} items={items} onLabels={prepareLabels} onPrepare={openPreview} onWork={openWork} /> : <DeploymentView activeBatch={activeBatch} batches={batches} items={items} onActiveBatch={setActiveBatchId} onItems={setItems} onQrRequest={requestQr} />}
        </div>
      </main>
      <footer className="pv-footer"><span><Icon name="keyboard" size={15} />Setas alternam abas · / abre a busca · Esc fecha painéis</span><strong>HARNESS DEV · PATRIMÔNIO V1</strong></footer>
      {selectedItem ? <Dossier item={selectedItem} onClose={() => setSelectedId("")} onQrRequest={requestQr} /> : null}
      {preview ? <BatchPreviewDialog confirmed={previewConfirmed} onClose={() => setPreview(null)} onConfirmed={setPreviewConfirmed} onGenerate={generateBatch} preview={preview} /> : null}
      {qrPreview ? <QrPreviewDialog onClose={() => setQrPreview(null)} preview={qrPreview} /> : null}
      {toast ? <div aria-live="polite" className="pv-toast"><Icon name="check" size={17} />{toast}</div> : null}
    </div>
  );
}
