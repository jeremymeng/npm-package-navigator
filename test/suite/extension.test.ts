import * as assert from 'assert';
import { PackageDetector } from '../../src/utils/packageDetector';

suite('PackageDetector', () => {
    const detector = new PackageDetector();

    test('isLikelyPackageName accepts scoped packages', () => {
        assert.strictEqual((detector as any).isLikelyPackageName('@types/node'), true);
    });

    test('isLikelyPackageName rejects relative imports', () => {
        assert.strictEqual((detector as any).isLikelyPackageName('./local-module'), false);
    });
});
