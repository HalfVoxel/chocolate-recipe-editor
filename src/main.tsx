import CodeMirror from "codemirror";
import { StringStream } from "codemirror"
import "codemirror/addon/mode/simple.js"
import "codemirror/addon/mode/overlay.js"
import "codemirror/addon/runmode/runmode.js"
import * as React from 'react'
import { Component, createRef, Fragment } from 'react';
import '../node_modules/codemirror/lib/codemirror.css';
import './css/style.scss';
import { DragManager } from "./dragdrop"
import { debounce } from 'ts-debounce';
import { type MouldCavity, type MouldData, type RecipeData, type RecipeDataServer, type RecipeDataShallow, type SessionServer, type ServerResponse, convertServerRecipeToRecipe, convertRecipeToServerRecipe, type SessionDeepServer, type Session } from "./data";
import { addRecipeMode, tokenizeRecipe } from "./codemirror_mode";
import { createRoot } from "react-dom/client";

const codemirror: any = CodeMirror;
addRecipeMode(codemirror);

interface RecipeProps {
    draggable_moulds: DragManager<MouldDragData>;
    recipe: RecipeData;
    onChangeMoulds: () => void;
    onDelete: () => void;
    onChangeRecipe: () => void;
}

interface RecipePlaintextProps {
    recipe: RecipeData;
}


interface MouldDragData {
    container: Recipe | null;
    mould: MouldData | null;
}

interface Measurement {
    value: number;
    unit: string;
    original_value: number;
    multiplier: number;
    scaling: MeaurementScaling | null;
}

interface MeaurementScaling {
    type: "multiplier" | "to value";
    value: number;
}

interface ParsedRecipeItem {
    amount: Measurement | null;
    name: string;
    additional_steps: string[];
    final_amount: Measurement | null;
}

interface ParsedRecipeSection {
    name: string;
    items: ParsedRecipeItem[];
    post_comments: string | null;
}

function prettyPrintNumber(val: number): string {
    const aval = Math.abs(val);
    if (aval >= 9.5) return val.toFixed(0);
    if (aval >= 1) return val.toFixed(1);
    return val.toFixed(1);
}

class ParsedRecipe {
    sections: ParsedRecipeSection[] = [];
    parse_success: boolean = true;
    parse_error_token: CodeMirrorToken | null = null;
    parse_error_line: number | null = null;
    parse_error: string | null = null;
    shells: string | null = null;

    totalWeight(): number {
        return this.sections.map(section => section.items.map(s => s.final_amount ? s.final_amount.value : 0).reduce((a, b) => a + b, 0)).reduce((a, b) => a + b, 0);
    }

    totalWeightExact(): number {
        return this.sections.map(section => section.items.map(s => s.final_amount ? s.final_amount.original_value * s.final_amount.multiplier : 0).reduce((a, b) => a + b, 0)).reduce((a, b) => a + b, 0);
    }

    multiply(multiplier: number) {
        for (const section of this.sections) {
            for (const item of section.items) {
                if (item.amount) {
                    item.amount.multiplier *= multiplier;
                    item.amount.value = item.amount.original_value * item.amount.multiplier;
                }
            }
        }
    }

    clear_scaling() {
        for (const section of this.sections) {
            for (const item of section.items) {
                if (item.amount) {
                    item.amount.scaling = null;
                }
            }
        }
    }

    prettyPrint(): string {
        let result = "";
        if (this.shells) {
            result += "Skal: " + this.shells + "\n";
        }
        for (const section of this.sections) {
            result += section.name + "\n";
            for (const item of section.items) {
                result += "\t";
                const amount = item.amount;
                if (amount) {
                    result += prettyPrintNumber(amount.value) + amount.unit;
                    const scaling = amount.scaling;
                    if (scaling) {
                        result += scaling.type == "multiplier" ? "*" : "=>";
                        result += scaling.value;
                    }
                    result += " ";
                }

                result += item.name + "\n";
                for (const subitem of item.additional_steps) {
                    result += "\t\t" + subitem + "\n";
                }
            }
            if (section.post_comments) {
                result += "Kommentarer\n";
                console.log(section.post_comments);
                result += section.post_comments.split("\n").map(x => "\t" + x).join("\n");
                result += "\n";
            }
        }
        return result;
    }
}

interface CodeMirrorToken {
    start: number;
    end: number;
    string: string;
    type: string;
    state: string;
}

class EOLError extends Error {
    constructor() {
        super("EOL");
        // Set the prototype explicitly.
        Object.setPrototypeOf(this, EOLError.prototype);
    }
    override toString() {
        return "Unexpected end of line";
    }
}

class UnexpectedTokenError extends Error {
    found: string;
    expected: string;
    token: CodeMirrorToken | null;
    constructor(found: string, expected: string, token: CodeMirrorToken | null) {
        super("UnexpectedTokenError");
        this.found = found;
        this.expected = expected;
        this.token = token;
        // Set the prototype explicitly.
        Object.setPrototypeOf(this, UnexpectedTokenError.prototype);
    }
    override toString() {
        return "Expected token " + this.expected + " but found " + this.found;
    }
}

