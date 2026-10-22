import { describe, expect, it } from "vitest";
import { orderTotal, parseMoney, summarize, validateOrder, type Order } from "../shared/domain";

const base: Order = {
  id: 1, date: "2026-10-10", time: null, vehicle: "Onix", plate: "ABC1D23", serviceType: "retirada",
  serviceValue: 4000, km: 0, kmRate: 200, city: null, reference: null, notes: null, status: "concluida",
};

describe("cálculos", () => {
  it("soma serviço + km a R$ 2,00", () => {
    expect(orderTotal({ serviceValue: 8000, km: 120, kmRate: 200 })).toBe(32000); // 80 + 240
  });

  it("fechamento conta só as concluídas", () => {
    const s = summarize([
      base,
      { ...base, id: 2, serviceType: "assistencia", serviceValue: 8000, km: 120, city: "Rio Grande" },
      { ...base, id: 3, status: "agendada" },
    ]);
    expect(s.count).toBe(2);
    expect(s.pending).toBe(1);
    expect(s.km).toBe(120);
    expect(s.kmTotal).toBe(24000);
    expect(s.total).toBe(4000 + 8000 + 24000);
  });

  it("lê valores digitados", () => {
    expect(parseMoney("40")).toBe(4000);
    expect(parseMoney("1.250,50")).toBe(125050);
    expect(parseMoney("80,5")).toBe(8050);
    expect(parseMoney("")).toBeNull();
  });

  it("valida e normaliza a placa", () => {
    const o = validateOrder({ ...base, plate: "abc-1234" });
    expect(o.plate).toBe("ABC1234");
    expect(() => validateOrder({ ...base, plate: "12" })).toThrow("Placa inválida");
  });
});
