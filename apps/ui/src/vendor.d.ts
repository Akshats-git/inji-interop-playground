declare module "@injistack/pixelpass" {
  /** Base45 + zlib (+ CBOR) PixelPass text back to the original string. */
  export function decode(data: string): string;
}
