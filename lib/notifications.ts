"use client";

import type { NotificationSettings } from "@/lib/db";

let notificationPermission: NotificationPermission | "unsupported" = "unsupported";

export function isDesktopNotificationsSupported(): boolean {
  if (typeof window === "undefined") return false;
  return "Notification" in window;
}

export async function requestDesktopPermission(): Promise<NotificationPermission> {
  if (!isDesktopNotificationsSupported()) return "denied";
  if (notificationPermission !== "unsupported") return notificationPermission;
  notificationPermission = await Notification.requestPermission();
  return notificationPermission;
}

export function getDesktopPermission(): NotificationPermission {
  if (!isDesktopNotificationsSupported()) return "denied";
  return Notification.permission;
}

export function sendDesktopNotification(title: string, body: string, options?: NotificationOptions): boolean {
  if (!isDesktopNotificationsSupported()) return false;
  if (Notification.permission !== "granted") return false;
  try {
    new Notification(title, { body, icon: "/favicon.ico", ...options });
    return true;
  } catch {
    return false;
  }
}

export function formatNotificationTemplate(
  template: string,
  vars: { symbol: string; type: string; price: string }
): string {
  return template
    .replace("{symbol}", vars.symbol)
    .replace("{type}", vars.type)
    .replace("{price}", vars.price);
}

export async function fireAlert(
  symbol: string,
  type: string,
  price: string,
  settings: NotificationSettings
): Promise<void> {
  // Desktop
  if (settings.desktopEnabled && Notification.permission === "granted") {
    const title = settings.desktopTitle ?? "MEXC Alert";
    const body = formatNotificationTemplate(
      settings.desktopBody ?? "{symbol} · {type} hit at {price}",
      { symbol, type, price }
    );
    sendDesktopNotification(title, body);
  }

  // Discord
  if (settings.discordEnabled && settings.discordWebhookUrl) {
    await sendDiscordWebhook(settings, symbol, type, price);
  }
}

async function sendDiscordWebhook(
  settings: { discordWebhookUrl?: string; discordUsername?: string; discordAvatarUrl?: string },
  symbol: string,
  type: string,
  price: string
): Promise<void> {
  if (!settings.discordWebhookUrl) return;

  const payload = {
    username: settings.discordUsername,
    avatar_url: settings.discordAvatarUrl,
    content: null,
    embeds: [
      {
        title: "📈 MEXC Alert",
        color: 0x10b981,
        fields: [
          { name: "Symbol", value: symbol, inline: true },
          { name: "Type", value: type, inline: true },
          { name: "Price", value: price, inline: true },
        ],
        timestamp: new Date().toISOString(),
        footer: { text: "MEXC Futures Terminal" },
      },
    ],
  };

  try {
    await fetch(settings.discordWebhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch {
    /* silent fail */
  }
}