import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "../index.css";
import "../App.css";
import "../styles/foundations.css";
import "../styles/command-flow.css";
import "../PointsCommandFlow.css";
import "../AdminCommandFlow.css";
import "../FechamentoCommandFlow.css";
import "../FechamentoWorkbench.css";
import "./ux-scroll-qa.css";
import UxScrollQaApp from "./UxScrollQaApp.jsx";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <UxScrollQaApp />
  </StrictMode>,
);
