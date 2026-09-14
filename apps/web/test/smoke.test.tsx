import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { cn } from "@/lib/utils";

describe("web test setup", () => {
  it("resolves modules through the @ alias", () => {
    const hidden = false;

    expect(cn("px-2", "px-4", hidden && "hidden")).toBe("px-4");
  });

  it("renders a component into jsdom", () => {
    render(<p className={cn("text-sm")}>pantry</p>);

    expect(screen.getByText("pantry")).toBeInTheDocument();
  });

  it("cleans up the DOM between tests", () => {
    expect(screen.queryByText("pantry")).toBeNull();
  });
});
