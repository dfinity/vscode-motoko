import assert = require('node:assert');
import { resolve } from 'node:path';
import { Connection } from 'vscode-languageserver/node';
import { URI } from 'vscode-uri';
import { setupClientServer } from '../test/mock';
const chalk = require('chalk');
const minimist = require('minimist');
const util = require('util');

export async function measureRequest<T>(
    client: Connection,
    method: string,
    params: object,
): Promise<number> {
    const start = performance.now();
    await client.sendRequest<T>(method, params);
    return performance.now() - start;
}

export async function measureMultipleRequestSequential<T>(
    client: Connection,
    method: string,
    params: object,
    times: number,
    prepare?: () => Promise<void>,
): Promise<number[]> {
    assert(times > 1, 'times must be greater than 1');
    const results: number[] = [];
    for (let i = 0; i < times; i++) {
        if (prepare) await prepare();
        const result = await measureRequest<T>(client, method, params);
        results.push(result);
    }
    return results;
}

export function logMemoryUsage() {
    const totalMemory = process.memoryUsage().heapUsed;
    console.log(
        chalk.yellow(
            `TOTAL MEMORY USAGE: ${(totalMemory / 1024 / 1024).toFixed(2)} MB`,
        ),
    );
}

export class Setup {
    client: Connection;
    rootUri: URI;
    verbose: boolean;
    name: string;
    args: any;

    constructor(
        name: string,
        client: Connection,
        rootUri: URI,
        verbose: boolean,
        args: any,
    ) {
        this.client = client;
        this.rootUri = rootUri;
        this.verbose = verbose;
        this.name = name;
        this.args = args;
    }

    static create(name: string, args: any) {
        if (!args.root) {
            console.error(
                'USAGE: node out/benchmark.js --root <path_to_project> [--verbose]',
            );
            process.exit(1);
        }
        const root = resolve(args.root);
        const verbose = !!args.verbose;
        const rootUri = URI.file(root);

        const [client, _server] = setupClientServer();

        client.onNotification('textDocument/publishDiagnostics', (params) => {
            if (verbose)
                console.log(chalk.cyan(`RECEIVED DIAGNOSTICS: ${params.uri}`));
        });

        return new Setup(name, client, rootUri, verbose, args);
    }

    async sendNotification(
        method: string,
        params: object,
        times?: number,
    ): Promise<void> {
        if (times) {
            assert(times > 1, 'times must be greater than 0');
            await Promise.all(
                [...Array(times)].map((_, _i) =>
                    this.client.sendNotification(method, params),
                ),
            );
        } else {
            await this.client.sendNotification(method, params);
        }
        if (this.verbose) {
            console.log(
                chalk.cyan(
                    `SENT NOTIFICATION: ${method}${
                        times ? ` ${times} times` : ''
                    }`,
                ),
            );
        }
    }

    emitOn<T>(method: string): Promise<T> {
        return new Promise<T>((resolve) => {
            this.client.onNotification(method, async (event) => {
                resolve(event);
            });
        });
    }

    async benchmark<T>(
        method: string,
        params: object,
        times?: number,
        prepare?: () => Promise<void>,
    ): Promise<void> {
        if (times) {
            const timings = await measureMultipleRequestSequential<T>(
                this.client,
                method,
                params,
                times,
                prepare,
            );
            const total = timings.reduce((acc, t) => acc + t, 0);
            const mean = total / times;
            timings.sort((a, b) => a - b);
            const mid = Math.floor(times / 2);
            const median =
                times % 2 !== 0
                    ? timings[mid]
                    : (timings[mid - 1] + timings[mid]) / 2;
            benchLog(
                `Request ${method} result (ran ${times} times sequentially):`,
            );
            console.table({
                'Total (ms)': Number(total.toFixed(2)),
                'Min (ms)': Number(timings[0].toFixed(2)),
                'Max (ms)': Number(timings[timings.length - 1].toFixed(2)),
                'Mean (ms)': Number(mean.toFixed(2)),
                'Median (ms)': Number(median.toFixed(2)),
            });
        } else {
            const result = await measureRequest(this.client, method, params);
            benchLog(
                `Single ${method} request result: ${result.toFixed(2)} ms`,
            );
        }
    }
}

export async function createBenchmark(
    name: string,
    scenario: (setup: Setup) => Promise<void>,
) {
    console.log(chalk.yellow(`Benchmark ${name} is running`));

    const args = minimist(process.argv.slice(2));

    const setup = Setup.create(name, args);

    await scenario(setup);
}

export const logInitializationTiming = (before: DOMHighResTimeStamp) => {
    const after = performance.now();
    benchLog(`Initialization time: ${(after - before).toFixed(2)} ms`);
};

export const benchLog = (...args: any[]) => {
    console.log(chalk.yellow(util.format('BENCHMARK:', ...args)));
};
