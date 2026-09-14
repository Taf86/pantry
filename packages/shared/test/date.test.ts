import { describe, expect, it } from "vitest";

import { serializeDates } from "../src/date.js";

describe("serializeDates", () => {
  it("converts top-level Date values to ISO strings", () => {
    const createdAt = new Date("2026-09-14T10:30:00.000Z");

    expect(serializeDates({ createdAt })).toEqual({
      createdAt: "2026-09-14T10:30:00.000Z",
    });
  });

  it("leaves primitives and null untouched", () => {
    const dto = {
      id: 42,
      name: "pantry",
      active: true,
      deletedAt: null,
      missing: undefined,
    };

    expect(serializeDates(dto)).toEqual(dto);
  });

  it("converts Dates nested in plain objects", () => {
    const dto = {
      user: {
        profile: { lastLoginAt: new Date("2026-01-02T03:04:05.678Z") },
      },
    };

    expect(serializeDates(dto)).toEqual({
      user: { profile: { lastLoginAt: "2026-01-02T03:04:05.678Z" } },
    });
  });

  it("converts Dates inside arrays, including nested arrays and objects", () => {
    const dto = {
      items: [
        { expiresAt: new Date("2026-03-01T00:00:00.000Z") },
        { expiresAt: new Date("2026-04-01T00:00:00.000Z") },
      ],
      matrix: [[new Date("2026-05-01T00:00:00.000Z")]],
    };

    expect(serializeDates(dto)).toEqual({
      items: [
        { expiresAt: "2026-03-01T00:00:00.000Z" },
        { expiresAt: "2026-04-01T00:00:00.000Z" },
      ],
      matrix: [["2026-05-01T00:00:00.000Z"]],
    });
  });

  it("preserves functions by reference", () => {
    const fn = () => "noop";

    expect(serializeDates({ fn }).fn).toBe(fn);
  });

  it("traverses objects created with a null prototype", () => {
    const nested = Object.create(null) as Record<string, unknown>;
    nested.updatedAt = new Date("2026-06-07T08:09:10.000Z");

    expect(serializeDates({ nested })).toEqual({
      nested: { updatedAt: "2026-06-07T08:09:10.000Z" },
    });
  });

  it("returns non-plain objects as-is, without traversing them", () => {
    class Row {
      constructor(public readonly createdAt: Date) {}
    }
    const row = new Row(new Date("2026-07-08T09:10:11.000Z"));
    const map = new Map([["createdAt", new Date("2026-07-08T09:10:11.000Z")]]);

    const result = serializeDates({ row, map });

    expect(result.row).toBe(row);
    expect(result.row.createdAt).toBeInstanceOf(Date);
    expect(result.map).toBe(map);
  });

  it("does not mutate the input dto", () => {
    const createdAt = new Date("2026-08-09T10:11:12.000Z");
    const dto = { nested: { createdAt }, items: [{ createdAt }] };

    const result = serializeDates(dto);

    expect(dto.nested.createdAt).toBe(createdAt);
    expect(dto.items[0]?.createdAt).toBe(createdAt);
    expect(result).not.toBe(dto);
    expect(result.nested).not.toBe(dto.nested);
  });

  it("produces a JSON-safe payload", () => {
    const dto = { createdAt: new Date("2026-09-14T10:30:00.000Z") };

    expect(JSON.parse(JSON.stringify(serializeDates(dto)))).toEqual({
      createdAt: "2026-09-14T10:30:00.000Z",
    });
  });

  it("throws on an invalid Date", () => {
    expect(() => serializeDates({ createdAt: new Date("nope") })).toThrow(
      RangeError,
    );
  });
});
