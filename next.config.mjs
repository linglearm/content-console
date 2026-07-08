/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    // Pollinations serves generated images; allow remote images from anywhere
    // (public blog uses plain <img> so this is mostly informational).
    remotePatterns: [
      { protocol: "https", hostname: "image.pollinations.ai" },
      { protocol: "https", hostname: "**.supabase.co" },
    ],
  },
};

export default nextConfig;
