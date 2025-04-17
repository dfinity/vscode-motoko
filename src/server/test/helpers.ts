import { Connection } from 'vscode-languageserver/node';

export const wait = (s: number) =>
    new Promise((resolve) => setTimeout(resolve, s * 1000));

export function waitForNotification<T>(
    name: string,
    conn: Connection,
): Promise<T> {
    return new Promise<T>((resolve) => {
        conn.onNotification(name, (message: T) => {
            resolve(message);
        });
    });
}
