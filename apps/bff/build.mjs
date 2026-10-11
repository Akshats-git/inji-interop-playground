// Bundle the BFF for production. Dependencies stay external (installed in the image), but workspace
// packages such as @playground/core ship as TypeScript source, so they must be bundled in.
import { readFileSync } from "node:fs";
import { build } from "esbuild";

const pkg = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8"));
const external = Object.entries(pkg.dependencies)
  .filter(([, version]) => !String(version).startsWith("workspace:"))
  .flatMap(([name]) => [name, `${name}/*`]);

await build({
  entryPoints: ["src/main.ts"],
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node20",
  outfile: "dist/main.js",
  external,
  // Bundled CommonJS helpers (none today, but cheap insurance) need `require` in an ES module.
  banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" },
  logLevel: "info",
});
