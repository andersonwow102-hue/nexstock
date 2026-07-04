function valorCsvSeguro(valor) {
  let texto = valor == null ? "" : typeof valor === "number" ? valor.toLocaleString("pt-BR") : String(valor);
  if (/^[=+\-@\t\r]/.test(texto)) texto = `'${texto}`;
  return `"${texto.replace(/"/g, '""')}"`;
}

export function exportarCsvSeguro(dados, nomeArquivo) {
  const linhas = Array.isArray(dados) ? dados : [];
  if (linhas.length === 0) return;

  const colunas = Object.keys(linhas[0]);
  const conteudo = [
    colunas.map(valorCsvSeguro).join(";"),
    ...linhas.map(linha => colunas.map(coluna => valorCsvSeguro(linha[coluna])).join(";")),
  ].join("\r\n");

  const url = URL.createObjectURL(new Blob(["\uFEFF", conteudo], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = nomeArquivo.endsWith(".csv") ? nomeArquivo : `${nomeArquivo}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
