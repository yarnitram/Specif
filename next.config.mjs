/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // @libsql/client must run server-side only (it opens sockets); keep it out
  // of any bundled client/runtime chunk.
  serverExternalPackages: ["@libsql/client"],
};

export default nextConfig;