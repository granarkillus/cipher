/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  webpack: (config) => {
    config.resolve.alias['@/lib/supabase'] = require('path').resolve('./lib/supabase.ts');
    return config;
  },
};
module.exports = nextConfig;
