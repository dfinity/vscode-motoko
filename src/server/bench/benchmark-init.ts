import { InitializeResult } from 'vscode-languageserver/node';
import { clientInitParams } from '../test/mock';
import { createBenchmark, logInitializationTiming, Setup } from './helpers';

createBenchmark('init', async (setup: Setup) => {
    const before = performance.now();

    setup.client.onNotification('custom/initialized', (_) =>
        logInitializationTiming(before),
    );

    await setup.benchmark<InitializeResult>(
        'initialize',
        clientInitParams(setup.rootUri),
    );

    await setup.sendNotification('initialized', {});
});
