enum DragEvent {
    DragStart,
    Move,
    DragEnd,
}

class DragStartEvent {

}

class DragMoveEvent {

}

interface DragEndEvent<T> {
    source: HTMLElement;
    target: HTMLElement|null;
    source_data: T|null;
    target_data: T|null;

    // constructor(source: HTMLElement, target: HTMLElement|null, source_data: T|null, target_data: T|null) {
    //     this.source = source;
    //     this.target = target;
    //     this.source_data = source_data
    // }
}

interface Item<T> {
    element: HTMLElement;
    click_zone: HTMLElement|null;
    drop_zone: HTMLElement|null;
    custom_data: T|null;
    on_drop: null|((event: DragEndEvent<T>) => void);
}

interface CurrentDrag<T> {
    source: Item<T>;
    over: Item<T>;
    dragged_clone: null|HTMLElement;
    drag_mouse_start: {x: number, y: number};
    clone_offset: {x: number, y: number};
}

export class DragManager<T> {
    private items: Item<T>[] = [];
    private dragStart: null|((event: DragStartEvent) => void) = null;
    private dragEnd: null|((event: DragEndEvent<T>) => void) = null;

    private currentDrag: null|CurrentDrag<T> = null;
    private mouse_position: {x: number, y: number} = { x: 0, y: 0 };

    constructor() {
        document.addEventListener("mousemove", (ev) => this.onMove(ev));
        document.addEventListener("mouseup", (ev) => this.onUp(ev));
    }
    onDragStart(callback: (event: DragStartEvent) => void) {
        this.dragStart = callback;
    }
    onDragEnd(callback: (event: DragEndEvent<T>) => void) {
        this.dragEnd = callback;
    }

    addContainer(container: HTMLElement, draggable_query?: string, click_zone_query?: string, drop_zone_query?: string) {
        console.log(container);
        let elements =  draggable_query == null ? container.children : container.querySelectorAll(draggable_query);

        for (let i = 0; i < elements.length; i++) {
            let domNode = elements[i] as HTMLElement;
            if (domNode) {
                this.add(domNode, click_zone_query, drop_zone_query);
            }
        }
    }

    add(element: HTMLElement, click_zone?: HTMLElement|string|null, drop_zone?: HTMLElement|string|null, custom_data?: T|null, on_drop?: null|((event: DragEndEvent<T>) => void)) {
        if (!element) throw "element is null";

        let click_zone_element = typeof click_zone === "string" ? element.querySelector(click_zone) as HTMLElement : click_zone;
        let drop_zone_element = typeof drop_zone === "string" ? element.querySelector(drop_zone) as HTMLElement : drop_zone;

        if (click_zone_element === undefined) click_zone_element = element;
        if (drop_zone_element === undefined) drop_zone_element = element;

        this.items = this.items.filter(item => item.element != element && item.element.isConnected);

        if (custom_data === undefined) custom_data = null;
        if (on_drop === undefined) on_drop = null;

        const item: Item<T> = {
            element,
            click_zone: click_zone_element,
            drop_zone: drop_zone_element,
            custom_data: custom_data,
            on_drop: on_drop,
        };

        element.addEventListener("mousedown", (ev) => this.onDown(ev));
        this.items.push(item);
    }

    cancelDrag() {
        if (!this.currentDrag || !this.currentDrag.dragged_clone) return;

        try {
            if (this.dragEnd) this.dragEnd({ source: this.currentDrag.source.element, target: null, source_data: this.currentDrag.source.custom_data, target_data: null });
        } finally {
            if (this.currentDrag.dragged_clone) this.currentDrag.dragged_clone.remove();
            this.currentDrag = null;
        }
    }

    private onDown(ev: MouseEvent) {
        this.cancelDrag();
        for (let i = 0; i < this.items.length; i++) {
            let item = this.items[i];
            if (item.click_zone && item.click_zone.contains(ev.target as HTMLElement)) {
                let rect = item.element.getBoundingClientRect();
                this.currentDrag = {
                    source: item,
                    over: item,
                    dragged_clone: null,
                    drag_mouse_start: this.mouse_position,
                    clone_offset: { x: rect.left - this.mouse_position.x, y: rect.top - this.mouse_position.y },
                };

                ev.preventDefault();
                return;
            }
        }
    }

    private onUp(ev: MouseEvent) {
        if (!this.currentDrag) return;
        if (this.currentDrag.dragged_clone) {
            for (let i = 0; i < this.items.length; i++) {
                let item = this.items[i];
                if (item.drop_zone && item.drop_zone.contains(ev.target as HTMLElement)) {
                    let event = { source: this.currentDrag.source.element, target: item.element, source_data: this.currentDrag.source.custom_data, target_data: item.custom_data };
                    try {
                        if (this.dragEnd) this.dragEnd(event);
                        if (item.on_drop) item.on_drop(event);
                    } finally {
                        this.currentDrag.dragged_clone.remove();
                        this.currentDrag = null;
                    }
                    return;
                }
            }
        }

        this.cancelDrag();
    }

    private onMove(ev: MouseEvent) {
        this.mouse_position = {x: ev.clientX, y: ev.clientY};

        if (!this.currentDrag) return;

        // Check if mouse is no longer pressed (might have been released outside of the browser window)
        if (this.currentDrag.dragged_clone && (ev.buttons & 1) == 0) {
            this.cancelDrag();
            return;
        }

        if (!this.currentDrag.dragged_clone && (Math.pow(this.currentDrag.drag_mouse_start.x - this.mouse_position.x, 2) + Math.pow(this.currentDrag.drag_mouse_start.y - this.mouse_position.y, 2)) > 5*5) {
            const sourceElement = this.currentDrag.source.element;
            const clone = sourceElement.cloneNode(true) as HTMLElement;
            const rect = sourceElement.getBoundingClientRect();
            clone.style.width = rect.width + "px"; 
            clone.style.height = rect.height + "px";
            document.body.appendChild(clone);
            clone.classList.add("dragdrop-clone");

            this.currentDrag.dragged_clone = clone;
        }

        if (this.currentDrag.dragged_clone) {
            this.currentDrag.dragged_clone.style.position = "absolute";
            this.currentDrag.dragged_clone.style.left = (ev.clientX + this.currentDrag.clone_offset.x) + "px";
            this.currentDrag.dragged_clone.style.top = (ev.clientY + this.currentDrag.clone_offset.y) + "px";
        }
    }
    
}