class TokenStream {
    tokens: CodeMirrorToken[];
    index: number;

    constructor(tokens: CodeMirrorToken[]) {
        this.tokens = tokens.filter(x => x.type !== null);
        this.index = 0;
    }

    peek() {
        return this.index < this.tokens.length ? this.tokens[this.index] : null;
    }

    next() {
        if (this.index >= this.tokens.length) throw new EOLError();
        const res = this.tokens[this.index];
        this.index++;
        return res;
    }

    expect(type: string) {
        if (this.isAtEnd()) {
            throw new UnexpectedTokenError("<end of line>", type, null);
        }
        let res = this.next()!;
        if (res.type.split(" ").indexOf(type) == -1) throw new UnexpectedTokenError(res.type, type, res);
        return res;
    }

    expectEnd() {
        if (!this.isAtEnd()) throw new UnexpectedTokenError(this.peek()!.type, "[end of stream]", null);
    }

    convert_remaining_to_string() {
        let result = "";
        while (!this.isAtEnd()) {
            result += this.next()!.string;
        }
        return result;
    }

    isAtEnd() {
        return this.index >= this.tokens.length;
    }
}

interface RecipeAdderProps {
    onAdd: (recipe: RecipeData) => void;
    onCreate: () => void;
    moulds: MouldData[],
}


class RecipeAdder extends Component<RecipeAdderProps, { adding: boolean, recipes: RecipeDataShallow[] | null }> {
    constructor(props: RecipeAdderProps) {
        super(props);
        this.state = { adding: false, recipes: null };
    }

    override componentDidMount() {
        this.updateRecipes();
    }

    updateRecipes() {
        fetch("data/recipes").then(r => r.json()).then((response: ServerResponse<RecipeDataShallow[]>) => {
            const recipes = response.data;
            recipes.sort((a, b) => a.id == null ? -1 : b.id == null ? 1 : b.id - a.id);
            recipes.unshift({ id: null, name: "New Recipe", last_edited: null });
            this.setState({ recipes });
        }).catch(e => {
            console.error(e);
            this.setState({ recipes: [] });
        });
    }

    loadRecipe(recipe: RecipeDataShallow) {
        if (recipe.id == null) {
            this.props.onCreate();
        } else {
            fetch("data/recipes/" + recipe.id).then(r => r.json()).then((response: ServerResponse<RecipeDataServer>) => {
                this.setState({ adding: false });
                this.props.onAdd(convertServerRecipeToRecipe(response.data, this.props.moulds));
            }).catch(e => {
                console.error(e);
                this.setState({ adding: false });
            });
        }
    }

    override render() {
        if (!this.state.adding) {
            return (
                <a role="button" onClick={() => { this.updateRecipes(); this.setState({ adding: true }) }} className="recipe-adder recipe-adder-dashed recipe-adder-big-plus">
                    +
                </a>
            )
        } else {
            return (
                <div className="recipe-adder">
                    <div className="recipe-adder-recipe-list">
                        {this.state.recipes?.map(recipe => (<a onClick={() => this.loadRecipe(recipe)}><i className="fas fa-file-alt"></i> {recipe.name}</a>))}
                    </div>
                </div>
            )
        }
    }
}

interface SessionListProps {
    database: RecipeDatabase;
}

class SessionList extends Component<SessionListProps, { sessions: Session[] }> {

    constructor(props: SessionListProps) {
        super(props);
        this.state = { sessions: [] };
    }

    override componentDidMount() {
        this.props.database.loadAllSessionsDeep().then(sessions => {
            this.setState({ sessions });
        });
    }

    override render() {
        return (<div className="session-list">
            {
                this.state.sessions.map(session =>
                (<div key={session.id} className="session-list-item">
                    <a href={"" + session.id}><h2>{session.name} ({toLocalDateString(new Date(session.last_edited))})</h2></a>
                    <ul>
                        {session.recipes.map(recipe => <li key={recipe.id}><a href={"recipes/" + recipe.id}>{recipe.name}</a></li>)}
                    </ul>
                </div>)
                )
            }
        </div>);
    }
}

interface NewSessionProps {
    onCreate: (name: string) => void;
}

class NewSession extends Component<NewSessionProps, { name: string }> {

    constructor(props: NewSessionProps) {
        super(props);
        this.state = { name: "" };
    }

    override render() {
        return (
            <div className="new-session">
                <h2>Create new session</h2>
                <input type="text" placeholder="Name" onInput={ev => this.setState({ name: (ev.target as HTMLInputElement).value })} value={this.state.name}></input>
                <a role="button" onClick={() => this.props.onCreate(this.state.name)}>Create</a>
            </div>
        )
    }
}

// How often to save (at most). In milliseconds
const SavingInterval = 2000;

class RecipePlaintext extends Component<RecipePlaintextProps> {
    constructor(props: RecipeProps) {
        super(props);
    }

