'use strict';

const fs = require('fs');
const mo = require('motoko');

(async () => {
    const basePackage = await mo.fetchPackage('dfinity/motoko-base/master/src');
    if (!basePackage.name || !Object.entries(basePackage.files).length) {
        throw new Error('Unexpected package format');
    }
    fs.writeFileSync(
        __dirname + '/../src/generated/baseLibrary.json',
        JSON.stringify(basePackage),
    );
})().catch((err) => {
    console.error(err);
    process.exit(1);
});
