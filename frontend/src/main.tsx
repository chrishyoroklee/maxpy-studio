import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.tsx";

// Allow a single “first load” intro animation; remove it quickly so it can’t
// re-trigger on scroll/layout quirks.
document.documentElement.classList.add("first-load");
window.setTimeout(() => document.documentElement.classList.remove("first-load"), 1000);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
