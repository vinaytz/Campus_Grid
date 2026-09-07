import { describe, it, expect } from "vitest";
import { parseCsv, parseRows, toCsv } from "@/lib/csv";

describe("parseCsv", () => {
  it("reads a plain table", () => {
    expect(parseCsv("a,b\n1,2\n3,4")).toEqual([["a", "b"], ["1", "2"], ["3", "4"]]);
  });

  it("handles quoted fields containing commas", () => {
    expect(parseCsv('name,note\n"Malik, Praveen",ok')).toEqual([
      ["name", "note"], ["Malik, Praveen", "ok"],
    ]);
  });

  it("handles doubled quotes as an escape", () => {
    expect(parseCsv('a\n"say ""hi"""')).toEqual([["a"], ['say "hi"']]);
  });

  it("handles embedded newlines inside quotes", () => {
    expect(parseCsv('a,b\n"one\ntwo",three')).toEqual([["a", "b"], ["one\ntwo", "three"]]);
  });

  it("handles CRLF line endings and a UTF-8 BOM", () => {
    expect(parseCsv("﻿a,b\r\n1,2\r\n")).toEqual([["a", "b"], ["1", "2"]]);
  });

  it("ignores a trailing newline rather than inventing an empty row", () => {
    expect(parseCsv("a,b\n1,2\n")).toHaveLength(2);
  });

  it("returns nothing for an empty file", () => {
    expect(parseCsv("")).toEqual([]);
  });
});

describe("parseRows header mapping", () => {
  const aliases = {
    code: ["room", "roomnumber", "room no"],
    capacity: ["seats"],
    capabilities: ["tags"],
  };

  it("maps canonical headers", () => {
    const { rows } = parseRows("code,capacity\n101,70", aliases);
    expect(rows).toEqual([{ code: "101", capacity: "70" }]);
  });

  it("maps aliases regardless of case, spaces, underscores and dashes", () => {
    const { rows } = parseRows("Room No,Seats\n101,70", aliases);
    expect(rows).toEqual([{ code: "101", capacity: "70" }]);

    const b = parseRows("room_number,SEATS\n102,60", aliases);
    expect(b.rows).toEqual([{ code: "102", capacity: "60" }]);
  });

  it("reports headers it does not recognise instead of dropping them silently", () => {
    const { unknown } = parseRows("code,mystery\n101,x", aliases);
    expect(unknown).toEqual(["mystery"]);
  });

  it("trims cell values and skips blank lines", () => {
    const { rows } = parseRows("code,capacity\n  101 , 70 \n\n", aliases);
    expect(rows).toEqual([{ code: "101", capacity: "70" }]);
  });

  it("handles a header-only file", () => {
    expect(parseRows("code,capacity", aliases).rows).toEqual([]);
  });
});

describe("toCsv", () => {
  it("quotes only what needs quoting", () => {
    expect(toCsv(["a", "b"], [["plain", "has,comma"]])).toBe('a,b\nplain,"has,comma"');
  });

  it("escapes embedded quotes", () => {
    expect(toCsv(["a"], [['say "hi"']])).toBe('a\n"say ""hi"""');
  });

  it("round-trips through parseCsv", () => {
    const rows = [["A", "101", "70", "COMPUTER;BYOD"], ["B", "3,02", 'quote"d']];
    const back = parseCsv(toCsv(["block", "code", "capacity", "tags"], rows));
    expect(back.slice(1)).toEqual(rows.map((r) => r.map(String)));
  });
});
