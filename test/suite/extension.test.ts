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

  test("does not detect workspace in package.json version specifier", async () => {
    const packageJsonContent = JSON.stringify({
      dependencies: {
        "@azure/dev-tool": "workspace:^",
        "lodash": "^4.17.21"
      }
    }, null, 2);

    const document = await vscode.workspace.openTextDocument({
      language: "json",
      content: packageJsonContent,
    });

    // Test cursor on "workspace" in the version specifier - should not detect
    const workspaceLine = document.lineAt(2).text; // "@azure/dev-tool": "workspace:^",
    const workspaceIndex = workspaceLine.indexOf("workspace");
    assert.ok(workspaceIndex >= 0, "workspace should exist in test document");
    const workspacePosition = new vscode.Position(2, workspaceIndex + 1);
    const workspaceMatch = detector.getPackageAtCursor(document, workspacePosition);
    assert.strictEqual(workspaceMatch, undefined, "should not detect workspace as package name");

    // Test cursor on actual package name - should detect
    const packageIndex = workspaceLine.indexOf("@azure/dev-tool");
    assert.ok(packageIndex >= 0, "@azure/dev-tool should exist in test document");
    // Position cursor within the package name, after the @ symbol
    const packagePosition = new vscode.Position(2, packageIndex + 1);
    const packageMatch = detector.getPackageAtCursor(document, packagePosition);
    assert.ok(packageMatch, "should detect actual package name");
    assert.strictEqual(packageMatch?.name, "@azure/dev-tool");
  });

  test("does not detect package names outside dependency sections", async () => {
    const packageJsonContent = JSON.stringify({
      name: "test-package",
      version: "1.0.0",
      engines: {
        node: ">=20.0.0"
      },
      scripts: {
        test: "echo 'test'"
      },
      dependencies: {
        "lodash": "^4.17.21"
      }
    }, null, 2);

    const document = await vscode.workspace.openTextDocument({
      language: "json",
      content: packageJsonContent,
    });

    // Test cursor on "node" in engines section - should not detect
    const enginesLine = document.lineAt(4).text; // "node": ">=20.0.0"
    const nodeIndex = enginesLine.indexOf("node");
    assert.ok(nodeIndex >= 0, "node should exist in engines section");
    const nodePosition = new vscode.Position(4, nodeIndex + 1);
    const nodeMatch = detector.getPackageAtCursor(document, nodePosition);
    assert.strictEqual(nodeMatch, undefined, "should not detect node in engines as package name");

    // Test cursor on "test" in scripts section - should not detect
    const scriptsLine = document.lineAt(7).text; // "test": "echo 'test'"
    const testIndex = scriptsLine.indexOf("test");
    assert.ok(testIndex >= 0, "test should exist in scripts section");
    const testPosition = new vscode.Position(7, testIndex + 1);
    const testMatch = detector.getPackageAtCursor(document, testPosition);
    assert.strictEqual(testMatch, undefined, "should not detect test in scripts as package name");

    // Test cursor on "lodash" in dependencies section - should detect
    const depsLine = document.lineAt(10).text; // "lodash": "^4.17.21"
    const lodashIndex = depsLine.indexOf("lodash");
    assert.ok(lodashIndex >= 0, "lodash should exist in dependencies section");
    const lodashPosition = new vscode.Position(10, lodashIndex + 1);
    const lodashMatch = detector.getPackageAtCursor(document, lodashPosition);
    assert.ok(lodashMatch, "should detect lodash in dependencies");
    assert.strictEqual(lodashMatch?.name, "lodash");
  });

  test("does not detect dependency section names as packages", async () => {
    const packageJsonContent = JSON.stringify({
      name: "test-package",
      dependencies: {
        "lodash": "^4.17.21"
      },
      devDependencies: {
        "typescript": "^5.0.0"  
      },
      peerDependencies: {
        "react": "^18.0.0"
      },
      optionalDependencies: {
        "fsevents": "^2.0.0"
      }
    }, null, 2);

    const document = await vscode.workspace.openTextDocument({
      language: "json",
      content: packageJsonContent,
    });

    // Test that dependency section names themselves are not detected as packages
    const dependenciesLine = document.lineAt(2).text; // "dependencies": {
    const depsIndex = dependenciesLine.indexOf("dependencies");
    const depsPosition = new vscode.Position(2, depsIndex + 1);
    const depsMatch = detector.getPackageAtCursor(document, depsPosition);
    assert.strictEqual(depsMatch, undefined, "should not detect 'dependencies' as package name");

    const devDependenciesLine = document.lineAt(5).text; // "devDependencies": {
    const devDepsIndex = devDependenciesLine.indexOf("devDependencies");
    const devDepsPosition = new vscode.Position(5, devDepsIndex + 1);
    const devDepsMatch = detector.getPackageAtCursor(document, devDepsPosition);
    assert.strictEqual(devDepsMatch, undefined, "should not detect 'devDependencies' as package name");

    const peerDependenciesLine = document.lineAt(8).text; // "peerDependencies": {
    const peerDepsIndex = peerDependenciesLine.indexOf("peerDependencies");
    const peerDepsPosition = new vscode.Position(8, peerDepsIndex + 1);
    const peerDepsMatch = detector.getPackageAtCursor(document, peerDepsPosition);
    assert.strictEqual(peerDepsMatch, undefined, "should not detect 'peerDependencies' as package name");

    const optionalDependenciesLine = document.lineAt(11).text; // "optionalDependencies": {
    const optDepsIndex = optionalDependenciesLine.indexOf("optionalDependencies");
    const optDepsPosition = new vscode.Position(11, optDepsIndex + 1);
    const optDepsMatch = detector.getPackageAtCursor(document, optDepsPosition);
    assert.strictEqual(optDepsMatch, undefined, "should not detect 'optionalDependencies' as package name");
  });

  test("does not detect package.json property names as packages", async () => {
    const packageJsonContent = JSON.stringify({
      name: "test-package",
      version: "1.0.0",
      description: "A test package",
      main: "index.js",
      scripts: {
        test: "jest"
      },
      devDependencies: {
        "@expo/ngrok": "^4.1.3",
        "@types/react": "~19.1.0",
        "eslint": "^9.25.0",
        "eslint-config-expo": "~10.0.0",
        "typescript": "~5.9.2"
      },
      private: true,
      license: "MIT",
      author: "Test Author"
    }, null, 2);

    const document = await vscode.workspace.openTextDocument({
      language: "json",
      content: packageJsonContent,
    });

    // Test that common package.json properties are not detected as packages
    const privateLine = document.lineAt(15).text; // "private": true
    const privateIndex = privateLine.indexOf("private");
    const privatePosition = new vscode.Position(15, privateIndex + 1);
    const privateMatch = detector.getPackageAtCursor(document, privatePosition);
    assert.strictEqual(privateMatch, undefined, "should not detect 'private' as package name");

    const nameLine = document.lineAt(1).text; // "name": "test-package"
    const nameIndex = nameLine.indexOf("name");
    const namePosition = new vscode.Position(1, nameIndex + 1);
    const nameMatch = detector.getPackageAtCursor(document, namePosition);
    assert.strictEqual(nameMatch, undefined, "should not detect 'name' as package name");

    const versionLine = document.lineAt(2).text; // "version": "1.0.0"
    const versionIndex = versionLine.indexOf("version");
    const versionPosition = new vscode.Position(2, versionIndex + 1);
    const versionMatch = detector.getPackageAtCursor(document, versionPosition);
    assert.strictEqual(versionMatch, undefined, "should not detect 'version' as package name");

    const licenseLine = document.lineAt(16).text; // "license": "MIT"
    const licenseIndex = licenseLine.indexOf("license");
    const licensePosition = new vscode.Position(16, licenseIndex + 1);
    const licenseMatch = detector.getPackageAtCursor(document, licensePosition);
    assert.strictEqual(licenseMatch, undefined, "should not detect 'license' as package name");

    // Test that actual packages in devDependencies are still detected
    const eslintLine = document.lineAt(11).text; // "eslint": "^9.25.0"
    const eslintIndex = eslintLine.indexOf("eslint");
    const eslintPosition = new vscode.Position(11, eslintIndex + 1);
    const eslintMatch = detector.getPackageAtCursor(document, eslintPosition);
    assert.ok(eslintMatch, "should detect eslint in devDependencies");
    assert.strictEqual(eslintMatch?.name, "eslint");
  });

  test("handles custom package.json properties correctly", async () => {
    const packageJsonContent = JSON.stringify({
      name: "test-package",
      customField: "react", // Custom property that matches a real package name
      build: {
        scripts: "lodash" // Nested property that matches a real package name
      },
      devDependencies: {
        "react": "^18.0.0",
        "lodash": "^4.17.21"
      }
    }, null, 2);

    const document = await vscode.workspace.openTextDocument({
      language: "json",
      content: packageJsonContent,
    });

    // "react" in customField should NOT be detected as a package
    const customFieldLine = document.lineAt(2).text; // "customField": "react"
    const customFieldReactIndex = customFieldLine.indexOf("react");
    const customFieldPosition = new vscode.Position(2, customFieldReactIndex + 1);
    const customFieldMatch = detector.getPackageAtCursor(document, customFieldPosition);
    assert.strictEqual(customFieldMatch, undefined, "should not detect 'react' in custom field");

    // "lodash" in nested build.scripts should NOT be detected as a package
    const buildScriptsLine = document.lineAt(4).text; // "scripts": "lodash"
    const buildScriptsLodashIndex = buildScriptsLine.indexOf("lodash");
    const buildScriptsPosition = new vscode.Position(4, buildScriptsLodashIndex + 1);
    const buildScriptsMatch = detector.getPackageAtCursor(document, buildScriptsPosition);
    assert.strictEqual(buildScriptsMatch, undefined, "should not detect 'lodash' in build.scripts");

    // "react" in devDependencies SHOULD be detected as a package
    const devDepReactLine = document.lineAt(7).text; // "react": "^18.0.0"
    const devDepReactIndex = devDepReactLine.indexOf("react");
    const devDepReactPosition = new vscode.Position(7, devDepReactIndex + 1);
    const devDepReactMatch = detector.getPackageAtCursor(document, devDepReactPosition);
    assert.ok(devDepReactMatch, "should detect 'react' in devDependencies");
    assert.strictEqual(devDepReactMatch?.name, "react");

    // "lodash" in devDependencies SHOULD be detected as a package
    const devDepLodashLine = document.lineAt(8).text; // "lodash": "^4.17.21"
    const devDepLodashIndex = devDepLodashLine.indexOf("lodash");
    const devDepLodashPosition = new vscode.Position(8, devDepLodashIndex + 1);
    const devDepLodashMatch = detector.getPackageAtCursor(document, devDepLodashPosition);
    assert.ok(devDepLodashMatch, "should detect 'lodash' in devDependencies");
    assert.strictEqual(devDepLodashMatch?.name, "lodash");
  });
});
