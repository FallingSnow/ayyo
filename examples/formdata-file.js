const {HTTP2_HEADER_CONTENT_TYPE} = require("http2").constants;

const Joi = require("@hapi/joi");
const {Server, Middleware, HTTPError} = require("../");

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
<script>
async function upload(e) {
    const response = await fetch('https://localhost:8080/api/upload', {method: "POST", body: new FormData(e.target)});
    console.log(response);
}
</script>
<form onsubmit="upload(event).catch(console.error); return false;">
<input name="newName" value="uploaded image" />
<label>Please upload a png image: <input name="image" type="file" /></label>
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
          const imageBuffer = req.body.image.content;
          if (!imageBuffer.toString("hex").startsWith("89504e47"))
            throw new HTTPError(400, "Invalid PNG uploaded");
          res.body = JSON.stringify({
            status: "Upload complete!"
          });
        },
        openapi: {
          description: "Uploads an image",
          schema: {
            consumes: {
              contentTypes: [
                "multipart/form-data",
              ],
              body: Joi.object({
                newName: Joi.object({
                  content: Joi.binary().required(),
                  name: Joi.string().required()
                }),
                image: Joi.object({
                  content: Joi.binary().required(),
                  filename: Joi.string(),
                  name: Joi.string().required()
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
