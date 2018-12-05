// import {createToken, Lexer, Parser} from "chevrotain";
const chevrotain = require('chevrotain');

const {createToken, Lexer, Parser} = chevrotain;

const _test1 = `--------------------------d74496d66958873e
Content-Disposition: form-data; name="person"

anonymous
--------------------------d74496d66958873e--`;
const _test2 = `--------------------------d74496d66958873e
Content-Disposition: form-data; name="person"

anonymous
--------------------------d74496d66958873e
Content-Disposition: form-data; name="secret"; filename="file.txt"
Content-Type: text/plain

contents of the file
--------------------------d74496d66958873e--`;

const Tokens = {};
// --------------------------d74496d66958873e
Tokens.BoundaryMarker = createToken({
    name: "BoundaryMarker",
    pattern: /--------------------------/
});
Tokens.String = createToken({
    name: "String",
    pattern: /[A-z0-9\\/]+/
});
// Tokens.Line = createToken({
//     name: "Line",
//     pattern: /.+?\r?\n/
// });

//
//
Tokens.NewLine = createToken({
    name: "NewLine",
    pattern: /\r?\n/
});

// -
Tokens.Dash = createToken({
    name: "Dash",
    pattern: /-/
});
// =
Tokens.Equals = createToken({
    name: "Equals",
    pattern: /=/
});

// :
Tokens.Colon = createToken({name: "Colon", pattern: /:/});
// ;
Tokens.SemiColon = createToken({name: "SemiColon", pattern: /;/});

// Thisisastring
Tokens.StringLiteral = createToken({
    name: "StringLiteral",
    pattern: /"(:?[^\\"\n\r]+|\\(:?[bfnrtv"\\/]|u[0-9a-fA-F]{4}))*"/
});
Tokens.NumberLiteral = createToken({
    name: "NumberLiteral",
    pattern: /-?(0|[1-9]\d*)(\.\d+)?([eE][+-]?\d+)?/
});
Tokens.WhiteSpace = createToken({
    name: "WhiteSpace",
    pattern: /\s+/,
    // group: Lexer.SKIPPED
});

const FormDataLexer = new Lexer(Object.values(Tokens), {
    // Less position info tracked, reduces verbosity of the playground output.
    positionTracking: "onlyStart"
});

class FormDataParser extends Parser {
    constructor() {
        super(Object.values(Tokens), {
            recoveryEnabled: false
        });

        const $ = this;

        $.RULE("boundary", () => {
            $.CONSUME(Tokens.BoundaryMarker);
            $.CONSUME(Tokens.String);
        });
        $.RULE("key", () => {
            $.AT_LEAST_ONE_SEP({
                SEP: Tokens.Dash,
                DEF: () => {
                    $.CONSUME(Tokens.String);
                }
            });
        });
        $.RULE("value", () => {
            $.CONSUME(Tokens.StringLiteral);
        });
        $.RULE("keyValue", () => {
            $.SUBRULE($.key);
            $.CONSUME(Tokens.Equals);
            $.SUBRULE($.value);
        });
        $.RULE("header", () => {
            $.SUBRULE($.key);
            $.CONSUME(Tokens.Colon);
            $.CONSUME(Tokens.WhiteSpace);
            $.SUBRULE2($.key);
            $.MANY({
                DEF: () => {
                    $.CONSUME(Tokens.SemiColon);
                    $.CONSUME2(Tokens.WhiteSpace);
                    $.SUBRULE($.keyValue);
                }
            });
            $.CONSUME(Tokens.NewLine);
        });
        $.RULE("fieldContent", () => {
            $.MANY(() => {
                $.CONSUME(Tokens.String);
                $.OPTION(() => {
                    $.CONSUME2(Tokens.WhiteSpace);
                });
            });
        });
        $.RULE("field", () => {
            $.MANY(() => {
                $.SUBRULE($.header);
            });
            $.CONSUME(Tokens.NewLine);
            $.SUBRULE($.fieldContent);
            $.CONSUME2(Tokens.NewLine);
            $.SUBRULE($.boundary);
        });
        $.RULE("end", () => {
            $.CONSUME(Tokens.Dash);
            $.CONSUME2(Tokens.Dash);
        });
        $.RULE("formdata", () => {
            $.SUBRULE($.boundary);
            $.CONSUME(Tokens.NewLine);
            $.MANY(() => {
                $.SUBRULE($.field);
                $.OPTION(() => {
                    $.CONSUME2(Tokens.NewLine);
                });
            });
            $.SUBRULE($.end);
        });

        this.performSelfAnalysis();
    }
}

let parser = new FormDataParser();
const lexResult = FormDataLexer.tokenize(_test2);
// const serializedGrammar = parser.getSerializedGastProductions();
// const htmlText = chevrotain.createSyntaxDiagramsCode(serializedGrammar);
// const outPath = require('path').resolve(__dirname, "./");
// require('fs').writeFileSync(outPath + "/generated_diagrams.html", htmlText);
// ".input" is a setter which will reset the parser's internal's state.
parser.input = lexResult.tokens;

const cst = parser.formdata();

/* eslint-disable no-console */
console.log(cst);
console.error(parser.errors);
