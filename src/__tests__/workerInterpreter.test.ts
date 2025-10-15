// src/__tests__/workerInterpreter.test.ts

import WorkerInterpreter from '../workerInterpreter';
import { Lexer, TokenType, type Token } from '../lexer';

// モック関数
const mockLogFn = jest.fn();
const mockPeekFn = jest.fn();
const mockPokeFn = jest.fn();
const mockGridData = new Array(100 * 100).fill(0);

describe('Lexer (TDD Cycle 1.1)', () => {
  let lexer: Lexer;

  beforeEach(() => {
    lexer = new Lexer();
  });

  // TDDサイクル 1.1: 空のスクリプト、コメント行、単純な数値リテラル、変数名のトークン化
  test('should tokenize an empty line into an empty token list', () => {
    const line = '';
    expect(lexer.tokenizeLine(line, 0)).toEqual([]);
  });

  test('should tokenize a comment line as a comment token', () => {
    const line = ': This is a comment';
    // Lexerはコメント行全体を一つのコメントトークンとして扱う
    expect(lexer.tokenizeLine(line, 0)).toEqual([
      { type: TokenType.COMMENT, value: ': This is a comment', line: 0, column: 0 },
    ]);
  });

  test('should tokenize a simple numeric literal', () => {
    const line = '123';
    expect(lexer.tokenizeLine(line, 0)).toEqual([
      { type: TokenType.NUMBER, value: '123', line: 0, column: 0 },
    ]);
  });

  test('should tokenize variable names (A-Z)', () => {
    const line = 'A Z';
    expect(lexer.tokenizeLine(line, 0)).toEqual([
      { type: TokenType.IDENTIFIER, value: 'A', line: 0, column: 0 },
      { type: TokenType.IDENTIFIER, value: 'Z', line: 0, column: 2 },
    ]);
  });

  test('should tokenize a simple assignment statement (A=10)', () => {
    const line = 'A=10';
    expect(lexer.tokenizeLine(line, 0)).toEqual([
      { type: TokenType.IDENTIFIER, value: 'A', line: 0, column: 0 },
      { type: TokenType.EQUALS, value: '=', line: 0, column: 1 },
      { type: TokenType.NUMBER, value: '10', line: 0, column: 2 },
    ]);
  });
});

describe('Lexer (TDD Cycle 1.2)', () => {
  let lexer: Lexer;

  beforeEach(() => {
    lexer = new Lexer();
  });

  // TDDサイクル 1.2: 演算子、文字列リテラル、ラベルのトークン化
  test('should tokenize arithmetic operators (+, -, *, /)', () => {
    const line = 'A+B-C*D/E';
    expect(lexer.tokenizeLine(line, 0)).toEqual([
      { type: TokenType.IDENTIFIER, value: 'A', line: 0, column: 0 },
      { type: TokenType.PLUS, value: '+', line: 0, column: 1 },
      { type: TokenType.IDENTIFIER, value: 'B', line: 0, column: 2 },
      { type: TokenType.MINUS, value: '-', line: 0, column: 3 },
      { type: TokenType.IDENTIFIER, value: 'C', line: 0, column: 4 },
      { type: TokenType.ASTERISK, value: '*', line: 0, column: 5 },
      { type: TokenType.IDENTIFIER, value: 'D', line: 0, column: 6 },
      { type: TokenType.SLASH, value: '/', line: 0, column: 7 },
      { type: TokenType.IDENTIFIER, value: 'E', line: 0, column: 8 },
    ]);
  });

  test('should tokenize comparison operators (>, <, >=, <=, <>)', () => {
    const line = 'A>B<C>=D<=E<>F';
    expect(lexer.tokenizeLine(line, 0)).toEqual([
      { type: TokenType.IDENTIFIER, value: 'A', line: 0, column: 0 },
      { type: TokenType.GREATER_THAN, value: '>', line: 0, column: 1 },
      { type: TokenType.IDENTIFIER, value: 'B', line: 0, column: 2 },
      { type: TokenType.LESS_THAN, value: '<', line: 0, column: 3 },
      { type: TokenType.IDENTIFIER, value: 'C', line: 0, column: 4 },
      { type: TokenType.GREATER_THAN_OR_EQUAL, value: '>=', line: 0, column: 5 },
      { type: TokenType.IDENTIFIER, value: 'D', line: 0, column: 7 },
      { type: TokenType.LESS_THAN_OR_EQUAL, value: '<=', line: 0, column: 8 },
      { type: TokenType.IDENTIFIER, value: 'E', line: 0, column: 10 },
      { type: TokenType.NOT_EQUAL, value: '<>', line: 0, column: 11 },
      { type: TokenType.IDENTIFIER, value: 'F', line: 0, column: 13 },
    ]);
  });

  test('should tokenize logical operators (&, |, !)', () => {
    const line = 'A&B|C!D';
    expect(lexer.tokenizeLine(line, 0)).toEqual([
      { type: TokenType.IDENTIFIER, value: 'A', line: 0, column: 0 },
      { type: TokenType.AMPERSAND, value: '&', line: 0, column: 1 },
      { type: TokenType.IDENTIFIER, value: 'B', line: 0, column: 2 },
      { type: TokenType.PIPE, value: '|', line: 0, column: 3 },
      { type: TokenType.IDENTIFIER, value: 'C', line: 0, column: 4 },
      { type: TokenType.BANG, value: '!', line: 0, column: 5 },
      { type: TokenType.IDENTIFIER, value: 'D', line: 0, column: 6 },
    ]);
  });

  test('should tokenize a string literal', () => {
    const line = '"Hello World"'
    expect(lexer.tokenizeLine(line, 0)).toEqual([
      { type: TokenType.STRING, value: 'Hello World' , line: 0, column: 0 },
    ]);
  });

  test('should tokenize a label definition', () => {
    const line = '^MY_LABEL';
    expect(lexer.tokenizeLine(line, 0)).toEqual([
      { type: TokenType.LABEL_DEFINITION, value: '^MY_LABEL', line: 0, column: 0 },
    ]);
  });
});

