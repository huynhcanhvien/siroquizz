import { describe, expect, it } from "vitest";
import { toCsv } from "./csv";

describe("toCsv", () => {
  it("quotes every cell and doubles embedded quotes", () => {
    expect(
      toCsv([
        ["Tên", "Ghi chú"],
        ["An", 'nói "xin chào", rồi về'],
      ]),
    ).toBe('﻿"Tên","Ghi chú"\r\n"An","nói ""xin chào"", rồi về"');
  });
  it("neutralises cells a spreadsheet would run as formulas", () => {
    expect(toCsv([["=1+1", "+cmd", "-2", "@SUM(A1)", "\tx", "ok"]])).toBe(
      '﻿"\'=1+1","\'+cmd","\'-2","\'@SUM(A1)","\'\tx","ok"',
    );
  });
  it("writes numbers and empty values plainly", () => {
    expect(toCsv([[50, null, undefined]])).toBe('﻿"50","",""');
  });
});
