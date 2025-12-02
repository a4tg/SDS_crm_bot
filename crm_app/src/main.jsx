// src/main.jsx
import React from "react";
import { createRoot } from "react-dom/client";
import { createBrowserRouter, RouterProvider } from "react-router-dom";
import Tasks from "./Tasks.jsx";
import "./index.css";

// Единственный маршрут: задачи. Главная страница и /tasks ведут на одну и ту же компоненту
const router = createBrowserRouter([
  { path: "/", element: <Tasks /> },
  { path: "/tasks", element: <Tasks /> },
]);

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>
);