    override render() {
        const recipe = this.props.recipe;
        return (
            <div className="recipe-plaintext">
                <h3>{recipe.name}</h3>
                <span>{"\t"}Formar: {recipe.moulds.map(m => m.count + "x " + m.mould.name).join(", ")}<br /></span>
                {recipe.recipe.split("\n").map(line => (<span>{"\t" + line}<br /></span>))}
            </div>
        );
    }
}

function parseRecipe(text: string): ParsedRecipe {
    let tokens = tokenizeRecipe(text);
    let section: ParsedRecipeSection | null = null;
    let item: ParsedRecipeItem | null = null;
    let parsed = new ParsedRecipe();
    parsed.parse_success = true;
    let lineNumber = -1;

    tokens.forEach(line => {
        lineNumber++;
        // while(line.length > 0 && (line[line.length-1].type == "whitespace" || line[line.length-1].type == "twotabs")) line.splice(0, 1);
        const stream = new TokenStream(line);

        try {

            let indent = 0;
            while (stream.peek() && (stream.peek()!.type == "whitespace" || stream.peek()!.type == "twotabs")) {
                indent += stream.peek()!.type == "twotabs" ? 2 : 1;
                stream.next();
            }

            if (stream.isAtEnd()) return;

            if (indent == 0) {
                const headerType = stream.peek()?.type;
                if (headerType == "recipe-header") {
                    // Header
                    section = {
                        name: stream.expect("recipe-header").string,
                        items: [],
                        post_comments: null,
                    }
                    item = null;
                    parsed.sections.push(section);
                    stream.expectEnd();
                } else if (headerType == "shell-header") {
                    if (parsed.shells) {
                        throw new UnexpectedTokenError("shell info", "already have shell info", stream.peek());
                    }
                    stream.expect("shell-header");
                    parsed.shells = stream.expect("shell-type").string;
                } else {
                    // Comments
                    stream.expect("recipe-comment-header");
                    indent = 1;
                }
            }

            if (stream.isAtEnd()) return;

            if (indent == 1) {
                if (stream.peek()?.type == "recipe-comment") {
                    while (stream.peek()?.type == "recipe-comment") {
                        let comment = stream.next()!;
                        if (section) {
                            if (!section.post_comments) section.post_comments = "";
                            else section.post_comments += "\n";
                            section.post_comments += comment.string;
                        }
                    }
                    stream.expectEnd();
                } else {
                    let first = stream.expect("recipe-measurement");
                    let measurement: Measurement | null = null;
                    if (first && first.type == "recipe-measurement") {
                        const matches = first.string.match(/^([0-9\.]+)(.*)$/);
                        const value = parseFloat(matches![1]!);
                        measurement = {
                            value: value,
                            unit: matches![2]!,
                            original_value: value,
                            multiplier: 1.0,
                            scaling: null,
                        };

                        if (stream.peek()?.type == "recipe-scaling") {
                            const scaling = stream.next()!;
                            const matches = scaling.string.match(/(\*|=>)\s*(\d+(:?\.\d+)?)/);
                            const value = parseFloat(matches![2]!);
                            if (matches![1] == "*") {
                                measurement.scaling = {
                                    type: "multiplier",
                                    value
                                }
                            } else {
                                measurement.scaling = {
                                    type: "to value",
                                    value
                                }
                            }
                        }
                    }
                    let name = stream.expect("recipe-name");
                    if (!section) {
                        throw new UnexpectedTokenError("no recipe header", "recipe header", stream.peek()!);
                    }

                    item = {
                        name: name.string,
                        amount: measurement,
                        additional_steps: [],
                        final_amount: measurement,
                    };
                    section!.items.push(item);
                    stream.expectEnd();
                }
            }
            if (indent == 2) {
                if (item == null) {
                    item = {
                        name: "??",
                        amount: null,
                        additional_steps: [],
                        final_amount: null,
                    };
                    section!.items.push(item);
                }

                let index = stream.index;
                let remaining = stream.convert_remaining_to_string();
                stream.index = index;
                let name = stream.expect("recipe-name");
                let last = stream.peek();
                if (last && last.type == "keyword-to") {
                    stream.next();
                    const matches = stream.expect("recipe-measurement-relative").string.match(/^([0-9\.]+)(.*)$/);
                    if (matches !== null && matches.length == 3) {
                        let value = parseFloat(matches[1]!);
                        const unit = matches[2]!;
                        if (item.final_amount == null) {
                            console.error("Missing final amount when modifying");
                        } else {
                            if (unit == "%") {
                                console.log(`Interpreting ${value}% as percentage of ${item.amount!.value}`);
                                const m = value / 100;
                                value = item.amount!.value * m;

                                item.final_amount = {
                                    ...item.final_amount,
                                    value: item.final_amount.value * m,
                                    multiplier: item.final_amount.multiplier * m,
                                };
                            } else {
                                item.final_amount = {
                                    value: value,
                                    unit: matches[2]!,
                                    original_value: value,
                                    multiplier: 1.0,
                                    scaling: item.final_amount.scaling,
                                };
                            }
                        }
                    }
                }
                item.additional_steps.push(remaining);
                stream.expectEnd();
            }

            if (indent > 2) throw new UnexpectedTokenError("indent=" + indent, "indent<=2", stream.peek()!);
        } catch (e) {
            if (e instanceof EOLError || e instanceof UnexpectedTokenError) {
                // Ok, parse error
                // Continue to next line
                parsed.parse_success = false;
                if (e instanceof UnexpectedTokenError) {
                    parsed.parse_error_token = e.token;
                    parsed.parse_error_line = lineNumber;
                    parsed.parse_error = "Unexpected token";
                } else {
                    parsed.parse_error_line = lineNumber;
                    parsed.parse_error = "Unexpected end of line";
                }
            } else {
                throw e;
            }
            console.log(`Failure on line ${lineNumber}`, e.toString());
            console.error(e);
        }
    });
    return parsed;
}

