/** QR code with the text alternative beside it: a copyable link and, on phones, a tappable deep link. */
import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { copy } from "../lib/format";
import { Button } from "./ui";

export function QrCode({ value, label, deepLinkLabel = "Open in wallet app", size = 240 }: { value: string; label: string; deepLinkLabel?: string; size?: number }) {
  const [svg, setSvg] = useState("");
  const [version, setVersion] = useState<number>();
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    let live = true;
    QRCode.toString(value, { type: "svg", errorCorrectionLevel: "M", margin: 1, color: { dark: "#16233F", light: "#FFFFFF" } })
      .then((s) => live && setSvg(s))
      .catch(() => live && setSvg(""));
    try {
      setVersion(QRCode.create(value, { errorCorrectionLevel: "M" }).version);
    } catch {
      setVersion(undefined);
    }
    return () => {
      live = false;
    };
  }, [value]);
  return (
    <figure className="flex flex-col items-center gap-3">
      <div className="rounded-lg border border-hairline bg-white p-2" style={{ width: size, height: size }} role="img" aria-label={label} dangerouslySetInnerHTML={{ __html: svg }} />
      <figcaption className="text-center text-sm text-muted">
        {value.length} characters{version ? `, QR version ${version} at error correction M` : ""}
      </figcaption>
      <div className="flex flex-wrap justify-center gap-2">
        <Button
          onClick={() => {
            void copy(value);
            setCopied(true);
            setTimeout(() => setCopied(false), 1200);
          }}
        >
          {copied ? "Copied" : "Copy link"}
        </Button>
        <a href={value} className="inline-flex min-h-10 items-center rounded-md border border-hairline bg-surface px-4 text-sm font-bold hover:border-ink sm:hidden">
          {deepLinkLabel}
        </a>
      </div>
    </figure>
  );
}
