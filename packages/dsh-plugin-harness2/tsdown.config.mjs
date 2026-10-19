// Standalone build of the host half of dsh-plugin-harness2.
//
//   lib/index.js        Plain ESM loaded by the Cordis Loader in Node. Every
//                       dsh / Cordis import in src/ is `import type`, so the
//                       emitted file has no runtime imports of those packages.
//   lib/types/**/*.d.ts Emitted by `tsc` (see the `build:types` script), not here.
//
// This plugin is host-only: there is no `dsh.client` declaration and no browser half.
export default {
  name: 'dsh-plugin-harness2/host',
  entry: { index: 'src/index.ts' },
  outDir: 'lib',
  format: 'esm',
  platform: 'node',
  dts: false,
  clean: false,
  sourcemap: false,
  outputOptions: { entryFileNames: 'index.js' },
}
