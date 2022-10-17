// 'use strict';

// const fs = require('fs');
// const { resolve } = require('path');
// const { exec } = require('child_process');

// // Generate Motoko compiler bindings

// const motokoRepoPath =
//     process.env.MOTOKO_REPO || resolve(__dirname, '../../motoko');

// exec(`cd "${motokoRepoPath}" && nix-build -A js`, (err, stdout, stderr) => {
//     if (err) {
//         console.error(err);
//         process.exit(1);
//     }
//     console.log(stdout);
//     console.error(stderr);

//     const outputLines = stdout.split('\n').reverse();

//     for (const target of ['moc']) {
//         const line = outputLines.find(
//             (line) =>
//                 line.startsWith('/nix/store/') &&
//                 line.endsWith(`-${target}.js`),
//         );
//         if (!line) {
//             throw new Error(`Could not find output directory for ${target}`);
//         }
//         const dest = resolve(__dirname, `../src/generated/${target}.min.js`);
//         fs.unlinkSync(dest);
//         fs.copyFileSync(`${line}/bin/${target}.min.js`, dest);
//     }
// });
