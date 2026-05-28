// ESLint flat config: only declare ignores so the linter skips noisy files
module.exports = [
  {
    ignores: [
      "**/script.js",
      "**/test-db.js",
      "**/fix.js",
      "**/fix2.js",
      "scripts/**",
      "kayod-repo-mirror.git/**",
      ".remediation/**",
      ".next/**",
      "dist/**",
      "node_modules/**",
    ],
  },
];
