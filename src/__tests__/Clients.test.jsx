import { render, screen } from "@testing-library/react";
import Clients from "../Clients.jsx";
vi.mock("../supabaseClient", async () => {
  const { createSupabaseMock } = await import("../test/utils/supabaseMock.js");
  return {
    supabase: createSupabaseMock({
      data: {
        clients: [],
        branches: [],
        users: [],
      },
    }),
  };
});

describe("Clients page", () => {
  it("renders and shows empty state", async () => {
    render(<Clients />);

    expect(
      screen.getByRole("heading", { name: /Клиенты/i })
    ).toBeInTheDocument();
    expect(
      await screen.findByText(/Клиенты не найдены/i)
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Выгрузить в Excel/i })
    ).toBeInTheDocument();
  });
});
