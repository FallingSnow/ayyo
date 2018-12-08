import {DONE} from "../symbols";

export class Middleware extends Function {
    constructor({chain, ...rest} = {}) {
        super();

        this.data = rest;
        this.chain = new Set(chain);

        return new Proxy(this, {
            apply: (target, thisArg, argumentsList) => {
                return this.render.apply(this, argumentsList);
            }
        });
    }
    async init(_parent) {}
    async use(...middlewares) {
        for (const middleware of middlewares) {
            this.chain.add(middleware);
            await middleware.init(this);
        }
    }
    async remove(...middlewares) {
        for (const middleware of middlewares) {
            this.chain.remove(middleware);
            await middleware.deinit(this);
        }
    }
    async render() {
        if (!this._initialized) {
            this._initialized = true;
            await this.init();
        }

        for (const middleware of this.chain) {
            const result = await middleware.apply(this, arguments);
            if (result === DONE) return DONE;
        }
    }
}
