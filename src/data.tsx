export interface MouldCavity {
    length: number;
    width: number;
    height: number;
    weight: number;
    footprint: string;
};

export interface MouldData {
    id: number;
    name: string;
    model: string;
    length: number;
    width: number;
    height: number;
    cavity: MouldCavity;
    layout: [number, number];
    properties: string[];
}

export type MouldUsage = {
    mould: MouldData;
    count: number;
}

export interface RecipeData {
    id: number;
    session: number;
    last_edited: string;
    name: string;
    moulds: MouldUsage[];
    recipe: string;
}

export interface RecipeDataServer {
    id: number;
    session: number;
    last_edited: string;
    name: string;
    moulds: number[];
    recipe: string;
}

export interface RecipeDataShallow {
    id: number | null;
    name: string;
    last_edited: string | null;
}

export interface SessionServer {
    id: number;
    name: string;
    created_date: string;
    last_edited: string;
    recipes: number[];
}

export interface SessionDeepServer {
    id: number;
    name: string;
    created_date: string;
    last_edited: string;
    recipes: RecipeDataServer[];
}

export interface Session {
    id: number;
    name: string;
    created_date: string;
    last_edited: string;
    recipes: RecipeData[];
}

export interface ServerResponse<T> {
    status: string,
    data: T,
}


function notUndefinedOrThrow<T>(x: T | undefined): x is T {
    if (x === undefined) {
        throw "Value was undefined";
    }
    return true;
}

export function convertServerRecipeToRecipe(recipe: RecipeDataServer, moulds: MouldData[]): RecipeData {
    const mouldUsages: MouldUsage[] = [];
    for (let mouldId of recipe.moulds) {
        const mould = moulds.find(m => m.id == mouldId);
        if (mould === undefined) {
            throw "Mould not found";
        }
        const existing = mouldUsages.find(m => m.mould.id == mould.id);
        if (existing) {
            existing.count++;
        } else {
            mouldUsages.push({ mould: mould, count: 1 });
        }
    }
    let clone: RecipeData = { ...recipe, moulds: mouldUsages };
    return clone;

}

export function convertRecipeToServerRecipe(recipe: RecipeData): RecipeDataServer {
    let clone: RecipeDataServer = { ...recipe, moulds: Array.from(recipe.moulds.flatMap(m => new Array(m.count).fill(m.mould.id))) };
    return clone;
}
