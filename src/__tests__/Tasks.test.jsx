import { render, screen } from "@testing-library/react";
import Tasks from "../Tasks.jsx";
vi.mock("../supabaseClient", async () => {
  const { createSupabaseMock } = await import("../test/utils/supabaseMock.js");
  return {
    supabase: createSupabaseMock({
      data: {
        tasks: [],
        clients: [],
        branches: [],
        users: [],
      },
    }),
  };
});

describe("Tasks page", () => {
  it("renders and shows empty state", async () => {
    render(<Tasks />);

    expect(
      screen.getByRole("heading", { name: /Задачи/i })
    ).toBeInTheDocument();
    expect(await screen.findByText(/Записей нет/i)).toBeInTheDocument();
  });
});
