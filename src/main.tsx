import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles.css";

// Safari can run this module before the stylesheet applies, and the canvas code reads colours from CSS
// variables at mount (an empty colour throws there). Wait until the variables resolve.
const stylesReady = () => getComputedStyle(document.documentElement).getPropertyValue("--map-lawn").trim() !== "";
const mount = () => {
  createRoot(document.getElementById("root")!).render(<App />);
  document.getElementById("boot")?.remove();
};
const waitForStyles = () => (stylesReady() ? mount() : requestAnimationFrame(waitForStyles));
waitForStyles();
