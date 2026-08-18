#!/usr/bin/env node

// Compatibility entry point; the complete music asset pipeline now includes
// all deduplicated masters as well as the three Stage 0 seamless derivatives.
await import("./generate-music-assets.mjs");
