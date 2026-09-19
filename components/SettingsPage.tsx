"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Bell, Monitor, MessageSquare, CheckCircle2, XCircle, Loader2, Save, ArrowLeft, RotateCcw, SlidersHorizontal } from "lucide-react";
import { toast } from "sonner";
import type { NotificationSettings, GeneralSettings } from "@/lib/db";

export default function SettingsPage() {
  const router = useRouter();
  const [notifSettings, setNotifSettings] = useState<NotificationSettings>({
    desktopEnabled: false,
    desktopTitle: "MEXC Alert",
    desktopBody: "{symbol} · {type} hit at {price}",
    discordEnabled: false,
    discordWebhookUrl: "",
    discordUsername: "MEXC Terminal",
    discordAvatarUrl: "",
  });
  const [generalSettings, setGeneralSettings] = useState<GeneralSettings>({
    pollIntervalSeconds: 4,
  });
  const [saving, setSaving] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission>("default");
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"notifications" | "general">("notifications");

  useEffect(() => {
    loadSettings();
    if ("Notification" in window) {
      setPermission(Notification.permission);
    }
  }, []);

  async function loadSettings() {
    setLoading(true);
    try {
      const [notifRes, generalRes] = await Promise.all([
        fetch("/api/settings/notifications"),
        fetch("/api/settings/general"),
      ]);
      const notifJson = await notifRes.json();
      const generalJson = await generalRes.json();
      if (notifRes.ok && notifJson.data) {
        setNotifSettings(notifJson.data);
      }
      if (generalRes.ok && generalJson.data) {
        setGeneralSettings(generalJson.data);
      }
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }

  function handleNotifChange<K extends keyof NotificationSettings>(key: K, value: NotificationSettings[K]) {
    setNotifSettings((prev) => ({ ...prev, [key]: value }));
  }

  function handleGeneralChange<K extends keyof GeneralSettings>(key: K, value: GeneralSettings[K]) {
    setGeneralSettings((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSave() {
    setSaving(true);
    try {
      await Promise.all([
        fetch("/api/settings/notifications", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(notifSettings),
        }),
        fetch("/api/settings/general", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(generalSettings),
        }),
      ]);
      toast.success("Settings saved");
    } catch {
      toast.error("Failed to save settings");
    } finally {
      setSaving(false);
    }
  }

  async function handleTestDesktop() {
    if (permission !== "granted") {
      const p = await Notification.requestPermission();
      setPermission(p);
    }
    if (Notification.permission === "granted") {
      new Notification(notifSettings.desktopTitle || "MEXC Alert", {
        body: "Test notification from MEXC Terminal",
        icon: "/favicon.ico",
      });
      toast.success("Test notification sent");
    } else {
      toast.error("Desktop notifications not permitted");
    }
  }

  async function handleTestDiscord() {
    if (!notifSettings.discordWebhookUrl) {
      toast.error("Please enter a Discord webhook URL first");
      return;
    }
    try {
      const payload = {
        username: notifSettings.discordUsername,
        avatar_url: notifSettings.discordAvatarUrl,
        content: null,
        embeds: [
          {
            title: "📈 MEXC Alert (Test)",
            color: 0x10b981,
            fields: [
              { name: "Symbol", value: "BTC_USDT", inline: true },
              { name: "Type", value: "TEST", inline: true },
              { name: "Price", value: "50000.00", inline: true },
            ],
            timestamp: new Date().toISOString(),
            footer: { text: "MEXC Futures Terminal" },
          },
        ],
      };
      const res = await fetch(notifSettings.discordWebhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        toast.success("Test Discord notification sent");
      } else {
        toast.error("Failed to send test notification");
      }
    } catch {
      toast.error("Failed to send test notification");
    }
  }

  async function handleRequestPermission() {
    if (!("Notification" in window)) {
      toast.error("Not supported in this browser");
      return;
    }
    const p = await Notification.requestPermission();
    setPermission(p);
    if (p === "granted") toast.success("Permission granted");
    else toast.error("Permission denied");
  }

  function handleBack() {
    router.back();
  }

  if (loading) {
    return (
      <div className="flex h-[400px] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-emerald" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex items-center gap-4">
        <button
          onClick={handleBack}
          className="rounded-lg p-2 text-slate-400 hover:bg-surface hover:text-slate-100 transition"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <h1 className="text-2xl font-bold text-slate-100">Settings</h1>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 rounded-lg bg-slate-800/50 p-1">
        <button
          onClick={() => setActiveTab("notifications")}
          className={`flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition ${
            activeTab === "notifications"
              ? "bg-emerald text-black"
              : "text-slate-400 hover:text-slate-200"
          }`}
        >
          <Bell className="h-4 w-4" />
          Notifications
        </button>
        <button
          onClick={() => setActiveTab("general")}
          className={`flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition ${
            activeTab === "general"
              ? "bg-emerald text-black"
              : "text-slate-400 hover:text-slate-200"
          }`}
        >
          <SlidersHorizontal className="h-4 w-4" />
          General
        </button>
      </div>

      <div className="rounded-2xl border border-borderline bg-surface/40 p-6 space-y-6">
        {activeTab === "notifications" && (
          <>
            {/* Desktop Notifications */}
            <section className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Monitor className="h-5 w-5 text-emerald" />
                  <h2 className="text-lg font-semibold text-slate-100">Desktop Notifications</h2>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={notifSettings.desktopEnabled}
                    onChange={(e) => handleNotifChange("desktopEnabled", e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 rounded-full bg-slate-700 peer-focus:ring-2 peer-focus:ring-emerald peer-checked:bg-emerald peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:w-5 after:h-5 after:bg-white after:rounded-full after:transition-all"></div>
                </label>
              </div>

              {notifSettings.desktopEnabled ? (
                <div className="space-y-3 ml-7">
                  <div className="flex items-center gap-2 text-sm text-slate-400">
                    <span className={permission === "granted" ? "text-emerald" : "text-rose"}>●</span>
                    <span>Permission: {permission}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={handleRequestPermission}
                      disabled={permission === "granted"}
                      className="rounded-lg bg-slate-800 px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-700 disabled:opacity-40"
                    >
                      {permission === "granted" ? "✓ Granted" : "Request Permission"}
                    </button>
                    <button
                      onClick={handleTestDesktop}
                      className="rounded-lg bg-slate-800 px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-700"
                    >
                      Send Test
                    </button>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1">Title Template</label>
                    <input
                      value={notifSettings.desktopTitle}
                      onChange={(e) => handleNotifChange("desktopTitle", e.target.value)}
                      className="w-full rounded-lg border border-borderline bg-base/60 px-3 py-2 font-mono text-sm text-slate-100 outline-none focus:border-emerald/50"
                      placeholder="MEXC Alert"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1">Body Template</label>
                    <input
                      value={notifSettings.desktopBody}
                      onChange={(e) => handleNotifChange("desktopBody", e.target.value)}
                      className="w-full rounded-lg border border-borderline bg-base/60 px-3 py-2 font-mono text-sm text-slate-100 outline-none focus:border-emerald/50"
                      placeholder="{symbol} · {type} hit at {price}"
                    />
                    <p className="mt-1 text-xs text-slate-500">
                      Variables: <code className="font-mono bg-slate-800 px-1 rounded">{ "{symbol}" }</code>,
                      <code className="font-mono bg-slate-800 px-1 rounded">{ "{type}" }</code>,
                      <code className="font-mono bg-slate-800 px-1 rounded">{ "{price}" }</code>
                    </p>
                  </div>
                </div>
              ) : null}
            </section>

            <div className="border-t border-borderline pt-6" />

            {/* Discord Notifications */}
            <section className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <MessageSquare className="h-5 w-5 text-blue-400" />
                  <h2 className="text-lg font-semibold text-slate-100">Discord Webhook</h2>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={notifSettings.discordEnabled}
                    onChange={(e) => handleNotifChange("discordEnabled", e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 rounded-full bg-slate-700 peer-focus:ring-2 peer-focus:ring-blue-400 peer-checked:bg-blue-500 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:w-5 after:h-5 after:bg-white after:rounded-full after:transition-all"></div>
                </label>
              </div>

              {notifSettings.discordEnabled ? (
                <div className="space-y-3 ml-7">
                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1">Webhook URL</label>
                    <input
                      value={notifSettings.discordWebhookUrl}
                      onChange={(e) => handleNotifChange("discordWebhookUrl", e.target.value)}
                      type="password"
                      className="w-full rounded-lg border border-borderline bg-base/60 px-3 py-2 font-mono text-sm text-slate-100 outline-none focus:border-blue-400/50"
                      placeholder="https://discord.com/api/webhooks/..."
                    />
                    <p className="mt-1 text-xs text-slate-500">Create a webhook in Discord Server Settings → Integrations → Webhooks</p>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1">Username (optional)</label>
                    <input
                      value={notifSettings.discordUsername}
                      onChange={(e) => handleNotifChange("discordUsername", e.target.value)}
                      className="w-full rounded-lg border border-borderline bg-base/60 px-3 py-2 font-mono text-sm text-slate-100 outline-none focus:border-blue-400/50"
                      placeholder="MEXC Terminal"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1">Avatar URL (optional)</label>
                    <input
                      value={notifSettings.discordAvatarUrl}
                      onChange={(e) => handleNotifChange("discordAvatarUrl", e.target.value)}
                      className="w-full rounded-lg border border-borderline bg-base/60 px-3 py-2 font-mono text-sm text-slate-100 outline-none focus:border-blue-400/50"
                      placeholder="https://..."
                    />
                  </div>
                  <div className="flex items-center gap-2 pt-2">
                    <button
                      onClick={handleTestDiscord}
                      className="rounded-lg bg-slate-800 px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-700"
                    >
                      Send Test
                    </button>
                  </div>
                </div>
              ) : null}
            </section>
          </>
        )}

        {activeTab === "general" && (
          <section className="space-y-4">
            <div className="flex items-center gap-2">
              <RotateCcw className="h-5 w-5 text-blue-400" />
              <h2 className="text-lg font-semibold text-slate-100">Data Polling</h2>
            </div>
            <div className="space-y-3 ml-7">
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">Poll Interval (seconds)</label>
                <input
                  type="number"
                  min="1"
                  max="60"
                  value={generalSettings.pollIntervalSeconds}
                  onChange={(e) => handleGeneralChange("pollIntervalSeconds", Number(e.target.value))}
                  className="w-full max-w-xs rounded-lg border border-borderline bg-base/60 px-3 py-2 font-mono text-sm text-slate-100 outline-none focus:border-blue-400/50"
                  placeholder="4"
                />
                <p className="mt-1 text-xs text-slate-500">How often to fetch live prices from MEXC (1-60 seconds)</p>
              </div>
            </div>
          </section>
        )}

        <div className="flex justify-end pt-4 border-t border-borderline">
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 rounded-lg bg-emerald px-4 py-2 text-sm font-bold text-black hover:bg-emerald/90 disabled:opacity-40"
          >
            <Save className="h-4 w-4" />
            {saving ? "Saving…" : "Save Settings"}
          </button>
        </div>
      </div>
    </div>
  );
}