export function addRecipeMode(codemirror: any) {
    codemirror.defineSimpleMode("testmode", {
        // The start state contains the rules that are intially used
        start: [
            {
                regex: /[^\s][^\(\{]*/,
                token: "recipe-header",
                next: "header",
                indent: true,
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
    });
}