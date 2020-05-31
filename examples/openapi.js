const Joi = require("@hapi/joi");
const {Server, Middleware} = require("../");

const server = new Server();
const openapi = new Middleware.OpenApi({
  path: "/api",
  doc: {
    tags: [
      {
        name: "user",
        description: "user stuff"
      }
    ],
    info: {
      title: "Openapi ayyo generated docs",
      version: "v1"
    },
    components: {
      securitySchemes: {
        JsonWebToken: {
          type: "http",
          schema: "bearer"
        }
      }
    }
  }
});

const JWT_SECRET = "123";

const authenticatedRouter = new Middleware.Router({
  path: "/authenticated"
});

(async () => {
  try {
    await openapi.use(
      new Middleware.Route({
        method: "POST",
        path: "/create/{id}",
        handler: async ({req, res}) => {
          res.body = JSON.stringify({
            id: req.params.id,
            name: req.query.name,
            description: req.body.description
          });
        },
        openapi: {
          tags: ["user"],
          description: "Creates a user in the database.",
          schema: {
            consumes: {
              contentTypes: [
                "application/json",
                "application/x-msgpack"
              ],
              path: Joi.object({
                id: Joi.number()
                  .min(0)
                  .max(200)
                  .default(10)
                  .example(101)
              }),
              query: Joi.object({
                name: Joi.string().required()
              }),
              body: Joi.object({
                description: Joi.string()
                  .required()
                  .example("White, Blue Eyes, 7ft 1in")
              })
            },
            produces: {
              200: {
                contentType: "application/json",
                description: "Ok!",
                body: Joi.object({
                  id: Joi.number()
                    .required()
                    .notes(
                      "Identification number associated with this user."
                    ),
                  name: Joi.string().required(),
                  description: Joi.string().required()
                })
              },
              500: {
                contentType: "application/json",
                body: Joi.object({
                  error: Joi.string()
                    .required()
                    .example("Internal server error")
                })
              }
            }
          }
        }
      }),
      new Middleware.Route({
        method: "GET",
        path: "/login",
        handler: async ({res}) => {
          res.body = JSON.stringify({
            token: await Middleware.JsonWebToken.sign(
              {
                hello: "world"
              },
              JWT_SECRET
            )
          });
        },
        openapi: {
          tags: ["user"],
          description: "Generates jwt token for user",
          security: [{JsonWebToken: []}],
          schema: {
            produces: {
              200: {
                contentType: "application/json",
                body: Joi.object({
                  token: Joi.string().required()
                })
              },
              500: {
                contentType: "application/json",
                body: Joi.object({
                  error: Joi.string()
                    .required()
                    .example("Internal server error")
                })
              }
            }
          }
        }
      })
    );
    await authenticatedRouter.use(
      new Middleware.JsonWebToken({
        secret: JWT_SECRET,
        // eslint-disable-next-line no-unused-vars
        onFail: ({res}, error) => ({error: "Invalid JWT"})
      })
    );
    await authenticatedRouter.use(
      new Middleware.Route({
        method: "GET",
        path: "/",
        handler: async ({req, res}) => {
          res.body = JSON.stringify({
            tokenContents: req.jwt
          });
        },
        openapi: {
          description: "Checks if JWT is valid.",
          security: [{JsonWebToken: []}],
          schema: {
            produces: {
              200: {
                contentType: "application/json",
                description: "Ok!",
                body: Joi.object({
                  tokenContents: Joi.any().required()
                })
              },
              500: {
                contentType: "application/json",
                body: Joi.object({
                  error: Joi.string()
                    .required()
                    .example("Internal server error")
                })
              }
            }
          }
        }
      })
    );
    await openapi.use(authenticatedRouter);
    await server.use(openapi);
    await server.listen(8080);
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error(e);
  }
})();
