export class Middleware extends Function {
    constructor({...rest} = {}) {
        super();

        this.data = rest;
        this.chain = new Set();

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
    async render({_req, _res}) {
        // eslint-disable-next-line no-console
        console.trace("Unhandled middleware!");
    }
}
