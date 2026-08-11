import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import type * as TrpcModule from "../src/lib/trpc";

const checkMutate = vi.fn().mockResolvedValue(undefined);
const uncheckMutate = vi.fn().mockResolvedValue(undefined);
const deleteMutate = vi.fn().mockResolvedValue(undefined);

vi.mock("../src/lib/trpc", async (importOriginal) => {
  const actual = await importOriginal<typeof TrpcModule>();
  return {
    ...actual,
    trpc: {
      items: {
        check: { mutate: checkMutate },
        uncheck: { mutate: uncheckMutate },
        delete: { mutate: deleteMutate },
        add: { mutate: vi.fn() },
        update: { mutate: vi.fn() },
      },
      lists: {
        create: { mutate: vi.fn() },
        update: { mutate: vi.fn() },
        delete: { mutate: vi.fn() },
        share: { mutate: vi.fn() },
        unshare: { mutate: vi.fn() },
      },
      pantries: {
        create: { mutate: vi.fn() },
        update: { mutate: vi.fn() },
        delete: { mutate: vi.fn() },
        share: { mutate: vi.fn() },
        unshare: { mutate: vi.fn() },
        toList: { mutate: vi.fn() },
      },
      nodes: {
        create: { mutate: vi.fn() },
        update: { mutate: vi.fn() },
        delete: { mutate: vi.fn() },
        move: { mutate: vi.fn() },
        consume: { mutate: vi.fn() },
      },
      shopping: { toPantry: { mutate: vi.fn() } },
    },
  };
});

const { ItemRow } = await import("../src/features/lists/item-row");
const { registerMutationDefaults } = await import("../src/lib/mutations");
const { makeItem } = await import("./factories");

const wrap = (children: ReactNode) => {
  const client = new QueryClient({
    defaultOptions: { mutations: { retry: false } },
  });
  registerMutationDefaults(client);
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
};

describe("ItemRow", () => {
  it("mostra nome, quantità e categoria", () => {
    render(
      wrap(
        <ItemRow
          item={makeItem({ quantity: 2, unit: "l" })}
          canWrite
          canShop
          categoryName="Latticini"
        />,
      ),
    );

    expect(screen.getByText("Latte")).toBeInTheDocument();
    expect(screen.getByText("2 l")).toBeInTheDocument();
    expect(screen.getByText("Latticini")).toBeInTheDocument();
  });

  it("spunta il prodotto quando si ha il permesso Shop", async () => {
    const user = userEvent.setup();
    render(wrap(<ItemRow item={makeItem()} canWrite={false} canShop />));

    await user.click(screen.getByRole("button", { name: /spunta latte/i }));

    expect(checkMutate).toHaveBeenCalledTimes(1);
    const payload = checkMutate.mock.calls[0]?.[0] as { checkedAt: string };
    // L'istante è quello del dispositivo: è il perno del last-write-wins.
    expect(Date.parse(payload.checkedAt)).not.toBeNaN();
  });

  it("de-spunta un prodotto già nel carrello", async () => {
    const user = userEvent.setup();
    render(
      wrap(
        <ItemRow
          item={makeItem({ checkedAt: "2026-08-11T18:00:00.000Z" })}
          canWrite={false}
          canShop
        />,
      ),
    );

    await user.click(screen.getByRole("button", { name: /togli la spunta/i }));
    expect(uncheckMutate).toHaveBeenCalledTimes(1);
  });

  it("senza permesso Shop la spunta è disabilitata", () => {
    render(wrap(<ItemRow item={makeItem()} canWrite canShop={false} />));
    expect(
      screen.getByRole("button", { name: /spunta latte/i }),
    ).toBeDisabled();
  });

  it("senza permesso Write non compaiono le azioni di modifica", () => {
    render(
      wrap(
        <ItemRow
          item={makeItem()}
          canWrite={false}
          canShop
          onEdit={() => {}}
        />,
      ),
    );

    expect(
      screen.queryByRole("button", { name: /modifica latte/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /elimina latte/i }),
    ).not.toBeInTheDocument();
  });

  it("mostra l'etichetta della lista di origine nella vista fusa", () => {
    render(
      wrap(
        <ItemRow item={makeItem()} canWrite={false} canShop listLabel="Casa" />,
      ),
    );
    expect(screen.getByText("Casa")).toBeInTheDocument();
  });
});
