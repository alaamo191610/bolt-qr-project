import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App"; // ✅ default export (see step 3)
import "./index.css";
// import { AuthProvider } from "./hooks/useAuth"; // ✅ now exists
import { AuthProvider } from "./providers/AuthProvider";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AuthProvider>
      <App />
    </AuthProvider>
  </StrictMode>
);
