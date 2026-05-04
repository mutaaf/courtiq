// Next.js requires route segment config (runtime/size/alt/contentType) to be
// statically declared per file — they can't be re-exported. We declare them
// here and reuse the default component from opengraph-image.tsx.

export const runtime = 'nodejs';
export const alt = 'SportsIQ — Voice-first AI coaching intelligence for youth sports';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export { default } from './opengraph-image';
