/** @type {import("@tinybirdco/sdk").TinybirdConfig} */
const tinybirdConfig = {
  include: ["lib/tinybird.ts"],
  token: "${TINYBIRD_TOKEN}",
  baseUrl: "${TINYBIRD_URL}",
  devMode: "branch",
};

export default tinybirdConfig;
