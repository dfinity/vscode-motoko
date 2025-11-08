import { Position, Range } from 'vscode-languageserver/node';
import { rangeContainsPosition } from '../utils';

interface CommentOrStringCacheEntry {
    version: number;
    ranges: Range[];
}

const commentOrStringRangeCache = new Map<string, CommentOrStringCacheEntry>();

export function clearCommentStringCache(uri: string): void {
    commentOrStringRangeCache.delete(uri);
}

interface CommentScanOptions {
    stopAt?: Position;
    collectRanges: boolean;
    fullScan?: boolean;
}

interface CommentScanResult {
    ranges: Range[];
    containsPosition: boolean;
}

/**
 * Returns true when the provided position falls inside a line or block comment, or inside a
 * string literal. Results are cached per document/version; we fall back to a direct scan when a
 * version isn't available (e.g. unsaved or read-only files).
 */
export function isPositionInsideCommentOrString(
    uri: string,
    lines: string[],
    position: Position,
    version: number | undefined,
): boolean {
    if (position.line >= lines.length) {
        return false;
    }

    if (version === undefined) {
        return scanCommentOrStringRegions(lines, {
            stopAt: position,
            collectRanges: false,
        }).containsPosition;
    }

    const cached = commentOrStringRangeCache.get(uri);
    if (cached?.version === version) {
        return cached.ranges.some((range) =>
            rangeContainsPosition(range, position),
        );
    }

    const scan = scanCommentOrStringRegions(lines, {
        stopAt: position,
        collectRanges: true,
        fullScan: true,
    });
    commentOrStringRangeCache.set(uri, {
        version,
        ranges: scan.ranges,
    });
    return scan.containsPosition;
}

function scanCommentOrStringRegions(
    lines: string[],
    options: CommentScanOptions,
): CommentScanResult {
    const { stopAt, collectRanges } = options;
    const fullScan = options.fullScan ?? collectRanges;
    const ranges: Range[] = [];
    const targetLine = stopAt?.line;
    const targetChar = stopAt?.character ?? 0;
    let containsPosition = false;
    let inBlockComment = false;
    let blockStart: Position | undefined;
    let stringDelimiter: '"' | "'" | undefined;
    let stringStart: Position | undefined;

    const finalize = (): CommentScanResult => ({
        ranges: collectRanges ? ranges : [],
        containsPosition,
    });

    for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
        const line = lines[lineIndex] ?? '';
        let column = 0;
        const isTargetLine = targetLine === lineIndex;

        while (column < line.length) {
            const char = line[column];
            const next = line[column + 1];
            const isTargetColumn = isTargetLine && column === targetChar;

            if (inBlockComment) {
                if (isTargetColumn) {
                    containsPosition = true;
                    if (!fullScan) {
                        return finalize();
                    }
                }
                if (char === '*' && next === '/') {
                    if (
                        isTargetLine &&
                        (column === targetChar || column + 1 === targetChar)
                    ) {
                        containsPosition = true;
                        if (!fullScan) {
                            return finalize();
                        }
                    }
                    if (collectRanges) {
                        ranges.push({
                            start: blockStart ?? {
                                line: lineIndex,
                                character: column,
                            },
                            end: { line: lineIndex, character: column + 2 },
                        });
                    }
                    inBlockComment = false;
                    blockStart = undefined;
                    column += 2;
                    continue;
                }
                column++;
                continue;
            }

            if (stringDelimiter) {
                if (isTargetColumn) {
                    containsPosition = true;
                    if (!fullScan) {
                        return finalize();
                    }
                }
                if (char === '\\') {
                    if (isTargetLine && column + 1 === targetChar) {
                        containsPosition = true;
                        if (!fullScan) {
                            return finalize();
                        }
                    }
                    column = Math.min(column + 2, line.length);
                    continue;
                }
                if (char === stringDelimiter) {
                    if (isTargetColumn) {
                        containsPosition = true;
                        if (!fullScan) {
                            return finalize();
                        }
                    }
                    if (collectRanges) {
                        ranges.push({
                            start: stringStart ?? {
                                line: lineIndex,
                                character: column,
                            },
                            end: { line: lineIndex, character: column + 1 },
                        });
                    }
                    stringDelimiter = undefined;
                    stringStart = undefined;
                    column++;
                    continue;
                }
                column++;
                continue;
            }

            if (char === '/' && next === '*') {
                if (
                    isTargetColumn ||
                    (isTargetLine && column + 1 === targetChar)
                ) {
                    containsPosition = true;
                    if (!fullScan) {
                        return finalize();
                    }
                }
                inBlockComment = true;
                if (collectRanges) {
                    blockStart = { line: lineIndex, character: column };
                }
                column += 2;
                continue;
            }

            if (char === '/' && next === '/') {
                if (isTargetLine && column <= targetChar) {
                    containsPosition = true;
                    if (!fullScan) {
                        return finalize();
                    }
                }
                if (collectRanges) {
                    ranges.push({
                        start: { line: lineIndex, character: column },
                        end: { line: lineIndex, character: line.length },
                    });
                }
                break;
            }

            if (char === '"' || char === "'") {
                if (isTargetColumn) {
                    containsPosition = true;
                    if (!fullScan) {
                        return finalize();
                    }
                }
                stringDelimiter = char as '"' | "'";
                if (collectRanges) {
                    stringStart = { line: lineIndex, character: column };
                }
                column++;
                continue;
            }

            column++;
        }

        const stringContinues = Boolean(stringDelimiter);
        if (stringDelimiter && collectRanges) {
            ranges.push({
                start: stringStart ?? {
                    line: lineIndex,
                    character: line.length,
                },
                end: { line: lineIndex, character: line.length },
            });
        }

        if (
            isTargetLine &&
            !containsPosition &&
            (inBlockComment || stringContinues)
        ) {
            containsPosition = true;
            if (!fullScan) {
                return finalize();
            }
        }

        stringDelimiter = undefined;
        stringStart = undefined;

        if (!fullScan && stopAt && lineIndex >= stopAt.line) {
            return finalize();
        }
    }

    if (collectRanges && inBlockComment && blockStart) {
        const lastLineIndex = Math.max(lines.length - 1, blockStart.line);
        const lastLine = lines[lastLineIndex] ?? '';
        ranges.push({
            start: blockStart,
            end: { line: lastLineIndex, character: lastLine.length },
        });
    }

    return finalize();
}
