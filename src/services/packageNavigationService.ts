import * as vscode from "vscode";
import * as fs from "fs/promises";
import * as path from "path";
import { PackageMatch } from "../utils/packageDetector";
import { Logger } from "../utils/logger";

type RepositoryField = string | { url?: string } | undefined;
type BugsField = string | { url?: string } | undefined;

export interface PackageInfo {
  name: string;
  version?: string;
  description?: string;
  homepage?: string;
  repository?: string;
  bugs?: string;
  private?: boolean;
}

export class PackageNavigationService {
  constructor(private readonly logger: Logger) {}

  async getPackageInfo(packageName: string, documentUri?: vscode.Uri): Promise<PackageInfo | undefined> {
    const packageJsonPath = await this.findPackageJsonPath(packageName, documentUri);
    if (!packageJsonPath) {
      this.logger.debug(`package.json not found for ${packageName}`);
      return undefined;
    }

    try {
      const content = await fs.readFile(packageJsonPath, "utf8");
      const data = JSON.parse(content);
      this.logger.debug(`Loaded package info for ${packageName}`, data);
      return {
        name: packageName,
        version: data.version,
        description: data.description,
        homepage: data.homepage,
        repository: this.normalizeRepository(data.repository),
        bugs: this.normalizeBugs(data.bugs),
        private: data.private,
      };
    } catch (error) {
      this.logger.error(`Failed to parse package.json for ${packageName}`, error);
      return {
        name: packageName,
      };
    }
  }

  async openPackageDirectory(match: PackageMatch): Promise<void> {
    const directory = await this.findPackageDirectory(match.name, match.documentUri);
    if (!directory) {
      vscode.window.showErrorMessage(`Could not find package directory for ${match.name}`);
      this.logger.warn(`Package directory not found`, { package: match.name });
      return;
    }

    this.logger.info(`Opening package directory for ${match.name}`, { package: match.name, directory });
    await vscode.commands.executeCommand("revealFileInOS", vscode.Uri.file(directory));
  }

  async openPackageJson(match: PackageMatch): Promise<void> {
    const packageJsonPath = await this.findPackageJsonPath(match.name, match.documentUri);
    if (!packageJsonPath) {
      vscode.window.showErrorMessage(`package.json not found for ${match.name}`);
      this.logger.warn(`package.json not found`, { package: match.name });
      return;
    }

    this.logger.info(`Opening package.json for ${match.name}`, {
      package: match.name,
      packageJsonPath,
    });
    await vscode.window.showTextDocument(vscode.Uri.file(packageJsonPath));
  }

  async openReadme(match: PackageMatch): Promise<void> {
    const directory = await this.findPackageDirectory(match.name, match.documentUri);
    if (!directory) {
      vscode.window.showErrorMessage(`Package ${match.name} not found in node_modules`);
      this.logger.warn(`Package directory missing when opening README`, { package: match.name });
      return;
    }

    const candidates = [
      "README.md", 
      "readme.md", 
      "README.markdown", 
      "readme.markdown",
      "README.mdown",
      "readme.mdown",
      "README.mkd",
      "readme.mkd",
      "README", 
      "readme", 
      "README.txt", 
      "readme.txt",
      "README.rst",
      "readme.rst"
    ];
    for (const file of candidates) {
      const fullPath = path.join(directory, file);
      try {
        this.logger.info(`Trying to open README for ${match.name}`, { package: match.name, path: fullPath });
        await fs.access(fullPath);
        await vscode.window.showTextDocument(vscode.Uri.file(fullPath));
        return;
      } catch (_error) {
        // try next candidate
      }
    }

    vscode.window.showWarningMessage(`README not found for ${match.name}`);
    this.logger.warn(`README not found`, { package: match.name });
  }

  async openRepository(match: PackageMatch): Promise<void> {
    const info = await this.getPackageInfo(match.name, match.documentUri);
    if (!info?.repository) {
      vscode.window.showErrorMessage(`Repository URL not available for ${match.name}`);
      this.logger.warn(`Repository URL missing`, { package: match.name });
      return;
    }

    this.logger.info(`Opening repository for ${match.name}`, {
      package: match.name,
      url: info.repository,
    });
    await vscode.env.openExternal(vscode.Uri.parse(info.repository));
  }

