---
description: "Generate a VS Code extension prompt"
mode: "agent"
model: "GPT-5-Codex"
---
Create a Visual Studio Code extension that supports these features for TypeScript and JavaScript codebases:

- For dependencies in `package.json` or `import` statements in code files, or other most common places where a package name might appear, provide a way to navigate to
  - its directory in `node_modules`
  - its `package.json` file
  - its readme file (if available)
  - its repository URL (if available)
  - its homepage URL (if available)
  - its issue tracker URL (if available)
  - its URL on CDN services like `unpkg.com` or `jsdelivr.com`