class Recipe extends Component<RecipeProps, { recipe: RecipeData, manualLeftover: string }> {
    textarea: any;
    moulds_container: any;
    inputLeftover: any;
    codemirror: any;
    saving: boolean = false;
    parsed_recipe: ParsedRecipe = new ParsedRecipe();
    last_parsed_recipe: ParsedRecipe = new ParsedRecipe();
    debouncedSave = debounce(() => this.save(), SavingInterval);
    debouncedUpdateUI = debounce(() => this.updateUICallback(), 200);

    constructor(props: RecipeProps) {
        super(props);
        this.textarea = createRef();
        this.state = { recipe: props.recipe, manualLeftover: "0" };
        this.moulds_container = createRef();
        this.inputLeftover = createRef();
    }

    removeMould(mould: MouldData): boolean {
        let recipe = this.state.recipe;
        const any = recipe.moulds.find(u => u.mould == mould) !== undefined;
        recipe.moulds = recipe.moulds.map(u => u.mould == mould ? { ...u, count: u.count - 1 } : u).filter(u => u.count > 0);
        this.setState({ recipe });
        if (this.props.onChangeMoulds) this.props.onChangeMoulds();
        this.debouncedSave();
        this.debouncedUpdateUI();
        return any;
    }

    addMould(mould: MouldData) {
        const recipe = this.state.recipe;
        const existing = recipe.moulds.find(u => u.mould == mould);
        if (existing) {
            existing.count++;
        } else {
            recipe.moulds = recipe.moulds.concat([{ mould, count: 1 }]);
        }
        this.setState({ recipe });
        if (this.props.onChangeMoulds) this.props.onChangeMoulds();
        this.debouncedSave();
        this.debouncedUpdateUI();
    }

    updateUICallback() {
        this.state.recipe.recipe = this.codemirror.getValue();
        this.props.onChangeRecipe();
    }

    save() {
        if (this.saving) return;
        this.updateUICallback();
        fetch("data/recipes/" + this.state.recipe.id, {
            "method": "UPDATE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(convertRecipeToServerRecipe(this.state.recipe))
        }).then(r => r.json()).then((response: ServerResponse<RecipeDataServer>) => {
            console.log("Saved");
        }).catch(e => {
            console.trace(e);
        }).finally(() => {
            this.saving = false;
        });
    }

    override componentDidMount() {
        this.codemirror = CodeMirror(this.textarea.current, {
            value: this.state.recipe.recipe,
            mode: "testmode",
            indentWithTabs: true,
            tabSize: 4,
            indentUnit: 4,
        });

        var mustacheOverlay = {
            token: (stream: StringStream, state: any, blah: any) => {
                if (stream.lineOracle.line == this.last_parsed_recipe.parse_error_line) {
                    let token = this.last_parsed_recipe.parse_error_token;
                    if (token != null) {
                        if (stream.pos == token.start) {
                            stream.pos = token.end;
                            return "error-token";
                        }
                        // console.log("Emitting...", stream.pos);
                        // console.log("Token", this.last_parsed_recipe.parse_error_token?.start, stream.pos);
                        stream.next();
                    } else {
                        if (stream.pos == stream.string.length - 1 && this.codemirror.getCursor().line != this.last_parsed_recipe.parse_error_line) {
                            stream.skipToEnd();
                            return "error-token";
                        }
                        stream.next();
                    }
                } else {
                    stream.skipToEnd();
                }
                return null;
            }
        };
        this.codemirror.addOverlay(mustacheOverlay);

        this.codemirror.on("change", () => {
            this.setState({});
            this.debouncedSave();
            this.debouncedUpdateUI();
            console.log("Changed recipe");
            //this.parseRecipe(this.codemirror.getValue());
        });

        this.codemirror.on("blur", () => {
            // refreshOverlay();
        });

        this.codemirror.on("focus", () => {
            // refreshOverlay();
        });

        // Add drop zone for moulds
        this.props.draggable_moulds.add(this.moulds_container.current, null, this.moulds_container.current, { container: this, mould: null });
    }

    addDraggableMould(mouldData: MouldData, mouldElement: Mould) {
        if (!mouldElement) return;
        let element = mouldElement.element_holder.current;
        this.props.draggable_moulds.add(element!, element, null, { container: this, mould: mouldData });
    }

