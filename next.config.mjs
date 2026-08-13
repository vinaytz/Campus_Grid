/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ["mongoose", "bcryptjs"],
  experimental: { optimizePackageImports: ["clsx", "tailwind-merge"] },
};
export default nextConfig;
