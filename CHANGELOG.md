# Changelog

## [0.1.4] - 2025-09-30

### Added
- Detect package names referenced in `export ... from` statements.
- Detect catalog/importer dependencies defined in `pnpm-workspace.yaml`.

### Changed
- Removed the CodeLens provider and related source file to focus on the hover and command-based navigation experience.

## [0.1.3] - 2025-09-26

### Added
- Navigation options for npmjs package pages (latest and specific version) from the package menu.

### Fixed
- Detect package names when import or require expressions span multiple lines.

## [0.1.2] - 2025-09-26

### Added
- Support logging to a dedicated Output channel with optional debug mode.
- Improve pnpm package discovery including scoped packages.
- README documentation for logging configuration.

### Fixed
- Better detection of pnpm-installed packages for scoped and unscoped names.

## [0.1.1] - 2025-09-26

### Changed
- Limit package detection to imports/requires in code files and dependencies in `package.json`.
- Normalize import detection to handle wildcard import syntax.

### Added
- README updates describing features and usage.

## [0.1.0] - 2025-09-26

- Initial preview release.
