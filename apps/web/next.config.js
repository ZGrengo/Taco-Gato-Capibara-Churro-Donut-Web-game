/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@acme/shared"],
  images: {
    unoptimized: true, // Disable image optimization for local assets
  },
};

module.exports = nextConfig;
