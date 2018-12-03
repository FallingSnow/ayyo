const {
    HTTP2_HEADER_SET_COOKIE
} = require('http2').constants;
const {
    Server,
    Middleware
} = require('../');

const server = new Server({
    certPath: '/etc/ssl/certs/localhost.pem',
    privKeyPath: '/etc/ssl/private/localhost.pem'
});

(async () => {
    try {

        const authorized = new Middleware.Router({
            path: '/restricted'
        });
        await authorized.use(new Middleware.Route({
            method: 'GET',
            path: '',
            handler: async ({
                res
            }) => {
                res.body = "Access granted!";
            }
        }));

        const jwt = new Middleware.JsonWebToken({
            secret: "12345"
        });

        const router = new Middleware.Router();
        await router.use(new Middleware.Route({
            method: 'GET',
            path: '/login',
            handler: async ({
                res
            }) => {
                res.headers[HTTP2_HEADER_SET_COOKIE] = `token=${await Middleware.JsonWebToken.sign({sub: "me"}, jwt.secret)}; Path=/; Secure; HttpOnly`;
                res.body = "We gave you a cookie token!";
            }
        }));
        await authorized.use(jwt);
        await router.use(authorized);
        await server.use(router);
        await server.listen(8080);
    } catch (e) {
        // eslint-disable-next-line no-console
        console.error(e);
    }
})();
