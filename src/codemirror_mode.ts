import { CodeMirror, simpleMode, StringStream, Token, runMode } from "codemirror";

const RecipeParserStates = {
    // The start state contains the rules that are intially used
    start: [
        {
            regex: /[sS]hell:?|[sS]kal:?/,
            token: "shell-header",
            next: "shell",
            indent: false,
        },
        {
            regex: /Kommentarer|Kommentar|Comments|Comment/,
            token: "recipe-comment-header",
            next: "comments",
            indent: true,
        },
        {
            regex: /[^\s][^\(\{]*/,
            token: "recipe-header",
            next: "header",
            indent: true,
        },
    ],
    comments: [
        {
            regex: /\s+/,
            token: "whitespace",
        },
        {
            // No indent at start of line
            regex: /(?=[^\s])/,
            sol: true,
            next: "start",
            dedent: true,
        },
        {
            regex: /.+/,
            token: "recipe-comment"
        },
    ],
    shell: [
        {
            regex: /\s+/,
            next: "shell",
        },
        {
            regex: /0%|white chocolate|white|vit choklad|vita|vit/,
            token: "shell-type shell-type-white",
            next: "start",
        },
        {
            regex: /[0-4][0-9]?%(?: (?:milk chocolate|mjölkchoklad|chocolate|choklad))?|milk chocolate|mjölkchoklad/,
            token: "shell-type shell-type-milk",
            next: "start",
        },
        {
            regex: /[5-6][0-9]%(?: (?:dark chocolate|mörk choklad|chocolate|choklad))?/,
            token: "shell-type shell-type-semi-dark",
            next: "start",
        },
        {
            regex: /(?:100|[7-9][0-9])%(?: (?:dark chocolate|mörk choklad|chocolate|choklad))?/,
            token: "shell-type shell-type-dark",
            next: "start",
        },
        {
            regex: /.+/,
            token: "shell-type",
            next: "start",
        }
    ],
    header: [
        {
            regex: /\(\d+(?:\.\d*)?\)/,
            token: "float",
        },
        {
            // Matches newlines essentially
            regex: /(?=.?)/,
            sol: true,
            next: "indented",
        },
    ],
    indented: [
        {
            // No indent at start of line
            regex: /(?=[^\s])/,
            sol: true,
            next: "start",
            dedent: true,
        },
        {
            regex: /\s\s/,
            sol: true,
            token: "twotabs",
            next: "doubleindent",
        },
        {
            regex: /\s+/,
            token: "whitespace",
        },
        {
            regex: /(\d+(?:\.\d*)?(?:\s*(?:g|gram|ml|l|pinch|nypa|tsk|msk|tsp|tbsp))?)(\s*)(.+)?/,
            token: ["recipe-measurement", null, "recipe-name"],
        },
        {
            regex: /.+/,
            token: "recipe-name"
        }
    ],
    doubleindent: [
        {
            // No indent at start of line
            regex: /(?=[^\s])/,
            sol: true,
            next: "start",
            dedent: true,
        },
        {
            // Single indent at start of line
            regex: /\s(?=[^\s])/,
            sol: true,
            token: "whitespace",
            next: "indented",
        },
        {
            regex: /\s/,
            token: "whitespace",
        },
        {
            regex: /(.+)((?:till|to)\s+)(\d+(?:\.\d*)?(?:\s*(?:g|gram|ml|l|pinch|nypa|tsk|msk|tsp|tbsp))?)/,
            token: ["recipe-name", "keyword-to", "recipe-measurement"],
        },
        {
            regex: /.+/,
            token: "recipe-name"
        },
    ],
    // The meta property contains global information about the mode. It
    // can contain properties like lineComment, which are supported by
    // all modes, and also directives like dontIndentStates, which are
    // specific to simple modes.
    meta: {
        dontIndentStates: [],
        lineComment: "//"
    }
};

export function addRecipeMode(codemirror: any) {

    codemirror.defineMode("testmode", (config: any) => {
        return simpleMode(config, RecipeParserStates);
    });
}

export function tokenizeRecipe(value: string): Token[][] {
    const lines: Token[][] = [];
    let currentLine: Token[] = [];
    runMode(value, "testmode", (tokenValue: string, style: string | null = null, pos: number | null = null, state: any | null) => {
        if (tokenValue == "\n") {
            lines.push(currentLine);
            currentLine = [];
        } else {
            if (style) {
                currentLine.push({
                    start: pos!,
                    end: pos! + tokenValue.length,
                    string: tokenValue,
                    type: style,
                    state: state,
                });
            }
        }
    });
    if (currentLine.length > 0) lines.push(currentLine);
    return lines;
}