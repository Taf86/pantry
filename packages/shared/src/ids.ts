/**
 * UUID v7 generati dal client.
 *
 * È il prerequisito dell'offline: l'item ha identità mentre sei ancora tra gli
 * scaffali senza segnale, e quando la mutazione parte l'INSERT è idempotente.
 * La componente temporale iniziale rende gli ID ordinabili, il che mantiene
 * sano l'indice B-tree della primary key.
 */

const UUID_V7_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const MAX_COUNTER = 0x0fff;

let lastTimestamp = -1;
let counter = 0;

const randomBytes = (length: number): Uint8Array => {
  const bytes = new Uint8Array(length);
  globalThis.crypto.getRandomValues(bytes);
  return bytes;
};

const hex = (byte: number): string => byte.toString(16).padStart(2, "0");

/**
 * Genera un UUID v7 monotòno: due chiamate nello stesso millisecondo
 * producono comunque ID crescenti, così l'ordinamento per ID non collassa
 * quando si aggiungono più item di fila.
 */
export const uuidv7 = (now: number = Date.now()): string => {
  let timestamp = now;

  if (timestamp === lastTimestamp) {
    counter += 1;
    if (counter > MAX_COUNTER) {
      // Contatore esaurito: prendiamo in prestito il millisecondo successivo.
      timestamp = lastTimestamp + 1;
      counter = 0;
    }
  } else if (timestamp < lastTimestamp) {
    // Orologio all'indietro (NTP, sospensione): non regrediamo mai.
    timestamp = lastTimestamp;
    counter += 1;
  } else {
    counter = 0;
  }

  lastTimestamp = timestamp;

  const bytes = randomBytes(16);

  bytes[0] = Math.floor(timestamp / 2 ** 40) & 0xff;
  bytes[1] = Math.floor(timestamp / 2 ** 32) & 0xff;
  bytes[2] = Math.floor(timestamp / 2 ** 24) & 0xff;
  bytes[3] = Math.floor(timestamp / 2 ** 16) & 0xff;
  bytes[4] = Math.floor(timestamp / 2 ** 8) & 0xff;
  bytes[5] = timestamp & 0xff;

  // Versione 7 + 12 bit di contatore.
  bytes[6] = 0x70 | ((counter >>> 8) & 0x0f);
  bytes[7] = counter & 0xff;

  // Variante RFC 4122.
  bytes[8] = 0x80 | (bytes[8]! & 0x3f);

  const s = Array.from(bytes, hex).join("");
  return `${s.slice(0, 8)}-${s.slice(8, 12)}-${s.slice(12, 16)}-${s.slice(
    16,
    20,
  )}-${s.slice(20)}`;
};

export const isUuidV7 = (value: string): boolean => UUID_V7_RE.test(value);

/** Millisecondi Unix codificati nei primi 48 bit di un UUID v7. */
export const uuidv7Timestamp = (value: string): number => {
  const hexPart = value.replace(/-/g, "").slice(0, 12);
  return Number.parseInt(hexPart, 16);
};
