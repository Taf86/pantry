import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";

import App from "./app";
import { createAppQueryClient, persistOptions } from "./lib/query-client";
import "./styles.css";

const queryClient = createAppQueryClient();

const root = document.getElementById("root");
if (!root) throw new Error("Elemento #root assente");

createRoot(root).render(
  <StrictMode>
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={persistOptions}
      /**
       * Il momento decisivo dell'offline: la cache è stata riletta da
       * IndexedDB e le mutazioni messe in pausa possono ripartire, in ordine
       * FIFO, con le `mutationFn` registrate per chiave.
       */
      onSuccess={() => {
        void queryClient.resumePausedMutations();
      }}
    >
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </PersistQueryClientProvider>
  </StrictMode>,
);
