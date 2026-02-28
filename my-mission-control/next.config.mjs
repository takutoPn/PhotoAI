/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async rewrites() {
    return [
      { source: "/task", destination: "/" },
      { source: "/calender", destination: "/" },
      { source: "/memory", destination: "/" },
      { source: "/token", destination: "/" }
    ];
  }
};

export default nextConfig;
