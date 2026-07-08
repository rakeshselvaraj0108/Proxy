const path = require("path");

/** @type {import('next').NextConfig} */
const nextConfig = {
  outputFileTracingRoot: path.resolve(__dirname, ".."),
  // Standalone output produces a minimal, self-contained server bundle --
  // needed for a lean production Docker image; has no effect on `next dev`.
  output: "standalone",
};

module.exports = nextConfig;
