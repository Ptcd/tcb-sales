import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  productionBrowserSourceMaps: false,

  // Add empty turbopack config to allow webpack config to work
  turbopack: {},

  webpack: (config, { isServer }) => {
    if (!isServer) {
      // Don't bundle Node.js modules in the client
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        net: false,
        tls: false,
      };
    }
    return config;
  },
};

export default nextConfig;
