export const wait = (s: number) =>
    new Promise((resolve) => setTimeout(resolve, s * 1000));
