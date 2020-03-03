declare module 'codemirror' {
    export default function CodeMirror(p: any, o: any): any;
    class StringStream {
        pos: number;
        lineStart: number;
        lineOracle: any;
        string: string;
        eol(): boolean;
        sol(): boolean;
        peek(): boolean;
        next(): string;
        eat(match:string): string|undefined;
        eatWhile(match:string): boolean;
        eatSpace(): boolean;
        skipToEnd(): void;
        skipTo(ch:string): boolean;
        backUp(n:number): void;
        column(): number;
        indentation(): number;
        match(pattern: string, consume?: boolean, caseInsensitive?: boolean): boolean;
        current(): string;
        hideFirstChars<T>(n: number, inner: ()=>T): void;
        lookAhead(n:number): boolean;
        baseToken(): string;
    }
}
