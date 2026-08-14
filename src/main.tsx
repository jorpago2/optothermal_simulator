import "./carbon.scss";
import "./styles.css";
import "@jorpago2/scientific-ui/styles.css";

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { ScientificUiProvider } from "@jorpago2/scientific-ui";
import { App } from "./App";

const root = document.getElementById("root");
if (!root) throw new Error("The application root element was not found.");

createRoot(root).render(
  <StrictMode>
    <ScientificUiProvider themeStorageKey="optothermal-simulator-theme">
      <App />
    </ScientificUiProvider>
  </StrictMode>,
);
