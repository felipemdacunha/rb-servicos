import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS } from "../shared/domain";
import { analyzeSheets, buildOrders, findHeaderRow, guessMapping, parseDate, parseServiceType, type Cell } from "../shared/import";

const options = { defaultType: null, valueIncludesKm: false, status: "concluida" as const };

// Planilha "de verdade": título, linha vazia, colunas que não interessam, formatos variados e linha de total.
const messy: Cell[][] = [
  ["Controle de serviços - Localiza", null, null, null],
  [],
  ["Cliente", "Nº OS", "Data do Atendimento", "Modelo", "Placa", "Cor", "Atividade", "KM inicial", "Km rodado", "Cidade", "Valor (R$)", "Pago?"],
  ["Localiza", "458812", new Date(Date.UTC(2026, 9, 2)), "Onix Plus", "IXZ-1A23", "Prata", "Retirada de rastreador", 45210, null, "Pelotas", 40, "sim"],
  ["Localiza", "458813", "08/10/2026", "Renegade", "rga2b11", "Preto", "Assistência técnica", 1200, 120, "Rio Grande", "R$ 80,00", "não"],
  ["Localiza", "", 46310, "T-Cross", "IUP9C88", "Branco", "INSTALAÇÃO", null, "", "Pelotas", "150,00", ""],
  ["Localiza", "", "15/10/26 14:30", "Kwid", "ABC1234", "", "Troca de chip", null, null, "", 40, ""],
  ["Localiza", "", "31/02/2026", "Gol", "AAA1B22", "", "Retirada", null, null, "", 40, ""],
  ["Localiza", "", "20/10/2026", "Mobi", "XX", "", "Retirada", null, null, "", "", ""],
  ["Localiza", "", "21/10/2026", "Argo", "BBB2C33", "", "Instalação", null, null, "", "", ""],
  [null, null, null, null, null, null, null, null, null, "TOTAL", 350],
];

describe("importação de planilha", () => {
  it("acha a linha de títulos e as colunas certas, ignorando as outras", () => {
    const header = findHeaderRow(messy);
    expect(header).toBe(2);
    const m = guessMapping(messy[2]!);
    expect(m).toMatchObject({ reference: 1, date: 2, vehicle: 3, plate: 4, serviceType: 6, km: 8, city: 9, serviceValue: 10 });
  });

  it("converte as linhas e explica os erros", () => {
    const sheet = analyzeSheets([{ name: "Plan1", rows: messy }])[0]!;
    const rows = buildOrders(sheet.rows, sheet.headerRow, sheet.mapping, options, DEFAULT_SETTINGS);
    const ok = rows.filter(r => r.order).map(r => r.order!);
    const errors = rows.filter(r => r.error).map(r => `${r.line}: ${r.error}`);

    expect(ok.map(o => [o.date, o.plate, o.serviceType, o.serviceValue, o.km])).toEqual([
      ["2026-10-02", "IXZ1A23", "retirada", 4000, 0],
      ["2026-10-08", "RGA2B11", "assistencia", 8000, 120],
      ["2026-10-15", "IUP9C88", "instalacao", 15000, 0],
    ]);
    expect(ok[0]!.reference).toBe("458812");
    expect(errors).toEqual([
      expect.stringMatching(/^7: Tipo de serviço não reconhecido: "Troca de chip"/),
      expect.stringMatching(/^8: Data inválida/),
      expect.stringMatching(/^9: Placa inválida/),
      expect.stringMatching(/^10: Sem valor \(Instalação/),
    ]);
  });

  it("usa a tabela de preços quando não há coluna de valor e tira o km quando o valor já inclui", () => {
    const rows: Cell[][] = [["Data", "Placa", "Serviço", "KM", "Total"], ["10/10/2026", "ABC1234", "Assistência", 50, 180]];
    const [withKm] = buildOrders(rows, 0, guessMapping(rows[0]!), { ...options, valueIncludesKm: true }, DEFAULT_SETTINGS);
    expect(withKm!.order!.serviceValue).toBe(8000); // 180 - 50 km × 2
    const noValue: Cell[][] = [["Data", "Placa"], ["10/10/2026", "ABC1234"]];
    const [fallback] = buildOrders(noValue, 0, guessMapping(noValue[0]!), { ...options, defaultType: "retirada" }, DEFAULT_SETTINGS);
    expect(fallback!.order).toMatchObject({ serviceType: "retirada", serviceValue: 4000, vehicle: "Não informado" });
  });

  it("entende datas e tipos escritos de jeitos diferentes", () => {
    expect(parseDate("2026-10-22")?.date).toBe("2026-10-22");
    expect(parseDate("22.10.2026")?.date).toBe("2026-10-22");
    expect(parseDate("22/10/2026 08h15")).toEqual({ date: "2026-10-22", time: "08:15" });
    expect(parseServiceType("Remoção")).toBe("retirada");
    expect(parseServiceType("Manutenção")).toBe("assistencia");
    expect(parseServiceType("")).toBeNull();
  });

  it("escolhe a aba com os serviços", () => {
    const sheets = analyzeSheets([
      { name: "Resumo", rows: [["Mês", "Total"], ["Out", 350]] },
      { name: "Serviços", rows: messy },
    ]);
    expect(sheets[0]!.name).toBe("Serviços");
  });
});
