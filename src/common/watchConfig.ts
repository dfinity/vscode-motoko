export const watchGlob = '**/*.{mo,did,json,dhall,toml}';

export const ignoreGlobPatterns = [
    '**/node_modules/**/*', // npm packages
    '**/.vessel/.tmp/**/*', // temporary Vessel files
];
