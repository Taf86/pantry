import { listItemSchema, pantryNodeSchema } from "pantry-shared";
import { describe, expect, it } from "vitest";

import { toListItem, toPantryNode } from "../src/services/mappers.js";

const CREATED = new Date("2026-08-11T10:00:00.000Z");
const UPDATED = new Date("2026-08-11T12:30:00.000Z");

const itemRow = {
  id: "01930d1e-0000-7000-8000-000000000001",
  listId: "01930d1e-0000-7000-8000-0000000000ff",
  name: "Latte",
  quantity: 2,
  unit: "l",
  categoryId: "latticini",
  note: null,
  checkedAt: null,
  checkedBy: null,
  sortOrder: 0,
  version: 1,
  createdAt: CREATED,
  updatedAt: UPDATED,
  deletedAt: null,
};

const nodeRow = {
  id: "01930d1e-0000-7000-8000-000000000002",
  pantryId: "01930d1e-0000-7000-8000-0000000000fe",
  parentId: null,
  kind: "item",
  name: "Biscotti",
  sortOrder: 3,
  quantity: 1,
  unit: "conf",
  categoryId: "colazione",
  expiresAt: "2026-09-01",
  minQuantity: 2,
  version: 4,
  createdAt: CREATED,
  updatedAt: UPDATED,
  deletedAt: null,
};

describe("toListItem", () => {
  it("serializza le date in ISO 8601, non come oggetti Date", () => {
    const dto = toListItem(itemRow);
    expect(dto.createdAt).toBe("2026-08-11T10:00:00.000Z");
    expect(dto.updatedAt).toBe("2026-08-11T12:30:00.000Z");
    expect(dto.deletedAt).toBeNull();
  });

  it("produce un DTO che rispetta lo schema condiviso", () => {
    expect(listItemSchema.safeParse(toListItem(itemRow)).success).toBe(true);
  });

  it("conserva il tombstone", () => {
    const dto = toListItem({ ...itemRow, deletedAt: UPDATED });
    expect(dto.deletedAt).toBe("2026-08-11T12:30:00.000Z");
  });
});

describe("toPantryNode", () => {
  it("produce un DTO che rispetta lo schema condiviso", () => {
    expect(pantryNodeSchema.safeParse(toPantryNode(nodeRow)).success).toBe(
      true,
    );
  });

  it("mantiene la scadenza come data pura, senza fuso orario", () => {
    expect(toPantryNode(nodeRow).expiresAt).toBe("2026-09-01");
  });

  it("normalizza un kind inatteso a 'container' invece di propagarlo", () => {
    expect(toPantryNode({ ...nodeRow, kind: "boh" }).kind).toBe("container");
  });
});
