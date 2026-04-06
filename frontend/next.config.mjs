/** @type {import('next').NextConfig} */
const nextConfig = {
  webpack: (config) => {
    // Required for react-pdf
    config.resolve.alias.canvas = false;
    return config;
  },
};

export default nextConfig;
