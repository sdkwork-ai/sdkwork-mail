import { HashRouter, Navigate, useLocation } from "react-router-dom";

import { AdminApp } from "./AdminApp";
import { AppAuthGate } from "./AppAuthGate";
import { mail_APP_HOME_PATH } from "./constants/appRoutes";
import { MailApp } from "./mailApp";
import { bootstrap } from "./bootstrap/runtime";

import "@sdkwork/mail-h5-mail/src/mail-app-styles.css";
import "@sdkwork/mail-h5-admin-core/src/admin-styles.css";

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
      <AppShell />
    </HashRouter>
  );
}
