import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { applyTheme, readTheme } from "./theme";
import { applyLanguage, readLanguage, LanguageProvider } from "./i18n";
import "./styles.css";

applyTheme(readTheme());
applyLanguage(readLanguage());

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <LanguageProvider><App /></LanguageProvider>
  </React.StrictMode>,
);
