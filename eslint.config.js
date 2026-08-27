import nextConfig from "eslint-config-next";

const config = [
  ...nextConfig,
  {
    ignores: ["generated/**"],
  },
];

export default config;
