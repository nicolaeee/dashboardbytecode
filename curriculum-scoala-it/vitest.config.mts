import { defineConfig } from 'vitest/config';
import path from 'path';

// Config minimal, intentionat: testam DOAR logica pura din src/lib (fara React, fara
// Supabase, fara DOM) - nu are nevoie de jsdom sau alt mediu de randare. Alias-ul "@/"
// reflecta exact "paths" din tsconfig.json, ca importurile din teste sa arate identic cu
// cele din aplicatie.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
});
