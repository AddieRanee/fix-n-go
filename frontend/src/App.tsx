import React from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { NavBar } from "./components/NavBar";
import { RequireAuth } from "./components/RequireAuth";
import { ApiDebugToast } from "./components/ApiDebugToast";
import { LoginPage } from "./pages/LoginPage";
import { ResetPasswordPage } from "./pages/ResetPasswordPage";
import { InventoryPage } from "./pages/InventoryPage";
import { UseInventoryPage } from "./pages/UseInventoryPage";
import { ReceiptPage } from "./pages/ReceiptPage";
import { SparePartsPage } from "./pages/SparePartsPage";
import { SalesPage } from "./pages/SalesPage";
import { HomePage } from "./pages/HomePage";
import { ProfilePage } from "./pages/ProfilePage";

export function App() {
  return (
    <>
      <NavBar />
      <ApiDebugToast />
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route
          path="/"
          element={
            <RequireAuth>
              <HomePage />
            </RequireAuth>
          }
        />
        <Route
          path="/inventory"
          element={
            <RequireAuth>
              <InventoryPage />
            </RequireAuth>
          }
        />
        <Route
          path="/use"
          element={
            <RequireAuth>
              <UseInventoryPage />
            </RequireAuth>
          }
        />
        <Route
          path="/receipt/:id"
          element={
            <RequireAuth>
              <ReceiptPage />
            </RequireAuth>
          }
        />
        <Route
          path="/sales"
          element={
            <RequireAuth>
              <SalesPage />
            </RequireAuth>
          }
        />
        <Route
          path="/spare-parts"
          element={
            <RequireAuth>
              <SparePartsPage />
            </RequireAuth>
          }
        />
        <Route
          path="/profile"
          element={
            <RequireAuth>
              <ProfilePage />
            </RequireAuth>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  );
}
