import * as vscode from "vscode";
import { builtinModules } from "module";

export interface PackageMatch {
  name: string;
  version?: string;
  range?: vscode.Range;
  documentUri?: vscode.Uri;
}

export class PackageDetector {
  getPackageAtCursor(
    document: vscode.TextDocument,
    position: vscode.Position,
  ): PackageMatch | undefined {
    if (this.isPackageJson(document)) {
      return this.extractFromPackageJson(document, position);
    }

    if (this.isPnpmWorkspace(document)) {
      return this.extractFromPnpmWorkspace(document, position);
    }

    if (!this.isSupportedCodeDocument(document)) {
      return undefined;
    }

    const importMatch = this.extractFromImport(document, position);
    if (importMatch) {
      return importMatch;
    }

    return undefined;
  }

  findPackagesInPackageJson(document: vscode.TextDocument): PackageMatch[] {
    if (!this.isPackageJson(document)) {
      return [];
    }

    try {
      const json = JSON.parse(document.getText());
      const matches: PackageMatch[] = [];
      const sections = [
        "dependencies",
        "devDependencies",
        "peerDependencies",
        "optionalDependencies",
      ];

      for (const section of sections) {
        const deps = json[section];
        if (!deps) {
          continue;
        }

        for (const [name, version] of Object.entries<string>(deps)) {
          const range = this.findRangeForDependency(document, name);
          matches.push({ name, version, range });
        }
      }

      return matches;
    } catch (_error) {
      return [];
    }
  }

  findPackageRange(document: vscode.TextDocument, packageName: string): vscode.Range | undefined {
    return this.findRangeForDependency(document, packageName);
  }

