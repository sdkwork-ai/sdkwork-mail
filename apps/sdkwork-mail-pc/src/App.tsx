import { HashRouter, Navigate, useLocation } from "react-router-dom";
import { SdkworkSessionAuthBrowserRoot } from '@sdkwork/auth-pc-react';

import { AdminApp } from "./AdminApp";
import { AppAuthGate, mail_APP_HOME_PATH } from "./AppAuthGate";
import { MailApp } from "./mailApp";
import { bootstrap } from "./bootstrap/runtime";

import "@sdkwork/mail-pc-mail/src/mail-app-styles.css";
import "@sdkwork/mail-pc-admin-core/src/admin-styles.css";

bootstrap();

function AppShell() {
  const location = useLocation();
  const route = location.pathname;

  if (route === "/" || route === "") {
    return <Navigate replace to={mail_APP_HOME_PATH} />;
  }

  if (route.startsWith("/admin")) {
    return <AdminApp route={route} />;
  }

  return (
    <AppAuthGate>
      <MailApp route={route} />
    </AppAuthGate>
  );
}

export default function App() {
  return (
    <HashRouter>
      <SdkworkSessionAuthBrowserRoot>
      <AppShell />
          </SdkworkSessionAuthBrowserRoot>
    </HashRouter>
  );
}
