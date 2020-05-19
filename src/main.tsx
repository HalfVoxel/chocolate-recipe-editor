import CodeMirror from "codemirror";
import { StringStream } from "codemirror"
import "codemirror/addon/mode/simple.js"
import "codemirror/addon/mode/overlay.js"
import { render, Component, createRef, Fragment } from 'inferno';
import '../node_modules/codemirror/lib/codemirror.css';
import './css/style.scss';
import { DragManager } from "./dragdrop"
import { debounce } from 'ts-debounce';
import { MouldCavity, MouldData, RecipeData, RecipeDataServer, RecipeDataShallow, SessionServer, ServerResponse, convertServerRecipeToRecipe, convertRecipeToServerRecipe } from "./data";
import { addRecipeMode } from "./codemirror_mode";

const codemirror : any = CodeMirror;
addRecipeMode(codemirror);

interface RecipeProps {
    draggable_moulds: DragManager<MouldDragData>;
    recipe: RecipeData;
    onChangeMoulds: ()=>void;
    onDelete: ()=>void;
}

interface RecipePlaintextProps {
    recipe: RecipeData;
}


interface MouldDragData {
    container: Recipe|null;
    mould: MouldData|null;
}

interface Measurement {
    value: number;
    unit: string;
    original_value: number;
    multiplier: number;
}

interface ParsedRecipeItem {
    amount: Measurement|null;
    name: string;
    additional_steps: string[];
    final_amount: Measurement|null;
}

interface ParsedRecipeSection {
    name: string;
    items: ParsedRecipeItem[];
}

function prettyPrintNumber(val: number) : string {
    const aval = Math.abs(val);
    if (aval >= 9.5) return val.toFixed(0);
    if (aval >= 1) return val.toFixed(1);
    return val.toFixed(1);
}

class ParsedRecipe {
    sections: ParsedRecipeSection[] = [];
    parse_success: boolean = true;
    parse_error_token: CodeMirrorToken|null = null;
    parse_error_line: number|null = null;
    parse_error: string|null = null;

    totalWeight(): number {
        return this.sections.map(section => section.items.map(s => s.final_amount ? s.final_amount.value : 0).reduce((a,b)=> a+b, 0)).reduce((a,b) => a+b, 0);
    }

    totalWeightExact(): number {
        return this.sections.map(section => section.items.map(s => s.amount ? s.amount.original_value*s.amount.multiplier : 0).reduce((a,b)=> a+b, 0)).reduce((a,b) => a+b, 0);
    }

