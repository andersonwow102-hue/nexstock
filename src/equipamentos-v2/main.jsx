import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import EquipamentosSprintApp from "./EquipamentosSprintApp.jsx";
import "./base.css";
import "./concept-a.css";
import "./concept-b.css";
import "./concept-c.css";

createRoot(document.getElementById("equipamentos-v2-root")).render(
  <StrictMode>
    <EquipamentosSprintApp />
  </StrictMode>,
);
