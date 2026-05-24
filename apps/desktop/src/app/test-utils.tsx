import "@testing-library/jest-dom/vitest";
import { ReactElement } from "react";
import { render } from "@testing-library/react";
import { RouterProvider, createMemoryRouter } from "react-router";

export function renderWithRouter(element: ReactElement, initialPath = "/") {
  const router = createMemoryRouter([{ path: "*", element }], {
    initialEntries: [initialPath]
  });

  return render(<RouterProvider router={router} />);
}
