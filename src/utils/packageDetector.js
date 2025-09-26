"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.PackageDetector = void 0;
const vscode = __importStar(require("vscode"));
class PackageDetector {
    getPackageAtCursor(document, position) {
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
    findPackagesInPackageJson(document) {
        if (!this.isPackageJson(document)) {
            return [];
        }
        try {
            const json = JSON.parse(document.getText());
            const matches = [];
            const sections = ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies'];
            for (const section of sections) {
                const deps = json[section];
                if (!deps) {
                    continue;
                }
                for (const [name, version] of Object.entries(deps)) {
                    const range = this.findRangeForDependency(document, name);
                    matches.push({ name, version, range });
                }
            }
            return matches;
        }
        catch (error) {
            return [];
        }
    }
    findPackageRange(document, packageName) {
        return this.findRangeForDependency(document, packageName);
    }
    extractFromImport(line, position) {
        const patterns = [
            /import\s+[^'"`]*?from\s+['"`]([^'"`]+)['"`]/g,
            /import\s+['"`]([^'"`]+)['"`]/g,
            /require\(\s*['"`]([^'"`]+)['"`]\s*\)/g,
            /import\s*\(\s*['"`]([^'"`]+)['"`]\s*\)/g
        ];
        for (const regex of patterns) {
            regex.lastIndex = 0;
            let match;
            while ((match = regex.exec(line)) !== null) {
                const specifier = match[1];
                const start = match.index + match[0].indexOf(specifier);
                const end = start + specifier.length;
                if (position.character >= start && position.character <= end) {
                    const normalized = this.normalizePackageSpecifier(specifier);
                    if (normalized) {
                        const range = new vscode.Range(new vscode.Position(position.line, start), new vscode.Position(position.line, end));
                        return { name: normalized, range };
                    }
                }
            }
        }
        return undefined;
    }
    extractFromPackageJson(document, position) {
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
            range
        };
    }
    lookupVersion(document, packageName) {
        try {
            const json = JSON.parse(document.getText());
            const sections = ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies'];
            for (const section of sections) {
                const deps = json[section];
                if (deps && typeof deps === 'object' && packageName in deps) {
                    return String(deps[packageName]);
                }
            }
        }
        catch (error) {
            // ignore parse failures
        }
        return undefined;
    }
    findRangeForDependency(document, packageName) {
        const text = document.getText();
        const regex = new RegExp(`"${this.escapeRegExp(packageName)}"\s*:\\s*"`, 'g');
        const match = regex.exec(text);
        if (!match) {
            return undefined;
        }
        const offset = match.index + 1; // skip opening quote
        const start = document.positionAt(offset);
        const end = document.positionAt(offset + packageName.length);
        return new vscode.Range(start, end);
    }
    isPackageJson(document) {
        return document.fileName.endsWith('package.json');
    }
    normalizePackageSpecifier(specifier) {
        if (specifier.startsWith('.') || specifier.startsWith('/')) {
            return '';
        }
        if (specifier.startsWith('@')) {
            const parts = specifier.split('/');
            return parts.length >= 2 ? `${parts[0]}/${parts[1]}` : specifier;
        }
        const parts = specifier.split('/');
        return parts[0];
    }
    isLikelyPackageName(value) {
        if (!value) {
            return false;
        }
        if (value.startsWith('.') || value.startsWith('/')) {
            return false;
        }
        if (value.startsWith('@')) {
            return /@[\w-]+\/[^\s]+/.test(value);
        }
        return /^[a-zA-Z0-9_\-]+$/.test(value);
    }
    escapeRegExp(value) {
        return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }
}
exports.PackageDetector = PackageDetector;
//# sourceMappingURL=packageDetector.js.map