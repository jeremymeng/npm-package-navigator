# Changelog

## [0.1.6] - 2025-10-22

### Fixed
- **Major improvement**: Replaced blacklist-based package detection with JSON parsing approach that only detects packages within actual dependency sections, eliminating false positives from custom package.json properties.
- Enhanced package detection accuracy by parsing the entire package.json structure and validating cursor positions against dependency sections.
- Improved robustness for edge cases involving custom properties that match real package names.

## [0.1.5] - 2025-10-22

### Fixed
- Display package version as "v1.2.3" instead of "@1.2.3" in hover tooltips to prevent mailto link rendering.
- Hide npm navigation options for private packages (packages with `"private": true` in package.json).
- Fixed incorrect package name detection in workspace version specifiers (e.g., hovering over "workspace" in `"workspace:^"` no longer triggers package navigation).
- Improved package.json detection to support test documents and untitled files with JSON content structure.
- Fixed package name detection to only work within dependency sections, preventing false positives in other sections like "engines", "scripts", etc.

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
