import { defineConfig } from "@apps-in-toss/web-framework/config";

export default defineConfig({
  appName: "muldae",

  brand: {
    primaryColor: "#1668B8",
  },

  // 처음 켤 때 가장 가까운 관측소를 골라주는 데만 써요. 거부해도 앱은 돌아가요.
  permissions: [{ name: "geolocation", access: "access" }],

  webBundleDir: "dist",

  navigationBar: {
    withBackButton: true,
    withHomeButton: false,
  },
});
