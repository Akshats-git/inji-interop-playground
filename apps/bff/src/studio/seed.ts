/**
 * Demo content for a fresh install: two issuers and credential types covering both mandatory formats
 * (W3C JSON-LD in Data Model 1.1 and 2.0, and IETF SD-JWT VC). All data is synthetic.
 */
import type { CredentialTypeInput, IssuerProfileInput } from "@playground/core";
import { log } from "../log.js";
import type { Store } from "../store/types.js";
import type { StudioService } from "./service.js";

const ISSUERS: IssuerProfileInput[] = [
  { slug: "agri-dept", name: "Karnataka Agriculture Department", description: "Registers farmers and the land they cultivate.", logoUrl: "", backgroundColor: "#1F4D3A", textColor: "#F4EFE3" },
  { slug: "veridonia-uni", name: "University of Veridonia", description: "Awards degrees to its graduates.", logoUrl: "", backgroundColor: "#2B2D6E", textColor: "#F5F1FF" },
];

const crop = { name: "primaryCropType", label: "Primary crop", kind: "choice" as const, options: ["Rice", "Ragi", "Sugarcane", "Coffee", "Cotton"] };

const TYPES: Partial<CredentialTypeInput>[] = [
  {
    issuerSlug: "agri-dept",
    typeName: "KarnatakaFarmerCard",
    displayName: "Karnataka Farmer Card",
    description: "Proves who a farmer is, where they farm and what they grow.",
    format: "ldp_vc",
    dataModel: "2.0",
    ldpSuite: "Ed25519Signature2020",
    revocable: true,
    fields: [
      { name: "fullName", label: "Full name", kind: "text", required: true, selectivelyDisclosable: true },
      { name: "farmerId", label: "Farmer ID", kind: "text", required: true, selectivelyDisclosable: true },
      { ...crop, required: true, selectivelyDisclosable: true },
      { name: "landAreaAcres", label: "Land area (acres)", kind: "number", required: true, selectivelyDisclosable: true },
      { name: "district", label: "District", kind: "text", required: true, selectivelyDisclosable: true },
    ],
  },
  {
    issuerSlug: "agri-dept",
    typeName: "KarnatakaFarmerCard",
    displayName: "Karnataka Farmer Card (SD-JWT)",
    description: "The same card as an SD-JWT VC: the holder chooses which claims to reveal.",
    format: "vc+sd-jwt",
    sdJwtAlg: "ES256",
    fields: [
      { name: "fullName", label: "Full name", kind: "text", required: true, selectivelyDisclosable: true },
      { name: "farmerId", label: "Farmer ID", kind: "text", required: true, selectivelyDisclosable: true },
      { ...crop, required: true, selectivelyDisclosable: true },
      { name: "landAreaAcres", label: "Land area (acres)", kind: "number", required: true, selectivelyDisclosable: true },
      { name: "district", label: "District", kind: "text", required: true, selectivelyDisclosable: false },
    ],
  },
  {
    issuerSlug: "veridonia-uni",
    typeName: "UniversityDegree",
    displayName: "Bachelor's Degree",
    description: "A degree certificate in the classic VC Data Model 1.1 shape.",
    format: "ldp_vc",
    dataModel: "1.1",
    ldpSuite: "Ed25519Signature2020",
    fields: [
      { name: "fullName", label: "Graduate", kind: "text", required: true, selectivelyDisclosable: true },
      { name: "degree", label: "Degree", kind: "choice", options: ["B.Tech", "B.Sc", "B.A", "B.Com"], required: true, selectivelyDisclosable: true },
      { name: "major", label: "Major", kind: "text", required: true, selectivelyDisclosable: true },
      { name: "graduationDate", label: "Graduated on", kind: "date", required: true, selectivelyDisclosable: true },
    ],
  },
  {
    // Shows "Valid but expired": correctly signed, but its validity ended on 1 Jan 2025.
    issuerSlug: "veridonia-uni",
    typeName: "ExpiredLibraryPass",
    displayName: "Library Pass (expired)",
    description: "Hard-coded to have expired on 1 Jan 2025, to test how verifiers treat expired credentials.",
    format: "ldp_vc",
    dataModel: "2.0",
    ldpSuite: "Ed25519Signature2020",
    expiresAt: "2025-01-01T00:00:00.000Z",
    fields: [
      { name: "holderName", label: "Holder", kind: "text", required: true, selectivelyDisclosable: true },
      { name: "cardNumber", label: "Card number", kind: "text", required: true, selectivelyDisclosable: true },
    ],
  },
];

export const DEMO_CLAIMS: Record<string, Record<string, unknown>> = {
  KarnatakaFarmerCard: { fullName: "Ramesh Kumar", farmerId: "KA-MND-20931", primaryCropType: "Ragi", landAreaAcres: 3.5, district: "Mandya" },
  UniversityDegree: { fullName: "Asha Rao", degree: "B.Tech", major: "Computer Science", graduationDate: "2025-06-30" },
};

export async function seedDemo(store: Store, studio: StudioService) {
  if ((await store.listTypes()).length) return false;
  for (const i of ISSUERS) if (!(await store.getIssuer(i.slug))) await studio.createIssuer(i);
  for (const t of TYPES) {
    try {
      await studio.createType(t);
    } catch (e) {
      log.warn({ err: (e as Error).message, type: t.typeName }, "seed type failed");
    }
  }
  log.info("seeded demo issuers and credential types");
  return true;
}
