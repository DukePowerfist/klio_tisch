import { execSync } from 'node:child_process';
import { resolve } from 'node:path';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { defineConfig } from 'vitest/config';
import { klioContent } from './content-plugin.ts';

// Build-Kennung (ARCHITEKTUR.md 7, Versionierung): Git-Commit des Builds.
// In GitHub Actions steht er in GITHUB_SHA, lokal fragen wir Git.
function buildId(): string {
  const sha = process.env.GITHUB_SHA ?? tryGit();
  return sha ? sha.slice(0, 7) : 'lokal';
}

function tryGit(): string | undefined {
  try {
    return execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim();
  } catch {
    return undefined;
  }
}

export default defineConfig({
  // relativ: läuft unter dukepowerfist.github.io/klio_tisch/ und unter einer eigenen Domain
  base: './',
  plugins: [svelte(), klioContent(resolve(import.meta.dirname, 'content/klio'))],
  define: {
    __BUILD_ID__: JSON.stringify(buildId()),
  },
  build: {
    rollupOptions: {
      input: {
        main: resolve(import.meta.dirname, 'index.html'),
        verbindungstest: resolve(import.meta.dirname, 'verbindungstest.html'),
      },
    },
  },
  test: {
    include: ['tests/**/*.test.ts'],
  },
});
