"use client";

import Header from "@/components/Header";
import SettingsPage from "@/components/SettingsPage";

export default function SettingsPageRoute() {
  return (
    <main className="min-h-screen bg-base text-slate-200">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 p-4 sm:p-6">
        <Header />
        <SettingsPage />
      </div>
    </main>
  );
}