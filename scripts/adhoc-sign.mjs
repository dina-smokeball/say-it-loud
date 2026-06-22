// Ad-hoc sign a packaged .app so macOS will launch it locally without an Apple
// developer certificate.
//
// On recent macOS an ad-hoc Electron app is otherwise killed by Library
// Validation: the app and Electron's framework have no team, so the loader
// treats them as "different teams". The disable-library-validation entitlement
// (plus the JIT entitlements Electron needs) turns that check off for local use.
import { sign } from '@electron/osx-sign';
import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const app = process.argv[2];
if (!app) {
  console.error('usage: node scripts/adhoc-sign.mjs <path-to-.app>');
  process.exit(1);
}

const entitlements = join(tmpdir(), 'say-it-loud-entitlements.plist');
writeFileSync(
  entitlements,
  `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>com.apple.security.cs.allow-jit</key><true/>
  <key>com.apple.security.cs.allow-unsigned-executable-memory</key><true/>
  <key>com.apple.security.cs.allow-dyld-environment-variables</key><true/>
  <key>com.apple.security.cs.disable-library-validation</key><true/>
</dict>
</plist>
`,
);

await sign({
  app,
  identity: '-', // ad-hoc, no certificate
  identityValidation: false,
  optionsForFile: () => ({ entitlements, hardenedRuntime: true }),
});

console.log(`Ad-hoc signed: ${app}`);