  async openHomepage(match: PackageMatch): Promise<void> {
    const info = await this.getPackageInfo(match.name, match.documentUri);
    if (!info?.homepage) {
      vscode.window.showErrorMessage(`Homepage not available for ${match.name}`);
      this.logger.warn(`Homepage missing`, { package: match.name });
      return;
    }

    this.logger.info(`Opening homepage for ${match.name}`, { package: match.name, url: info.homepage });
    await vscode.env.openExternal(vscode.Uri.parse(info.homepage));
  }

  async openIssues(match: PackageMatch): Promise<void> {
    const info = await this.getPackageInfo(match.name, match.documentUri);
    const issuesUrl = info?.bugs || this.deriveIssuesFromRepository(info?.repository);
    if (!issuesUrl) {
      vscode.window.showErrorMessage(`Issue tracker not available for ${match.name}`);
      this.logger.warn(`Issue tracker missing`, { package: match.name });
      return;
    }

    this.logger.info(`Opening issue tracker for ${match.name}`, { package: match.name, url: issuesUrl });
    await vscode.env.openExternal(vscode.Uri.parse(issuesUrl));
  }

  async openNpm(match: PackageMatch): Promise<void> {
    const info = await this.getPackageInfo(match.name, match.documentUri);
    if (info?.private) {
      vscode.window.showErrorMessage(`Package ${match.name} is private and not published to npm`);
      this.logger.warn(`Attempted to open npm page for private package`, { package: match.name });
      return;
    }

    const normalizedVersion = this.normalizeVersionSpecifier(match.version);
    const baseUrl = `https://www.npmjs.com/package/${match.name}`;
    const url = normalizedVersion ? `${baseUrl}/v/${normalizedVersion}` : baseUrl;
    this.logger.info(`Opening npm registry page`, { package: match.name, version: normalizedVersion });
    await vscode.env.openExternal(vscode.Uri.parse(url));
  }

  async openUnpkg(match: PackageMatch): Promise<void> {
    const normalizedVersion = this.normalizeVersionSpecifier(match.version);
    const versionSuffix = normalizedVersion ? `@${normalizedVersion}` : "";
    const url = `https://unpkg.com/${match.name}${versionSuffix}/`;
    this.logger.info(`Opening unpkg`, { package: match.name, version: normalizedVersion });
    await vscode.env.openExternal(vscode.Uri.parse(url));
  }

  async openJsDelivr(match: PackageMatch): Promise<void> {
    const normalizedVersion = this.normalizeVersionSpecifier(match.version);
    const versionSegment = normalizedVersion ? `@${normalizedVersion}` : "";
    const url = `https://cdn.jsdelivr.net/npm/${match.name}${versionSegment}/`;
    this.logger.info(`Opening jsDelivr`, { package: match.name, version: normalizedVersion });
    await vscode.env.openExternal(vscode.Uri.parse(url));
  }

  private async findPackageJsonPath(packageName: string, documentUri?: vscode.Uri): Promise<string | undefined> {
    const directory = await this.findPackageDirectory(packageName, documentUri);
    if (!directory) {
      return undefined;
    }

    const manifest = path.join(directory, "package.json");
    try {
      await fs.access(manifest);
      return manifest;
    } catch (_error) {
      return undefined;
    }
  }

