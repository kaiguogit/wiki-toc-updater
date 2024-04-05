module.exports = {
  root: true,
  overrides: [
    {
      files: ["*.ts"],
      parser: "@typescript-eslint/parser",
      extends: [
        "eslint:recommended",
        "plugin:@typescript-eslint/recommended",
        "plugin:@typescript-eslint/recommended-requiring-type-checking",
        "prettier",
      ],
      parserOptions: {
        project: ["tsconfig.json"],
      },
    },
    {
      files: ["*.js"],
      extends: ["eslint:recommended"],
      parserOptions: {
        ecmaVersion: 2018,
      },
      env: {
        node: true,
      },
    },
  ],
};
