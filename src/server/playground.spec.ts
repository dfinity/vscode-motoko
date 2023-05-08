import motoko from './motoko';
import { deployPlayground } from './playground';

describe('playground', () => {
    test('deploy', async () => {
        const file = motoko.file('Deploy.mo');
        file.write('actor { public func main() : async Nat { 5 } }');
        const result = await deployPlayground({ file: file.path });
        expect(result.canisterId).toBeTruthy(); ///
    });
});
