expect.extend({
    toContainSubarray<E = any>(
        this: jest.MatcherContext,
        received: readonly E[],
        sub: readonly E[],
    ) {
        const len = sub.length;
        const pass = received.some((_, i) => {
            if (i + len > received.length) return false;
            for (let j = 0; j < len; ++j) {
                if (!this.equals(received[i + j], sub[j])) return false;
            }
            return true;
        });
        return {
            pass,
            message: () =>
                pass
                    ? `Expected array not to contain subarray ${JSON.stringify(
                          sub,
                          null,
                          2,
                      )}`
                    : `Expected array to contain subarray ${JSON.stringify(
                          sub,
                          null,
                          2,
                      )}`,
        };
    },
});
