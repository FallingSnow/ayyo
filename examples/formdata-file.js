const {HTTP2_HEADER_CONTENT_TYPE} = require("http2").constants;

const Joi = require("joi");
const {Server, Middleware} = require("../");

const server = new Server({
    certPath: "/etc/ssl/certs/localhost.pem",
    privKeyPath: "/etc/ssl/private/localhost.pem"
});
const openapi = new Middleware.OpenApi({
    path: "/api",
    doc: {
        info: {
            title: "Docs for image upload"
        }
    }
});
const router = new Middleware.Router();

const uploadForm = `
<html>
<form action="" "">
<input name="image" type="file" />
<input type="submit" />
</form>
</html>
`;

(async () => {
    try {
        await router.use(
            new Middleware.Route({
                method: "GET",
                path: "",
                handler: async ({res}) => {
                    res.headers[HTTP2_HEADER_CONTENT_TYPE] = "text/html";
                    res.body = uploadForm;
                }
            })
        );
        await openapi.use(
            new Middleware.Route({
                method: "POST",
                path: "/upload",
                handler: async ({req, res}) => {
                    const matches = /data:(?<mime>.+?\/.+?);base64,(?<content>.*)/.exec(
                        req.body.image.dataurl
                    );
                    const image = matches.groups;
                    const imageBuffer = Buffer.from(
                        image.content,
                        "base64"
                    );
                    res.body = JSON.stringify({
                        status: "Upload complete!"
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
                            body: Joi.object({
                                image: Joi.object({
                                    name: Joi.string().required(),
                                    dataurl: Joi.string().required()
                                })
                            })
                        },
                        produces: {
                            200: {
                                contentType: "application/json",
                                description: "Ok!",
                                body: Joi.object({
                                    status: Joi.string()
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
        await router.use(openapi);
        await server.use(router);
        await server.listen(8080);
    } catch (e) {
        // eslint-disable-next-line no-console
        console.error(e);
    }
})();
