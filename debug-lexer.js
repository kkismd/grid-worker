console.log("Lexer test:"); 
const { Lexer } = require("./src/lexer");
const lexer = new Lexer();
const tokens = lexer.tokenize("A=10 : comment", 0);
console.log("Tokens:", tokens.map(t => ({type: t.type, value: t.value})));
