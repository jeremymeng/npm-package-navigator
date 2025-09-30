import * as vscode from "vscode";
import { PackageDetector, PackageMatch } from "./utils/packageDetector";
import { PackageNavigationService } from "./services/packageNavigationService";
import { PackageHoverProvider } from "./providers/hoverProvider";
import { Logger } from "./utils/logger";

let navigationService: PackageNavigationService;
let packageDetector: PackageDetector;
let logger: Logger | undefined;

export function activate(context: vscode.ExtensionContext) {
  const outputLogger = new Logger("NPM Package Navigator");
  logger = outputLogger;
  packageDetector = new PackageDetector();
  navigationService = new PackageNavigationService(outputLogger);

  outputLogger.info("Extension activated");

  const hoverProvider = vscode.languages.registerHoverProvider(
    ["javascript", "javascriptreact", "typescript", "typescriptreact", "json"],
    new PackageHoverProvider(packageDetector, navigationService),
  );

  const showMenu = vscode.commands.registerCommand(
    "npm-package-navigator.showPackageMenu",
    async (explicit?: PackageMatch | string) => {
      const match = await resolvePackageMatch(explicit);
      if (!match) {
        vscode.window.showInformationMessage("No package detected at the current cursor position.");
        logger?.debug("Show menu command invoked without detectable package");
        return;
      }

      logger?.info("Showing package navigation menu", { package: match.name, source: explicit ? "explicit" : "cursor" });
      await showPackageNavigationMenu(match);
    },
  );

  const commands = [
    {
      command: "npm-package-navigator.openPackageDirectory",
      handler: (match: PackageMatch) => navigationService.openPackageDirectory(match),
    },
    {
      command: "npm-package-navigator.openPackageJson",
      handler: (match: PackageMatch) => navigationService.openPackageJson(match),
    },
    {
      command: "npm-package-navigator.openReadme",
      handler: (match: PackageMatch) => navigationService.openReadme(match),
    },
    {
      command: "npm-package-navigator.openRepository",
      handler: (match: PackageMatch) => navigationService.openRepository(match),
    },
    {
      command: "npm-package-navigator.openHomepage",
      handler: (match: PackageMatch) => navigationService.openHomepage(match),
    },
    {
      command: "npm-package-navigator.openIssues",
      handler: (match: PackageMatch) => navigationService.openIssues(match),
    },
    {
      command: "npm-package-navigator.openNpm",
      handler: (match: PackageMatch) => navigationService.openNpm(match),
    },
    {
      command: "npm-package-navigator.openUnpkg",
      handler: (match: PackageMatch) => navigationService.openUnpkg(match),
    },
    {
      command: "npm-package-navigator.openJsDelivr",
      handler: (match: PackageMatch) => navigationService.openJsDelivr(match),
    },
  ].map(({ command, handler }) =>
    vscode.commands.registerCommand(command, (raw: PackageMatch | string) => {
      const normalized = normalizeMatch(raw);
      logger?.info(`Command ${command} invoked`, { package: normalized.name });
      return handler(normalized);
    }),
  );

  context.subscriptions.push(hoverProvider, showMenu, ...commands, outputLogger);
}

export function deactivate() {
  logger?.info("Extension deactivated");
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
    label: "$(link-external) npm (latest)",
    description: `Open https://www.npmjs.com/package/${match.name}`,
  });

  if (version) {
    quickPickItems.push({
      label: "$(link-external) npm (version)",
      description: `Open https://www.npmjs.com/package/${match.name}/v/${version}`,
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
    logger?.debug("Package navigation menu dismissed", { package: match.name });
    return;
  }

  logger?.info("Package navigation action selected", { package: match.name, action: selection.label });

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
    case "$(link-external) npm (latest)":
      await vscode.commands.executeCommand("npm-package-navigator.openNpm", {
        name: match.name,
      });
      break;
    case "$(link-external) npm (version)":
      await vscode.commands.executeCommand("npm-package-navigator.openNpm", {
        name: match.name,
        version,
      });
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
  logger?.debug("Normalizing match", match);
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
