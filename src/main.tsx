import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Toaster } from "react-hot-toast";
import "./index.css";

const root = createRoot(document.getElementById("root")!);

const renderApplication = async () => {
  if (window.location.pathname === "/pos") {
    const { default: PosPage } = await import("./pos/PosPage");
    root.render(
      <StrictMode>
        <PosPage />
        <Toaster position="top-center" />
      </StrictMode>,
    );
    return;
  }

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
