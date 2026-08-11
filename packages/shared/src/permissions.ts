/**
 * Modello di permessi a bitmask, applicato in modo identico a liste e dispense.
 *
 * `Shop` è deliberatamente separato da `Write`: una persona può spuntare i
 * prodotti mentre fa la spesa senza poter alterare la lista.
 */
export const Permission = {
  None: 0,
  /** Vede il contenuto. */
  Read: 1 << 0,
  /** Aggiunge, modifica, rimuove. */
  Write: 1 << 1,
  /** Spunta come comprato / consuma dalla dispensa. */
  Shop: 1 << 2,
  /** Gestisce le condivisioni. */
  Manage: 1 << 3,
} as const;

export type PermissionFlag = (typeof Permission)[keyof typeof Permission];

/** Maschera con tutti i bit definiti: usata per validare gli input. */
export const ALL_PERMISSIONS =
  Permission.Read | Permission.Write | Permission.Shop | Permission.Manage;

export const Role = {
  Viewer: Permission.Read,
  Shopper: Permission.Read | Permission.Shop,
  Editor: Permission.Read | Permission.Write | Permission.Shop,
  Owner:
    Permission.Read | Permission.Write | Permission.Shop | Permission.Manage,
} as const;

export type RoleName = keyof typeof Role;

export const ROLE_NAMES = ["Viewer", "Shopper", "Editor", "Owner"] as const;

/** Etichette in italiano, per la UI di condivisione. */
export const ROLE_LABELS: Record<RoleName, string> = {
  Viewer: "Sola lettura",
  Shopper: "Può fare la spesa",
  Editor: "Può modificare",
  Owner: "Amministra",
};

/** `true` se `granted` contiene *tutti* i bit di `required`. */
export const can = (granted: number, required: number): boolean =>
  (granted & required) === required;

/**
 * Ruolo corrispondente esatto a una maschera, se esiste.
 * Le maschere arbitrarie restano legittime: la UI mostra il ruolo solo quando
 * c'è una corrispondenza pulita.
 */
export const roleOf = (permissions: number): RoleName | null =>
  ROLE_NAMES.find((name) => Role[name] === permissions) ?? null;

/** Normalizza una maschera scartando i bit non definiti. */
export const sanitizePermissions = (permissions: number): number =>
  permissions & ALL_PERMISSIONS;

/** Elenco leggibile dei permessi concessi, per diagnostica e UI. */
export const describePermissions = (permissions: number): string[] => {
  const labels: Array<[number, string]> = [
    [Permission.Read, "lettura"],
    [Permission.Write, "modifica"],
    [Permission.Shop, "spesa"],
    [Permission.Manage, "condivisione"],
  ];
  return labels
    .filter(([flag]) => can(permissions, flag))
    .map(([, label]) => label);
};
