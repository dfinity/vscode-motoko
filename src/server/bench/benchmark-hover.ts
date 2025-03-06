import { readFileSync } from 'node:fs';
import { Hover, InitializeResult } from 'vscode-languageserver/node';
import { URI } from 'vscode-uri';
import {
    benchLog,
    createBenchmark,
    logInitializationTiming,
    Setup,
} from './helpers';
import { join } from 'node:path';
import { clientInitParams } from '../test/mock';
import { wait } from '../test/helpers';

createBenchmark('hover', async (setup: Setup) => {
    if (!setup.args.file) {
        console.error(
            'USAGE: node out/benchmark-hover.js --root <path_to_project> --file <relative_path_to_file> [--verbose]',
        );
        process.exit(1);
    }
    const file = join(setup.rootUri.fsPath, setup.args.file);
    const fileUri = URI.file(file);
    const document = {
        uri: `${fileUri}`,
        version: 1,
        text: readFileSync(file, 'utf-8'),
    };
    const hoverParams = {
        textDocument: { uri: document.uri },
        position: { line: 39, character: 0 }, // NOTE: doesn't matter
    };

    const untilInitialized = setup.emitOn('custom/initialized');

    // NOTE: for more accurate measurements
    await setup.sendNotification('custom/disableChecks', {});

    await setup.client.sendRequest<InitializeResult>(
        'initialize',
        clientInitParams(setup.rootUri),
    );

    await setup.sendNotification('initialized', {});

    const before = performance.now();

    // NOTE: run benchmark only after full initialization for more accurate measurements
    await untilInitialized;

    logInitializationTiming(before);

    await setup.sendNotification('textDocument/didOpen', {
        textDocument: {
            ...document,
            languageId: 'motoko',
        },
    });

    benchLog('Sending first hover - should be the slowest one');
    await setup.benchmark<Hover>('textDocument/hover', hoverParams);

    const changeFile = async () => {
        await setup.sendNotification('textDocument/didChange', {
            textDocument: {
                uri: document.uri,
                version: 1,
            },
            contentChanges: [
                {
                    text: document.text,
                },
            ],
        });

        await wait(0.6); // NOTE: avoid skipping frequent hover requests
    };

    benchLog(
        'Sending hovers after change - should be faster than the first hover',
    );
    await setup.benchmark<Hover>(
        'textDocument/hover',
        hoverParams,
        10,
        changeFile,
    );

    benchLog('Sending hovers without change - should reuse cached and be AFAP');
    await setup.benchmark<Hover>('textDocument/hover', hoverParams, 10);
});
