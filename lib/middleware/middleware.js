export class Middleware extends Function {
  constructor({
    chain,
    ...rest
  } = {}) {
    super();

    this.data = rest;
    this.chain = new Set(chain);

    return new Proxy(this, {
      apply: async (target, thisArg, argumentsList) => {
        for (const middleware of this.chain) {
          const result = await middleware.apply(this, argumentsList);
          if (result === Middleware.DONE) return Middleware.DONE;
        }
        return await this.render.apply(this, argumentsList);
      }
    });
  }
  async init() {}
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
  async render() {}
}
Middleware.DONE = Symbol("done");
