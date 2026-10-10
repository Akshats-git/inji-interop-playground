// Dev helper: issue a credential from a Studio type to the Reference Wallet through the running gateway.
//   npx tsx scripts/try-issue.ts <typeId> '{"claim":"value"}'
import { receiveOffer } from "../src/reference/wallet/issuance.js";
import { walletHttp } from "../src/reference/wallet/http.js";

const [typeId, claimsJson] = process.argv.slice(2);
const base = process.env.SELF_URL ?? "http://127.0.0.1:8080";
const res = await fetch(`${base}/api/types/${typeId}/offers`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ claims: JSON.parse(claimsJson ?? "{}") }) });
const { offerUri } = (await res.json()) as { offerUri: string };
console.log("offer:", offerUri);
const http = walletHttp({ publicBaseUrl: process.env.PUBLIC_BASE_URL ?? "http://playground.localhost:8080", selfUrl: base });
const got = await receiveOffer(http, offerUri);
console.log(JSON.stringify({ format: got.format, holder: got.holder.did, credential: got.credential }, null, 2));
