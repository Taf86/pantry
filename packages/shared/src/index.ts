/**
 * `pantry-shared` — il contratto fra client e server.
 *
 * Ci vive tutto ciò che esiste su entrambi i lati: gli schemi Zod di input e
 * output, i flag di permesso, la forma degli eventi real-time e le poche
 * funzioni di dominio (albero della dispensa, ordinamento della spesa,
 * risoluzione dei conflitti) che client e server devono valutare allo stesso
 * modo. Definirle due volte è la fonte di bug più prevedibile del progetto.
 */

export * from "./constants.js";
export * from "./events.js";
export * from "./ids.js";
export * from "./permissions.js";

export * from "./domain/conflict.js";
export * from "./domain/shopping.js";
export * from "./domain/status.js";
export * from "./domain/tree.js";

export * from "./schemas/bridge.js";
export * from "./schemas/category.js";
export * from "./schemas/common.js";
export * from "./schemas/item.js";
export * from "./schemas/list.js";
export * from "./schemas/pantry.js";
export * from "./schemas/shopping.js";
export * from "./schemas/user.js";
