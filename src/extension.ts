import * as vscode from "vscode";
import { PackageDetector, PackageMatch } from "./utils/packageDetector";
import { PackageNavigationService } from "./services/packageNavigationService";
import { PackageHoverProvider } from "./providers/hoverProvider";
import { PackageCodeLensProvider } from "./providers/codeLensProvider";

let navigationService: PackageNavigationService;
let packageDetector: PackageDetector;

export function activate(context: vscode.ExtensionContext) {
  packageDetector = new PackageDetector();
  navigationService = new PackageNavigationService();

  const hoverProvider = vscode.languages.registerHoverProvider(
    ["javascript", "javascriptreact", "typescript", "typescriptreact", "json"],
    new PackageHoverProvider(packageDetector, navigationService),
  );

  const codeLensProvider = vscode.languages.registerCodeLensProvider(
    { language: "json", pattern: "**/package.json" },
    new PackageCodeLensProvider(packageDetector),
  );

  const showMenu = vscode.commands.registerCommand(
    "npm-package-navigator.showPackageMenu",
    async (explicit?: PackageMatch | string) => {
      const match = await resolvePackageMatch(explicit);
      if (!match) {
        vscode.window.showInformationMessage("No package detected at the current cursor position.");
        return;
      }

      await showPackageNavigationMenu(match);
    },
  );

  const commands = [
    {
      command: "npm-package-navigator.openPackageDirectory",
      handler: (match: PackageMatch | string) =>
        navigationService.openPackageDirectory(normalizeMatch(match)),
    },
    {
      command: "npm-package-navigator.openPackageJson",
      handler: (match: PackageMatch | string) =>
        navigationService.openPackageJson(normalizeMatch(match)),
    },
    {
      command: "npm-package-navigator.openReadme",
      handler: (match: PackageMatch | string) =>
        navigationService.openReadme(normalizeMatch(match)),
    },
    {
      command: "npm-package-navigator.openRepository",
      handler: (match: PackageMatch | string) =>
        navigationService.openRepository(normalizeMatch(match)),
    },
    {
      command: "npm-package-navigator.openHomepage",
      handler: (match: PackageMatch | string) =>
        navigationService.openHomepage(normalizeMatch(match)),
    },
    {
      command: "npm-package-navigator.openIssues",
      handler: (match: PackageMatch | string) =>
        navigationService.openIssues(normalizeMatch(match)),
    },
    {
      command: "npm-package-navigator.openUnpkg",
      handler: (match: PackageMatch | string) => navigationService.openUnpkg(normalizeMatch(match)),
    },
    {
      command: "npm-package-navigator.openJsDelivr",
      handler: (match: PackageMatch | string) =>
        navigationService.openJsDelivr(normalizeMatch(match)),
    },
  ].map(({ command, handler }) => vscode.commands.registerCommand(command, handler));

  context.subscriptions.push(hoverProvider, codeLensProvider, showMenu, ...commands);
}

export function deactivate() {
  // nothing to clean up
}

async function resolvePackageMatch(
  explicit?: PackageMatch | string,
): Promise<PackageMatch | undefined> {
  if (typeof explicit === "string") {
    return { name: explicit };
  }

  if (explicit && typeof explicit === "object") {
    return explicit;
  }

  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    return undefined;
  }

  return packageDetector.getPackageAtCursor(editor.document, editor.selection.active);
}

async function showPackageNavigationMenu(match: PackageMatch): Promise<void> {
  const packageInfo = await navigationService.getPackageInfo(match.name);
  const version = sanitizeVersion(match.version ?? packageInfo?.version);

  const quickPickItems: vscode.QuickPickItem[] = [
    {
      label: "$(folder-opened) Package directory",
      description: "Open the package inside node_modules",
    },
    {
      label: "$(file-code) package.json",
      description: "Open the package manifest",
    },
    {
      label: "$(book) README",
      description: "Open README if available",
    },
  ];

  if (packageInfo?.repository) {
    quickPickItems.push({
      label: "$(repo) Repository",
      description: packageInfo.repository,
    });
  }

  if (packageInfo?.homepage) {
    quickPickItems.push({
      label: "$(home) Homepage",
      description: packageInfo.homepage,
    });
  }

  if (packageInfo?.bugs) {
    quickPickItems.push({
      label: "$(issue-opened) Issues",
      description: packageInfo.bugs,
    });
  }

  quickPickItems.push({
    label: "$(cloud) unpkg (latest)",
    description: `Open https://unpkg.com/${match.name}/`,
  });

  if (version) {
    quickPickItems.push({
      label: "$(cloud) unpkg (version)",
      description: `Open https://unpkg.com/${match.name}@${version}/`,
    });
  }

  quickPickItems.push({
    label: "$(rocket) jsDelivr (latest)",
    description: `Open https://cdn.jsdelivr.net/npm/${match.name}/`,
  });

  if (version) {
    quickPickItems.push({
      label: "$(rocket) jsDelivr (version)",
      description: `Open https://cdn.jsdelivr.net/npm/${match.name}@${version}/`,
    });
  }

  const selection = await vscode.window.showQuickPick(quickPickItems, {
    title: `Navigate package: ${match.name}${version ? `@${version}` : ""}`,
    placeHolder: "Select a target to open",
  });

  if (!selection) {
    return;
  }

  switch (selection.label) {
    case "$(folder-opened) Package directory":
      await vscode.commands.executeCommand("npm-package-navigator.openPackageDirectory", match);
      break;
    case "$(file-code) package.json":
      await vscode.commands.executeCommand("npm-package-navigator.openPackageJson", match);
      break;
    case "$(book) README":
      await vscode.commands.executeCommand("npm-package-navigator.openReadme", match);
      break;
    case "$(repo) Repository":
      await vscode.commands.executeCommand("npm-package-navigator.openRepository", match);
      break;
    case "$(home) Homepage":
      await vscode.commands.executeCommand("npm-package-navigator.openHomepage", match);
      break;
    case "$(issue-opened) Issues":
      await vscode.commands.executeCommand("npm-package-navigator.openIssues", match);
      break;
    case "$(cloud) unpkg (latest)":
      await vscode.commands.executeCommand("npm-package-navigator.openUnpkg", {
        name: match.name,
      });
      break;
    case "$(cloud) unpkg (version)":
      await vscode.commands.executeCommand("npm-package-navigator.openUnpkg", {
        name: match.name,
        version,
      });
      break;
    case "$(rocket) jsDelivr (latest)":
      await vscode.commands.executeCommand("npm-package-navigator.openJsDelivr", {
        name: match.name,
      });
      break;
    case "$(rocket) jsDelivr (version)":
      await vscode.commands.executeCommand("npm-package-navigator.openJsDelivr", {
        name: match.name,
        version,
      });
      break;
    default:
      break;
  }
}

function normalizeMatch(match: PackageMatch | string): PackageMatch {
  if (typeof match === "string") {
    return { name: match };
  }
  return match;
}

function sanitizeVersion(raw?: string): string | undefined {
  if (!raw) {
    return undefined;
  }

  const cleaned = raw.trim();
  const match = cleaned.match(/(\d+\.\d+\.\d+(?:[-+][^\s]+)?)/);
  return match ? match[1] : undefined;
}