    getTokens(): CodeMirrorToken[][] {
        let result = [];
        for (let i = 0; i < this.codemirror.lineCount(); i++) {
            result.push(this.codemirror.getLineTokens(i, true));
        }
        return result;
    }

    findBestValue(recipe: ParsedRecipe, sectionIndex: number, itemIndex: number, sectionName: string, itemName: string, measurement: Measurement) {
        for (let i = 0; i < recipe.sections.length; i++) {
            const section = recipe.sections[i]!;
            for (let j = 0; j < section.items.length; j++) {
                const item = section.items[j]!;

                if (item.amount) {
                    let score = 0;
                    if (i == sectionIndex) score += 1;
                    if (j == itemIndex) score += 1;
                    if (section.name == sectionName) score += 1;
                    if (item.name == itemName) score += 1;

                    if (score >= 3) {
                        if (Math.abs(item.amount.original_value * item.amount.multiplier - measurement.value) <= 0.5) {
                            return item.amount;
                        }
                    }
                }
            }
        }
        return null;
    }

    findExactValues(recipe: ParsedRecipe, previousRecipe: ParsedRecipe) {
        for (let i = 0; i < recipe.sections.length; i++) {
            const section = recipe.sections[i]!;
            for (let j = 0; j < section.items.length; j++) {
                const item = section.items[j]!;
                if (item.amount) {
                    const previous = this.findBestValue(previousRecipe, i, j, section.name, item.name, item.amount);
                    if (previous != null) {
                        item.amount.original_value = previous.original_value;
                        item.amount.multiplier = previous.multiplier;
                    }
                }
            }
        }
    }

    mould_weight_model(recipe: RecipeData) {
        let result = 0
        for (const mould of recipe.moulds) {
            const weight = mould.mould.cavity.weight;
            const itemCount = mould.mould.layout[0] * mould.mould.layout[1];
            const v0 = itemCount * weight * mould.count;
            // const v1 = count * (weight**(2/3));
            result += v0 * 0.69 + 93;
        }

        return result;
    }

    multiply_recipe(multiplier: number) {
        const parsed = parseRecipe(this.codemirror.getValue());
        if (parsed.parse_success) {
            this.findExactValues(parsed, this.parsed_recipe);
            this.parsed_recipe = parsed;
        } else {
            return;
        }

        parsed.multiply(multiplier);
        parsed.clear_scaling();
        this.codemirror.setValue(parsed.prettyPrint());
    }

    rebalance(weight: number) {
        if (weight <= 0) return;

        const parsed = parseRecipe(this.codemirror.getValue());
        if (parsed.parse_success) {
            this.findExactValues(parsed, this.parsed_recipe);
            this.parsed_recipe = parsed;
        } else {
            return;
        }

        let currentWeight = parsed.totalWeightExact();
        let multiplier = weight / currentWeight;

        let largestWeight = 0;
        for (const section of parsed.sections) {
            for (const item of section.items) {
                if (item.amount) {
                    largestWeight = Math.max(largestWeight, item.amount.original_value * item.amount.multiplier * multiplier);
                }
            }
        }

        if (largestWeight > 100) {
            // Round up to multiples of 25
            multiplier *= (25 * Math.ceil(largestWeight / 25)) / largestWeight;
        }

        parsed.multiply(multiplier);

        this.codemirror.setValue(parsed.prettyPrint());
    }

    delete() {
        this.props.onDelete();
    }

