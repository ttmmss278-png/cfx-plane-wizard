import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles.css";
import "./ux-v2.css";
import "./ux-v3.css";
import "./topbar-polish.css";
import "./home-workbench-polish.css";
import "./frame-stabilizer.css";
import "./design-system.css";
import "./frame-stabilizer";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