describe('Lexer (TDD Cycle 1.3)', () => {
  let lexer: Lexer;

  beforeEach(() => {
    lexer = new Lexer();
  });

  test('should tokenize multiple statements on the same line', () => {
    const line = 'A=10 B=20';
    expect(lexer.tokenizeLine(line, 0)).toEqual([
      { type: TokenType.IDENTIFIER, value: 'A', line: 0, column: 0 },
      { type: TokenType.EQUALS, value: '=', line: 0, column: 1 },
      { type: TokenType.NUMBER, value: '10', line: 0, column: 2 },
      { type: TokenType.IDENTIFIER, value: 'B', line: 0, column: 5 },
      { type: TokenType.EQUALS, value: '=', line: 0, column: 6 },
      { type: TokenType.NUMBER, value: '20', line: 0, column: 7 },
    ]);
  });

  test('should tokenize a complex IF statement', () => {
    const line = ';=A>100 ?=100 #=^END';
    expect(lexer.tokenizeLine(line, 0)).toEqual([
        { type: TokenType.SEMICOLON, value: ';', line: 0, column: 0 },
        { type: TokenType.EQUALS, value: '=', line: 0, column: 1 },
        { type: TokenType.IDENTIFIER, value: 'A', line: 0, column: 2 },
        { type: TokenType.GREATER_THAN, value: '>', line: 0, column: 3 },
        { type: TokenType.NUMBER, value: '100', line: 0, column: 4 },
        { type: TokenType.QUESTION, value: '?', line: 0, column: 8 },
        { type: TokenType.EQUALS, value: '=', line: 0, column: 9 },
        { type: TokenType.NUMBER, value: '100', line: 0, column: 10 },
        { type: TokenType.HASH, value: '#', line: 0, column: 14 },
        { type: TokenType.EQUALS, value: '=', line: 0, column: 15 },
        { type: TokenType.LABEL_DEFINITION, value: '^END', line: 0, column: 16 },
    ]);
  });
});

describe('Parser (TDD Cycle 2.1)', () => {
    let interpreter: WorkerInterpreter;

    beforeEach(() => {
        interpreter = new WorkerInterpreter({
            logFn: mockLogFn,
            peekFn: mockPeekFn,
            pokeFn: mockPokeFn,
            gridData: mockGridData,
        });
    });

    test('should parse a simple assignment statement', () => {
        const tokens: Token[] = [
            { type: TokenType.IDENTIFIER, value: 'A', line: 0, column: 0 },
            { type: TokenType.EQUALS, value: '=', line: 0, column: 1 },
            { type: TokenType.NUMBER, value: '10', line: 0, column: 2 },
        ];
        const ast = interpreter.parse(tokens);
        expect(ast).toEqual({
            type: 'Program',
            body: [
                {
                    type: 'AssignmentStatement',
                    variable: { type: 'Identifier', name: 'A' },
                    value: { type: 'NumericLiteral', value: 10 },
                },
            ],
        });
    });
});

describe('Parser (TDD Cycle 2.2)', () => {
    let interpreter: WorkerInterpreter;

    beforeEach(() => {
        interpreter = new WorkerInterpreter({
            logFn: mockLogFn,
            peekFn: mockPeekFn,
            pokeFn: mockPokeFn,
            gridData: mockGridData,
        });
    });

    test('should parse a numeric output statement (?=10)', () => {
        const tokens: Token[] = [
            { type: TokenType.QUESTION, value: '?', line: 0, column: 0 },
            { type: TokenType.EQUALS, value: '=', line: 0, column: 1 },
            { type: TokenType.NUMBER, value: '10', line: 0, column: 2 },
        ];
        const ast = interpreter.parse(tokens);
        expect(ast).toEqual({
            type: 'Program',
            body: [
                {
                    type: 'OutputStatement',
                    expression: { type: 'NumericLiteral', value: 10 },
                },
            ],
        });
    });

    test('should parse a string output statement (?="Hello")', () => {
        const tokens: Token[] = [
            { type: TokenType.QUESTION, value: '?', line: 0, column: 0 },
            { type: TokenType.EQUALS, value: '=', line: 0, column: 1 },
            { type: TokenType.STRING, value: 'Hello', line: 0, column: 2 },
        ];
        const ast = interpreter.parse(tokens);
        expect(ast).toEqual({
            type: 'Program',
            body: [
                {
                    type: 'OutputStatement',
                    expression: { type: 'StringLiteral', value: 'Hello' },
                },
            ],
        });
    });

    test('should parse a newline statement (/)', () => {
        const tokens: Token[] = [
            { type: TokenType.SLASH, value: '/', line: 0, column: 0 },
        ];
        const ast = interpreter.parse(tokens);
        expect(ast).toEqual({
            type: 'Program',
            body: [
                {
                    type: 'NewlineStatement',
                },
            ],
        });
    });
});

