// jest.custom-matchers.d.ts
declare global {
    namespace jest {
        interface Matchers<R> {
            toContainSubarray<E = any>(sub: readonly E[]): R;
        }
    }
}

export {};
