import { defineConfig } from 'vite';

// relative asset paths, so the built site works from any folder (e.g. GitHub Pages' /<repo>/)
export default defineConfig({ base: './' });
