import * as assert from "assert";
import { PackageDetector } from "../../src/utils/packageDetector";
import * as vscode from "vscode";

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
});
