import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import FechamentoSprintApp from "./FechamentoSprintApp.jsx";
import "../styles/foundations.css";
import "./base.css";

createRoot(document.getElementById("fechamento-v2-root")).render(
  <StrictMode>
    <FechamentoSprintApp />
  </StrictMode>,
);
