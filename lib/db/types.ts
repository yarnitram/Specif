export type TickerData = {
  lastPrice: number;
  riseFallRate: number;
  fairPrice: number;
  indexPrice: number;
  amount24: number;
  holdVol: number;
  fundingRate: number;
  high24Price: number;
  lower24Price: number;
};

export type WatchlistRow = {
  id: number;
  symbol: string;
  sort_order: number;
  created_at: string;
};

export type OrderType = "LIMIT" | "MARKET" | "TRIGGER_LIMIT";

export type StrategyRow = {
  symbol: string;
  trigger_type: "ABOVE" | "BELOW";
  trigger_price: number | null;
  entry_price: number | null;
  tp_price: number | null;
  sl_price: number | null;
  order_type: OrderType;
  trigger_fired: number;
  tp_fired: number;
  sl_fired: number;
  updated_at: string;
};

export type WatchlistJoined = WatchlistRow & {
  strategy: StrategyRow | null;
};

export type UpsertStrategyInput = {
  symbol: string;
  triggerType: "ABOVE" | "BELOW";
  triggerPrice: number | null;
  entryPrice: number | null;
  tpPrice: number | null;
  slPrice: number | null;
  orderType: OrderType;
  triggerFired: boolean;
  tpFired: boolean;
  slFired: boolean;
};

export type NotificationSettings = {
  desktopEnabled: boolean;
  desktopTitle?: string;
  desktopBody?: string;
  discordEnabled: boolean;
  discordWebhookUrl?: string;
  discordUsername?: string;
  discordAvatarUrl?: string;
};

export type GeneralSettings = {
  pollIntervalSeconds: number;
};