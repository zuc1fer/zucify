import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.zucify.app",
  appName: "Zucify",
  webDir: "dist",
  backgroundColor: "#080808",
  plugins: {
    CapacitorHttp: {
      enabled: true,
    },
  },
  ios: {
    contentInset: "automatic",
  },
};

export default config;
