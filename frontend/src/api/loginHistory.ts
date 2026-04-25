import { apiGet, apiPost } from "@/api/client";

export interface DeviceEntry {
  id: string;
  device_hash: string;
  browser: string;
  os: string;
  device_type: string;
  first_seen: string;
  last_seen: string;
}

export interface LoginEntry {
  id: string;
  device_hash: string;
  browser: string;
  os: string;
  device_type: string;
  ip_address: string;
  country: string | null;
  city: string | null;
  is_new_device: boolean;
  created_at: string;
}

export const trackLogin      = (): Promise<void>           => apiPost("/api/login-history/track");
export const getDevices      = (): Promise<DeviceEntry[]>  => apiGet("/api/login-history/devices");
export const getLoginHistory = (): Promise<LoginEntry[]>   => apiGet("/api/login-history/history");
export const signOutOthers   = (socketId: string): Promise<void> => apiPost("/api/login-history/sign-out-others", { socketId });