    override render() {
        // Note: this.codemirror will be null the first time render is called
        const parsed = parseRecipe(this.codemirror ? this.codemirror.getValue() : this.state.recipe.recipe);
        if (parsed.parse_success) {
            this.findExactValues(parsed, this.parsed_recipe);
            this.parsed_recipe = parsed;
        }
        this.last_parsed_recipe = parsed;

        const model_weight = this.mould_weight_model(this.state.recipe);

        const leftover = (this.parsed_recipe.totalWeight() - Math.max(0, model_weight - 100)).toFixed(0);
        const inputText = document.activeElement === this.inputLeftover?.current ? this.state.manualLeftover : leftover;

        let manual_rebalance: number | null = null;
        for (const section of this.parsed_recipe.sections) {
            for (const item of section.items) {
                if (item.amount && item.amount.scaling) {
                    const scaling = item.amount.scaling;
                    if (scaling.type == "multiplier") {
                        manual_rebalance = scaling.value;
                    } else {
                        manual_rebalance = scaling.value / item.amount.value;
                    }
                }
            }
        }

        let inputLeftover = (<input
            ref={this.inputLeftover}
            onInput={(ev) => {
                this.setState({ manualLeftover: (ev.target as HTMLInputElement).value });
                const targetWeight = Math.max(0, model_weight - 100) + parseFloat(this.state.manualLeftover);
                if (isFinite(targetWeight) && targetWeight > 0) {
                    this.rebalance(targetWeight);
                }
            }}
            onFocus={() => this.setState({ manualLeftover: leftover })}
            onBlur={() => this.setState({})}
            type="text"
            style={{
                width: `calc(${Math.max(1, inputText.length)}ch + 2px)`,
                "WebkitAppearance": "none",
                "appearance": "none",
                "background": "none",
                "color": "white",
                "border": "none",
                "fontSize": "12pt",
            }}
            value={inputText} ></input >);

        let itemCount = 0;
        const shapeCounts = new Map<string, number>();
        for (const mould of this.state.recipe.moulds) {
            const count = mould.count * mould.mould.layout[0] * mould.mould.layout[1];
            itemCount += count;
            shapeCounts.set(mould.mould.cavity.footprint, (shapeCounts.get(mould.mould.cavity.footprint) ?? 0) + count);
        }
        let mostCommonFootprint: string | null = null;
        let mostCommonFootprintCount = 0;
        for (const [footprint, count] of shapeCounts) {
            if (count > mostCommonFootprintCount) {
                mostCommonFootprint = footprint;
                mostCommonFootprintCount = count;
            }
        }
        return (
            <div className="recipe draggable-source">
                <div className="recipe-inner">
                    <div className="recipe-top">
                        <span className={"recipe-item-count mould-icon " + (itemCount >= 100 ? "large-count" : "")}><span className={"mould-icon-" + (mostCommonFootprint ?? "circle")}>{this.state.recipe.moulds.map(m => m.count * m.mould.layout[0] * m.mould.layout[1]).reduce((a, b) => a + b, 0)}</span></span>
                        <input className="recipe-name" type="text" value={this.state.recipe.name} onInput={ev => { this.state.recipe.name = (ev.target as HTMLInputElement).value; this.setState({}); this.debouncedSave(); }} />
                        <a role="button" className="recipe-delete fas fa-trash" onClick={() => this.delete()}></a>
                    </div>
                    <div className="recipe-contents">
                        <div className="recipe-moulds" ref={this.moulds_container}>
                            {
                                this.state.recipe.moulds.length > 0 ? this.state.recipe.moulds.map((mould, i) => <Mould key={i} mould={mould.mould} usageCount={mould.count} ref={(element: any) => this.addDraggableMould(mould.mould, element as Mould)} />) : (<div className="recipe-moulds-dropzone draggable-source">Drop moulds here</div>)
                            }
                        </div>
                        <div className="recipe-editor-holder" ref={this.textarea}></div>
                        {
                            manual_rebalance != null ?
                                (
                                    <a role="button" className={"btn-recipe" + (model_weight > 0 ? "" : " btn-disabled")} onClick={() => this.multiply_recipe(manual_rebalance!)}><span>Multiply recipe by ({manual_rebalance!.toFixed(2)})</span></a>
                                )
                                : (
                                    <a role="button" className={"btn-recipe" + (model_weight > 0 ? "" : " btn-disabled")} onClick={() => this.rebalance(model_weight)}><span>Rebalance to moulds ({model_weight.toFixed()} g)</span></a>
                                )
                        }
                    </div>
                    <div className="recipe-bottom">
                        <div className="recipe-total">
                            <div className="box-top">Filling weight</div>
                            <div>{this.parsed_recipe.totalWeight().toFixed(0)} g</div>
                        </div>
                        <div className="recipe-leftover">
                            <div className="box-top">Expected leftover filling</div>
                            {inputLeftover}<span> g</span>
                        </div>
                    </div>
                </div>
            </div>
        )
    }

}

interface MouldProps {
    mould: MouldData;
    usageCount: number;
    // draggable_moulds: DragManager;
}

function titleCase(str: string) {
    str = str.toLowerCase();
    const words = str.split(' ');
    for (var i = 0; i < words.length; i++) words[i] = words[i]!.charAt(0).toUpperCase() + words[i]!.slice(1);

    return words.join(' '); // ["I'm", "A", "Little", "Tea", "Pot"].join(' ') => "I'm A Little Tea Pot"
}

function capitalizeFirstCharacter(str: string) {
    return str.length > 0 ? str.charAt(0).toUpperCase() + str.slice(1) : str;
}

class Mould extends Component<MouldProps> {
    element_holder = createRef<HTMLDivElement>();

    override componentDidMount() {
        // this.props.draggable_moulds.add(this.element_holder.current, this.element_holder.current, null);
    }

    override render() {
        let data = this.props.mould;
        return (
            <div className="mould draggable-source draggable-handle" ref={this.element_holder}>
                <div className="mould-icon"><span className={"mould-icon-" + data.cavity.footprint}>{data.layout[0] * data.layout[1]}</span></div>
                <div className="mould-names">
                    <span className="model">{data.model}</span><span className="nickname">{titleCase(data.name)}</span>
                </div>
                {this.props.usageCount > 0 ? (<span className="mould-usage-count">{this.props.usageCount}</span>) : null}
            </div>
        )
    }
}



enum DisplayMode {
    Normal,
    PlainText,
}

function toLocalDateString(date: Date) {
    const offset = date.getTimezoneOffset()
    date = new Date(date.getTime() + (offset * 60 * 1000))
    return date.toISOString().split('T')[0]
}

class RecipeDatabase {
    moulds: Promise<MouldData[]>;
    private currentMoulds: MouldData[];

