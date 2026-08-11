import { useQuery } from "@tanstack/react-query";
import type { SessionUser } from "pantry-shared";

import { keys } from "../lib/keys";
import { trpc } from "../lib/trpc";

/**
 * La sessione si chiede al server, non si deduce dal cookie: il cookie è
 * `httpOnly` e — soprattutto — un account sospeso ha un cookie ancora valido.
 *
 * `offlineFirst` e la persistenza sono deliberati. Aprire la PWA in un
 * supermercato senza segnale non deve portare a una schermata di login: senza
 * l'ultima sessione conosciuta, l'app che si vanta di funzionare offline si
 * fermerebbe al primo passo. Il prezzo è che un account sospeso vede ancora la
 * propria interfaccia finché resta offline — dove però ogni scrittura resta in
 * coda e verrà rifiutata dal server appena la rete torna.
 */
export const useSession = () =>
  useQuery<SessionUser | null>({
    queryKey: keys.me(),
    queryFn: () => trpc.account.me.query(),
    networkMode: "offlineFirst",
    staleTime: 30_000,
    retry: false,
  });
