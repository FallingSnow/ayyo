import Joi from "@hapi/joi";
import mongoose from "mongoose";
import Joigoose from "joigoose";
const Joig = Joigoose(mongoose);

import {Server, Middleware} from "../lib/index.mjs";

const user = Joi.object({
  name: Joi.object({
    first: Joi.string()
      .required()
      .notes(["First name of the user"]),
    last: Joi.string().required()
  }),
  email: Joi.string()
    .email()
    .required(),
  bestFriend: Joi.string().meta({type: "ObjectId", ref: "User"}),
  metaInfo: Joi.any(),
  addresses: Joi.array()
    .items({
      line1: Joi.string().required(),
      line2: Joi.string()
    })
    .meta({_id: false, timestamps: true})
});
mongoose.model("User", new mongoose.Schema(Joig.convert(user)));

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
    }
  }
});

async function main() {
  await openapi.use(
    new Middleware.Route({
      method: "POST",
      path: "/create",
      handler: async ({req, res}) => {
        const user = new mongoose.models.User(req.body);

        res.body = JSON.stringify(user, null, 2);
      },
      openapi: {
        tags: ["user"],
        schema: {
          consumes: {
            contentTypes: [
              "application/json",
              "application/x-msgpack"
            ],
            body: user
          },
          produces: {
            200: {
              contentType: "application/json",
              description: "Ok!",
              body: user
            },
            500: {
              contentType: "application/json",
              description: "Internal Error",
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
  await server.use(openapi);
  await server.listen(8080);
}

main().catch(console.error);
