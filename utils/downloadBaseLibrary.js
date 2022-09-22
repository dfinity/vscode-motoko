'use strict';

const fs = require('fs');
const mo = require('motoko');

(async () => {
    const package = await mo.fetchPackage('dfinity/motoko-base/master/src');
    if (!package.name || !Object.entries(package.files).length) {
        throw new Error('Unexpected package format');
    }
    fs.writeFileSync(
        __dirname + '/../src/generated/baseLibrary.json',
        JSON.stringify(package),
    );
})().catch((err) => {
    console.error(err);
    process.exit(1);
});
