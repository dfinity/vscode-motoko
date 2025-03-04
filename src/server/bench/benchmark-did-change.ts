import { readFileSync } from 'node:fs';
import {
    DocumentSymbol,
    Hover,
    InitializeResult,
} from 'vscode-languageserver/node';
import { URI } from 'vscode-uri';
import { createBenchmark, logInitializationTiming, Setup } from './helpers';
import { join } from 'node:path';
import { clientInitParams } from '../test/mock';

createBenchmark('didChange', async (setup: Setup) => {
    if (!setup.args.file) {
        console.error(
            'USAGE: node out/benchmark-did-change.js --root <path_to_project> --file <relative_path_to_file> [--verbose]',
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

    await setup.client.sendRequest<InitializeResult>(
        'initialize',
        clientInitParams(setup.rootUri),
    );

    await setup.sendNotification('initialized', {});

    const before = performance.now();

    // NOTE: run benchmark only after full initialization for more accurate measurements
    setup.client.onNotification('custom/initialized', async (_) => {
        logInitializationTiming(before);

        await setup.sendNotification('textDocument/didOpen', {
            textDocument: {
                ...document,
                languageId: 'motoko',
            },
        });

        await setup.benchmark<DocumentSymbol>('textDocument/documentSymbol', {
            textDocument: { uri: document.uri },
        });

        await setup.sendNotification(
            'textDocument/didChange',
            {
                textDocument: {
                    uri: document.uri,
                    version: 1,
                },
                contentChanges: [
                    {
                        text: document.text,
                    },
                ],
            },
            100,
        );

        await setup.benchmark<Hover>('textDocument/hover', {
            textDocument: { uri: document.uri },
            position: { line: 39, character: 0 }, // NOTE: doesn't matter
        });

        await setup.sendNotification(
            'textDocument/didChange',
            {
                textDocument: {
                    uri: document.uri,
                    version: 1,
                },
                contentChanges: [
                    {
                        text: document.text,
                    },
                ],
            },
            100,
        );

        await setup.benchmark<Hover>('textDocument/hover', {
            textDocument: { uri: document.uri },
            position: { line: 39, character: 0 }, // NOTE: doesn't matter
        });
    });
});
