/** @type {import('next').NextConfig} */
const nextConfig = {
  // Docker uses the standalone server; Netlify's Next.js runtime packages the app itself.
  output: process.env.NETLIFY ? undefined : "standalone",
  // Chromium automation and HTML parsing run only on the server.
  serverExternalPackages: ["playwright-core", "@sparticuz/chromium-min", "cheerio"],
};

export default nextConfig;
