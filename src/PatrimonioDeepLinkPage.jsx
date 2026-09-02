import { useEffect, useMemo, useState } from "react";
import { carregarPerfilAtual, resolverPatrimonioPorPublicId } from "./db.js";
import {
  PATRIMONIO_GENERIC_MESSAGE,
  patrimonioViewModel,
} from "./patrimonioDeepLink.js";
import "./PatrimonioDeepLinkPage.css";

const BRAND = Object.freeze({
  logoDark: "/brand/neptera/neptera-logo-horizontal-dark.png",
  logoLight: "/brand/neptera/neptera-logo-horizontal-light.png",
});

function Detail({ label, value }) {
  if (!value) return null;
  return <div><dt>{label}</dt><dd>{value}</dd></div>;
}

export default function PatrimonioDeepLinkPage({ route, onLogout }) {
  const [attempt, setAttempt] = useState(0);
  const [lookup, setLookup] = useState({ status: route.valid ? "loading" : "ready", record: null, role: "consulta" });

  useEffect(() => {
    if (!route.valid) {
      setLookup({ status: "ready", record: null, role: "consulta" });
      return undefined;
    }
    let active = true;
    setLookup((current) => ({ ...current, status: "loading", record: null }));
    Promise.allSettled([
      resolverPatrimonioPorPublicId(route.publicId),
      carregarPerfilAtual(),
    ]).then(([patrimonyResult, profileResult]) => {
      if (!active) return;
      if (patrimonyResult.status === "rejected") {
        setLookup({ status: "error", record: null, role: "consulta" });
        return;
      }
      setLookup({
        status: "ready",
        record: patrimonyResult.value,
        role: profileResult.status === "fulfilled" ? profileResult.value?.perfil || "consulta" : "consulta",
      });
    });
    return () => { active = false; };
  }, [attempt, route.publicId, route.valid]);

  const view = useMemo(() => patrimonioViewModel({
    authenticated: true,
    route,
    status: lookup.status,
    record: lookup.record,
    role: lookup.role,
  }), [lookup, route]);

  return (
    <main className="patrimonio-deep-link-page">
      <section className="patrimonio-deep-link-shell" aria-labelledby="patrimonio-deep-link-title">
        <header>
          <picture>
            <source media="(prefers-color-scheme: dark)" srcSet={BRAND.logoLight} />
            <img src={BRAND.logoDark} alt="NEPTERA — Plataforma Operacional Integrada" />
          </picture>
          <span>IDENTIDADE PATRIMONIAL · ACESSO PROTEGIDO</span>
        </header>

        {view.kind === "loading" ? (
          <div className="patrimonio-deep-link-state" role="status">
            <span className="patrimonio-deep-link-pulse" aria-hidden="true" />
            <h1 id="patrimonio-deep-link-title">Consultando patrimônio</h1>
            <p>Validando sua sessão e o escopo de acesso.</p>
          </div>
        ) : null}

        {view.kind === "error" ? (
          <div className="patrimonio-deep-link-state is-error" role="alert">
            <span className="patrimonio-deep-link-symbol" aria-hidden="true">!</span>
            <h1 id="patrimonio-deep-link-title">Consulta indisponível</h1>
            <p>{view.message}</p>
            <button type="button" onClick={() => setAttempt((value) => value + 1)}>Tentar novamente</button>
          </div>
        ) : null}

        {view.kind === "unavailable" ? (
          <div className="patrimonio-deep-link-state is-neutral" role="status">
            <span className="patrimonio-deep-link-symbol" aria-hidden="true">?</span>
            <h1 id="patrimonio-deep-link-title">Consulta patrimonial</h1>
            <p>{view.message || PATRIMONIO_GENERIC_MESSAGE}</p>
          </div>
        ) : null}

        {view.kind === "resolved" ? (
          <div className="patrimonio-deep-link-result">
            <div className="patrimonio-deep-link-heading">
              <div>
                <span>IDENTIDADE NEPTERA</span>
                <h1 id="patrimonio-deep-link-title">{view.record.code}</h1>
                <p>{view.state.description}</p>
              </div>
              <strong data-state={view.record.state}>{view.state.label}</strong>
            </div>

            {view.record.equipmentName ? (
              <section aria-label="Equipamento vinculado">
                <span>EQUIPAMENTO VINCULADO</span>
                <h2>{view.record.equipmentName}</h2>
                <dl>
                  <Detail label="Categoria" value={view.record.equipmentCategory} />
                  <Detail label="Situação" value={view.record.equipmentStatus} />
                  <Detail label="Posição atual" value={view.record.equipmentLocation} />
                  <Detail label="Lote" value={view.record.batchCode} />
                </dl>
              </section>
            ) : null}

            {view.canActivate ? (
              <section className="patrimonio-deep-link-action" aria-label="Próxima ação">
                <span>PRÓXIMA AÇÃO</span>
                <h2>Ativar patrimônio</h2>
                <p>A identidade está disponível para um perfil operacional autorizado. A mutação permanecerá bloqueada até a implantação controlada do backend patrimonial.</p>
                <button type="button" disabled aria-describedby="patrimonio-activation-gate">Ativar patrimônio</button>
                <small id="patrimonio-activation-gate">Implantação ainda não liberada · nenhuma operação real será executada.</small>
              </section>
            ) : null}

            {view.activationDenied ? (
              <section className="patrimonio-deep-link-permission" role="status">
                <strong>Ativação não permitida para este perfil.</strong>
                <p>Nenhum catálogo global de equipamentos foi carregado.</p>
              </section>
            ) : null}
          </div>
        ) : null}

        <footer>
          <a href="/?modulo=equipamentos">Voltar ao sistema</a>
          <button type="button" onClick={onLogout}>Sair</button>
        </footer>
      </section>
    </main>
  );
}
