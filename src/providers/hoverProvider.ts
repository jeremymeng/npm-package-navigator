import * as vscode from 'vscode';
import { PackageDetector } from '../utils/packageDetector';
import { PackageNavigationService } from '../services/packageNavigationService';

export class PackageHoverProvider implements vscode.HoverProvider {
    constructor(
        private readonly detector: PackageDetector,
        private readonly navigation: PackageNavigationService
    ) {}

    async provideHover(document: vscode.TextDocument, position: vscode.Position): Promise<vscode.Hover | undefined> {
        const match = this.detector.getPackageAtCursor(document, position);
        if (!match) {
            return undefined;
        }

        const info = await this.navigation.getPackageInfo(match.name);

        const markdown = new vscode.MarkdownString(undefined, true);
        markdown.isTrusted = true;
        markdown.supportHtml = true;

        markdown.appendMarkdown(`**${match.name}${info?.version ? `@${info.version}` : ''}**\n\n`);

        if (info?.description) {
            markdown.appendMarkdown(`${info.description}\n\n`);
        }

        const commandArgs = encodeURIComponent(JSON.stringify([match]));
        markdown.appendMarkdown(`[Open Navigator](command:npm-package-navigator.showPackageMenu?${commandArgs})\n\n`);

        const quickLinks: Array<{ label: string; command: string; condition?: boolean }> = [
            { label: 'Package directory', command: 'openPackageDirectory' },
            { label: 'package.json', command: 'openPackageJson' },
            { label: 'README', command: 'openReadme' },
            { label: 'Repository', command: 'openRepository', condition: !!info?.repository },
            { label: 'Homepage', command: 'openHomepage', condition: !!info?.homepage },
            { label: 'Issues', command: 'openIssues', condition: !!info?.bugs }
        ];

        markdown.appendMarkdown(quickLinks
            .filter(link => link.condition === undefined || link.condition)
            .map(link => {
                const args = encodeURIComponent(JSON.stringify([match]));
                return `[${link.label}](command:npm-package-navigator.${link.command}?${args})`;
            })
            .join(' · '));

        if (markdown.value.endsWith(' · ')) {
            markdown.value = markdown.value.slice(0, -3);
        }

        const range = match.range ?? document.getWordRangeAtPosition(position, /[@\w\-/.]+/);
        return new vscode.Hover(markdown, range);
    }
}
