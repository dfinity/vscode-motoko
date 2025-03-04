import { DepGraph as DG } from 'dependency-graph';

export default class DepGraph {
    // Motoko doesn't allow for circular imports, however, we allow it in the
    // extension to avoid exceptions from this module.
    private readonly _depGraph = new DG<string>({ circular: true });

    clear() {
        for (const node of this._depGraph.overallOrder()) {
            this._depGraph.removeNode(node);
        }
    }

    add(node: string) {
        this._depGraph.addNode(node);
    }

    delete(node: string): boolean {
        const hasNode = this._depGraph.hasNode(node);
        this._depGraph.removeNode(node);
        return hasNode;
    }

    addImmediateImports(from: string, immediateImports: string[]) {
        for (const immediateImport of immediateImports) {
            this._depGraph.addNode(immediateImport);
            this._depGraph.addDependency(from, immediateImport);
        }
    }

    transitiveDependencies(node: string): string[] {
        return this._depGraph.dependenciesOf(node, false);
    }

    transitiveDependents(node: string): string[] {
        return this._depGraph.dependentsOf(node, false);
    }

    removeImmediateDependencies(node: string) {
        for (const file of this.transitiveDependencies(node)) {
            this._depGraph.removeDependency(node, file);
        }
    }
}
