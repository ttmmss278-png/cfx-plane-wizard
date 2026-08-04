import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { applySkin, readStoredSkin } from "./skins";
import "./styles.css";
import "./ux-v2.css";
import "./ux-v3.css";
import "./topbar-polish.css";
import "./home-workbench-polish.css";
import "./frame-stabilizer.css";
import "./design-system.css";
import "./design-system-dark.css";
import "./skin-system.css";
import "./frame-stabilizer";
import "./plane-wizard-polish";
import "./section-normalizer-polish";
import "./section-normalizer-export-layout";

applySkin(readStoredSkin());

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
