import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import { initializeClientTelemetry } from "./telemetry";

initializeClientTelemetry();

const root = createRoot(document.getElementById("root")!);

const renderApplication = async () => {
  const [{ default: App }, { AuthProvider }] = await Promise.all([
    import("./App"),
    import("./providers/AuthProvider"),
  ]);
  root.render(
    <StrictMode>
      <AuthProvider>
        <App />
      </AuthProvider>
    </StrictMode>,
  );
};

void renderApplication();
