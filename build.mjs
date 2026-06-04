import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

function pickEnvValue(names) {
  for (const name of names) {
    if (process.env[name]) return process.env[name];
  }
  return '';
}

const username = pickEnvValue([
  'HIVEMQ_USERNAME',
  'VITE_HIVEMQ_USERNAME',
  'NEXT_PUBLIC_HIVEMQ_USERNAME',
]);

const password = pickEnvValue([
  'HIVEMQ_PASSWORD',
  'VITE_HIVEMQ_PASSWORD',
  'NEXT_PUBLIC_HIVEMQ_PASSWORD',
]);

const config = `window.HIVEMQ_USERNAME = ${JSON.stringify(username)};\nwindow.HIVEMQ_PASSWORD = ${JSON.stringify(password)};\n`;

writeFileSync('config.js', config, 'utf8');

const outputDir = 'public';
if (existsSync(outputDir)) {
  rmSync(outputDir, { recursive: true, force: true });
}
mkdirSync(outputDir, { recursive: true });

const copyTargets = [
  'index.html',
  'script.js',
  'style.css',
  'config.js',
  'assets',
];

for (const target of copyTargets) {
  const sourcePath = join('.', target);
  if (!existsSync(sourcePath)) continue;
  cpSync(sourcePath, join(outputDir, target), { recursive: true });
}

const vercelOutputDir = join('.vercel', 'output');
const vercelStaticDir = join(vercelOutputDir, 'static');
if (existsSync(vercelOutputDir)) {
  rmSync(vercelOutputDir, { recursive: true, force: true });
}
mkdirSync(vercelStaticDir, { recursive: true });

for (const target of copyTargets) {
  const sourcePath = join('.', target);
  if (!existsSync(sourcePath)) continue;
  cpSync(sourcePath, join(vercelStaticDir, target), { recursive: true });
}

writeFileSync(join(vercelOutputDir, 'config.json'), JSON.stringify({ version: 3 }, null, 2), 'utf8');

console.log('Generated config.js');
console.log('Generated public/ output');
console.log('Generated .vercel/output for prebuilt deploy');
console.log(`Username source: ${username ? 'env' : 'empty'}`);
console.log(`Password source: ${password ? 'env' : 'empty'}`);