    prettyPrint(): string {
        let result = "";
        for (const section of this.sections) {
            result += section.name + "\n";
            for (const item of section.items) {
                result += "\t" + (item.amount != null ? prettyPrintNumber(item.amount.value) + item.amount.unit + " " : "") + item.name + "\n";
                for (const subitem of item.additional_steps) {
                    result += "\t\t" + subitem + "\n";
                }
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

class EOLError {}
class UnexpectedTokenError {
    found: string;
    expected: string;
    token: CodeMirrorToken|null;
    constructor(found: string, expected: string, token: CodeMirrorToken|null) {
        this.found = found;
        this.expected = expected;
        this.token = token;
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
        let res = this.next();
        if (res.type != type) throw new UnexpectedTokenError(res.type, type, res);
        return res;
    }

    expectEnd() {
        if (!this.isAtEnd()) throw new UnexpectedTokenError(this.peek()!.type, "[end of stream]", null);
    }

    convert_remaining_to_string() {
        let result = "";
        while(!this.isAtEnd()) {
            result += this.next().string;
        }
        return result;
    }

    isAtEnd() {
        return this.index >= this.tokens.length;
    }
}

interface RecipeAdderProps {
    onAdd: (recipe: RecipeData)=>void;
    onCreate: ()=>void;
    moulds: MouldData[],
}


class RecipeAdder extends Component<RecipeAdderProps> {
    state : { adding: boolean, recipes: RecipeDataShallow[]|null } = { adding: false, recipes: null };

    componentDidMount() {
        this.updateRecipes();
    }

    updateRecipes() {
        fetch("data/recipes").then(r => r.json()).then((response: ServerResponse<RecipeDataShallow[]>) => {
            const recipes = response.data;
            console.log("Got response " + recipes);

            recipes.unshift({ id: null, name: "New Recipe", last_edited: null});
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
                console.log("Got response " + response.data);
                
                this.setState({ adding: false });
                this.props.onAdd(convertServerRecipeToRecipe(response.data, this.props.moulds));
            }).catch(e => {
                console.error(e);
                this.setState({ adding: false });
            });
        }
    }

    render() {
        if (!this.state.adding) {
            return (
                <a role="button" onClick={()=>{ this.updateRecipes(); this.setState({adding: true})}} class="recipe-adder recipe-adder-dashed recipe-adder-big-plus">
                    +
                </a>
            )
        } else {
            return (
                <div class="recipe-adder">
                    <div class="recipe-adder-recipe-list">
                        { this.state.recipes?.map(recipe => (<a onClick={()=> this.loadRecipe(recipe) }><i class="fas fa-file-alt"></i> {recipe.name}</a>))}
                    </div>
                </div>
            )
        }
    }
}

interface NewSessionProps {
    onCreate: (name: string)=>void;
}

class NewSession extends Component<NewSessionProps> {
    state = { name: "" }

    render() {
        return (
            <div class="new-session">
                <h2>Create new session</h2>
                <input type="text" placeholder="Name" onInput={ev => this.setState({name: (ev.target as HTMLInputElement).value})} value={this.state.name}></input>
                <a role="button" onClick={()=>this.props.onCreate(this.state.name)}>Create</a>
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

    render() {
        const recipe = this.props.recipe;
        return (
            <div class="recipe-plaintext">
                <h3>{recipe.name}</h3>
                <span>{"\t"}Formar: {recipe.moulds.map(m => m.name).join(", ")}<br/></span>
                {recipe.recipe.split("\n").map(line => (<span>{"\t" + line}<br/></span>))}
            </div>
        );
    }
}

class Recipe extends Component<RecipeProps> {
    textarea: any;
    state: { recipe: RecipeData, manualLeftover: string };
    moulds_container: any;
    inputLeftover: any;
    codemirror: any;
    saving: boolean = false;
    parsed_recipe: ParsedRecipe = new ParsedRecipe();
    last_parsed_recipe: ParsedRecipe = new ParsedRecipe();
    debouncedSave = debounce(() => this.save(), SavingInterval);

    constructor(props: RecipeProps) {
        super(props);
        this.textarea = createRef();
        this.state = { recipe: props.recipe, manualLeftover: "0" };
        this.moulds_container = createRef();
        this.inputLeftover = createRef();
    }
    
    removeMould(mould: MouldData) {
        let recipe = this.state.recipe;
        recipe.moulds = recipe.moulds.filter(m => m != mould);
        this.setState ({ recipe });
        if (this.props.onChangeMoulds) this.props.onChangeMoulds();
        this.debouncedSave();
    }

    addMould(mould: MouldData) {
        let recipe = this.state.recipe;
        recipe.moulds = recipe.moulds.concat([mould]);
        this.setState ({ recipe });
        if (this.props.onChangeMoulds) this.props.onChangeMoulds();
        this.debouncedSave();
    }

    save() {
        if (this.saving) return;
        this.state.recipe.recipe = this.codemirror.getValue();
        fetch("data/recipes/" + this.state.recipe.id, {
            "method": "UPDATE",
            headers: {"Content-Type": "application/json"},
            body: JSON.stringify(convertRecipeToServerRecipe(this.state.recipe))
        }).then(r => r.json()).then((response: ServerResponse<RecipeDataServer>) => {
            console.log("Saved");
        }).catch(e => {
            console.trace(e);
        }).finally(() => {
            this.saving = false;
        });
    }

    componentDidMount() {
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
                        console.log("Token", this.last_parsed_recipe.parse_error_token?.start);
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

        // const refreshOverlay = () => {
        //     this.codemirror.removeOverlay(mustacheOverlay);
        //     this.codemirror.addOverlay(mustacheOverlay);
        // }

        this.codemirror.on("change", () => {
            this.setState({});
            this.debouncedSave();
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
    
    getTokens() : CodeMirrorToken[][] {
        let result = [];
        for (let i = 0; i < this.codemirror.lineCount(); i++) {
            result.push(this.codemirror.getLineTokens(i, true));
        }
        return result;
    }

    findBestValue(recipe: ParsedRecipe, sectionIndex: number, itemIndex: number, sectionName: string, itemName: string, measurement: Measurement) {
        for (let i = 0; i < recipe.sections.length; i++) {
            const section = recipe.sections[i];
            for (let j = 0; j < section.items.length; j++) {
                const item = section.items[j];

                if (item.amount) {
                    let score = 0;
                    if (i == sectionIndex) score += 1;
                    if (j == itemIndex) score += 1;
                    if (section.name == sectionName) score += 1;
                    if (item.name == itemName) score += 1;

                    if (score >= 3) {
                        if (Math.abs(item.amount.original_value*item.amount.multiplier - measurement.value) <= 0.5) {
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
            const section = recipe.sections[i];
            for (let j = 0; j < section.items.length; j++) {
                const item = section.items[j];
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

    parseRecipe(text: string) {
        let tokens = this.getTokens();
        let section: ParsedRecipeSection|null = null;
        let item: ParsedRecipeItem|null = null;
        let parsed = new ParsedRecipe();
        parsed.parse_success = true;
        let lineNumber = -1;
        tokens.forEach(line => {
            lineNumber++;
            // while(line.length > 0 && (line[line.length-1].type == "whitespace" || line[line.length-1].type == "twotabs")) line.splice(0, 1);
            const stream = new TokenStream(line);

            try {

                let indent = 0;
                while(stream.peek() && (stream.peek()!.type == "whitespace" || stream.peek()!.type == "twotabs")) {
                    indent += stream.peek()!.type == "twotabs" ? 2 : 1;
                    stream.next();
                }

                if (stream.isAtEnd()) return;

                if (indent == 0) {
                    // Header
                    section = {
                        name: stream.expect("recipe-header").string,
                        items: [],
                    }
                    item = null;
                    parsed.sections.push(section);
                    stream.expectEnd();
                } else if (indent == 1) {
                    let first = stream.expect("recipe-measurement");
                    let measurement = null;
                    if (first && first.type == "recipe-measurement") {
                        const matches = first.string.match(/^([0-9\.]+)(.*)$/);
                        const value = parseFloat(matches![1]);
                        measurement = {
                            value: value,
                            unit: matches![2],
                            original_value: value,
                            multiplier: 1.0,
                        };
                    }
                    let name = stream.expect("recipe-name");
                    item = {
                        name: name.string,
                        amount: measurement,
                        additional_steps: [],
                        final_amount: measurement,
                    };
                    section!.items.push(item);
                    stream.expectEnd();
                } else if (indent == 2) {
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
                        const matches = stream.expect("recipe-measurement").string.match(/^([0-9\.]+)(.*)$/);
                        const value = parseFloat(matches![1]);
                        const measurement = {
                            value: value,
                            unit: matches![2],
                            original_value: value,
                            multiplier: 1.0,
                        };
                        item.final_amount = measurement;
                    }
                    item.additional_steps.push(remaining);
                    stream.expectEnd();
                } else {
                    throw new UnexpectedTokenError("indent="+indent, "indent<=2", stream.peek());
                }
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
            }
        });
        return parsed;
    }

    mould_weight_model(recipe: RecipeData) {
        let result = 0
        for (const mould of recipe.moulds) {
            const weight = mould.cavity.weight;
            const count = mould.layout[0] * mould.layout[1];
            const v0 = count * weight;
            // const v1 = count * (weight**(2/3));
            result += v0 * 0.69 + 93;
        }
        
        return result;
    }

    rebalance(weight: number) {
        if (weight <= 0) return;

        const parsed = this.parseRecipe(this.codemirror.getValue());
        if (parsed.parse_success) {
            this.findExactValues(parsed, this.parsed_recipe);
            this.parsed_recipe = parsed;
        } else {
            return;
        }

        let currentWeight = parsed.totalWeightExact();
        let multiplier = weight / currentWeight;

        let largestWeight = 0;
        for(const section of parsed.sections) {
            for (const item of section.items) {
                if (item.amount) {
                    largestWeight = Math.max(largestWeight, item.amount.original_value * item.amount.multiplier * multiplier);
                }
            }
        }

        if (largestWeight > 100) {
            // Round up to multiples of 50
            multiplier *= (50*Math.ceil(largestWeight / 50)) / largestWeight;
        }

        for(const section of parsed.sections) {
            for (const item of section.items) {
                if (item.amount) {
                    item.amount.multiplier *= multiplier;
                    item.amount.value = item.amount.original_value * item.amount.multiplier;
                }
            }
        }

        this.codemirror.setValue(parsed.prettyPrint());
    }

    delete() {
        this.props.onDelete();
    }

    render() {
        if (this.codemirror) {
            const parsed = this.parseRecipe(this.codemirror.getValue());
            if (parsed.parse_success) {
                this.findExactValues(parsed, this.parsed_recipe);
                this.parsed_recipe = parsed;
            }
            this.last_parsed_recipe = parsed;
        }

        const model_weight = this.mould_weight_model(this.state.recipe);

        const leftover = (this.parsed_recipe.totalWeight() - Math.max(0, model_weight - 100)).toFixed(0);
        const inputText = document.activeElement === this.inputLeftover?.current ? this.state.manualLeftover : leftover;

        let inputLeftover = (<input
            ref={this.inputLeftover} 
            onInput={(ev)=> {
                this.setState({ manualLeftover: (ev.target as HTMLInputElement).value });
                const targetWeight = Math.max(0, model_weight - 100) + parseFloat(this.state.manualLeftover);
                if (isFinite(targetWeight) && targetWeight > 0) {
                    this.rebalance(targetWeight);
                }
            }}
            onFocus={() => this.setState({manualLeftover: leftover})}
            onBlur={() => this.setState({})}
            type="text"
            style={"width: calc(" + (Math.max(1, inputText.length)) + "ch + 2px); -webkit-appearance: none; appearance: none; background: none; color: white; border: none; font-size: 12pt;"}
            value={inputText}></input>);

        return (
            <div class="recipe draggable-source">
                <div class="recipe-inner">
                    <div class="recipe-top">
                        <input class="recipe-name" type="text" value={this.state.recipe.name} onInput={ev=> { this.state.recipe.name = (ev.target as HTMLInputElement).value; this.setState({}); this.debouncedSave(); } } />
                        <a role="button" class="recipe-delete fas fa-trash" onClick={()=>this.delete()}></a>
                    </div>
                    <div class="recipe-contents">
                        <div class="recipe-moulds" ref={this.moulds_container}>
                            {
                                this.state.recipe.moulds.length > 0 ? this.state.recipe.moulds.map(mould => <Mould mould={mould} usageCount={1} ref={(element:any) => this.addDraggableMould(mould, element as Mould)} />) : (<div class="recipe-moulds-dropzone draggable-source">Drop moulds here</div>)
                            }
                        </div>
                        <div ref={this.textarea}></div>
                        <a role="button" class={"btn-recipe" + (model_weight > 0 ? "" : " btn-disabled")} onClick={() => this.rebalance(model_weight) }><span>Rebalance to moulds ({model_weight.toFixed()} g)</span></a>
                    </div>
                    <div class="recipe-bottom">
                        <div class="recipe-total">
                            <div class="box-top">Filling weight</div>
                            <div>{this.parsed_recipe.totalWeight().toFixed(0)} g</div>
                        </div>
                        <div class="recipe-leftover">
                            <div class="box-top">Expected leftover filling</div>
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
    for (var i = 0; i < words.length; i++) words[i] = words[i].charAt(0).toUpperCase() + words[i].slice(1);

    return words.join(' '); // ["I'm", "A", "Little", "Tea", "Pot"].join(' ') => "I'm A Little Tea Pot"
}

function capitalizeFirstCharacter(str: string) {
    return str.length > 0 ? str.charAt(0).toUpperCase() + str.slice(1) : str;
}

class Mould extends Component<MouldProps> {
    element_holder = createRef();

    componentDidMount() {
        // this.props.draggable_moulds.add(this.element_holder.current, this.element_holder.current, null);
    }

    render() {
        let data = this.props.mould;
        return (
            <div class="mould draggable-source draggable-handle" ref={this.element_holder}>
                <div class="mould-icon"><span class={"mould-icon-" + data.cavity.footprint}>{data.layout[0]*data.layout[1]}</span></div>
                <div class="mould-names">
                    <span class="model">{data.model}</span><span class="nickname">{titleCase(data.name)}</span>
                </div>
                { this.props.usageCount > 0 ? (<span class="mould-usage-count">{this.props.usageCount}</span>) : null }
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
    date = new Date(date.getTime() + (offset*60*1000))
    return date.toISOString().split('T')[0]
}

class App extends Component {
    state: { recipes: RecipeData[], moulds: MouldData[], session: SessionServer|null, mode: DisplayMode };
    recipes_holder: any;
    moulds_holder: any;
    draggable_moulds: DragManager<MouldDragData>;
    draggable_recipes: any;

    constructor(props: any) {
        super(props);
        this.state = { recipes: [], moulds: [], session: null, mode: DisplayMode.Normal };

        this.recipes_holder = createRef();
        this.moulds_holder = createRef();
        // this.draggable_recipes = new Draggable([], { handle: ".draggable-handle" });
        // this.draggable_moulds = new Draggable([], { handle: ".draggable-handle" });
        // onDrop(this.draggable_moulds, (e: DropEvent) => {
        //     console.log(e);
        // });
        this.draggable_moulds = new DragManager();
        this.draggable_moulds.onDragEnd(event => {
            event.source_data!.container?.removeMould(event.source_data!.mould!);
            event.target_data?.container?.addMould(event.source_data!.mould!);
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

    componentDidMount() {
        console.log("Mounted");
        // this.draggable.addContainer(this.recipes_holder.current);
        fetch(`data/moulds`).then(r => r.json()).then(moulds => {
            console.log("Got response " + moulds);
            
            for (let i = 0; i < moulds.length; i++) {
                moulds[i].id = i;
            }
            this.setState({ moulds });

            const match = window.location.pathname.match(/^\/(\d+)$/);
            if(match) {
                this.loadSession(parseInt(match[1]));
            }
        }).catch(e => {
            console.error(e);
            this.setState({ moulds: [] });
        });
    }

    calculateMouldUsage() : { [key: number] : number } {
        const usage : { [key: number] : number } = {};
        this.state.moulds.forEach(mould => usage[mould.id] = 0);
        console.log(this.state.recipes);
        this.state.recipes.forEach(recipe => {
            recipe.moulds.forEach(mould => {
                usage[mould.id] = (usage[mould.id] || 0) + 1;
            })
        })
        return usage;
    }

    addDraggableMould(mouldData: MouldData, mouldElement: Mould) {
        if (!mouldElement) return;
        let element = mouldElement.element_holder.current;
        this.draggable_moulds.add(element!, element, null, { container: null, mould: mouldData });
    }

    loadSession(session: number) {
        fetch("data/sessions/" + session).then(r => r.json()).then((response: ServerResponse<SessionServer>) => {
            
            return Promise.all(response.data.recipes.map(id => fetch("data/recipes/"+id).then(r => r.json()))).then((responses: ServerResponse<RecipeDataServer>[]) => {
                this.setState({ session: response.data, recipes: Array.from(responses.map(x => convertServerRecipeToRecipe(x.data, this.state.moulds))) });
            });
        }).catch(e => {
            console.trace(e);
        });
    }

    loadRecipe(recipe: RecipeData) {
        if (!this.state.session) throw "Cannot load recipe without a session";

        let newRecipe = { ...recipe };
        newRecipe.session = this.state.session.id;
        newRecipe.moulds = [];

        fetch("data/recipes", {
            "method": "POST",
            headers: {"Content-Type": "application/json"},
            body: JSON.stringify(newRecipe)
        }).then(r => r.json()).then((response: ServerResponse<RecipeDataServer>) => {
            this.setState({ recipes: [...this.state.recipes, convertServerRecipeToRecipe(response.data, this.state.moulds)] });
        }).catch(e => {
            console.trace(e);
        });
    }

    createNewRecipe() {
        if (!this.state.session) throw "Cannot load recipe without a session";

        const recipe: RecipeData = {
            id: 0,
            name: "New Recipe",
            session: this.state.session.id,
            moulds: [],
            recipe: "",
            last_edited: "",
        };
        fetch("data/recipes", {
            "method": "POST",
            headers: {"Content-Type": "application/json"},
            body: JSON.stringify(recipe)
        }).then(r => r.json()).then((response: ServerResponse<RecipeDataServer>) => {
            console.log(response.data);
            this.setState({ recipes: [...this.state.recipes, convertServerRecipeToRecipe(response.data, this.state.moulds)] });
            console.log(this.state.recipes);
        }).catch(e => {
            console.trace(e);
        });
    }

    createNewSession(name: string) {
        fetch("data/sessions", {
            "method": "POST",
            headers: {"Content-Type": "application/json"},
            body: JSON.stringify({name})
        }).then(r => r.json()).then((response: ServerResponse<SessionServer>) => {
            this.setState({ recipes: [], session: response.data.id });
        }).catch(e => {
            console.trace(e);
        });
    }

    deleteRecipe(recipe: RecipeData) {
        fetch("data/recipes/" + recipe.id, {
            "method": "DELETE"
        }).then(r => r.json()).then((response: ServerResponse<SessionServer>) => {
            this.setState({ recipes: this.state.recipes.filter(x => x.id != recipe.id) });
        }).catch(e => {
            console.trace(e);
        });
    }

    render() {
        let mouldUsage = this.calculateMouldUsage();
        console.log(mouldUsage);

        if (this.state.session) {
            if (this.state.mode == DisplayMode.Normal) {
                return (
                    <div class="recipe-editor">
                        <div class="moulds" ref={this.moulds_holder}>
                            { this.state.moulds.map(mould => (<Mould mould={mould} usageCount={mouldUsage[mould.id]} ref={(element:any) => this.addDraggableMould(mould, element as Mould)} />)) }
                            <div class="stats">
                                <h4>Tempering chocolate</h4>
                                <span>{ this.state.recipes.map(r => r.moulds.map(m => m.layout[0]*m.layout[1] > 30 ? 500 : 400).reduce((a,b)=>a+b, 0)).reduce((a,b)=>a+b, 0) }g</span>
                            </div>
                            <a role="button" class="btn-recipe" onClick={() => this.setState({ mode: DisplayMode.PlainText }) }><span>View as plain text</span></a>
                        </div>
                        <div class="recipes" ref={this.recipes_holder}>
                            { this.state.recipes.map(recipe => (<Recipe recipe={recipe} key={recipe.id} onDelete={() => this.deleteRecipe(recipe)} onChangeMoulds={() => this.setState({})} draggable_moulds={this.draggable_moulds} />)) }
                            <RecipeAdder moulds={this.state.moulds} onAdd={recipe => this.loadRecipe(recipe)} onCreate={() => this.createNewRecipe()} />
                        </div>
                    </div>
                );
            } else { // if (this.state.mode == DisplayMode.PlainText) {
                return (
                    <div class="recipe-editor">
                        <div class="recipes-plaintext">
                            <h1>{this.state.session.name} {toLocalDateString(new Date(this.state.session.last_edited))}</h1>
                            { this.state.recipes.map(recipe => (<RecipePlaintext recipe={recipe} key={recipe.id} />)) }
                        </div>
                    </div>
                );
            }
        } else {
            return (
                <NewSession onCreate={name=>this.createNewSession(name)} />
            )
        }
    }
}
render(
    <App />,
    document.getElementById("app-root")
);
