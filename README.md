# NPM Package Navigator

Navigate to npm package resources directly from your JavaScript and TypeScript projects inside VS Code.

## Features

- Detect package names in `package.json` dependencies and common import/require statements.
- Quick navigation to:
  - Package directory inside `node_modules`
  - Package `package.json`
  - README (if available)
  - Repository, homepage, and issue tracker URLs
  - CDN pages on [unpkg.com](https://unpkg.com) and [jsDelivr](https://www.jsdelivr.com)
- Hover tooltips with useful metadata and quick links.
- CodeLens entries for dependencies in `package.json`.
- Context menu command and command palette entry for fast access.

## Getting Started (Users)

1. Install the extension.
2. Open a JavaScript or TypeScript project with dependencies installed.
3. Hover over imports or dependency names, or trigger `Package Navigator: Open Menu` from the command palette.

## Development

```bash
npm install
npm run watch
```

Press `F5` in VS Code to launch the extension host for development.

### Compile

```bash
npm run compile
```

### Lint

```bash
npm run lint
```

The project uses ESLint 9 with a flat config defined in `eslint.config.mjs`.

### Format

```bash
npm run format
```

Prettier formats project source and config files using the settings in `prettier.config.mjs`.

### Test

```bash
npm test
```

## License

MIT
