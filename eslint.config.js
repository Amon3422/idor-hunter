import js from "@eslint/js";
import globals from "globals";
import { defineConfig } from "eslint/config";

export default defineConfig([
  //Shared Configuration
  { 
    ignores: ["node_modules/**", "dist/**"] 
  },
  
  //SERVER
  {
    files: ["server/**/*.js"],
    languageOptions: {
      globals: { ...globals.node },
      sourceType: "module"
    },
    rules: {
      ...js.configs.recommended.rules,
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }]
    }
  },

  // SERVER TESTS — add jest globals so describe/test/expect are not flagged
  {
    files: ["server/tests/**/*.test.js", "server/__tests__/**/*.test.js"],
    languageOptions: {
      globals: { ...globals.node, ...globals.jest },
      sourceType: "module"
    },
    rules: {
      ...js.configs.recommended.rules,
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }]
    }
  },

  // CLIENT proxy server (Node.js, not browser)
  {
    files: ["client/server.js"],
    languageOptions: {
      globals: { ...globals.node },
      sourceType: "module"
    },
    rules: {
      ...js.configs.recommended.rules,
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }]
    }
  },

  //CLIENT
  {
    files: ["client/**/*.js", "!client/server.js"],
    languageOptions: {
      globals: { ...globals.browser },
      sourceType: "module"
    },
    rules: {
      ...js.configs.recommended.rules,
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }]
    }
  }
]);