describe('Parser (TDD Cycle 2.3)', () => {
    let interpreter: WorkerInterpreter;

    beforeEach(() => {
        interpreter = new WorkerInterpreter({
            logFn: mockLogFn,
            peekFn: mockPeekFn,
            pokeFn: mockPokeFn,
            gridData: mockGridData,
        });
    });

    test('should parse a simple arithmetic expression (C=A+B)', () => {
        const tokens: Token[] = [
            { type: TokenType.IDENTIFIER, value: 'C', line: 0, column: 0 },
            { type: TokenType.EQUALS, value: '=', line: 0, column: 1 },
            { type: TokenType.IDENTIFIER, value: 'A', line: 0, column: 2 },
            { type: TokenType.PLUS, value: '+', line: 0, column: 3 },
            { type: TokenType.IDENTIFIER, value: 'B', line: 0, column: 4 },
        ];
        const ast = interpreter.parse(tokens);
        expect(ast).toEqual({
            type: 'Program',
            body: [
                {
                    type: 'AssignmentStatement',
                    variable: { type: 'Identifier', name: 'C' },
                    value: {
                        type: 'BinaryExpression',
                        operator: '+',
                        left: { type: 'Identifier', name: 'A' },
                        right: { type: 'Identifier', name: 'B' },
                    },
                },
            ],
        });
    });

    test('should parse a complex arithmetic expression (D=10*5-2)', () => {
        const tokens: Token[] = [
            { type: TokenType.IDENTIFIER, value: 'D', line: 0, column: 0 },
            { type: TokenType.EQUALS, value: '=', line: 0, column: 1 },
            { type: TokenType.NUMBER, value: '10', line: 0, column: 2 },
            { type: TokenType.ASTERISK, value: '*', line: 0, column: 4 },
            { type: TokenType.NUMBER, value: '5', line: 0, column: 5 },
            { type: TokenType.MINUS, value: '-', line: 0, column: 6 },
            { type: TokenType.NUMBER, value: '2', line: 0, column: 7 },
        ];
        const ast = interpreter.parse(tokens);
        // VTL系言語は左から右へ評価するため: ((10*5)-2)
        expect(ast).toEqual({
            type: 'Program',
            body: [
                {
                    type: 'AssignmentStatement',
                    variable: { type: 'Identifier', name: 'D' },
                    value: {
                        type: 'BinaryExpression',
                        operator: '-',
                        left: {
                            type: 'BinaryExpression',
                            operator: '*',
                            left: { type: 'NumericLiteral', value: 10 },
                            right: { type: 'NumericLiteral', value: 5 },
                        },
                        right: { type: 'NumericLiteral', value: 2 },
                    },
                },
            ],
        });
    });

    test('should parse an expression with parentheses (E=(A+B)*C)', () => {
        const tokens: Token[] = [
            { type: TokenType.IDENTIFIER, value: 'E', line: 0, column: 0 },
            { type: TokenType.EQUALS, value: '=', line: 0, column: 1 },
            { type: TokenType.LEFT_PAREN, value: '(', line: 0, column: 2 },
            { type: TokenType.IDENTIFIER, value: 'A', line: 0, column: 3 },
            { type: TokenType.PLUS, value: '+', line: 0, column: 4 },
            { type: TokenType.IDENTIFIER, value: 'B', line: 0, column: 5 },
            { type: TokenType.RIGHT_PAREN, value: ')', line: 0, column: 6 },
            { type: TokenType.ASTERISK, value: '*', line: 0, column: 7 },
            { type: TokenType.IDENTIFIER, value: 'C', line: 0, column: 8 },
        ];
        const ast = interpreter.parse(tokens);
        expect(ast).toEqual({
            type: 'Program',
            body: [
                {
                    type: 'AssignmentStatement',
                    variable: { type: 'Identifier', name: 'E' },
                    value: {
                        type: 'BinaryExpression',
                        operator: '*',
                        left: {
                            type: 'BinaryExpression',
                            operator: '+',
                            left: { type: 'Identifier', name: 'A' },
                            right: { type: 'Identifier', name: 'B' },
                        },
                        right: { type: 'Identifier', name: 'C' },
                    },
                },
            ],
        });
    });
});

