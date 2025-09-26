import js from "@eslint/js";
import tsPlugin from "@typescript-eslint/eslint-plugin";
import tsParser from "@typescript-eslint/parser";
import globals from "globals";

const commonGlobals = {
  ...globals.es2021,
  ...globals.node,
};

const typeScriptRules = {
  ...js.configs.recommended.rules,
  ...tsPlugin.configs.recommended.rules,
  semi: ["error", "always"],
  "@typescript-eslint/explicit-function-return-type": "off",
  "@typescript-eslint/no-unused-vars": [
    "error",
    {
      argsIgnorePattern: "^_",
      varsIgnorePattern: "^_",
      caughtErrors: "all",
      caughtErrorsIgnorePattern: "^_",
    },
  ],
};

const commonLanguageOptions = {
  parser: tsParser,
  parserOptions: {
    ecmaVersion: 2020,
    sourceType: "module",
  },
  globals: commonGlobals,
};

export default [
  {
    ignores: ["out/**", ".vscode-test/**", "node_modules/**", "src/**/*.js", "test/**/*.js"],
  },
  {
    files: ["**/*.ts"],
    languageOptions: commonLanguageOptions,
    plugins: {
      "@typescript-eslint": tsPlugin,
    },
    rules: typeScriptRules,
  },
  {
    files: ["test/**/*.ts"],
    languageOptions: {
      ...commonLanguageOptions,
      globals: {
        ...commonGlobals,
        ...globals.mocha,
      },
    },
    plugins: {
      "@typescript-eslint": tsPlugin,
    },
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-require-imports": "off",
    },
  },
];
