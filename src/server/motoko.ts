import { Motoko } from 'motoko/lib';
// import defaultInstance from 'motoko';
const defaultInstance = require('motoko').default;

const instances: [string, Motoko][] = [];

function newMotokoInstance() {
    Object.keys(require.cache).forEach((key) => {
        if (key.includes('/node_modules/motoko/')) {
            console.error('Deleting cache:', key); ///////
            delete require.cache[key];
        }
    });
    return require('motoko').default;
}

export function addMotokoInstance(virtualDirectory: string): Motoko {
    if (instances.some(([dir]) => dir === virtualDirectory)) {
        console.warn(
            'Duplicate Motoko instances for virtual directory:',
            virtualDirectory,
        );
    }
    const mo = newMotokoInstance();
    let index = 0;
    for (; index < instances.length; index++) {
        let [dir] = instances[index];
        if (
            dir.length < virtualDirectory.length ||
            (dir.length === virtualDirectory.length &&
                dir.localeCompare(virtualDirectory) > 0)
        ) {
            break;
        }
    }
    instances.splice(index, 0, [virtualDirectory, mo]);
    return mo;
}

export function resetMotokoInstances() {
    instances.length = 0;
}

export function allMotokoInstances(): Motoko[] {
    return [...instances.map(([, mo]) => mo), defaultInstance];
}

export function getMotokoInstance(virtualPath: string): Motoko {
    return (
        instances.find(([dir]) => virtualPath.startsWith(dir))?.[1] ??
        defaultInstance
    );
}