  private async findPackageDirectory(packageName: string, documentUri?: vscode.Uri): Promise<string | undefined> {
    // First, try Node.js-style resolution from the document's directory
    if (documentUri && documentUri.scheme === "file") {
      const documentPath = documentUri.fsPath;
      const documentDir = path.dirname(documentPath);
      
      const result = await this.findPackageFromDirectory(documentDir, packageName);
      if (result) {
        this.logger.debug(`Found package via document-relative resolution`, { packageName, result, documentPath });
        return result;
      }
    }

    // Fall back to workspace folder roots
    const folders = vscode.workspace.workspaceFolders;
    if (!folders) {
      this.logger.debug("No workspace folders available to locate package directory");
      return undefined;
    }

    for (const folder of folders) {
      const base = path.join(folder.uri.fsPath, "node_modules");
      const directCandidate = path.join(base, packageName);
      if (await this.exists(directCandidate)) {
        this.logger.debug(`Found package directory`, { packageName, directCandidate });
        return directCandidate;
      }

      const pnpmCandidate = await this.locatePnpmPackage(folder.uri.fsPath, packageName);
      if (pnpmCandidate) {
        this.logger.debug(`Found pnpm package directory`, { packageName, pnpmCandidate });
        return pnpmCandidate;
      }
    }

    this.logger.debug(`Package directory not found`, { packageName });
    return undefined;
  }

  /**
   * Walk up from startDir looking for node_modules containing the package.
   * This mimics Node.js module resolution algorithm.
   */
  private async findPackageFromDirectory(startDir: string, packageName: string): Promise<string | undefined> {
    let currentDir = startDir;
    const root = path.parse(currentDir).root;

    while (currentDir !== root) {
      // Check direct node_modules
      const nodeModulesPath = path.join(currentDir, "node_modules");
      const directCandidate = path.join(nodeModulesPath, packageName);
      
      if (await this.exists(directCandidate)) {
        return directCandidate;
      }

      // Check pnpm structure
      const pnpmCandidate = await this.locatePnpmPackage(currentDir, packageName);
      if (pnpmCandidate) {
        return pnpmCandidate;
      }

      // Move up to parent directory
      const parentDir = path.dirname(currentDir);
      if (parentDir === currentDir) {
        break; // Reached root
      }
      currentDir = parentDir;
    }

    return undefined;
  }

  private normalizeRepository(repository: RepositoryField): string | undefined {
    if (!repository) {
      return undefined;
    }

    if (typeof repository === "string") {
      return this.cleanGitUrl(repository);
    }

    if (repository.url) {
      return this.cleanGitUrl(repository.url);
    }

    return undefined;
  }

  private normalizeBugs(bugs: BugsField): string | undefined {
    if (!bugs) {
      return undefined;
    }

    if (typeof bugs === "string") {
      return bugs;
    }

    if (bugs.url) {
      return bugs.url;
    }

    return undefined;
  }

  private cleanGitUrl(url: string): string {
    let cleaned = url.replace(/^git\+/, "");
    cleaned = cleaned.replace(/\.git$/, "");
    cleaned = cleaned.replace(/^git:\/\//, "https://");
    cleaned = cleaned.replace(/^git@github\.com:/, "https://github.com/");
    return cleaned;
  }

  private deriveIssuesFromRepository(repository?: string): string | undefined {
    if (!repository) {
      return undefined;
    }

    if (repository.includes("github.com")) {
      return `${repository}/issues`;
    }

    return undefined;
  }

  private async exists(target: string): Promise<boolean> {
    try {
      const stat = await fs.stat(target);
      return stat.isDirectory();
    } catch (_error) {
      return false;
    }
  }

  private async locatePnpmPackage(
    workspacePath: string,
    packageName: string,
  ): Promise<string | undefined> {
    const pnpmNodeModules = path.join(workspacePath, "node_modules", ".pnpm", "node_modules");

    const candidateSegments = packageName.startsWith("@")
      ? packageName.split("/")
      : [packageName];

    const candidate = path.join(pnpmNodeModules, ...candidateSegments);

    if (await this.exists(candidate)) {
      this.logger.debug(`Found package inside pnpm store`, { packageName, candidate });
      return candidate;
    }

    this.logger.debug(`Package not found inside pnpm store`, { packageName });
    return undefined;
  }

  private normalizeVersionSpecifier(raw?: string): string | undefined {
    if (!raw) {
      return undefined;
    }

    const cleaned = raw.trim();
    const match = cleaned.match(/(\d+\.\d+\.\d+(?:[-+][^\s]+)?)/);
    return match ? match[1] : undefined;
  }
}
