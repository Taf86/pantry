/**
 * `pantry-shared` — il contratto fra client e server.
 *
 * Ci vive tutto ciò che esiste su entrambi i lati: gli schemi Zod di input e
 * output, i flag di permesso, la forma degli eventi real-time e le poche
 * funzioni di dominio (albero della dispensa, ordinamento della spesa,
 * risoluzione dei conflitti) che client e server devono valutare allo stesso
 * modo. Definirle due volte è la fonte di bug più prevedibile del progetto.
 */

export * from "./constants";
export * from "./events";
export * from "./ids";
export * from "./permissions";

export * from "./domain/conflict";
export * from "./domain/shopping";
export * from "./domain/status";
export * from "./domain/tree";

export * from "./schemas/bridge";
export * from "./schemas/category";
export * from "./schemas/common";
export * from "./schemas/item";
export * from "./schemas/list";
export * from "./schemas/pantry";
export * from "./schemas/shopping";
export * from "./schemas/user";
