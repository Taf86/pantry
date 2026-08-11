export type NoticeKind = "info" | "warning" | "error" | "success";

export interface Notice {
  id: number;
  kind: NoticeKind;
  message: string;
}

type Listener = (notices: Notice[]) => void;

let notices: Notice[] = [];
let nextId = 1;
const listeners = new Set<Listener>();

const emit = (): void => {
  for (const listener of listeners) listener(notices);
};

/**
 * Avvisi non bloccanti.
 *
 * Un conflitto di versione si comunica così: il client accetta lo stato del
 * server e lo dice. Nessun dialogo di merge manuale — sarebbe sproporzionato
 * per un'app della spesa, e comunque nessuno lo leggerebbe al supermercato.
 */
export const notify = (kind: NoticeKind, message: string): number => {
  const id = nextId++;
  notices = [...notices, { id, kind, message }];
  emit();
  setTimeout(() => dismissNotice(id), kind === "error" ? 8000 : 4000);
  return id;
};

export const dismissNotice = (id: number): void => {
  const next = notices.filter((notice) => notice.id !== id);
  if (next.length === notices.length) return;
  notices = next;
  emit();
};

export const subscribeToNotices = (listener: Listener): (() => void) => {
  listeners.add(listener);
  listener(notices);
  return () => listeners.delete(listener);
};

/** Solo per i test: riporta lo stato a zero fra un caso e l'altro. */
export const resetNotices = (): void => {
  notices = [];
  nextId = 1;
  emit();
};
