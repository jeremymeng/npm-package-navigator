import * as vscode from 'vscode';
import * as fs from 'fs/promises';
import * as path from 'path';
import { PackageMatch } from '../utils/packageDetector';

type RepositoryField = string | { url?: string } | undefined;
type BugsField = string | { url?: string } | undefined;

export interface PackageInfo {
    name: string;
    version?: string;
    description?: string;
    homepage?: string;
    repository?: string;
    bugs?: string;
}

export class PackageNavigationService {
    async getPackageInfo(packageName: string): Promise<PackageInfo | undefined> {
        const packageJsonPath = await this.findPackageJsonPath(packageName);
        if (!packageJsonPath) {
            return undefined;
        }

        try {
            const content = await fs.readFile(packageJsonPath, 'utf8');
            const data = JSON.parse(content);
            return {
                name: packageName,
                version: data.version,
                description: data.description,
                homepage: data.homepage,
                repository: this.normalizeRepository(data.repository),
                bugs: this.normalizeBugs(data.bugs)
            };
    } catch (_error) {
            return {
                name: packageName
            };
        }
    }

    async openPackageDirectory(match: PackageMatch): Promise<void> {
        const directory = await this.findPackageDirectory(match.name);
        if (!directory) {
            vscode.window.showErrorMessage(`Could not find package directory for ${match.name}`);
            return;
        }

        await vscode.commands.executeCommand('revealFileInOS', vscode.Uri.file(directory));
    }

    async openPackageJson(match: PackageMatch): Promise<void> {
        const packageJsonPath = await this.findPackageJsonPath(match.name);
        if (!packageJsonPath) {
            vscode.window.showErrorMessage(`package.json not found for ${match.name}`);
            return;
        }

        await vscode.window.showTextDocument(vscode.Uri.file(packageJsonPath));
    }

    async openReadme(match: PackageMatch): Promise<void> {
        const directory = await this.findPackageDirectory(match.name);
        if (!directory) {
            vscode.window.showErrorMessage(`Package ${match.name} not found in node_modules`);
            return;
        }

        const candidates = ['README.md', 'readme.md', 'README', 'readme', 'README.txt', 'readme.txt'];
        for (const file of candidates) {
            const fullPath = path.join(directory, file);
            try {
                await fs.access(fullPath);
                await vscode.window.showTextDocument(vscode.Uri.file(fullPath));
                return;
            } catch (_error) {
                // try next candidate
            }
        }

        vscode.window.showWarningMessage(`README not found for ${match.name}`);
    }

    async openRepository(match: PackageMatch): Promise<void> {
        const info = await this.getPackageInfo(match.name);
        if (!info?.repository) {
            vscode.window.showErrorMessage(`Repository URL not available for ${match.name}`);
            return;
        }

        await vscode.env.openExternal(vscode.Uri.parse(info.repository));
    }

    async openHomepage(match: PackageMatch): Promise<void> {
        const info = await this.getPackageInfo(match.name);
        if (!info?.homepage) {
            vscode.window.showErrorMessage(`Homepage not available for ${match.name}`);
            return;
        }

        await vscode.env.openExternal(vscode.Uri.parse(info.homepage));
    }

    async openIssues(match: PackageMatch): Promise<void> {
        const info = await this.getPackageInfo(match.name);
        const issuesUrl = info?.bugs || this.deriveIssuesFromRepository(info?.repository);
        if (!issuesUrl) {
            vscode.window.showErrorMessage(`Issue tracker not available for ${match.name}`);
            return;
        }

        await vscode.env.openExternal(vscode.Uri.parse(issuesUrl));
    }

    async openUnpkg(match: PackageMatch): Promise<void> {
        const normalizedVersion = this.normalizeVersionSpecifier(match.version);
        const versionSuffix = normalizedVersion ? `@${normalizedVersion}` : '';
        const url = `https://unpkg.com/${match.name}${versionSuffix}/`;
        await vscode.env.openExternal(vscode.Uri.parse(url));
    }

    async openJsDelivr(match: PackageMatch): Promise<void> {
        const normalizedVersion = this.normalizeVersionSpecifier(match.version);
        const versionSegment = normalizedVersion ? `@${normalizedVersion}` : '';
        const url = `https://cdn.jsdelivr.net/npm/${match.name}${versionSegment}/`;
        await vscode.env.openExternal(vscode.Uri.parse(url));
    }

    private async findPackageJsonPath(packageName: string): Promise<string | undefined> {
        const directory = await this.findPackageDirectory(packageName);
        if (!directory) {
            return undefined;
        }

        const manifest = path.join(directory, 'package.json');
        try {
            await fs.access(manifest);
            return manifest;
    } catch (_error) {
            return undefined;
        }
    }

    private async findPackageDirectory(packageName: string): Promise<string | undefined> {
        const folders = vscode.workspace.workspaceFolders;
        if (!folders) {
            return undefined;
        }

        for (const folder of folders) {
            const base = path.join(folder.uri.fsPath, 'node_modules');
            const directCandidate = path.join(base, packageName);
            if (await this.exists(directCandidate)) {
                return directCandidate;
            }

            const pnpmCandidate = await this.locatePnpmPackage(folder.uri.fsPath, packageName);
            if (pnpmCandidate) {
                return pnpmCandidate;
            }
        }

        return undefined;
    }

    private normalizeRepository(repository: RepositoryField): string | undefined {
        if (!repository) {
            return undefined;
        }

        if (typeof repository === 'string') {
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

        if (typeof bugs === 'string') {
            return bugs;
        }

        if (bugs.url) {
            return bugs.url;
        }

        return undefined;
    }

    private cleanGitUrl(url: string): string {
        let cleaned = url.replace(/^git\+/, '');
        cleaned = cleaned.replace(/\.git$/, '');
        cleaned = cleaned.replace(/^git:\/\//, 'https://');
        cleaned = cleaned.replace(/^git@github\.com:/, 'https://github.com/');
        return cleaned;
    }

    private deriveIssuesFromRepository(repository?: string): string | undefined {
        if (!repository) {
            return undefined;
        }

        if (repository.includes('github.com')) {
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

    private async locatePnpmPackage(workspacePath: string, packageName: string): Promise<string | undefined> {
        const pnpmRoot = path.join(workspacePath, 'node_modules', '.pnpm');
        try {
            const entries = await fs.readdir(pnpmRoot, { withFileTypes: true });
            for (const entry of entries) {
                if (!entry.isDirectory()) {
                    continue;
                }

                const entryName = entry.name;
                if (!entryName.includes('node_modules')) {
                    continue;
                }

                const candidate = path.join(pnpmRoot, entryName, 'node_modules', packageName);
                if (await this.exists(candidate)) {
                    return candidate;
                }
            }
    } catch (_error) {
            // ignore missing pnpm structure
        }

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
