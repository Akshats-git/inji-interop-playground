import { PARTY_LABEL, type Party } from "@playground/core";

export const time = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
export const ago = (iso: string) => {
  const s = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return new Date(iso).toLocaleDateString();
};
export const party = (p: Party) => PARTY_LABEL[p] ?? p;
export const formatLabel = (f: string, dm?: string) => (f === "ldp_vc" ? `W3C JSON-LD${dm ? `, VCDM ${dm}` : ""}` : f === "vc+sd-jwt" || f === "dc+sd-jwt" ? "IETF SD-JWT VC" : f);

/** Which station on the transit line a party sits at. */
export type Station = "issuer" | "wallet" | "verifier";
export const stationOf = (p: Party): Station => (p === "studio" || p === "certify" || p === "external-issuer" ? "issuer" : p === "wallet" || p === "external-wallet" ? "wallet" : "verifier");

export function bytes(n: number) {
  return n < 1024 ? `${n} B` : `${(n / 1024).toFixed(1)} KB`;
}

export function copy(text: string) {
  return navigator.clipboard?.writeText(text);
}
