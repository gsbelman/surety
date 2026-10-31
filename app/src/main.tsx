import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { MotionConfig } from "motion/react";
import "@fontsource-variable/inter";
import "@fontsource-variable/bricolage-grotesque";
import { App } from "./App";
import { WalletProvider } from "./lib/wallet";
import "./styles.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <MotionConfig reducedMotion="user">
      <WalletProvider>
        <App />
      </WalletProvider>
    </MotionConfig>
  </StrictMode>,
);
