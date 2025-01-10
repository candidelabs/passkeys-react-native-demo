const express = require("express");
const cors = require("cors");
const app = express();
const port = 3006;

app.use(cors());

app.get("/.well-known/apple-app-site-association", (req, res) => {
  res.set({
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
  });
  const appIdentifier = "FZZKKA62H4.com.adi52.abstractionkitrnpasskeysexample";

  res.json({
    webcredentials: {
      apps: [appIdentifier],
    },
    applinks: {
      details: [
        {
          appIDs: [appIdentifier],
          components: [
            {
              "/": "/*",
              comment: "Matches any URL",
            },
          ],
        },
      ],
    },
  });
});

app.get("/.well-known/assetlinks.json", (req, res) => {
  res.set({
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
  });

  res.json([
    {
      relation: ["delegate_permission/common.handle_all_urls"],
      target: {
        namespace: "android_app",
        package_name: "com.adi52.abstractionkitrnpasskeysexample",
        sha256_cert_fingerprints: [
          "FA:C6:17:45:DC:09:03:78:6F:B9:ED:E6:2A:96:2B:39:9F:73:48:F0:BB:6F:89:9B:83:32:66:75:91:03:3B:9C",
        ],
      },
    },
  ]);
});

app.get("/", (req, res) => {
  res.send("Server is running!");
});

app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
  next();
});

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
  console.log(
    `AASA file available at http://localhost:${port}/.well-known/apple-app-site-association`
  );
});