  private extractFromImport(
    document: vscode.TextDocument,
    position: vscode.Position,
  ): PackageMatch | undefined {
    const patterns = [
      /import\s+[\s\S]*?from\s+['"`]([^'"`]+)['"`]/g,
      /import\s+['"`]([^'"`]+)['"`]/g,
      /require\(\s*['"`]([^'"`]+)['"`]\s*\)/g,
      /import\s*\(\s*['"`]([^'"`]+)['"`]\s*\)/g,
      /export\s+[\s\S]*?from\s+['"`]([^'"`]+)['"`]/g,
    ];

    const text = document.getText();
    const cursorOffset = document.offsetAt(position);

    for (const regex of patterns) {
      regex.lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = regex.exec(text)) !== null) {
        const specifier = match[1];
        // Use lastIndexOf to find the specifier in the module path (inside quotes),
        // not in the variable name position. For example, in:
        // "import unixify from 'unixify'"
        // indexOf would return 7 (variable), lastIndexOf returns 21 (module specifier)
        const specifierStart = match.index + match[0].lastIndexOf(specifier);
        const specifierEnd = specifierStart + specifier.length;

        if (cursorOffset >= specifierStart && cursorOffset <= specifierEnd) {
          const normalized = this.normalizePackageSpecifier(specifier);
          if (normalized) {
            const range = new vscode.Range(
              document.positionAt(specifierStart),
              document.positionAt(specifierEnd),
            );
            return { name: normalized, range, documentUri: document.uri };
          }
        }
      }
    }

    return undefined;
  }

  private extractFromPackageJson(
    document: vscode.TextDocument,
    position: vscode.Position,
  ): PackageMatch | undefined {
    const range = document.getWordRangeAtPosition(position, /@?[\w./-]+/);
    if (!range) {
      return undefined;
    }

    const text = document.getText(range);
    if (!this.isLikelyPackageName(text)) {
      return undefined;
    }

    // Check if we're in a dependency key position, not a version value
    if (!this.isInDependencyKeyPosition(document, position, text)) {
      return undefined;
    }

    // Parse the package.json and check if this position corresponds to a dependency
    const dependencyInfo = this.findDependencyAtPosition(document, position, text);
    if (!dependencyInfo) {
      return undefined;
    }

    return {
      name: text,
      version: dependencyInfo.version,
      range,
      documentUri: document.uri,
    };
  }

  private extractFromPnpmWorkspace(
    document: vscode.TextDocument,
    position: vscode.Position,
  ): PackageMatch | undefined {
    const range = document.getWordRangeAtPosition(position, /@?[\w./-]+/);
    if (!range) {
      return undefined;
    }

    const name = document.getText(range);
    if (!this.isLikelyPackageName(name)) {
      return undefined;
    }

    const packages = this.collectPnpmWorkspacePackages(document.getText());
    if (!packages.has(name)) {
      return undefined;
    }

    return {
      name,
      version: packages.get(name),
      range,
      documentUri: document.uri,
    };
  }

  private lookupVersion(document: vscode.TextDocument, packageName: string): string | undefined {
    try {
      const json = JSON.parse(document.getText());
      const sections = [
        "dependencies",
        "devDependencies",
        "peerDependencies",
        "optionalDependencies",
      ];
      for (const section of sections) {
        const deps = json[section];
        if (deps && typeof deps === "object" && packageName in deps) {
          return String(deps[packageName]);
        }
      }
    } catch (_error) {
      // ignore parse failures
    }

    return undefined;
  }

  private findRangeForDependency(
    document: vscode.TextDocument,
    packageName: string,
  ): vscode.Range | undefined {
    const text = document.getText();
    let offset = 0;

    for (const line of text.split("\n")) {
      const index = line.indexOf(`"${packageName}"`);
      if (index !== -1) {
        const start = document.positionAt(offset + index + 1);
        const end = document.positionAt(offset + index + 1 + packageName.length);
        return new vscode.Range(start, end);
      }

      offset += line.length + 1; // account for newline
    }

    return undefined;
  }

  private isPackageJson(document: vscode.TextDocument): boolean {
    // Check filename first
    if (document.fileName.endsWith("package.json")) {
      return true;
    }
    
    // For untitled documents or tests, check if it's JSON with dependencies structure
    if (document.languageId === "json") {
      const content = document.getText();
      try {
        const parsed = JSON.parse(content);
        // Check if it has typical package.json structure
        return (
          parsed &&
          typeof parsed === "object" &&
          (parsed.dependencies || parsed.devDependencies || parsed.peerDependencies || parsed.optionalDependencies)
        );
      } catch {
        return false;
      }
    }
    
    return false;
  }

  private isSupportedCodeDocument(document: vscode.TextDocument): boolean {
    const supportedLanguages = new Set([
      "javascript",
      "javascriptreact",
      "typescript",
      "typescriptreact",
    ]);

    return supportedLanguages.has(document.languageId);
  }

  private isPnpmWorkspace(document: vscode.TextDocument): boolean {
    const fileName = document.fileName.toLowerCase();
    return fileName.endsWith("pnpm-workspace.yaml") || fileName.endsWith("pnpm-workspace.yml");
  }

  private collectPnpmWorkspacePackages(content: string): Map<string, string | undefined> {
    const result = new Map<string, string | undefined>();
    const lineRegex =
      /^\s*(["']?)(@?[\w.-]+(?:\/[\w.-]+)*)\1\s*:\s*(["']?)([^'"#]+?)\3?\s*(?:#.*)?$/;

    for (const rawLine of content.split(/\r?\n/)) {
      const trimmedLine = rawLine.trim();
      if (!trimmedLine || trimmedLine.startsWith("#")) {
        continue;
      }

      const match = lineRegex.exec(trimmedLine);
      if (!match) {
        continue;
      }

      const name = match[2];
      if (!this.isLikelyPackageName(name)) {
        continue;
      }

      let version = match[4]?.trim() ?? "";
      if (version.endsWith(",")) {
        version = version.slice(0, -1).trim();
      }

      if (!result.has(name)) {
        result.set(name, version || undefined);
      }
    }

    return result;
  }

  private normalizePackageSpecifier(specifier: string): string {
    // Ignore Node.js built-in modules
    if (this.isNodeBuiltin(specifier)) {
      return "";
    }

    if (specifier.startsWith(".") || specifier.startsWith("/")) {
      return "";
    }

    if (specifier.startsWith("@")) {
      const parts = specifier.split("/");
      return parts.length >= 2 ? `${parts[0]}/${parts[1]}` : specifier;
    }

    const parts = specifier.split("/");
    return parts[0];
  }

  /**
   * Check if a module specifier refers to a Node.js built-in module.
   * Handles both prefixed (node:fs) and non-prefixed (fs) forms.
   */
  private isNodeBuiltin(specifier: string): boolean {
    // Handle node: prefixed imports (e.g., node:fs, node:path)
    if (specifier.startsWith("node:")) {
      return true;
    }

    // Extract the base module name (handle subpaths like fs/promises)
    const baseName = specifier.split("/")[0];

    // Check against Node.js built-in modules list
    return builtinModules.includes(baseName);
  }

  private isLikelyPackageName(value: string): boolean {
    if (!value) {
      return false;
    }

    if (value.startsWith(".") || value.startsWith("/")) {
      return false;
    }

    if (value.startsWith("@")) {
      return /@[\w-]+\/[^\s]+/.test(value);
    }

    return /^[a-zA-Z0-9_-]+$/.test(value);
  }

  private findDependencyAtPosition(
    document: vscode.TextDocument, 
    position: vscode.Position, 
    packageName: string
  ): { version: string | undefined } | undefined {
    try {
      const content = document.getText();
      const parsed = JSON.parse(content);
      
      const dependencySections = [
        "dependencies",
        "devDependencies", 
        "peerDependencies",
        "optionalDependencies"
      ];

      // Check if the package exists in any dependency section
      for (const section of dependencySections) {
        const deps = parsed[section];
        if (deps && typeof deps === "object" && packageName in deps) {
          // Now verify that the cursor position is actually within this dependency section
          if (this.isPositionWithinDependencySection(document, position, section, packageName)) {
            return { version: String(deps[packageName]) };
          }
        }
      }

      return undefined;
    } catch (_error) {
      return undefined;
    }
  }

  private isPositionWithinDependencySection(
    document: vscode.TextDocument,
    position: vscode.Position,
    sectionName: string,
    packageName: string
  ): boolean {
    const content = document.getText();
    
    // Use a more robust approach: find the section in the content string
    // and check if the cursor position falls within that section
    const sectionPattern = new RegExp(`"${sectionName}"\\s*:\\s*\\{`, 'g');
    const match = sectionPattern.exec(content);
    
    if (!match) {
      return false;
    }
    
    const sectionStart = match.index;
    const cursorOffset = document.offsetAt(position);
    
    // Find the end of this section by counting braces
    let braceCount = 0;
    let sectionEnd = -1;
    let foundOpenBrace = false;
    
    for (let i = sectionStart; i < content.length; i++) {
      const char = content[i];
      if (char === '{') {
        braceCount++;
        foundOpenBrace = true;
      } else if (char === '}') {
        braceCount--;
        if (foundOpenBrace && braceCount === 0) {
          sectionEnd = i;
          break;
        }
      }
    }
    
    if (sectionEnd === -1) {
      return false;
    }
    
    // Check if cursor is within this section
    if (cursorOffset >= sectionStart && cursorOffset <= sectionEnd) {
      // Additionally verify that the package name exists at this position
      const sectionContent = content.substring(sectionStart, sectionEnd + 1);
      const packagePattern = new RegExp(`"${this.escapeRegex(packageName)}"\\s*:`);
      return packagePattern.test(sectionContent);
    }
    
    return false;
  }

  private isInDependencyKeyPosition(
    document: vscode.TextDocument,
    position: vscode.Position,
    packageName: string,
  ): boolean {
    const line = document.lineAt(position.line);
    const lineText = line.text;
    const cursorChar = position.character;

    // Find all occurrences of the package name in the line
    let searchStart = 0;
    while (searchStart < lineText.length) {
      const nameIndex = lineText.indexOf(packageName, searchStart);
      if (nameIndex === -1) break;

      // Check if cursor is within this occurrence
      if (cursorChar >= nameIndex && cursorChar <= nameIndex + packageName.length) {
        // Check if this occurrence is in a key position (before a colon)
        const beforeName = lineText.substring(0, nameIndex);
        const afterName = lineText.substring(nameIndex + packageName.length);
        
        // Look for pattern: "packageName": (with optional quotes around package name)
        if (beforeName.endsWith('"') && afterName.match(/^"\s*:\s*/)) {
          return true;
        }
      }
      
      searchStart = nameIndex + 1;
    }

    return false;
  }

  private escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
}
