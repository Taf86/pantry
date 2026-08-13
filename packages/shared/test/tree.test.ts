import { describe, expect, it } from "vitest";

import {
  buildTree,
  depthOf,
  descendantIds,
  flattenTree,
  pathOf,
  wouldCycle,
} from "../src/domain/tree.js";
import type { PantryNode } from "../src/schemas/pantry.js";
import { makeNode } from "./factories.js";

/**
 * Armadio cucina
 *   └── Scaffale 1
 *         ├── Cassetto 1
 *         │     └── Biscotti
 *         └── Pasta
 * Frigo
 */
const nodes: PantryNode[] = [
  makeNode({ id: "armadio", name: "Armadio cucina", sortOrder: 0 }),
  makeNode({
    id: "scaffale",
    name: "Scaffale 1",
    parentId: "armadio",
    sortOrder: 0,
  }),
  makeNode({
    id: "cassetto",
    name: "Cassetto 1",
    parentId: "scaffale",
    sortOrder: 0,
  }),
  makeNode({
    id: "biscotti",
    name: "Biscotti",
    parentId: "cassetto",
    kind: "item",
    quantity: 2,
  }),
  makeNode({
    id: "pasta",
    name: "Pasta",
    parentId: "scaffale",
    kind: "item",
    sortOrder: 5,
    quantity: 3,
  }),
  makeNode({ id: "frigo", name: "Frigo", sortOrder: 10 }),
];

describe("buildTree", () => {
  it("materializza l'adjacency list in un albero ordinato", () => {
    const roots = buildTree(nodes);
    expect(roots.map((node) => node.id)).toEqual(["armadio", "frigo"]);

    const scaffale = roots[0]!.children[0]!;
    expect(scaffale.id).toBe("scaffale");
    expect(scaffale.children.map((node) => node.id)).toEqual([
      "cassetto",
      "pasta",
    ]);
  });

  it("promuove a radice i nodi il cui genitore non è nell'insieme", () => {
    const partial = nodes.filter((node) => node.id !== "armadio");
    const roots = buildTree(partial);
    expect(roots.map((node) => node.id).sort()).toEqual(["frigo", "scaffale"]);
  });

  it("non muta l'array in ingresso", () => {
    const snapshot = nodes.map((node) => node.id);
    buildTree(nodes);
    expect(nodes.map((node) => node.id)).toEqual(snapshot);
  });

  it("restituisce un albero vuoto per un insieme vuoto", () => {
    expect(buildTree([])).toEqual([]);
  });
});

describe("descendantIds", () => {
  it("raccoglie tutti i discendenti, escluso il nodo stesso", () => {
    expect([...descendantIds(nodes, "scaffale")].sort()).toEqual([
      "biscotti",
      "cassetto",
      "pasta",
    ]);
  });

  it("restituisce l'insieme vuoto per una foglia", () => {
    expect(descendantIds(nodes, "biscotti").size).toBe(0);
  });
});

describe("wouldCycle", () => {
  it("vieta di spostare un nodo dentro un proprio discendente", () => {
    expect(wouldCycle(nodes, "armadio", "cassetto")).toBe(true);
  });

  it("vieta di spostare un nodo dentro sé stesso", () => {
    expect(wouldCycle(nodes, "scaffale", "scaffale")).toBe(true);
  });

  it("consente lo spostamento verso un ramo indipendente", () => {
    expect(wouldCycle(nodes, "scaffale", "frigo")).toBe(false);
  });

  it("consente sempre la promozione a radice", () => {
    expect(wouldCycle(nodes, "cassetto", null)).toBe(false);
  });
});

describe("depthOf", () => {
  it("conta i livelli dalla radice", () => {
    expect(depthOf(nodes, "armadio")).toBe(0);
    expect(depthOf(nodes, "cassetto")).toBe(2);
    expect(depthOf(nodes, "biscotti")).toBe(3);
  });

  it("restituisce null su un ciclo, invece di girare all'infinito", () => {
    const cyclic = [
      { id: "a", parentId: "b" },
      { id: "b", parentId: "a" },
    ];
    expect(depthOf(cyclic, "a")).toBeNull();
  });
});

describe("pathOf", () => {
  it("compone il percorso leggibile dalla radice alla foglia", () => {
    expect(pathOf(nodes, "biscotti")).toEqual([
      "Armadio cucina",
      "Scaffale 1",
      "Cassetto 1",
      "Biscotti",
    ]);
  });

  it("restituisce un percorso vuoto per un nodo sconosciuto", () => {
    expect(pathOf(nodes, "ignoto")).toEqual([]);
  });
});

describe("flattenTree", () => {
  it("appiattisce in ordine di visita con la profondità", () => {
    const flat = flattenTree(buildTree(nodes));
    expect(flat.map(({ node, depth }) => [node.id, depth])).toEqual([
      ["armadio", 0],
      ["scaffale", 1],
      ["cassetto", 2],
      ["biscotti", 3],
      ["pasta", 2],
      ["frigo", 0],
    ]);
  });
});
