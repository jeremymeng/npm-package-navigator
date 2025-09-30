import * as assert from "assert";
import { PackageDetector } from "../../src/utils/packageDetector";
import * as vscode from "vscode";
import * as fs from "fs/promises";
import * as os from "os";
import * as path from "path";

suite("PackageDetector", () => {
  const detector = new PackageDetector();

  test("isLikelyPackageName accepts scoped packages", () => {
    assert.strictEqual((detector as any).isLikelyPackageName("@types/node"), true);
  });

  test("isLikelyPackageName rejects relative imports", () => {
    assert.strictEqual((detector as any).isLikelyPackageName("./local-module"), false);
  });

  test("detects package name in multi-line import", async () => {
    const document = await vscode.workspace.openTextDocument({
      language: "typescript",
      content: `import {\n  something\n} from "lodash";\n`,
    });

    const line = document.lineAt(2).text;
    const specifierIndex = line.indexOf("lodash");
    assert.ok(specifierIndex >= 0, "specifier should exist in test document");

    const position = new vscode.Position(2, specifierIndex + 1);
    const match = detector.getPackageAtCursor(document, position);

    assert.ok(match, "expected to detect package at cursor");
    assert.strictEqual(match?.name, "lodash");
  });

  test("detects package name in export from statements", async () => {
    const document = await vscode.workspace.openTextDocument({
      language: "typescript",
      content: `export { default as Button } from "@mui/material";\n`,
    });

    const line = document.lineAt(0).text;
    const specifierIndex = line.indexOf("@mui/material");
    assert.ok(specifierIndex >= 0, "specifier should exist in test document");

    const position = new vscode.Position(0, specifierIndex + 2);
    const match = detector.getPackageAtCursor(document, position);

    assert.ok(match, "expected to detect package at cursor");
    assert.strictEqual(match?.name, "@mui/material");
  });

  test("detects catalog entry in pnpm-workspace.yaml", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "npm-package-navigator-"));
    const workspacePath = path.join(tempDir, "pnpm-workspace.yaml");
    await fs.writeFile(
      workspacePath,
      [
        "catalog:",
        "  react: 18.2.0",
        "  '@types/node': ^18.0.0",
        "importers:",
        "  .:",
        "    dependencies:",
        "      \"@mui/material\": \"5.15.0\"",
      ].join("\n"),
      "utf8",
    );

    try {
      const document = await vscode.workspace.openTextDocument(vscode.Uri.file(workspacePath));

      const reactLine = document.lineAt(1).text;
      const reactIndex = reactLine.indexOf("react");
      assert.ok(reactIndex >= 0, "react entry should exist in test document");
      const reactPosition = new vscode.Position(1, reactIndex + 1);
      const reactMatch = detector.getPackageAtCursor(document, reactPosition);
      assert.ok(reactMatch, "expected to detect package at cursor");
      assert.strictEqual(reactMatch?.name, "react");
      assert.strictEqual(reactMatch?.version, "18.2.0");

      const typesLine = document.lineAt(2).text;
      const typesIndex = typesLine.indexOf("@types/node");
      assert.ok(typesIndex >= 0, "@types/node entry should exist in test document");
      const typesPosition = new vscode.Position(2, typesIndex + 2);
      const typesMatch = detector.getPackageAtCursor(document, typesPosition);
      assert.ok(typesMatch, "expected to detect scoped package in catalog");
      assert.strictEqual(typesMatch?.name, "@types/node");
      assert.strictEqual(typesMatch?.version, "^18.0.0");

      const muiLine = document.lineAt(6).text;
      const muiIndex = muiLine.indexOf("@mui/material");
      assert.ok(muiIndex >= 0, "@mui/material entry should exist in dev dependencies");
      const muiPosition = new vscode.Position(6, muiIndex + 2);
      const muiMatch = detector.getPackageAtCursor(document, muiPosition);
      assert.ok(muiMatch, "expected to detect importer dependency");
      assert.strictEqual(muiMatch?.name, "@mui/material");
      assert.strictEqual(muiMatch?.version, "5.15.0");
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });
});
