import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const page = fs.readFileSync(new URL('./PointsPage.jsx', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('./PointsCommandFlow.css', import.meta.url), 'utf8');

test('desktop usa inspector flutuante e mantém o ledger em largura integral', () => {
  assert.match(css, /@media \(min-width: 1361px\)[\s\S]*?\.pcf-master-detail\s*\{[\s\S]*?grid-template-columns:\s*minmax\(0, 1fr\)/);
  assert.match(css, /@media \(min-width: 1361px\)[\s\S]*?\.pcf-operations-folio:not\(\[role="dialog"\]\)\s*\{[\s\S]*?position:\s*fixed;[\s\S]*?inset:\s*calc\(var\(--cf-target[\s\S]*?overflow-y:\s*auto/);
  assert.match(css, /pcf-floating-inspector-in var\(--pcf-motion-panel\)/);
  assert.match(css, /\.pcf-folio-context\s*\{[\s\S]*?position:\s*sticky/);
  assert.doesNotMatch(page, /Selecione uma unidade para consultar seu registro operacional/);
  assert.match(page, /const dossieDesktopAberto=!dossieEmSheet&&Boolean\(pontoSelecionadoAtivoId\)/);
  assert.match(page, /if\(event\.key!=="Escape"\)return/);
});

test('Pendências usa a condição administrativa real e participa dos filtros', () => {
  assert.match(page, /solicitacoesStatus\.some\(s=>s\.status==="pendente"&&Number\(s\.pontoId\)===Number\(ponto\.id\)\)/);
  assert.match(page, /const mP=filtroPendencia==="todos"\|\|dados\.desativacaoPendente/);
  assert.match(page, /aria-pressed=\{filtroPendencia==="pendente"\}/);
  assert.match(page, /Somente pendências/);
  assert.match(page, /Pendências administrativas/);
});

test('cabeçalho contextual reúne identidade e status e permanece sticky no desktop', () => {
  const inicioContexto = page.indexOf('<div className="pcf-folio-context">');
  const fimContexto = page.indexOf('<dl className="pcf-folio-identity">', inicioContexto);
  const contexto = page.slice(inicioContexto, fimContexto);

  assert.ok(inicioContexto >= 0 && fimContexto > inicioContexto, 'contexto sticky do dossiê não encontrado');
  assert.match(contexto, /Registro operacional/);
  assert.match(contexto, /pcf-dossier-title/);
  assert.match(contexto, /rotaCanonica\(pontoSelecionado\.gerente\)/);
  assert.match(contexto, /pcf-dossier-status/);
  assert.match(css, /\.pcf-folio-context\s*\{[\s\S]*?position:\s*sticky;[\s\S]*?background:\s*var\(--pcf-depth-2\)/);
});

test('troca de ponto reinicia somente o scroll do dossiê permanente', () => {
  const inicioReset = page.indexOf('if(!pontoSelecionadoAtivoId||dossieEmSheet)return;');
  const fimReset = page.indexOf('},[pontoSelecionadoAtivoId,dossieEmSheet]);', inicioReset);
  const reset = page.slice(inicioReset, fimReset);

  assert.ok(inicioReset >= 0 && fimReset > inicioReset, 'efeito de reset do dossiê não encontrado');
  assert.match(reset, /dossieRef\.current/);
  assert.match(reset, /painel\.scrollTop=0/);
});

test('side sheet e bottom sheet preservam os contratos responsivos existentes', () => {
  assert.match(page, /PONTOS_DOSSIE_SHEET_QUERY = "\(max-width: 1360px\)"/);
  assert.match(css, /@media \(max-width: 1360px\)[\s\S]*?position:\s*fixed;[\s\S]*?height:\s*100dvh;[\s\S]*?overflow-y:\s*auto/);
  assert.match(css, /@media \(max-width: 680px\)[\s\S]*?inset:\s*auto 0 0;[\s\S]*?max-height:\s*min\(88dvh, 760px\)/);
  assert.match(page, /acquireMainScrollLock\(\)/);
  assert.match(page, /event\.key==="Escape"/);
  assert.match(page, /focoAntesDossieRef/);
});

test('polimento final reduz peso no Light e compacta o hero financeiro', () => {
  assert.match(css, /\.app\.tema-claro \.points-command-flow \.pcf-operations-ledger \.pcf-record\.is-selected\s*\{[\s\S]*?var\(--pcf-accent-wash\) 63%/);
  assert.match(css, /\.pcf-operations-ledger \.pcf-ledger-columns,[\s\S]*?font-size:\s*9px;[\s\S]*?font-weight:\s*650/);
  assert.match(css, /\.pcf-route-chapter > header h3\s*\{[\s\S]*?font-size:\s*13\.5px/);
  assert.match(css, /\.pcf-expenses-total strong\s*\{\s*font-size:\s*clamp\(31px, 3vw, 42px\)/);
  assert.match(css, /\.pcf-expenses-hero,[\s\S]*?align-items:\s*center;[\s\S]*?padding:\s*clamp\(18px, 2vw, 24px\)/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
});
