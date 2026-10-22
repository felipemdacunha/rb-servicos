import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import {
  formatDate, formatKm, formatMoney, formatPlate, kmValue, monthLabel, orderTotal, SERVICE_LABELS, summarize, type Order, type Settings,
} from "@shared/domain";

type RGB = [number, number, number];
const NIGHT: RGB = [20, 21, 24];
const RED: RGB = [224, 52, 43];
const INK: RGB = [24, 25, 28];
const MUTED: RGB = [107, 111, 120];

async function loadImage(url: string) {
  const blob = await (await fetch(url)).blob();
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/** PDF do fechamento mensal: resumo, total a receber e lista detalhada para conferir com a NF. */
export async function downloadClosingPdf({ month, orders, settings }: { month: string; orders: Order[]; settings: Settings }) {
  const logo = await loadImage("/logo-pdf.png").catch(() => null);
  const company = settings.company;
  const summary = summarize(orders);
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4", compress: true });
  const title = `Fechamento de serviços · ${monthLabel(month)}`;
  doc.setProperties({ title, author: company.name, subject: `Serviços prestados para ${company.client}` });
  const generated = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" }).format(new Date());

  // Cabeçalho (repetido em todas as páginas)
  const header = () => {
    doc.setFillColor(...NIGHT);
    doc.rect(0, 0, 210, 38, "F");
    doc.setFillColor(...RED);
    doc.rect(0, 38, 210, 1.6, "F");
    if (logo) doc.addImage(logo, "PNG", 12, 4, 42.5, 30.2, "logo", "FAST");
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(15);
    doc.text("Fechamento de serviços", 198, 15, { align: "right" });
    doc.setFontSize(11);
    doc.setTextColor(...RED);
    doc.text(monthLabel(month).toUpperCase(), 198, 22, { align: "right" });
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(200, 200, 205);
    doc.text(`Tomador: ${company.client}`, 198, 29, { align: "right" });
  };
  const footer = () => {
    const page = doc.getNumberOfPages();
    doc.setDrawColor(226, 227, 230);
    doc.line(12, 284, 198, 284);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(...MUTED);
    const info = [company.name, company.document && `CNPJ/CPF ${company.document}`, company.phone, company.email, company.city].filter(Boolean).join("  ·  ");
    doc.text(info, 12, 289, { maxWidth: 150 });
    doc.text(`Gerado em ${generated}  ·  Página ${page}`, 198, 289, { align: "right" });
  };

  // Cabeçalho e rodapé uma vez em cada página (inclusive as criadas pelas tabelas).
  const decorated = new Set<number>();
  const decorate = () => {
    const page = doc.getCurrentPageInfo().pageNumber;
    if (decorated.has(page)) return;
    decorated.add(page);
    header();
    footer();
  };
  decorate();

  // Prestador / período
  let y = 48;
  doc.setTextColor(...MUTED);
  doc.setFontSize(7.5);
  doc.setFont("helvetica", "bold");
  doc.text("PRESTADOR", 12, y);
  doc.text("PERÍODO", 110, y);
  doc.setTextColor(...INK);
  doc.setFontSize(10);
  doc.text(company.name, 12, y + 5);
  doc.text(monthLabel(month), 110, y + 5);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(...MUTED);
  const details = [company.document && `CNPJ/CPF: ${company.document}`, company.city].filter(Boolean).join("  ·  ");
  if (details) doc.text(details, 12, y + 10);
  doc.text(`${summary.count} serviço(s) concluído(s)`, 110, y + 10);

  // Destaque do total
  y += 17;
  doc.setFillColor(...NIGHT);
  doc.roundedRect(12, y, 186, 22, 3, 3, "F");
  doc.setFillColor(...RED);
  doc.roundedRect(12, y, 3, 22, 1.5, 1.5, "F");
  doc.setTextColor(200, 200, 205);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.text("TOTAL A RECEBER", 20, y + 8);
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(18);
  doc.text(formatMoney(summary.total), 20, y + 17);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(200, 200, 205);
  doc.text(`Serviços ${formatMoney(summary.servicesTotal)}  +  Deslocamento ${formatMoney(summary.kmTotal)}`, 192, y + 13, { align: "right" });
  if (company.pix) doc.text(`PIX: ${company.pix}`, 192, y + 18, { align: "right" });

  const table = {
    styles: { font: "helvetica", fontSize: 8.5, cellPadding: 2.2, textColor: INK, lineColor: [226, 227, 230] as RGB, lineWidth: 0.1 },
    headStyles: { fillColor: NIGHT, textColor: 255, fontStyle: "bold" as const, fontSize: 8 },
    alternateRowStyles: { fillColor: [247, 247, 248] as RGB },
    margin: { left: 12, right: 12, top: 46, bottom: 18 },
    didDrawPage: decorate,
  };
  const lastY = () => (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;

  // Resumo por tipo de serviço
  autoTable(doc, {
    ...table,
    startY: y + 30,
    head: [["Resumo", "Quantidade", "Valor unitário", "Total"]],
    body: [
      ...summary.byService.filter(r => r.count).map(r => {
        const rates = new Set(orders.filter(o => o.serviceType === r.type).map(o => o.serviceValue));
        return [r.label, String(r.count), rates.size === 1 ? formatMoney([...rates][0]!) : "variado", formatMoney(r.total)];
      }),
      ...(summary.km ? [["Deslocamento (km rodado)", formatKm(summary.km), kmRatesLabel(orders), formatMoney(summary.kmTotal)]] : []),
    ],
    foot: [["TOTAL A RECEBER", "", "", formatMoney(summary.total)]],
    footStyles: { fillColor: RED, textColor: 255, fontStyle: "bold" },
    columnStyles: { 1: { halign: "center" }, 2: { halign: "right" }, 3: { halign: "right", fontStyle: "bold" } },
  });

  // Detalhe de cada OS (para bater com a NF)
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(...INK);
  doc.text("Serviços prestados", 12, lastY() + 10);
  autoTable(doc, {
    ...table,
    startY: lastY() + 13,
    head: [["Data", "Nº OS", "Veículo", "Placa", "Serviço", "Cidade", "Km", "Serviço R$", "Desloc. R$", "Total"]],
    body: orders.map(o => [
      formatDate(o.date), o.reference ?? "—", o.vehicle, formatPlate(o.plate), SERVICE_LABELS[o.serviceType], o.city ?? "—",
      o.km ? o.km.toLocaleString("pt-BR") : "—", formatMoney(o.serviceValue), o.km ? formatMoney(kmValue(o)) : "—", formatMoney(orderTotal(o)),
    ]),
    styles: { ...table.styles, fontSize: 7.5, cellPadding: 1.8 },
    columnStyles: { 3: { fontStyle: "bold" }, 6: { halign: "right" }, 7: { halign: "right" }, 8: { halign: "right" }, 9: { halign: "right", fontStyle: "bold" } },
  });

  // Assinatura
  let end = lastY() + 22;
  if (end > 270) { doc.addPage(); decorate(); end = 70; }
  doc.setDrawColor(...MUTED);
  doc.line(12, end, 92, end);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(...MUTED);
  doc.text(company.name, 12, end + 4);

  doc.save(`fechamento-${month}-${company.name.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^\w]+/g, "-").toLowerCase()}.pdf`);
}

function kmRatesLabel(orders: Order[]) {
  const rates = new Set(orders.filter(o => o.km > 0).map(o => o.kmRate));
  return rates.size === 1 ? `${formatMoney([...rates][0]!)}/km` : "variado";
}
