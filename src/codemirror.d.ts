declare module 'codemirror' {
    export function CodeMirror(p: any, o: any): any;
    export default CodeMirror;
    // export const CodeMirror : any;
    export function simpleMode(config: any, modes: any): any;
    export function runMode(value: string, mode: string, callback: any): void;

    export class StringStream {
        constructor(s: string);
        pos: number;
        start: number;
        lineStart: number;
        lineOracle: any;
        string: string;
        eol(): boolean;
        sol(): boolean;
        peek(): boolean;
        next(): string;
        eat(match: string): string | undefined;
        eatWhile(match: string): boolean;
        eatSpace(): boolean;
        skipToEnd(): void;
        skipTo(ch: string): boolean;
        backUp(n: number): void;
        column(): number;
        indentation(): number;
        match(pattern: string, consume?: boolean, caseInsensitive?: boolean): boolean;
        current(): string;
        hideFirstChars<T>(n: number, inner: () => T): void;
        lookAhead(n: number): boolean;
        baseToken(): string;
    }

    export interface Token {
        start: number;
        end: number
        string: string;
        type: string;
        state: any;
    }
}
