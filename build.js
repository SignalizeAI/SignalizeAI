#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Load .env.local
const envPath = path.join(__dirname, '.env.local');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf-8');
  envContent.split('\n').forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;

    const [key, ...valueParts] = trimmed.split('=');
    const value = valueParts.join('=');
    if (key && value) {
      process.env[key.trim()] = value.trim().replace(/^['\"]|['\"]$/g, '');
    }
  });
}

const url = process.env.VITE_SUPABASE_URL || 'https://qcvnfvbzxbnrquxtjihp.supabase.co';
const key = process.env.VITE_SUPABASE_ANON_KEY;

if (!key) {
  throw new Error(
    'Missing VITE_SUPABASE_ANON_KEY. Add it to .env.local before building.'
  );
}

// Write config file that will be imported
const configContent = `export const SUPABASE_URL = ${JSON.stringify(url)};
export const SUPABASE_ANON_KEY = ${JSON.stringify(key)};
`;

fs.writeFileSync(path.join(__dirname, 'src/config.js'), configContent);

// Build supabase bundle
const cmd1 = `esbuild src/sidepanel-entry.js --bundle --format=iife --minify --outfile=extension/supabase.bundle.js`;
execSync(cmd1, { stdio: 'inherit' });

// Build sidepanel
const cmd2 = `esbuild sidepanel.js --bundle --platform=browser --format=esm --minify --tree-shaking=true --splitting --outdir=extension`;
execSync(cmd2, { stdio: 'inherit' });
