import jsPDF from "jspdf";
import autoTable from "jspdf-autotable/es";
import logo from "./assets/stock-on-light.png";

const AZUL = [15, 35, 72];
const DOURADO = [222, 147, 0];
const CINZA = [100, 116, 139];

function agora() {
  return new Date().toLocaleString("pt-BR", {
    day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

async function carregarImagem(url) {
  const resposta = await fetch(url);
  if (!resposta.ok) throw new Error("Logo nao carregada");
  const blob = await resposta.blob();
  return new Promise((resolve, reject) => {
    const leitor = new FileReader();
    leitor.onload = () => resolve(leitor.result);
    leitor.onerror = reject;
    leitor.readAsDataURL(blob);
  });
}

function baixarDocumento(doc, nomeArquivo) {
  const url = URL.createObjectURL(doc.output("blob"));
  const link = document.createElement("a");
  link.href = url;
  link.download = nomeArquivo;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function gerarRelatorioPDF({ titulo, descricao, nomeArquivo, colunas, linhas, total, secoes }) {
  try {
    const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
    const largura = doc.internal.pageSize.getWidth();
    const altura = doc.internal.pageSize.getHeight();

    doc.setFillColor(...AZUL);
    doc.rect(0, 0, largura, 33, "F");
    doc.setFillColor(...DOURADO);
    doc.rect(0, 32, largura, 1, "F");

    let inicioTitulo = 54;
    try {
      const imagem = await carregarImagem(logo);
      doc.addImage(imagem, "PNG", 12, 4, 35, 23, undefined, "FAST");
    } catch (erroLogo) {
      console.warn("Logo nao incorporada ao PDF; usando assinatura textual.", erroLogo);
      inicioTitulo = 46;
      doc.setTextColor(...DOURADO);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(17);
      doc.text("Stock-ON", 12, 19);
    }

    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(17);
    doc.text(titulo, inicioTitulo, 14);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.text(descricao, inicioTitulo, 21);
    doc.text(`Emitido em: ${agora()}  |  Total de registros: ${total}`, inicioTitulo, 27);

    const tabelas = secoes?.length ? secoes : [{ colunas, linhas }];
    let inicioTabela = 41;
    tabelas.forEach((secao) => {
      if (secao.titulo) {
        if (inicioTabela > altura - 32) {
          doc.addPage();
          inicioTabela = 18;
        }
        doc.setTextColor(...AZUL);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(11);
        doc.text(secao.titulo, 12, inicioTabela);
        inicioTabela += 5;
      }
      autoTable(doc, {
        startY: inicioTabela,
        head: [secao.colunas],
        body: secao.linhas,
        margin: { left: 12, right: 12, bottom: 18 },
        theme: "grid",
        styles: { fontSize: 8.5, cellPadding: 3.2, lineColor: [219, 228, 240], lineWidth: 0.2, textColor: AZUL },
        headStyles: { fillColor: AZUL, textColor: [255, 255, 255], fontStyle: "bold" },
        alternateRowStyles: { fillColor: [247, 249, 253] },
        didDrawPage: () => {
          doc.setDrawColor(222, 226, 234);
          doc.line(12, altura - 12, largura - 12, altura - 12);
          doc.setTextColor(...CINZA);
          doc.setFontSize(8);
          doc.text("Stock-ON | Seu estoque sempre ON.", 12, altura - 7);
          doc.text(`Pagina ${doc.internal.getNumberOfPages()}`, largura - 12, altura - 7, { align: "right" });
        },
      });
      inicioTabela = doc.lastAutoTable.finalY + 12;
    });
    baixarDocumento(doc, nomeArquivo);
  } catch (erro) {
    console.error("Erro ao gerar PDF:", erro);
    const detalhe = erro instanceof Error ? erro.message : "erro desconhecido";
    window.alert(`Nao foi possivel gerar o PDF. Motivo: ${detalhe}`);
  }
}
