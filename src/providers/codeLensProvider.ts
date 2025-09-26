import * as vscode from "vscode";
import { PackageDetector } from "../utils/packageDetector";

export class PackageCodeLensProvider implements vscode.CodeLensProvider {
  constructor(private readonly detector: PackageDetector) {}

  provideCodeLenses(document: vscode.TextDocument): vscode.CodeLens[] {
    const matches = this.detector.findPackagesInPackageJson(document);
    return matches
      .filter((match) => !!match.range)
      .map(
        (match) =>
          new vscode.CodeLens(match.range!, {
            title: "📦 Navigate",
            command: "npm-package-navigator.showPackageMenu",
            arguments: [match],
          }),
      );
  }
}
