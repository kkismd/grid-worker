import { Lexer } from './src/lexer.js';

const lexer = new Lexer();
const testLine = 'A=10 : これはコメント';
const tokens = lexer.tokenize(testLine, 0);

console.log('トークン化結果:');
tokens.forEach((token, i) => {
    console.log(`${i}: ${token.type} = "${token.value}"`);
});