// VAPID public key is safe to ship to the browser (the private key stays on the server).
export const VAPID_PUBLIC_KEY =
  "BCZQTQV-202uXhECOOfh0K5FBL2tpJT6eLpfAK97kLxKJE7RdYYJ1n8Kx_jLkhBcSzkVqq2_T1KuTl8pe5PjA54";

export function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}
