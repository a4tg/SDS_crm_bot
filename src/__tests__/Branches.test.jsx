import { render, screen } from "@testing-library/react";
import Branches from "../Branches.jsx";
vi.mock("../supabaseClient", async () => {
  const { createSupabaseMock } = await import("../test/utils/supabaseMock.js");
  return {
    supabase: createSupabaseMock({
      data: {
        branches: [],
        clients: [],
        users: [],
      },
    }),
  };
});

describe("Branches page", () => {
  it("renders and shows empty state", async () => {
    render(<Branches />);

    expect(
      screen.getByRole("heading", { name: /Филиалы/i })
    ).toBeInTheDocument();
    expect(
      await screen.findByText(/Филиалы не найдены/i)
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Выгрузить в Excel/i })
    ).toBeInTheDocument();
  });
});
