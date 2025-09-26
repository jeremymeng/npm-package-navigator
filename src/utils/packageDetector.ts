import * as vscode from "vscode";

export interface PackageMatch {
  name: string;
  version?: string;
  range?: vscode.Range;
}

export class PackageDetector {
  getPackageAtCursor(
    document: vscode.TextDocument,
    position: vscode.Position,
  ): PackageMatch | undefined {
    const lineText = document.lineAt(position.line).text;

    const importMatch = this.extractFromImport(lineText, position);
    if (importMatch) {
      return importMatch;
    }

    if (this.isPackageJson(document)) {
      return this.extractFromPackageJson(document, position);
    }

    const word = document.getWordRangeAtPosition(position, /[@\w\-/.]+/);
    if (word) {
      const text = document.getText(word);
      if (this.isLikelyPackageName(text)) {
        return { name: this.normalizePackageSpecifier(text), range: word };
      }
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

  private extractFromImport(line: string, position: vscode.Position): PackageMatch | undefined {
    const patterns = [
      /import\s+[^'"`]*?from\s+['"`]([^'"`]+)['"`]/g,
      /import\s+['"`]([^'"`]+)['"`]/g,
      /require\(\s*['"`]([^'"`]+)['"`]\s*\)/g,
      /import\s*\(\s*['"`]([^'"`]+)['"`]\s*\)/g,
    ];

    for (const regex of patterns) {
      regex.lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = regex.exec(line)) !== null) {
        const specifier = match[1];
        const start = match.index + match[0].indexOf(specifier);
        const end = start + specifier.length;

        if (position.character >= start && position.character <= end) {
          const normalized = this.normalizePackageSpecifier(specifier);
          if (normalized) {
            const range = new vscode.Range(
              new vscode.Position(position.line, start),
              new vscode.Position(position.line, end),
            );
            return { name: normalized, range };
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

    return {
      name: text,
      version: this.lookupVersion(document, text),
      range,
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
    return document.fileName.endsWith("package.json");
  }

  private normalizePackageSpecifier(specifier: string): string {
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
}
