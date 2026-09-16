/**
 * Device-based account: no email, no password prompt, no OTP.
 * A random credential pair is generated once and kept on the device,
 * so the same phone always signs back into the same account.
 */
const STORAGE_KEY = "sawtak.device.account";

export type DeviceCredentials = { email: string; password: string };

function randomToken(length: number) {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(36).padStart(2, "0")).join("").slice(0, length);
}

export function readDeviceCredentials(): DeviceCredentials | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as DeviceCredentials;
    if (!parsed?.email || !parsed?.password) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function createDeviceCredentials(): DeviceCredentials {
  const creds: DeviceCredentials = {
    email: `d${randomToken(20)}@sawtak.device`,
    password: randomToken(32),
  };
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(creds));
  return creds;
}

export function clearDeviceCredentials() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(STORAGE_KEY);
}