    constructor() {
        this.currentMoulds = [];
        this.moulds = Promise.resolve([]);
    }

    init() {
        this.moulds = fetch(`data/moulds`).then(r => r.json()).then((moulds: MouldData[]) => {
            for (let i = 0; i < moulds.length; i++) {
                moulds[i]!.id = i;
            }
            this.currentMoulds = moulds;
            return moulds;
        });
    }

    async loadAllSessionsDeep(): Promise<Session[]> {
        const r = await fetch("data/sessions/deep");
        const moulds = await this.moulds;
        const response: ServerResponse<SessionDeepServer[]> = await r.json();
        const sessions = response.data.map(s => {
            return {
                ...s,
                recipes: s.recipes.map(x => convertServerRecipeToRecipe(x, moulds)),
            } as Session;
        });

        // Newer recipes first
        sessions.sort((a, b) => new Date(b.created_date).getTime() - new Date(a.created_date).getTime());
        return sessions;
    }

    async loadSession(sessionID: number): Promise<Session> {
        const r = await fetch("data/sessions/" + sessionID);
        const serverSession: ServerResponse<SessionServer> = await r.json();
        const recipes: ServerResponse<RecipeDataServer>[] = await Promise.all(serverSession.data.recipes.map(id => fetch("data/recipes/" + id).then(r => r.json())));
        const moulds = await this.moulds;
        const session: Session = {
            ...serverSession.data,
            recipes: recipes.map(x => convertServerRecipeToRecipe(x.data, moulds)),
        };
        return session;
    }

    getLoadedMoulds(): MouldData[] {
        return this.currentMoulds;
    }
}

interface AppState {
    moulds: MouldData[],
    session: Session | null,
    mode: DisplayMode
}


class App extends Component<{}, AppState> {
    database: RecipeDatabase = new RecipeDatabase();
    recipes_holder: any;
    moulds_holder: any;
    draggable_moulds: DragManager<MouldDragData>;
    draggable_recipes: any;

    constructor(props: any) {
        super(props);
        this.state = { moulds: [], session: null, mode: DisplayMode.Normal };

        this.recipes_holder = createRef();
        this.moulds_holder = createRef();
        // this.draggable_recipes = new Draggable([], { handle: ".draggable-handle" });
        // this.draggable_moulds = new Draggable([], { handle: ".draggable-handle" });
        // onDrop(this.draggable_moulds, (e: DropEvent) => {
        //     console.log(e);
        // });
        this.draggable_moulds = new DragManager();
        this.draggable_moulds.onDragEnd(event => {
            const all = event.mouse_event?.ctrlKey ?? false;
            if (event.source_data!.container !== null) {
                while (event.source_data!.container?.removeMould(event.source_data!.mould!)) {
                    event.target_data?.container?.addMould(event.source_data!.mould!);
                    if (!all) break;
                }
            } else {
                event.target_data?.container?.addMould(event.source_data!.mould!);
            }
        });


        // for (let i = 0; i < 10; i++) {
        //     this.state.recipes.push({
        //         id: i,
        //         name: "",
        //         moulds: [],
        //         recipe: "",
        //     });
        // }
        // for (let i = 0; i < 10; i++) {
        //     this.state.moulds.push(new MouldData());
        //     this.state.moulds[this.state.moulds.length - 1].id = i;
        // }
    }

    override componentDidMount() {
        this.database.init();
        console.log("Mounted");

        this.database.moulds.then(moulds => {
            this.setState({ moulds });
        })

        const match = window.location.pathname.match(/^\/(\d+)$/);
        if (match) {
            this.loadSession(parseInt(match[1]!));
        }
    }

    calculateMouldUsage(): { [key: number]: number } {
        if (!this.state.session) {
            return {};
        }

        const usage: { [key: number]: number } = {};
        this.state.moulds.forEach(mould => usage[mould.id] = 0);
        this.state.session.recipes.forEach(recipe => {
            recipe.moulds.forEach(mould => {
                usage[mould.mould.id] = (usage[mould.mould.id] || 0) + mould.count;
            })
        });
        return usage;
    }

    addDraggableMould(mouldData: MouldData, mouldElement: Mould) {
        if (!mouldElement) return;
        let element = mouldElement.element_holder.current;
        this.draggable_moulds.add(element!, element, null, { container: null, mould: mouldData });
    }

    loadSession(sessionID: number) {
        this.database.loadSession(sessionID).then(session => {
            this.setState({ session });
        });
    }

    loadRecipe(recipe: RecipeData) {
        const session = this.state.session;
        if (!session) throw "Cannot load recipe without a session";

        let newRecipe = { ...recipe };
        newRecipe.session = session.id;
        newRecipe.moulds = [];

        fetch("data/recipes", {
            "method": "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(newRecipe)
        }).then(r => r.json()).then((response: ServerResponse<RecipeDataServer>) => {
            this.setState({ session: { ...session, recipes: [...session.recipes, convertServerRecipeToRecipe(response.data, this.state.moulds)] } });
        }).catch(e => {
            console.trace(e);
        });
    }

