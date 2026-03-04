#!/usr/bin/env node

import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env.local
const envPath = path.join(__dirname, '.env.local');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf-8');
  envContent.split('\n').forEach((line: string) => {
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
const env = process.env.API_ENV || 'production'; // Set API_ENV=dev in .env.local for dev API

if (!key) {
  throw new Error(
    'Missing VITE_SUPABASE_ANON_KEY. Add it to .env.local before building.'
  );
}

// Write config file that will be imported
const configContent = `export const SUPABASE_URL = ${JSON.stringify(url)};
export const SUPABASE_ANON_KEY = ${JSON.stringify(key)};

// API Configuration
// To test with dev API, change this to 'dev' or set API_ENV=dev in .env.local
export const ENV = ${JSON.stringify(env)}; // 'production' | 'dev'

export const API_BASE_URL = ENV === 'dev' 
  ? 'https://dev-api.signalizeai.org' 
  : 'https://api.signalizeai.org';
`;

fs.writeFileSync(path.join(__dirname, 'src/config.ts'), configContent);

// Build supabase bundle from TypeScript
const cmd1 = `esbuild src/sidepanel-entry.ts --bundle --format=iife --minify --outfile=extension/supabase.bundle.js`;
execSync(cmd1, { stdio: 'inherit' });

// Build sidepanel from TypeScript
const cmd2 = `esbuild sidepanel.ts --bundle --platform=browser --format=esm --minify --tree-shaking=true --splitting --outdir=extension`;
execSync(cmd2, { stdio: 'inherit' });

// Build background script from TypeScript
const cmd3 = `esbuild background.ts --bundle --format=iife --minify --outfile=extension/background.js`;
execSync(cmd3, { stdio: 'inherit' });

// Build content scripts from TypeScript
const cmd4 = `esbuild content-auth-bridge.ts --bundle --format=iife --minify --outfile=extension/content-auth-bridge.js`;
execSync(cmd4, { stdio: 'inherit' });

const cmd5 = `esbuild content-extractor.ts --bundle --format=iife --minify --outfile=extension/content-extractor.js`;
execSync(cmd5, { stdio: 'inherit' });

// Build sidepanel-loader from TypeScript
const cmd6 = `esbuild sidepanel-loader.ts --bundle --format=iife --minify --outfile=extension/sidepanel-loader.js`;
execSync(cmd6, { stdio: 'inherit' });

console.log('✅ All TypeScript files compiled successfully!');
