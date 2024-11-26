const fs = require('fs');
const path = require('path');
const https = require('https');

const generatedDirectory = path.join(__dirname, '../src/generated');
if (!fs.existsSync(generatedDirectory)) {
    fs.mkdirSync(generatedDirectory);
}

https
    .get(
        'https://raw.githubusercontent.com/dfinity/portal/master/docs/references/_attachments/ic.did',
        (response) => {
            if (response.statusCode !== 200) {
                throw new Error(
                    `HTTP ${response.statusCode}: ${response.statusMessage}`,
                );
            }
            const data = [];
            response.on('data', (chunk) => data.push(chunk));
            response.on('end', () => {
                fs.writeFile(
                    path.join(generatedDirectory, 'aaaaa-aa.did.ts'),
                    `export default \`${data.join('')}\`;\n`,
                    (err) => {
                        if (err) {
                            throw err;
                        }
                    },
                );
            });
        },
    )
    .on('error', (err) => {
        console.error(
            'Error while downloading management canister Candid file:',
        );
        throw err;
    });
