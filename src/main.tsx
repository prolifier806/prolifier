import { createRoot } from "react-dom/client";
import { GoogleOAuthProvider } from "@react-oauth/google";
import App from "./App.tsx";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <GoogleOAuthProvider clientId="941097091996-e201j1p4vffd523c2flt9aou61jnm06q.apps.googleusercontent.com">
    <App />
  </GoogleOAuthProvider>
);