    createNewRecipe() {
        const session = this.state.session;
        if (!session) throw "Cannot create recipe without a session";

        const recipe: RecipeData = {
            id: 0,
            name: "New Recipe",
            session: session.id,
            moulds: [],
            recipe: "",
            last_edited: "",
        };
        fetch("data/recipes", {
            "method": "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(recipe)
        }).then(r => r.json()).then((response: ServerResponse<RecipeDataServer>) => {
            this.setState({ session: { ...session, recipes: [...session.recipes, convertServerRecipeToRecipe(response.data, this.state.moulds)] } });
        }).catch(e => {
            console.trace(e);
        });
    }

    createNewSession(name: string) {
        fetch("data/sessions", {
            "method": "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name })
        }).then(r => r.json()).then((response: ServerResponse<SessionServer>) => {
            this.loadSession(response.data.id);
        }).catch(e => {
            console.trace(e);
        });
    }

    deleteRecipe(recipe: RecipeData) {
        fetch("data/recipes/" + recipe.id, {
            "method": "DELETE"
        }).then(r => r.json()).then((response: ServerResponse<SessionServer>) => {
            const session = this.state.session;
            if (session) {
                this.setState({ session: { ...session, recipes: session.recipes.filter(x => x.id != recipe.id) } });
            }
        }).catch(e => {
            console.trace(e);
        });
    }

    calculateMouldTemperingAmounts(recipes: RecipeData[]): { shell: string, mass: number }[] {
        const amounts = new Map<string, number>();
        for (const recipe of recipes) {
            let parsed = parseRecipe(recipe.recipe);
            let shell = parsed.shells;
            if (!shell) shell = "Unspecified";

            if (!amounts.has(shell)) {
                amounts.set(shell, 0);
            }
            amounts.set(shell, amounts.get(shell)! + recipe.moulds.map(m => (m.mould.layout[0] * m.mould.layout[1] > 30 ? 300 : 200) * m.count).reduce((a, b) => a + b, 0));
        }

        return Array.from(amounts.entries().map(([shell, mass]) => ({ shell, mass })));
    }

    override render() {
        let mouldUsage = this.calculateMouldUsage();

        if (this.state.session) {
            const recipes = this.state.session.recipes;
            const temperingAmount = this.calculateMouldTemperingAmounts(recipes);
            if (this.state.mode == DisplayMode.Normal) {
                return (
                    <div className="recipe-editor">
                        <div className="top">
                            <a href="/" className="fas fa-arrow-left"></a>
                            <h1>{this.state.session.name}</h1>
                        </div>
                        <div className="sidebar">
                            <div className="moulds" ref={this.moulds_holder}>
                                {this.state.moulds.map(mould => (<Mould key={mould.id} mould={mould} usageCount={mouldUsage[mould.id]!} ref={(element: any) => this.addDraggableMould(mould, element as Mould)} />))}
                            </div>
                            <div className="stats">
                                <h4>Tempering chocolate</h4>
                                {temperingAmount.map(x =>
                                    <div key={x.shell}>
                                        <h5>{x.shell}</h5>
                                        <div><span>Total: {x.mass} g</span></div>
                                        <div><span>Heating: {x.mass * (3 / 4)} g</span></div>
                                        <div><span>Cooling: {x.mass * (1 / 4)} g</span></div>
                                    </div>
                                )}
                                {/* <span>{recipes.map(r => r.moulds.map(m => m.layout[0] * m.layout[1] > 30 ? 500 : 400).reduce((a, b) => a + b, 0)).reduce((a, b) => a + b, 0)}g</span> */}
                            </div>
                            <a role="button" className="btn-sidebar" onClick={() => this.setState({ mode: DisplayMode.PlainText })}><span>View as plain text</span></a>
                        </div>
                        <div className="recipes" ref={this.recipes_holder}>
                            {recipes.map(recipe => (<Recipe recipe={recipe} key={recipe.id} onChangeRecipe={() => this.setState({})} onDelete={() => this.deleteRecipe(recipe)} onChangeMoulds={() => this.setState({})} draggable_moulds={this.draggable_moulds} />))}
                            <RecipeAdder moulds={this.state.moulds} onAdd={recipe => this.loadRecipe(recipe)} onCreate={() => this.createNewRecipe()} />
                        </div>
                    </div>
                );
            } else { // if (this.state.mode == DisplayMode.PlainText) {
                return (
                    <div className="recipes-plaintext">
                        <h1>{this.state.session.name} {toLocalDateString(new Date(this.state.session.last_edited))}</h1>
                        {recipes.map(recipe => (<RecipePlaintext recipe={recipe} key={recipe.id} />))}
                    </div>
                );
            }
        } else {
            return (
                <Fragment>
                    <NewSession onCreate={name => this.createNewSession(name)} />
                    <SessionList database={this.database} />
                </Fragment>
            )
        }
    }
}

const mount = () => {
    console.log("Loaded");
    const container = document.getElementById('app-root');
    const root = createRoot(container!);
    root.render(<App />);
}

if (document.readyState === "loading") document.addEventListener('DOMContentLoaded', mount);
else mount();
