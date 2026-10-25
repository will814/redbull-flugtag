import fs from 'node:fs';
import path from 'node:path';

const bundleDir = path.join(process.cwd(), '.apphosting');
fs.mkdirSync(bundleDir, { recursive: true });

const bundleYaml = `version: v1
runConfig:
  runCommand: node server.mjs
outputFiles:
  serverApp:
    include:
      - dist
      - server.mjs
      - package.json
`;

fs.writeFileSync(path.join(bundleDir, 'bundle.yaml'), bundleYaml, 'utf8');
console.log('Generated .apphosting/bundle.yaml for Firebase App Hosting');
