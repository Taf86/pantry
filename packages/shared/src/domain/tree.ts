import type { PantryNode, PantryTreeNode } from "../schemas/pantry";

/** Sottoinsieme di un nodo sufficiente a ragionare sulla struttura dell'albero. */
export interface TreeShape {
  id: string;
  parentId: string | null;
}

const byOrderThenName = (a: PantryNode, b: PantryNode): number =>
  a.sortOrder - b.sortOrder ||
  a.name.localeCompare(b.name, "it") ||
  a.id.localeCompare(b.id);

/**
 * Materializza l'adjacency list in un albero.
 *
 * I nodi il cui genitore non è presente nell'insieme diventano radici: la
 * vista resta utilizzabile anche se il client ha una copia parziale.
 */
export const buildTree = (nodes: readonly PantryNode[]): PantryTreeNode[] => {
  const index = new Map<string, PantryTreeNode>();
  for (const node of nodes) {
    index.set(node.id, { ...node, children: [] });
  }

  const roots: PantryTreeNode[] = [];
  for (const node of index.values()) {
    const parent = node.parentId ? index.get(node.parentId) : undefined;
    if (parent) {
      parent.children.push(node);
    } else {
      roots.push(node);
    }
  }

  const sortRecursive = (list: PantryTreeNode[]): void => {
    list.sort(byOrderThenName);
    for (const child of list) sortRecursive(child.children);
  };
  sortRecursive(roots);

  return roots;
};

/** Tutti i discendenti di `rootId`, escluso `rootId` stesso. */
export const descendantIds = (
  nodes: readonly TreeShape[],
  rootId: string,
): Set<string> => {
  const childrenOf = new Map<string, string[]>();
  for (const node of nodes) {
    if (!node.parentId) continue;
    const siblings = childrenOf.get(node.parentId);
    if (siblings) siblings.push(node.id);
    else childrenOf.set(node.parentId, [node.id]);
  }

  const result = new Set<string>();
  const stack = [...(childrenOf.get(rootId) ?? [])];
  while (stack.length > 0) {
    const current = stack.pop()!;
    if (result.has(current)) continue;
    result.add(current);
    stack.push(...(childrenOf.get(current) ?? []));
  }
  return result;
};

/**
 * `true` se riparentare `nodeId` sotto `newParentId` creerebbe un ciclo.
 *
 * Il server rifà comunque questo controllo in SQL dentro la transazione dello
 * spostamento: qui serve a non proporre nemmeno il drag illegale nella UI.
 */
export const wouldCycle = (
  nodes: readonly TreeShape[],
  nodeId: string,
  newParentId: string | null,
): boolean => {
  if (newParentId === null) return false;
  if (newParentId === nodeId) return true;
  return descendantIds(nodes, nodeId).has(newParentId);
};

/** Profondità di un nodo, 0 per le radici. `null` se il percorso è ciclico. */
export const depthOf = (
  nodes: readonly TreeShape[],
  nodeId: string,
): number | null => {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const seen = new Set<string>();
  let current = byId.get(nodeId);
  let depth = 0;

  while (current?.parentId) {
    if (seen.has(current.id)) return null;
    seen.add(current.id);
    current = byId.get(current.parentId);
    if (!current) break;
    depth += 1;
  }
  return depth;
};

/** Percorso leggibile dalla radice al nodo, estremi inclusi. */
export const pathOf = (
  nodes: readonly PantryNode[],
  nodeId: string,
): string[] => {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const names: string[] = [];
  const seen = new Set<string>();
  let current = byId.get(nodeId);

  while (current && !seen.has(current.id)) {
    seen.add(current.id);
    names.unshift(current.name);
    current = current.parentId ? byId.get(current.parentId) : undefined;
  }
  return names;
};

/** Appiattisce l'albero in ordine di visita, con la profondità di ogni nodo. */
export const flattenTree = (
  roots: readonly PantryTreeNode[],
  depth = 0,
): Array<{ node: PantryTreeNode; depth: number }> =>
  roots.flatMap((node) => [
    { node, depth },
    ...flattenTree(node.children, depth + 1),
  ]);
