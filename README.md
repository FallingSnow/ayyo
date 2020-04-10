# Ayyo

### Work in Progress


## Features
- [x] HTTP2 TLS Only
- [x] Async Routing
    - [x] Nested Routing
- [x] Static Directory Serving
  - [x] [Use magic numbers to determine file types](https://www.npmjs.com/package/file-type)
  - [x] [Use http2 respond with](https://nodejs.org/api/http2.html#http2_http2stream_respondwithfile_path_headers_options)
- [x] CORS
- [x] Json Web Token Support
    - [ ] Revoked Tokens
- [x] OpenAPI documentation generation
    - [x] Request validation
    - [x] Response validation
    - [x] Defaults
- [x] Rate limiting
    - [ ] [Slow down](https://www.npmjs.com/package/express-slow-down)
- [ ] Builtin (opt-in) metrics
- [x] Server Side Events
- [ ] Compression
    - [ ] Gzip
    - [ ] Brotli
- [x] Automatic Self Signed SSL/TLS
- [ ] Caching
    - [x] Default Caching
    - [ ] Real Caching
