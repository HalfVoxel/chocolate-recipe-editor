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
    layout: number[];
    properties: string[];
}

export interface RecipeData {
    id: number;
    session: number;
    last_edited: string;
    name: string;
    moulds: MouldData[];
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
    id: number|null;
    name: string;
    last_edited: string|null;
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

export function convertServerRecipeToRecipe(recipe: RecipeDataServer, moulds: MouldData[]) : RecipeData {
    let clone: RecipeData = { ...recipe, moulds: Array.from(recipe.moulds.map(m => moulds.find(x => x.id == m)).filter(notUndefinedOrThrow)) };
    return clone;

}

export function convertRecipeToServerRecipe(recipe: RecipeData) : RecipeDataServer {
    let clone: RecipeDataServer = { ...recipe, moulds: Array.from(recipe.moulds.map(m => m.id)) };
    return clone;
}
