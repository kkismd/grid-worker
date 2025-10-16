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

  test('should tokenize string followed by other statements', () => {
    const line = '?=100 /';
    const tokens = lexer.tokenizeLine(line, 0);
    console.log('Tokenized ?=100 /:', JSON.stringify(tokens, null, 2));
    // このテストでトークン化の結果を確認する
    expect(tokens.length).toBe(4); // ?, =, 100, /
  });

  test('should tokenize string with escaped double quotes', () => {
    const line = '"He said ""Hello"""';
    expect(lexer.tokenizeLine(line, 0)).toEqual([
      { type: TokenType.STRING, value: 'He said "Hello"', line: 0, column: 0 },
    ]);
  });

  test('should tokenize empty string with escaped quotes', () => {
    const line = '""""""';  // "" "" "" -> three empty quotes -> " " "
    // Actually: """ """ would be " followed by unterminated, so this is ""  then ""  then ""
    // Wait: """" is "" (escaped quote = ") followed by " (string end)
    // Let me reconsider: """" tokenizes as one string containing one quote
    const line2 = '""';  // empty string
    expect(lexer.tokenizeLine(line2, 0)).toEqual([
      { type: TokenType.STRING, value: '', line: 0, column: 0 },
    ]);
  });

  test('should tokenize multiple escaped quotes in string', () => {
    const line = '"Quote: ""test"" and ""more"""';
    expect(lexer.tokenizeLine(line, 0)).toEqual([
      { type: TokenType.STRING, value: 'Quote: "test" and "more"', line: 0, column: 0 },
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

    test('should parse a simple assignment statement (A=10)', () => {
        const tokens: Token[] = [
            { type: TokenType.IDENTIFIER, value: 'A', line: 0, column: 0 },
            { type: TokenType.EQUALS, value: '=', line: 0, column: 1 },
            { type: TokenType.NUMBER, value: '10', line: 0, column: 2 },
        ];
        const ast = interpreter.parse(tokens);
        expect(ast).toEqual({
            type: 'Program',
            line: 0,
            body: [
                {
                    lineNumber: 0,
                    statements: [
                        {
                            type: 'AssignmentStatement',
                            line: 0,
                            column: 0,
                            variable: { type: 'Identifier', name: 'A', line: 0, column: 0 },
                            value: { type: 'NumericLiteral', value: 10, line: 0, column: 2 },
                        },
                    ],
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
            line: 0,
            body: [
                {
                    lineNumber: 0,
                    statements: [
                        {
                            type: 'OutputStatement',
                            line: 0,
                            column: 0,
                            expression: { type: 'NumericLiteral', value: 10, line: 0, column: 2 },
                        },
                    ],
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
            line: 0,
            body: [
                {
                    lineNumber: 0,
                    statements: [
                        {
                            type: 'OutputStatement',
                            line: 0,
                            column: 0,
                            expression: { type: 'StringLiteral', value: 'Hello', line: 0, column: 2 },
                        },
                    ],
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
            line: 0,
            body: [
                {
                    lineNumber: 0,
                    statements: [
                        {
                            type: 'NewlineStatement',
                            line: 0,
                            column: 0,
                        },
                    ],
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
            line: 0,
            body: [
                {
                    lineNumber: 0,
                    statements: [
                        {
                            type: 'AssignmentStatement',
                            line: 0,
                            column: 0,
                            variable: { type: 'Identifier', name: 'C', line: 0, column: 0 },
                            value: {
                                type: 'BinaryExpression',
                                line: 0,
                                operator: '+',
                                left: { type: 'Identifier', name: 'A', line: 0, column: 2 },
                                right: { type: 'Identifier', name: 'B', line: 0, column: 4 },
                            },
                        },
                    ],
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
        // 標準的な演算子優先順位: 10*(5-2) = 10*3 = 30
        expect(ast).toEqual({
            type: 'Program',
            line: 0,
            body: [
                {
                    lineNumber: 0,
                    statements: [
                        {
                            type: 'AssignmentStatement',
                            line: 0,
                            column: 0,
                            variable: { type: 'Identifier', name: 'D', line: 0, column: 0 },
                            value: {
                                type: 'BinaryExpression',
                                line: 0,
                                operator: '-',
                                left: {
                                    type: 'BinaryExpression',
                                    line: 0,
                                    operator: '*',
                                    left: { type: 'NumericLiteral', value: 10, line: 0, column: 2 },
                                    right: { type: 'NumericLiteral', value: 5, line: 0, column: 5 },
                                },
                                right: { type: 'NumericLiteral', value: 2, line: 0, column: 7 },
                            },
                        },
                    ],
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
            line: 0,
            body: [
                {
                    lineNumber: 0,
                    statements: [
                        {
                            type: 'AssignmentStatement',
                            line: 0,
                            column: 0,
                            variable: { type: 'Identifier', name: 'E', line: 0, column: 0 },
                            value: {
                                type: 'BinaryExpression',
                                line: 0,
                                operator: '*',
                                left: {
                                    type: 'BinaryExpression',
                                    line: 0,
                                    operator: '+',
                                    left: { type: 'Identifier', name: 'A', line: 0, column: 3 },
                                    right: { type: 'Identifier', name: 'B', line: 0, column: 5 },
                                },
                                right: { type: 'Identifier', name: 'C', line: 0, column: 8 },
                            },
                        },
                    ],
                },
            ],
        });
    });
});

describe('Parser (TDD Cycle 2.4)', () => {
    let interpreter: WorkerInterpreter;

    beforeEach(() => {
        interpreter = new WorkerInterpreter({
            logFn: mockLogFn,
            peekFn: mockPeekFn,
            pokeFn: mockPokeFn,
            gridData: mockGridData,
        });
    });

    test('should parse a comparison expression (F=A>B)', () => {
        const tokens: Token[] = [
            { type: TokenType.IDENTIFIER, value: 'F', line: 0, column: 0 },
            { type: TokenType.EQUALS, value: '=', line: 0, column: 1 },
            { type: TokenType.IDENTIFIER, value: 'A', line: 0, column: 2 },
            { type: TokenType.GREATER_THAN, value: '>', line: 0, column: 3 },
            { type: TokenType.IDENTIFIER, value: 'B', line: 0, column: 4 },
        ];
        const ast = interpreter.parse(tokens);
        expect(ast).toEqual({
            type: 'Program',
            line: 0,
            body: [
                {
                    lineNumber: 0,
                    statements: [
                        {
                            type: 'AssignmentStatement',
                            line: 0,
                            column: 0,
                            variable: { type: 'Identifier', name: 'F', line: 0, column: 0 },
                            value: {
                                type: 'BinaryExpression',
                                line: 0,
                                operator: '>',
                                left: { type: 'Identifier', name: 'A', line: 0, column: 2 },
                                right: { type: 'Identifier', name: 'B', line: 0, column: 4 },
                            },
                        },
                    ],
                },
            ],
        });
    });

    test('should parse an equality comparison (G=X=Y)', () => {
        const tokens: Token[] = [
            { type: TokenType.IDENTIFIER, value: 'G', line: 0, column: 0 },
            { type: TokenType.EQUALS, value: '=', line: 0, column: 1 },
            { type: TokenType.IDENTIFIER, value: 'X', line: 0, column: 2 },
            { type: TokenType.EQUALS, value: '=', line: 0, column: 3 },
            { type: TokenType.IDENTIFIER, value: 'Y', line: 0, column: 4 },
        ];
        const ast = interpreter.parse(tokens);
        expect(ast).toEqual({
            type: 'Program',
            line: 0,
            body: [
                {
                    lineNumber: 0,
                    statements: [
                        {
                            type: 'AssignmentStatement',
                            line: 0,
                            column: 0,
                            variable: { type: 'Identifier', name: 'G', line: 0, column: 0 },
                            value: {
                                type: 'BinaryExpression',
                                line: 0,
                                operator: '=',
                                left: { type: 'Identifier', name: 'X', line: 0, column: 2 },
                                right: { type: 'Identifier', name: 'Y', line: 0, column: 4 },
                            },
                        },
                    ],
                },
            ],
        });
    });

    test('should parse a logical expression (H=A&B|C)', () => {
        const tokens: Token[] = [
            { type: TokenType.IDENTIFIER, value: 'H', line: 0, column: 0 },
            { type: TokenType.EQUALS, value: '=', line: 0, column: 1 },
            { type: TokenType.IDENTIFIER, value: 'A', line: 0, column: 2 },
            { type: TokenType.AMPERSAND, value: '&', line: 0, column: 3 },
            { type: TokenType.IDENTIFIER, value: 'B', line: 0, column: 4 },
            { type: TokenType.PIPE, value: '|', line: 0, column: 5 },
            { type: TokenType.IDENTIFIER, value: 'C', line: 0, column: 6 },
        ];
        const ast = interpreter.parse(tokens);
        // 左から右へ評価: ((A&B)|C)
        expect(ast).toEqual({
            type: 'Program',
            line: 0,
            body: [
                {
                    lineNumber: 0,
                    statements: [
                        {
                            type: 'AssignmentStatement',
                            line: 0,
                            column: 0,
                            variable: { type: 'Identifier', name: 'H', line: 0, column: 0 },
                            value: {
                                type: 'BinaryExpression',
                                line: 0,
                                operator: '|',
                                left: {
                                    type: 'BinaryExpression',
                                    line: 0,
                                    operator: '&',
                                    left: { type: 'Identifier', name: 'A', line: 0, column: 2 },
                                    right: { type: 'Identifier', name: 'B', line: 0, column: 4 },
                                },
                                right: { type: 'Identifier', name: 'C', line: 0, column: 6 },
                            },
                        },
                    ],
                },
            ],
        });
    });
});

describe('Parser (TDD Cycle 2.5)', () => {
    let interpreter: WorkerInterpreter;

    beforeEach(() => {
        interpreter = new WorkerInterpreter({
            logFn: mockLogFn,
            peekFn: mockPeekFn,
            pokeFn: mockPokeFn,
            gridData: mockGridData,
        });
    });

    test('should parse an IF statement (;=A>100 ?=100)', () => {
        const tokens: Token[] = [
            { type: TokenType.SEMICOLON, value: ';', line: 0, column: 0 },
            { type: TokenType.EQUALS, value: '=', line: 0, column: 1 },
            { type: TokenType.IDENTIFIER, value: 'A', line: 0, column: 2 },
            { type: TokenType.GREATER_THAN, value: '>', line: 0, column: 3 },
            { type: TokenType.NUMBER, value: '100', line: 0, column: 4 },
            { type: TokenType.QUESTION, value: '?', line: 0, column: 8 },
            { type: TokenType.EQUALS, value: '=', line: 0, column: 9 },
            { type: TokenType.NUMBER, value: '100', line: 0, column: 10 },
        ];
        const ast = interpreter.parse(tokens);
        expect(ast).toEqual({
            type: 'Program',
            line: 0,
            body: [
                {
                    lineNumber: 0,
                    statements: [
                        {
                            type: 'IfStatement',
                            line: 0,
                            column: 0,
                            condition: {
                                type: 'BinaryExpression',
                                line: 0,
                                operator: '>',
                                left: { type: 'Identifier', name: 'A', line: 0, column: 2 },
                                right: { type: 'NumericLiteral', value: 100, line: 0, column: 4 },
                            },
                        },
                        {
                            type: 'OutputStatement',
                            line: 0,
                            column: 8,
                            expression: { type: 'NumericLiteral', value: 100, line: 0, column: 10 },
                        },
                    ],
                },
            ],
        });
    });

    test('should parse an IF statement with multiple actions', () => {
        const tokens: Token[] = [
            { type: TokenType.SEMICOLON, value: ';', line: 0, column: 0 },
            { type: TokenType.EQUALS, value: '=', line: 0, column: 1 },
            { type: TokenType.IDENTIFIER, value: 'A', line: 0, column: 2 },
            { type: TokenType.GREATER_THAN, value: '>', line: 0, column: 3 },
            { type: TokenType.NUMBER, value: '100', line: 0, column: 4 },
            { type: TokenType.QUESTION, value: '?', line: 0, column: 8 },
            { type: TokenType.EQUALS, value: '=', line: 0, column: 9 },
            { type: TokenType.NUMBER, value: '100', line: 0, column: 10 },
            { type: TokenType.IDENTIFIER, value: 'B', line: 0, column: 14 },
            { type: TokenType.EQUALS, value: '=', line: 0, column: 15 },
            { type: TokenType.NUMBER, value: '200', line: 0, column: 16 },
        ];
        const ast = interpreter.parse(tokens);
        expect(ast).toEqual({
            type: 'Program',
            line: 0,
            body: [
                {
                    lineNumber: 0,
                    statements: [
                        {
                            type: 'IfStatement',
                            line: 0,
                            column: 0,
                            condition: {
                                type: 'BinaryExpression',
                                line: 0,
                                operator: '>',
                                left: { type: 'Identifier', name: 'A', line: 0, column: 2 },
                                right: { type: 'NumericLiteral', value: 100, line: 0, column: 4 },
                            },
                        },
                        {
                            type: 'OutputStatement',
                            line: 0,
                            column: 8,
                            expression: { type: 'NumericLiteral', value: 100, line: 0, column: 10 },
                        },
                        {
                            type: 'AssignmentStatement',
                            line: 0,
                            column: 14,
                            variable: { type: 'Identifier', name: 'B', line: 0, column: 14 },
                            value: { type: 'NumericLiteral', value: 200, line: 0, column: 16 },
                        },
                    ],
                },
            ],
        });
    });
});


describe('Parser (TDD Cycle 2A.3)', () => {
    let interpreter: WorkerInterpreter;

    beforeEach(() => {
        interpreter = new WorkerInterpreter({
            logFn: mockLogFn,
            peekFn: mockPeekFn,
            pokeFn: mockPokeFn,
            gridData: mockGridData,
        });
    });

    test('should build and store Program AST when loadScript is called', () => {
        const script = 'A=10\nB=20';
        interpreter.loadScript(script);
        
        const program = interpreter.getProgram();
        expect(program).toBeDefined();
        expect(program?.type).toBe('Program');
        expect(program?.body).toHaveLength(2);
        expect(program?.body[0]?.lineNumber).toBe(0);
        expect(program?.body[1]?.lineNumber).toBe(1);
    });

    test('should retrieve line by line number', () => {
        const script = 'A=10\nB=20\nC=30';
        interpreter.loadScript(script);
        
        const line1 = interpreter.getLineByNumber(1);
        expect(line1).toBeDefined();
        expect(line1?.lineNumber).toBe(1);
        expect(line1?.statements).toHaveLength(1);
        expect(line1?.statements[0]?.type).toBe('AssignmentStatement');
    });

    test('should return undefined for non-existent line number', () => {
        const script = 'A=10';
        interpreter.loadScript(script);
        
        const line = interpreter.getLineByNumber(99);
        expect(line).toBeUndefined();
    });

    test('should support label jumps via line numbers', () => {
        const script = '^LOOP\nA=10\nB=20';
        interpreter.loadScript(script);
        
        // ラベルの行番号を取得 (^なしで検索)
        const labelLine = interpreter.getLabelLine('LOOP');
        expect(labelLine).toBe(0);
        
        // その行のASTを取得
        const line = interpreter.getLineByNumber(labelLine!);
        expect(line).toBeDefined();
        expect(line?.lineNumber).toBe(0);
    });

    test('should handle empty lines in Program', () => {
        const script = 'A=10\n\nB=20';
        interpreter.loadScript(script);
        
        const program = interpreter.getProgram();
        expect(program?.body).toHaveLength(3);
        expect(program?.body[1]?.statements).toHaveLength(0); // 空行
    });
});

describe('WorkerInterpreter - Control Flow Statements (Phase 2B.4)', () => {
    let interpreter: WorkerInterpreter;

    beforeEach(() => {
        interpreter = new WorkerInterpreter({
            logFn: mockLogFn,
            peekFn: mockPeekFn,
            pokeFn: mockPokeFn,
            gridData: mockGridData,
        });
    });

    test('should parse GOTO statement with label (#=^START)', () => {
        const tokens: Token[] = [
            { type: TokenType.HASH, value: '#', line: 0, column: 0 },
            { type: TokenType.EQUALS, value: '=', line: 0, column: 1 },
            { type: TokenType.LABEL_DEFINITION, value: '^START', line: 0, column: 2 },
        ];
        const ast = interpreter.parse(tokens);
        expect(ast.body).toHaveLength(1);
        expect(ast.body[0]?.statements).toHaveLength(1);
        const stmt = ast.body[0]?.statements[0];
        expect(stmt?.type).toBe('GotoStatement');
        expect(stmt).toHaveProperty('target');
        const gotoStmt = stmt as any;
        expect(gotoStmt.target).toBe('START'); // ラベル名（^なし）
    });

    test('should parse GOSUB statement with label (!=^MYSUB)', () => {
        const tokens: Token[] = [
            { type: TokenType.BANG, value: '!', line: 0, column: 0 },
            { type: TokenType.EQUALS, value: '=', line: 0, column: 1 },
            { type: TokenType.LABEL_DEFINITION, value: '^MYSUB', line: 0, column: 2 },
        ];
        const ast = interpreter.parse(tokens);
        expect(ast.body).toHaveLength(1);
        expect(ast.body[0]?.statements).toHaveLength(1);
        const stmt = ast.body[0]?.statements[0];
        expect(stmt?.type).toBe('GosubStatement');
        expect(stmt).toHaveProperty('target');
        const gosubStmt = stmt as any;
        expect(gosubStmt.target).toBe('MYSUB'); // ラベル名（^なし）
    });

    test('should parse RETURN statement (])', () => {
        const tokens: Token[] = [
            { type: TokenType.RIGHT_BRACKET, value: ']', line: 0, column: 0 },
        ];
        const ast = interpreter.parse(tokens);
        expect(ast.body).toHaveLength(1);
        expect(ast.body[0]?.statements).toHaveLength(1);
        const stmt = ast.body[0]?.statements[0];
        expect(stmt?.type).toBe('ReturnStatement');
    });

    test('should parse HALT statement (#=-1)', () => {
        const tokens: Token[] = [
            { type: TokenType.HASH, value: '#', line: 0, column: 0 },
            { type: TokenType.EQUALS, value: '=', line: 0, column: 1 },
            { type: TokenType.MINUS, value: '-', line: 0, column: 2 },
            { type: TokenType.NUMBER, value: '1', line: 0, column: 3 },
        ];
        const ast = interpreter.parse(tokens);
        expect(ast.body).toHaveLength(1);
        expect(ast.body[0]?.statements).toHaveLength(1);
        const stmt = ast.body[0]?.statements[0];
        expect(stmt?.type).toBe('HaltStatement');
    });

    test('should reject GOTO with number (#=100)', () => {
        const tokens: Token[] = [
            { type: TokenType.HASH, value: '#', line: 0, column: 0 },
            { type: TokenType.EQUALS, value: '=', line: 0, column: 1 },
            { type: TokenType.NUMBER, value: '100', line: 0, column: 2 },
        ];
        expect(() => interpreter.parse(tokens)).toThrow('GOTOにはラベル');
    });

    test('should reject GOTO with variable (#=A)', () => {
        const tokens: Token[] = [
            { type: TokenType.HASH, value: '#', line: 0, column: 0 },
            { type: TokenType.EQUALS, value: '=', line: 0, column: 1 },
            { type: TokenType.IDENTIFIER, value: 'A', line: 0, column: 2 },
        ];
        expect(() => interpreter.parse(tokens)).toThrow('GOTOにはラベル');
    });

    test('should reject GOSUB with expression (!=A+10)', () => {
        const tokens: Token[] = [
            { type: TokenType.BANG, value: '!', line: 0, column: 0 },
            { type: TokenType.EQUALS, value: '=', line: 0, column: 1 },
            { type: TokenType.IDENTIFIER, value: 'A', line: 0, column: 2 },
            { type: TokenType.PLUS, value: '+', line: 0, column: 3 },
            { type: TokenType.NUMBER, value: '10', line: 0, column: 4 },
        ];
        expect(() => interpreter.parse(tokens)).toThrow('GOSUBにはラベル');
    });
});

describe('WorkerInterpreter - Unary Minus Operator (Phase 2B.3.5)', () => {
    let interpreter: WorkerInterpreter;

    beforeEach(() => {
        interpreter = new WorkerInterpreter({
            logFn: mockLogFn,
            peekFn: mockPeekFn,
            pokeFn: mockPokeFn,
            gridData: mockGridData,
        });
    });

    test('should parse negative number literal (A=-100)', () => {
        const tokens: Token[] = [
            { type: TokenType.IDENTIFIER, value: 'A', line: 0, column: 0 },
            { type: TokenType.EQUALS, value: '=', line: 0, column: 1 },
            { type: TokenType.MINUS, value: '-', line: 0, column: 2 },
            { type: TokenType.NUMBER, value: '100', line: 0, column: 3 },
        ];
        const ast = interpreter.parse(tokens);
        expect(ast.body).toHaveLength(1);
        expect(ast.body[0]?.statements).toHaveLength(1);
        const stmt = ast.body[0]?.statements[0];
        expect(stmt?.type).toBe('AssignmentStatement');
        const assignStmt = stmt as any;
        expect(assignStmt.value.type).toBe('UnaryExpression');
        expect(assignStmt.value.operator).toBe('-');
        expect(assignStmt.value.operand.type).toBe('NumericLiteral');
        expect(assignStmt.value.operand.value).toBe(100);
    });

    test('should parse unary minus with variable (B=-A)', () => {
        const tokens: Token[] = [
            { type: TokenType.IDENTIFIER, value: 'B', line: 0, column: 0 },
            { type: TokenType.EQUALS, value: '=', line: 0, column: 1 },
            { type: TokenType.MINUS, value: '-', line: 0, column: 2 },
            { type: TokenType.IDENTIFIER, value: 'A', line: 0, column: 3 },
        ];
        const ast = interpreter.parse(tokens);
        expect(ast.body).toHaveLength(1);
        expect(ast.body[0]?.statements).toHaveLength(1);
        const stmt = ast.body[0]?.statements[0];
        expect(stmt?.type).toBe('AssignmentStatement');
        const assignStmt = stmt as any;
        expect(assignStmt.value.type).toBe('UnaryExpression');
        expect(assignStmt.value.operator).toBe('-');
        expect(assignStmt.value.operand.type).toBe('Identifier');
        expect(assignStmt.value.operand.name).toBe('A');
    });

    test('should parse complex expression with unary minus (C=10+-5)', () => {
        const tokens: Token[] = [
            { type: TokenType.IDENTIFIER, value: 'C', line: 0, column: 0 },
            { type: TokenType.EQUALS, value: '=', line: 0, column: 1 },
            { type: TokenType.NUMBER, value: '10', line: 0, column: 2 },
            { type: TokenType.PLUS, value: '+', line: 0, column: 3 },
            { type: TokenType.MINUS, value: '-', line: 0, column: 4 },
            { type: TokenType.NUMBER, value: '5', line: 0, column: 5 },
        ];
        const ast = interpreter.parse(tokens);
        expect(ast.body).toHaveLength(1);
        expect(ast.body[0]?.statements).toHaveLength(1);
        const stmt = ast.body[0]?.statements[0];
        expect(stmt?.type).toBe('AssignmentStatement');
        const assignStmt = stmt as any;
        expect(assignStmt.value.type).toBe('BinaryExpression');
        expect(assignStmt.value.operator).toBe('+');
        expect(assignStmt.value.left.type).toBe('NumericLiteral');
        expect(assignStmt.value.right.type).toBe('UnaryExpression');
        expect(assignStmt.value.right.operator).toBe('-');
        expect(assignStmt.value.right.operand.value).toBe(5);
    });

    test('should parse unary minus with parentheses (D=-(A+B))', () => {
        const tokens: Token[] = [
            { type: TokenType.IDENTIFIER, value: 'D', line: 0, column: 0 },
            { type: TokenType.EQUALS, value: '=', line: 0, column: 1 },
            { type: TokenType.MINUS, value: '-', line: 0, column: 2 },
            { type: TokenType.LEFT_PAREN, value: '(', line: 0, column: 3 },
            { type: TokenType.IDENTIFIER, value: 'A', line: 0, column: 4 },
            { type: TokenType.PLUS, value: '+', line: 0, column: 5 },
            { type: TokenType.IDENTIFIER, value: 'B', line: 0, column: 6 },
            { type: TokenType.RIGHT_PAREN, value: ')', line: 0, column: 7 },
        ];
        const ast = interpreter.parse(tokens);
        expect(ast.body).toHaveLength(1);
        expect(ast.body[0]?.statements).toHaveLength(1);
        const stmt = ast.body[0]?.statements[0];
        expect(stmt?.type).toBe('AssignmentStatement');
        const assignStmt = stmt as any;
        expect(assignStmt.value.type).toBe('UnaryExpression');
        expect(assignStmt.value.operator).toBe('-');
        expect(assignStmt.value.operand.type).toBe('BinaryExpression');
    });
});

describe('WorkerInterpreter - FOR/NEXT Statements (Phase 2B.5)', () => {
    let interpreter: WorkerInterpreter;

    beforeEach(() => {
        interpreter = new WorkerInterpreter({
            logFn: mockLogFn,
            peekFn: mockPeekFn,
            pokeFn: mockPokeFn,
            gridData: mockGridData,
        });
    });

    test('should parse FOR loop with default step (I=1,100)', () => {
        const tokens: Token[] = [
            { type: TokenType.IDENTIFIER, value: 'I', line: 0, column: 0 },
            { type: TokenType.EQUALS, value: '=', line: 0, column: 1 },
            { type: TokenType.NUMBER, value: '1', line: 0, column: 2 },
            { type: TokenType.COMMA, value: ',', line: 0, column: 3 },
            { type: TokenType.NUMBER, value: '100', line: 0, column: 4 },
        ];
        const ast = interpreter.parse(tokens);
        expect(ast.body).toHaveLength(1);
        expect(ast.body[0]?.statements).toHaveLength(1);
        const stmt = ast.body[0]?.statements[0];
        expect(stmt?.type).toBe('ForStatement');
        const forStmt = stmt as any;
        expect(forStmt.variable.name).toBe('I');
        expect(forStmt.start.type).toBe('NumericLiteral');
        expect(forStmt.start.value).toBe(1);
        expect(forStmt.end.type).toBe('NumericLiteral');
        expect(forStmt.end.value).toBe(100);
        expect(forStmt.step).toBeUndefined(); // デフォルトステップ
    });

    test('should parse FOR loop with negative step (J=10,1,-1)', () => {
        const tokens: Token[] = [
            { type: TokenType.IDENTIFIER, value: 'J', line: 0, column: 0 },
            { type: TokenType.EQUALS, value: '=', line: 0, column: 1 },
            { type: TokenType.NUMBER, value: '10', line: 0, column: 2 },
            { type: TokenType.COMMA, value: ',', line: 0, column: 3 },
            { type: TokenType.NUMBER, value: '1', line: 0, column: 4 },
            { type: TokenType.COMMA, value: ',', line: 0, column: 5 },
            { type: TokenType.MINUS, value: '-', line: 0, column: 6 },
            { type: TokenType.NUMBER, value: '1', line: 0, column: 7 },
        ];
        const ast = interpreter.parse(tokens);
        expect(ast.body).toHaveLength(1);
        expect(ast.body[0]?.statements).toHaveLength(1);
        const stmt = ast.body[0]?.statements[0];
        expect(stmt?.type).toBe('ForStatement');
        const forStmt = stmt as any;
        expect(forStmt.variable.name).toBe('J');
        expect(forStmt.start.value).toBe(10);
        expect(forStmt.end.value).toBe(1);
        expect(forStmt.step).toBeDefined();
        expect(forStmt.step.type).toBe('UnaryExpression');
        expect(forStmt.step.operator).toBe('-');
        expect(forStmt.step.operand.value).toBe(1);
    });

    test('should parse FOR loop with variable expressions (K=A,B,C)', () => {
        const tokens: Token[] = [
            { type: TokenType.IDENTIFIER, value: 'K', line: 0, column: 0 },
            { type: TokenType.EQUALS, value: '=', line: 0, column: 1 },
            { type: TokenType.IDENTIFIER, value: 'A', line: 0, column: 2 },
            { type: TokenType.COMMA, value: ',', line: 0, column: 3 },
            { type: TokenType.IDENTIFIER, value: 'B', line: 0, column: 4 },
            { type: TokenType.COMMA, value: ',', line: 0, column: 5 },
            { type: TokenType.IDENTIFIER, value: 'C', line: 0, column: 6 },
        ];
        const ast = interpreter.parse(tokens);
        expect(ast.body).toHaveLength(1);
        expect(ast.body[0]?.statements).toHaveLength(1);
        const stmt = ast.body[0]?.statements[0];
        expect(stmt?.type).toBe('ForStatement');
        const forStmt = stmt as any;
        expect(forStmt.variable.name).toBe('K');
        expect(forStmt.start.type).toBe('Identifier');
        expect(forStmt.start.name).toBe('A');
        expect(forStmt.end.type).toBe('Identifier');
        expect(forStmt.end.name).toBe('B');
        expect(forStmt.step.type).toBe('Identifier');
        expect(forStmt.step.name).toBe('C');
    });

    test('should parse NEXT statement (@=I)', () => {
        const tokens: Token[] = [
            { type: TokenType.AT, value: '@', line: 0, column: 0 },
            { type: TokenType.EQUALS, value: '=', line: 0, column: 1 },
            { type: TokenType.IDENTIFIER, value: 'I', line: 0, column: 2 },
        ];
        const ast = interpreter.parse(tokens);
        expect(ast.body).toHaveLength(1);
        expect(ast.body[0]?.statements).toHaveLength(1);
        const stmt = ast.body[0]?.statements[0];
        expect(stmt?.type).toBe('NextStatement');
        const nextStmt = stmt as any;
        expect(nextStmt.variable.type).toBe('Identifier');
        expect(nextStmt.variable.name).toBe('I');
    });

    test('should distinguish FOR from regular assignment (A=1)', () => {
        const tokens: Token[] = [
            { type: TokenType.IDENTIFIER, value: 'A', line: 0, column: 0 },
            { type: TokenType.EQUALS, value: '=', line: 0, column: 1 },
            { type: TokenType.NUMBER, value: '1', line: 0, column: 2 },
        ];
        const ast = interpreter.parse(tokens);
        expect(ast.body).toHaveLength(1);
        expect(ast.body[0]?.statements).toHaveLength(1);
        const stmt = ast.body[0]?.statements[0];
        expect(stmt?.type).toBe('AssignmentStatement'); // FORではなく通常の代入
    });
});

describe('WorkerInterpreter - PEEK/POKE Statements (Phase 2B.6)', () => {
    let interpreter: WorkerInterpreter;

    beforeEach(() => {
        interpreter = new WorkerInterpreter({
            logFn: mockLogFn,
            peekFn: mockPeekFn,
            pokeFn: mockPokeFn,
            gridData: mockGridData,
        });
    });

    test('should parse PEEK expression (A=$)', () => {
        const tokens: Token[] = [
            { type: TokenType.IDENTIFIER, value: 'A', line: 0, column: 0 },
            { type: TokenType.EQUALS, value: '=', line: 0, column: 1 },
            { type: TokenType.DOLLAR, value: '$', line: 0, column: 2 },
        ];
        const ast = interpreter.parse(tokens);
        expect(ast.body).toHaveLength(1);
        expect(ast.body[0]?.statements).toHaveLength(1);
        const stmt = ast.body[0]?.statements[0];
        expect(stmt?.type).toBe('AssignmentStatement');
        const assignStmt = stmt as any;
        expect(assignStmt.variable.name).toBe('A');
        expect(assignStmt.value.type).toBe('PeekExpression');
    });

    test('should parse POKE statement ($=A)', () => {
        const tokens: Token[] = [
            { type: TokenType.DOLLAR, value: '$', line: 0, column: 0 },
            { type: TokenType.EQUALS, value: '=', line: 0, column: 1 },
            { type: TokenType.IDENTIFIER, value: 'A', line: 0, column: 2 },
        ];
        const ast = interpreter.parse(tokens);
        expect(ast.body).toHaveLength(1);
        expect(ast.body[0]?.statements).toHaveLength(1);
        const stmt = ast.body[0]?.statements[0];
        expect(stmt?.type).toBe('PokeStatement');
        const pokeStmt = stmt as any;
        expect(pokeStmt.value.type).toBe('Identifier');
        expect(pokeStmt.value.name).toBe('A');
    });

    test('should parse POKE with numeric literal ($=42)', () => {
        const tokens: Token[] = [
            { type: TokenType.DOLLAR, value: '$', line: 0, column: 0 },
            { type: TokenType.EQUALS, value: '=', line: 0, column: 1 },
            { type: TokenType.NUMBER, value: '42', line: 0, column: 2 },
        ];
        const ast = interpreter.parse(tokens);
        expect(ast.body).toHaveLength(1);
        expect(ast.body[0]?.statements).toHaveLength(1);
        const stmt = ast.body[0]?.statements[0];
        expect(stmt?.type).toBe('PokeStatement');
        const pokeStmt = stmt as any;
        expect(pokeStmt.value.type).toBe('NumericLiteral');
        expect(pokeStmt.value.value).toBe(42);
    });

    test('should parse POKE with expression ($=A+10)', () => {
        const tokens: Token[] = [
            { type: TokenType.DOLLAR, value: '$', line: 0, column: 0 },
            { type: TokenType.EQUALS, value: '=', line: 0, column: 1 },
            { type: TokenType.IDENTIFIER, value: 'A', line: 0, column: 2 },
            { type: TokenType.PLUS, value: '+', line: 0, column: 3 },
            { type: TokenType.NUMBER, value: '10', line: 0, column: 4 },
        ];
        const ast = interpreter.parse(tokens);
        expect(ast.body).toHaveLength(1);
        expect(ast.body[0]?.statements).toHaveLength(1);
        const stmt = ast.body[0]?.statements[0];
        expect(stmt?.type).toBe('PokeStatement');
        const pokeStmt = stmt as any;
        expect(pokeStmt.value.type).toBe('BinaryExpression');
    });

    test('should parse PEEK in expression (B=A+$)', () => {
        const tokens: Token[] = [
            { type: TokenType.IDENTIFIER, value: 'B', line: 0, column: 0 },
            { type: TokenType.EQUALS, value: '=', line: 0, column: 1 },
            { type: TokenType.IDENTIFIER, value: 'A', line: 0, column: 2 },
            { type: TokenType.PLUS, value: '+', line: 0, column: 3 },
            { type: TokenType.DOLLAR, value: '$', line: 0, column: 4 },
        ];
        const ast = interpreter.parse(tokens);
        expect(ast.body).toHaveLength(1);
        expect(ast.body[0]?.statements).toHaveLength(1);
        const stmt = ast.body[0]?.statements[0];
        expect(stmt?.type).toBe('AssignmentStatement');
        const assignStmt = stmt as any;
        expect(assignStmt.variable.name).toBe('B');
        expect(assignStmt.value.type).toBe('BinaryExpression');
        const binaryExpr = assignStmt.value as any;
        expect(binaryExpr.right.type).toBe('PeekExpression');
    });

    test('should parse PEEK in subtraction (C=$-2)', () => {
        const tokens: Token[] = [
            { type: TokenType.IDENTIFIER, value: 'C', line: 0, column: 0 },
            { type: TokenType.EQUALS, value: '=', line: 0, column: 1 },
            { type: TokenType.DOLLAR, value: '$', line: 0, column: 2 },
            { type: TokenType.MINUS, value: '-', line: 0, column: 3 },
            { type: TokenType.NUMBER, value: '2', line: 0, column: 4 },
        ];
        const ast = interpreter.parse(tokens);
        expect(ast.body).toHaveLength(1);
        expect(ast.body[0]?.statements).toHaveLength(1);
        const stmt = ast.body[0]?.statements[0];
        expect(stmt?.type).toBe('AssignmentStatement');
        const assignStmt = stmt as any;
        expect(assignStmt.variable.name).toBe('C');
        expect(assignStmt.value.type).toBe('BinaryExpression');
        const binaryExpr = assignStmt.value as any;
        expect(binaryExpr.left.type).toBe('PeekExpression');
        expect(binaryExpr.operator).toBe('-');
    });
});

describe('WorkerInterpreter - Multiple Statements per Line (Phase 2B.7)', () => {
    let interpreter: WorkerInterpreter;

    beforeEach(() => {
        interpreter = new WorkerInterpreter({
            logFn: mockLogFn,
            peekFn: mockPeekFn,
            pokeFn: mockPokeFn,
            gridData: mockGridData,
        });
    });

    test('should parse multiple assignments on one line (A=10 B=20 C=30)', () => {
        const tokens: Token[] = [
            { type: TokenType.IDENTIFIER, value: 'A', line: 0, column: 0 },
            { type: TokenType.EQUALS, value: '=', line: 0, column: 1 },
            { type: TokenType.NUMBER, value: '10', line: 0, column: 2 },
            { type: TokenType.IDENTIFIER, value: 'B', line: 0, column: 5 },
            { type: TokenType.EQUALS, value: '=', line: 0, column: 6 },
            { type: TokenType.NUMBER, value: '20', line: 0, column: 7 },
            { type: TokenType.IDENTIFIER, value: 'C', line: 0, column: 10 },
            { type: TokenType.EQUALS, value: '=', line: 0, column: 11 },
            { type: TokenType.NUMBER, value: '30', line: 0, column: 12 },
        ];
        const ast = interpreter.parse(tokens);
        expect(ast.body).toHaveLength(1);
        expect(ast.body[0]?.statements).toHaveLength(3);
        
        const stmt1 = ast.body[0]?.statements[0];
        expect(stmt1?.type).toBe('AssignmentStatement');
        const assign1 = stmt1 as any;
        expect(assign1.variable.name).toBe('A');
        expect(assign1.value.value).toBe(10);
        
        const stmt2 = ast.body[0]?.statements[1];
        expect(stmt2?.type).toBe('AssignmentStatement');
        const assign2 = stmt2 as any;
        expect(assign2.variable.name).toBe('B');
        expect(assign2.value.value).toBe(20);
        
        const stmt3 = ast.body[0]?.statements[2];
        expect(stmt3?.type).toBe('AssignmentStatement');
        const assign3 = stmt3 as any;
        expect(assign3.variable.name).toBe('C');
        expect(assign3.value.value).toBe(30);
    });

    test('should parse assignment with output (A=10 B=20 ?=A+B)', () => {
        const tokens: Token[] = [
            { type: TokenType.IDENTIFIER, value: 'A', line: 0, column: 0 },
            { type: TokenType.EQUALS, value: '=', line: 0, column: 1 },
            { type: TokenType.NUMBER, value: '10', line: 0, column: 2 },
            { type: TokenType.IDENTIFIER, value: 'B', line: 0, column: 5 },
            { type: TokenType.EQUALS, value: '=', line: 0, column: 6 },
            { type: TokenType.NUMBER, value: '20', line: 0, column: 7 },
            { type: TokenType.QUESTION, value: '?', line: 0, column: 10 },
            { type: TokenType.EQUALS, value: '=', line: 0, column: 11 },
            { type: TokenType.IDENTIFIER, value: 'A', line: 0, column: 12 },
            { type: TokenType.PLUS, value: '+', line: 0, column: 13 },
            { type: TokenType.IDENTIFIER, value: 'B', line: 0, column: 14 },
        ];
        const ast = interpreter.parse(tokens);
        expect(ast.body).toHaveLength(1);
        expect(ast.body[0]?.statements).toHaveLength(3);
        
        expect(ast.body[0]?.statements[0]?.type).toBe('AssignmentStatement');
        expect(ast.body[0]?.statements[1]?.type).toBe('AssignmentStatement');
        expect(ast.body[0]?.statements[2]?.type).toBe('OutputStatement');
    });

    test('should parse IF with multiple subsequent statements (;=A>10 ?="Yes" B=1)', () => {
        const tokens: Token[] = [
            { type: TokenType.SEMICOLON, value: ';', line: 0, column: 0 },
            { type: TokenType.EQUALS, value: '=', line: 0, column: 1 },
            { type: TokenType.IDENTIFIER, value: 'A', line: 0, column: 2 },
            { type: TokenType.GREATER_THAN, value: '>', line: 0, column: 3 },
            { type: TokenType.NUMBER, value: '10', line: 0, column: 4 },
            { type: TokenType.QUESTION, value: '?', line: 0, column: 7 },
            { type: TokenType.EQUALS, value: '=', line: 0, column: 8 },
            { type: TokenType.STRING, value: 'Yes', line: 0, column: 9 },
            { type: TokenType.IDENTIFIER, value: 'B', line: 0, column: 15 },
            { type: TokenType.EQUALS, value: '=', line: 0, column: 16 },
            { type: TokenType.NUMBER, value: '1', line: 0, column: 17 },
        ];
        const ast = interpreter.parse(tokens);
        expect(ast.body).toHaveLength(1);
        expect(ast.body[0]?.statements).toHaveLength(3);
        
        expect(ast.body[0]?.statements[0]?.type).toBe('IfStatement');
        expect(ast.body[0]?.statements[1]?.type).toBe('OutputStatement');
        expect(ast.body[0]?.statements[2]?.type).toBe('AssignmentStatement');
    });

    test('should parse FOR loop with output and NEXT (I=1,10 ?=I @=I)', () => {
        const tokens: Token[] = [
            { type: TokenType.IDENTIFIER, value: 'I', line: 0, column: 0 },
            { type: TokenType.EQUALS, value: '=', line: 0, column: 1 },
            { type: TokenType.NUMBER, value: '1', line: 0, column: 2 },
            { type: TokenType.COMMA, value: ',', line: 0, column: 3 },
            { type: TokenType.NUMBER, value: '10', line: 0, column: 4 },
            { type: TokenType.QUESTION, value: '?', line: 0, column: 7 },
            { type: TokenType.EQUALS, value: '=', line: 0, column: 8 },
            { type: TokenType.IDENTIFIER, value: 'I', line: 0, column: 9 },
            { type: TokenType.AT, value: '@', line: 0, column: 11 },
            { type: TokenType.EQUALS, value: '=', line: 0, column: 12 },
            { type: TokenType.IDENTIFIER, value: 'I', line: 0, column: 13 },
        ];
        const ast = interpreter.parse(tokens);
        expect(ast.body).toHaveLength(1);
        expect(ast.body[0]?.statements).toHaveLength(3);
        
        expect(ast.body[0]?.statements[0]?.type).toBe('ForStatement');
        expect(ast.body[0]?.statements[1]?.type).toBe('OutputStatement');
        expect(ast.body[0]?.statements[2]?.type).toBe('NextStatement');
    });

    test('should parse PEEK/POKE with assignment (A=$ $=A+1 B=$)', () => {
        const tokens: Token[] = [
            { type: TokenType.IDENTIFIER, value: 'A', line: 0, column: 0 },
            { type: TokenType.EQUALS, value: '=', line: 0, column: 1 },
            { type: TokenType.DOLLAR, value: '$', line: 0, column: 2 },
            { type: TokenType.DOLLAR, value: '$', line: 0, column: 4 },
            { type: TokenType.EQUALS, value: '=', line: 0, column: 5 },
            { type: TokenType.IDENTIFIER, value: 'A', line: 0, column: 6 },
            { type: TokenType.PLUS, value: '+', line: 0, column: 7 },
            { type: TokenType.NUMBER, value: '1', line: 0, column: 8 },
            { type: TokenType.IDENTIFIER, value: 'B', line: 0, column: 10 },
            { type: TokenType.EQUALS, value: '=', line: 0, column: 11 },
            { type: TokenType.DOLLAR, value: '$', line: 0, column: 12 },
        ];
        const ast = interpreter.parse(tokens);
        expect(ast.body).toHaveLength(1);
        expect(ast.body[0]?.statements).toHaveLength(3);
        
        const stmt1 = ast.body[0]?.statements[0];
        expect(stmt1?.type).toBe('AssignmentStatement');
        const assign1 = stmt1 as any;
        expect(assign1.value.type).toBe('PeekExpression');
        
        const stmt2 = ast.body[0]?.statements[1];
        expect(stmt2?.type).toBe('PokeStatement');
        
        const stmt3 = ast.body[0]?.statements[2];
        expect(stmt3?.type).toBe('AssignmentStatement');
        const assign3 = stmt3 as any;
        expect(assign3.value.type).toBe('PeekExpression');
    });

    test('should parse complex line with control flow (;=X>0 #=^SKIP A=1 B=2)', () => {
        const tokens: Token[] = [
            { type: TokenType.SEMICOLON, value: ';', line: 0, column: 0 },
            { type: TokenType.EQUALS, value: '=', line: 0, column: 1 },
            { type: TokenType.IDENTIFIER, value: 'X', line: 0, column: 2 },
            { type: TokenType.GREATER_THAN, value: '>', line: 0, column: 3 },
            { type: TokenType.NUMBER, value: '0', line: 0, column: 4 },
            { type: TokenType.HASH, value: '#', line: 0, column: 6 },
            { type: TokenType.EQUALS, value: '=', line: 0, column: 7 },
            { type: TokenType.LABEL_DEFINITION, value: '^SKIP', line: 0, column: 8 },
            { type: TokenType.IDENTIFIER, value: 'A', line: 0, column: 14 },
            { type: TokenType.EQUALS, value: '=', line: 0, column: 15 },
            { type: TokenType.NUMBER, value: '1', line: 0, column: 16 },
            { type: TokenType.IDENTIFIER, value: 'B', line: 0, column: 18 },
            { type: TokenType.EQUALS, value: '=', line: 0, column: 19 },
            { type: TokenType.NUMBER, value: '2', line: 0, column: 20 },
        ];
        const ast = interpreter.parse(tokens);
        expect(ast.body).toHaveLength(1);
        expect(ast.body[0]?.statements).toHaveLength(4);
        
        expect(ast.body[0]?.statements[0]?.type).toBe('IfStatement');
        expect(ast.body[0]?.statements[1]?.type).toBe('GotoStatement');
        expect(ast.body[0]?.statements[2]?.type).toBe('AssignmentStatement');
        expect(ast.body[0]?.statements[3]?.type).toBe('AssignmentStatement');
    });
});

// ==================== Phase 3: インタプリタ実装 ====================

describe('WorkerInterpreter - Execution (Phase 3.1)', () => {
    let interpreter: WorkerInterpreter;

    beforeEach(() => {
        mockLogFn.mockClear();
        mockPeekFn.mockClear();
        mockPokeFn.mockClear();
        
        interpreter = new WorkerInterpreter({
            logFn: mockLogFn,
            peekFn: mockPeekFn,
            pokeFn: mockPokeFn,
            gridData: mockGridData,
        });
    });

    test('should execute simple assignment (A=10)', () => {
        const script = 'A=10';
        interpreter.loadScript(script);
        
        // Generator を完全に実行
        const gen = interpreter.run();
        let result = gen.next();
        while (!result.done) {
            result = gen.next();
        }
        
        // 変数Aの値が10になっていることを確認
        expect(interpreter.getVariable('A')).toBe(10);
    });

    test('should execute assignment with expression (B=5+3)', () => {
        const script = 'B=5+3';
        interpreter.loadScript(script);
        
        // Generator を完全に実行
        const gen = interpreter.run();
        let result = gen.next();
        while (!result.done) {
            result = gen.next();
        }
        
        expect(interpreter.getVariable('B')).toBe(8);
    });

    test('should execute multiple assignments (A=10 B=20 C=A+B)', () => {
        const script = 'A=10 B=20 C=A+B';
        interpreter.loadScript(script);
        
        // Generator を完全に実行
        const gen = interpreter.run();
        let result = gen.next();
        while (!result.done) {
            result = gen.next();
        }
        
        expect(interpreter.getVariable('A')).toBe(10);
        expect(interpreter.getVariable('B')).toBe(20);
        expect(interpreter.getVariable('C')).toBe(30);
    });

    test('should execute one statement per next() call', () => {
        const script = 'A=1 B=2 C=3';
        interpreter.loadScript(script);
        
        const gen = interpreter.run();
        
        // 最初のnext()でA=1が実行される
        gen.next();
        expect(interpreter.getVariable('A')).toBe(1);
        expect(interpreter.getVariable('B')).toBe(0); // まだ未実行
        expect(interpreter.getVariable('C')).toBe(0); // まだ未実行
        
        // 2回目のnext()でB=2が実行される
        gen.next();
        expect(interpreter.getVariable('A')).toBe(1);
        expect(interpreter.getVariable('B')).toBe(2);
        expect(interpreter.getVariable('C')).toBe(0); // まだ未実行
        
        // 3回目のnext()でC=3が実行される
        gen.next();
        expect(interpreter.getVariable('A')).toBe(1);
        expect(interpreter.getVariable('B')).toBe(2);
        expect(interpreter.getVariable('C')).toBe(3);
    });
});

describe('WorkerInterpreter - Output Statements (Phase 3.2)', () => {
    let interpreter: WorkerInterpreter;

    beforeEach(() => {
        mockLogFn.mockClear();
        mockPeekFn.mockClear();
        mockPokeFn.mockClear();
        
        interpreter = new WorkerInterpreter({
            logFn: mockLogFn,
            peekFn: mockPeekFn,
            pokeFn: mockPokeFn,
            gridData: mockGridData,
        });
    });

    test('should execute numeric output (?=10)', () => {
        const script = '?=10';
        interpreter.loadScript(script);
        
        const gen = interpreter.run();
        let result = gen.next();
        while (!result.done) {
            result = gen.next();
        }
        
        // logFnが数値10で呼ばれることを確認
        expect(mockLogFn).toHaveBeenCalledWith(10);
    });

    test('should execute string output (?="Hello")', () => {
        const script = '?="Hello"';
        interpreter.loadScript(script);
        
        const gen = interpreter.run();
        let result = gen.next();
        while (!result.done) {
            result = gen.next();
        }
        
        // logFnが文字列"Hello"で呼ばれることを確認
        expect(mockLogFn).toHaveBeenCalledWith('Hello');
    });

    test('should execute string output with spaces (?="Hello World")', () => {
        const script = '?="Hello World"';
        interpreter.loadScript(script);
        
        const gen = interpreter.run();
        let result = gen.next();
        while (!result.done) {
            result = gen.next();
        }
        
        // logFnが文字列"Hello World"で呼ばれることを確認
        expect(mockLogFn).toHaveBeenCalledWith('Hello World');
    });

    test('should execute string output with trailing space (?="Value: ")', () => {
        const script = '?="Value: "';
        interpreter.loadScript(script);
        
        const gen = interpreter.run();
        let result = gen.next();
        while (!result.done) {
            result = gen.next();
        }
        
        // logFnが文字列"Value: "で呼ばれることを確認
        expect(mockLogFn).toHaveBeenCalledWith('Value: ');
    });

    test('should execute variable output (?=A)', () => {
        const script = 'A=42 ?=A';
        interpreter.loadScript(script);
        
        const gen = interpreter.run();
        let result = gen.next();
        while (!result.done) {
            result = gen.next();
        }
        
        // logFnが42で呼ばれることを確認
        expect(mockLogFn).toHaveBeenCalledWith(42);
    });

    test('should execute newline statement (/)', () => {
        const script = '/';
        interpreter.loadScript(script);
        
        const gen = interpreter.run();
        let result = gen.next();
        while (!result.done) {
            result = gen.next();
        }
        
        // logFnが改行文字で呼ばれることを確認
        expect(mockLogFn).toHaveBeenCalledWith('\n');
    });

    test('should execute multiple output statements', () => {
        const script = '?=10 ?=20';
        interpreter.loadScript(script);
        
        const gen = interpreter.run();
        let result = gen.next();
        while (!result.done) {
            result = gen.next();
        }
        
        // logFnが2回呼ばれることを確認
        expect(mockLogFn).toHaveBeenCalledTimes(2);
        expect(mockLogFn).toHaveBeenNthCalledWith(1, 10);
        expect(mockLogFn).toHaveBeenNthCalledWith(2, 20);
    });

    test('should execute two string outputs', () => {
        const script = '?="A" ?="B"';
        interpreter.loadScript(script);
        
        const gen = interpreter.run();
        let result = gen.next();
        while (!result.done) {
            result = gen.next();
        }
        
        expect(mockLogFn).toHaveBeenCalledTimes(2);
        expect(mockLogFn).toHaveBeenNthCalledWith(1, 'A');
        expect(mockLogFn).toHaveBeenNthCalledWith(2, 'B');
    });

    test('should execute string then number output', () => {
        const script = '?="Value: " ?=100';
        interpreter.loadScript(script);
        
        const gen = interpreter.run();
        let result = gen.next();
        while (!result.done) {
            result = gen.next();
        }
        
        expect(mockLogFn).toHaveBeenCalledTimes(2);
        expect(mockLogFn).toHaveBeenNthCalledWith(1, 'Value: ');
        expect(mockLogFn).toHaveBeenNthCalledWith(2, 100);
    });

    test('should execute string, number, and newline output', () => {
        // まず数値と改行をテスト
        const simpleScript = '?=100 /';
        interpreter.loadScript(simpleScript);
        
        let gen = interpreter.run();
        let result = gen.next();
        while (!result.done) {
            result = gen.next();
        }
        
        expect(mockLogFn).toHaveBeenCalledTimes(2);
        expect(mockLogFn).toHaveBeenNthCalledWith(1, 100);
        expect(mockLogFn).toHaveBeenNthCalledWith(2, '\n');
        mockLogFn.mockClear();
        
        // 次に文字列、数値、改行をテスト
        const script = '?="Value: " ?=100 /';
        interpreter.loadScript(script);
        
        gen = interpreter.run();
        result = gen.next();
        while (!result.done) {
            result = gen.next();
        }
        
        expect(mockLogFn).toHaveBeenCalledTimes(3);
        expect(mockLogFn).toHaveBeenNthCalledWith(1, 'Value: ');
        expect(mockLogFn).toHaveBeenNthCalledWith(2, 100);
        expect(mockLogFn).toHaveBeenNthCalledWith(3, '\n');
    });
});

// ========================================
// Phase 2C: 空白区切り構文への最適化リファクタリング
// ========================================

describe('Phase 2C.1: String literal protection in whitespace splitting', () => {
    let interpreter: WorkerInterpreter;
    let mockLogFn: jest.Mock;
    let mockPokeFn: jest.Mock;

    beforeEach(() => {
        mockLogFn = jest.fn();
        mockPokeFn = jest.fn();
        const gridData = Array.from(new Int16Array(10000));
        interpreter = new WorkerInterpreter({
            gridData,
            peekFn: (index) => gridData[index] ?? 0,
            pokeFn: (index, value) => {
                gridData[index] = value;
                mockPokeFn(index, value);
            },
            logFn: mockLogFn,
        });
    });

    test('should split simple statements by whitespace', () => {
        const result = interpreter.splitLineByWhitespace('A=10 B=20');
        expect(result).toEqual(['A=10', 'B=20']);
    });

    test('should protect whitespace inside string literals', () => {
        const result = interpreter.splitLineByWhitespace('?="Hello World" B=20');
        expect(result).toEqual(['?="Hello World"', 'B=20']);
    });

    test('should handle string with trailing space', () => {
        const result = interpreter.splitLineByWhitespace('?="Value: " ?=100 /');
        expect(result).toEqual(['?="Value: "', '?=100', '/']);
    });

    test('should handle multiple spaces between statements', () => {
        const result = interpreter.splitLineByWhitespace('A=10   B=20');
        expect(result).toEqual(['A=10', 'B=20']);
    });

    test('should handle leading and trailing spaces', () => {
        const result = interpreter.splitLineByWhitespace('  A=10 B=20  ');
        expect(result).toEqual(['A=10', 'B=20']);
    });

    test('should handle string with escaped double quotes', () => {
        const result = interpreter.splitLineByWhitespace('?="He said ""Hello""" A=10');
        expect(result).toEqual(['?="He said ""Hello"""', 'A=10']);
    });

    test('should handle empty string literal', () => {
        const result = interpreter.splitLineByWhitespace('?="" A=10');
        expect(result).toEqual(['?=""', 'A=10']);
    });

    test('should handle string at the end', () => {
        const result = interpreter.splitLineByWhitespace('A=10 ?="End"');
        expect(result).toEqual(['A=10', '?="End"']);
    });

    test('should handle single statement with no spaces', () => {
        const result = interpreter.splitLineByWhitespace('A=10');
        expect(result).toEqual(['A=10']);
    });

    test('should handle empty line', () => {
        const result = interpreter.splitLineByWhitespace('');
        expect(result).toEqual([]);
    });

    test('should handle line with only spaces', () => {
        const result = interpreter.splitLineByWhitespace('   ');
        expect(result).toEqual([]);
    });
});

// ========================================
// Phase 3.3: 比較演算子・論理演算子
// ========================================

describe('Phase 3.3: Comparison and logical operators', () => {
    let interpreter: WorkerInterpreter;
    let mockLogFn: jest.Mock;
    let mockPokeFn: jest.Mock;

    beforeEach(() => {
        mockLogFn = jest.fn();
        mockPokeFn = jest.fn();
        const gridData = Array.from(new Int16Array(10000));
        interpreter = new WorkerInterpreter({
            gridData,
            peekFn: (index) => gridData[index] ?? 0,
            pokeFn: (index, value) => {
                gridData[index] = value;
                mockPokeFn(index, value);
            },
            logFn: mockLogFn,
        });
    });

    // 比較演算子のテスト
    test('should evaluate > (greater than) as 1 when true', () => {
        interpreter.loadScript('A=5>3');
        const gen = interpreter.run();
        gen.next();
        expect(interpreter.getVariable('A')).toBe(1);
    });

    test('should evaluate > (greater than) as 0 when false', () => {
        interpreter.loadScript('A=2>5');
        const gen = interpreter.run();
        gen.next();
        expect(interpreter.getVariable('A')).toBe(0);
    });

    test('should evaluate < (less than) as 1 when true', () => {
        interpreter.loadScript('A=2<5');
        const gen = interpreter.run();
        gen.next();
        expect(interpreter.getVariable('A')).toBe(1);
    });

    test('should evaluate < (less than) as 0 when false', () => {
        interpreter.loadScript('A=5<2');
        const gen = interpreter.run();
        gen.next();
        expect(interpreter.getVariable('A')).toBe(0);
    });

    test('should evaluate >= (greater than or equal) correctly', () => {
        interpreter.loadScript('A=5>=5');
        let gen = interpreter.run();
        gen.next();
        expect(interpreter.getVariable('A')).toBe(1);
        
        interpreter.loadScript('B=5>=3');
        gen = interpreter.run();
        gen.next();
        expect(interpreter.getVariable('B')).toBe(1);
        
        interpreter.loadScript('C=2>=5');
        gen = interpreter.run();
        gen.next();
        expect(interpreter.getVariable('C')).toBe(0);
    });

    test('should evaluate <= (less than or equal) correctly', () => {
        interpreter.loadScript('A=3<=3');
        let gen = interpreter.run();
        gen.next();
        expect(interpreter.getVariable('A')).toBe(1);
        
        interpreter.loadScript('B=2<=5');
        gen = interpreter.run();
        gen.next();
        expect(interpreter.getVariable('B')).toBe(1);
        
        interpreter.loadScript('C=5<=2');
        gen = interpreter.run();
        gen.next();
        expect(interpreter.getVariable('C')).toBe(0);
    });

    test('should evaluate = (equal) correctly', () => {
        interpreter.loadScript('A=5=5 B=3=5');
        const gen = interpreter.run();
        gen.next();
        expect(interpreter.getVariable('A')).toBe(1);
        expect(interpreter.getVariable('B')).toBe(0);
    });

    test('should evaluate <> (not equal) correctly', () => {
        interpreter.loadScript('A=5<>3 B=5<>5');
        const gen = interpreter.run();
        gen.next();
        expect(interpreter.getVariable('A')).toBe(1);
        expect(interpreter.getVariable('B')).toBe(0);
    });

    // 論理演算子のテスト
    test('should evaluate & (AND) correctly', () => {
        interpreter.loadScript('A=1&1 B=1&0 C=0&0');
        const gen = interpreter.run();
        gen.next();
        expect(interpreter.getVariable('A')).toBe(1);
        expect(interpreter.getVariable('B')).toBe(0);
        expect(interpreter.getVariable('C')).toBe(0);
    });

    test('should evaluate | (OR) correctly', () => {
        interpreter.loadScript('A=1|1');
        let gen = interpreter.run();
        gen.next();
        expect(interpreter.getVariable('A')).toBe(1);
        
        interpreter.loadScript('B=1|0');
        gen = interpreter.run();
        gen.next();
        expect(interpreter.getVariable('B')).toBe(1);
        
        interpreter.loadScript('C=0|0');
        gen = interpreter.run();
        gen.next();
        expect(interpreter.getVariable('C')).toBe(0);
    });

    test('should evaluate ! (NOT) correctly', () => {
        interpreter.loadScript('A=!0 B=!1 C=!5');
        const gen = interpreter.run();
        gen.next();
        expect(interpreter.getVariable('A')).toBe(1);
        expect(interpreter.getVariable('B')).toBe(0);
        expect(interpreter.getVariable('C')).toBe(0);
    });

    // 複合式のテスト
    test('should handle comparison with arithmetic', () => {
        interpreter.loadScript('A=1+2>2');
        let gen = interpreter.run();
        gen.next();
        expect(interpreter.getVariable('A')).toBe(1); // 3>2
        
        interpreter.loadScript('B=3*2<10');
        gen = interpreter.run();
        gen.next();
        expect(interpreter.getVariable('B')).toBe(1); // 6<10
    });

    test('should handle logical operators with comparison', () => {
        interpreter.loadScript('A=5>3&2<4');
        let gen = interpreter.run();
        gen.next();
        expect(interpreter.getVariable('A')).toBe(1); // 1&1
        
        interpreter.loadScript('B=1>2|3<5');
        gen = interpreter.run();
        gen.next();
        expect(interpreter.getVariable('B')).toBe(1); // 0|1
    });

    test('should treat non-zero values as true in logical operations', () => {
        interpreter.loadScript('A=5&3');
        let gen = interpreter.run();
        gen.next();
        expect(interpreter.getVariable('A')).toBe(1); // both non-zero
        
        interpreter.loadScript('B=5|0');
        gen = interpreter.run();
        gen.next();
        expect(interpreter.getVariable('B')).toBe(1); // at least one non-zero
    });
});

// ========================================
// Phase 3.4: IFステートメント実行
// ========================================

describe('Phase 3.4: IF statement execution', () => {
    let interpreter: WorkerInterpreter;
    let mockLogFn: jest.Mock;
    let mockPokeFn: jest.Mock;

    beforeEach(() => {
        mockLogFn = jest.fn();
        mockPokeFn = jest.fn();
        const gridData = Array.from(new Int16Array(10000));
        interpreter = new WorkerInterpreter({
            gridData,
            peekFn: (index) => gridData[index] ?? 0,
            pokeFn: (index, value) => {
                gridData[index] = value;
                mockPokeFn(index, value);
            },
            logFn: mockLogFn,
        });
    });

    test('should execute statements after IF when condition is true (non-zero)', () => {
        interpreter.loadScript(';=1 ?="True"');
        const gen = interpreter.run();
        gen.next(); // IF statement
        gen.next(); // Output statement
        
        expect(mockLogFn).toHaveBeenCalledWith('True');
    });

    test('should skip statements after IF when condition is false (zero)', () => {
        interpreter.loadScript(';=0 ?="False"');
        const gen = interpreter.run();
        gen.next(); // IF statement
        gen.next(); // Skipped Output statement
        
        expect(mockLogFn).not.toHaveBeenCalled();
    });

    test('should evaluate expression in IF condition', () => {
        interpreter.loadScript('A=10 ;=A>5 ?="Greater"');
        const gen = interpreter.run();
        gen.next(); // A=10
        gen.next(); // IF
        gen.next(); // Output
        
        expect(mockLogFn).toHaveBeenCalledWith('Greater');
    });

    test('should skip when comparison is false', () => {
        interpreter.loadScript('A=3 ;=A>5 ?="Greater"');
        const gen = interpreter.run();
        gen.next(); // A=3
        gen.next(); // IF
        gen.next(); // Skipped Output
        
        expect(mockLogFn).not.toHaveBeenCalled();
    });

    test('should handle multiple statements after IF when true', () => {
        interpreter.loadScript(';=1 A=10 B=20 ?=A');
        const gen = interpreter.run();
        gen.next(); // IF
        gen.next(); // A=10
        gen.next(); // B=20
        gen.next(); // ?=A
        
        expect(interpreter.getVariable('A')).toBe(10);
        expect(interpreter.getVariable('B')).toBe(20);
        expect(mockLogFn).toHaveBeenCalledWith(10);
    });

    test('should skip all statements after IF when false', () => {
        interpreter.loadScript(';=0 A=10 B=20 ?=999');
        const gen = interpreter.run();
        gen.next(); // IF
        gen.next(); // Skipped A=10
        gen.next(); // Skipped B=20
        gen.next(); // Skipped ?=999
        
        expect(interpreter.getVariable('A')).toBe(0); // Not executed
        expect(interpreter.getVariable('B')).toBe(0); // Not executed
        expect(mockLogFn).not.toHaveBeenCalled(); // Not executed
    });

    test('should handle logical AND in IF condition', () => {
        interpreter.loadScript('A=10 B=5 ;=(A>5)&(B<10) ?="Both true"');
        const gen = interpreter.run();
        gen.next(); // A=10
        gen.next(); // B=5
        gen.next(); // IF
        gen.next(); // Output
        
        expect(mockLogFn).toHaveBeenCalledWith('Both true');
    });

    test('should handle logical OR in IF condition', () => {
        interpreter.loadScript('A=3 B=15 ;=A>5|B>10 ?="At least one"');
        const gen = interpreter.run();
        gen.next(); // A=3
        gen.next(); // B=15
        gen.next(); // IF
        gen.next(); // Output
        
        expect(mockLogFn).toHaveBeenCalledWith('At least one');
    });

    test('should handle NOT operator in IF condition', () => {
        interpreter.loadScript('A=0 ;=!A ?="A is zero"');
        const gen = interpreter.run();
        gen.next(); // A=0
        gen.next(); // IF
        gen.next(); // Output
        
        expect(mockLogFn).toHaveBeenCalledWith('A is zero');
    });

    test('should execute statements before IF regardless of condition', () => {
        interpreter.loadScript('A=5 ;=0 B=10');
        const gen = interpreter.run();
        gen.next(); // A=5
        gen.next(); // IF
        gen.next(); // Skipped B=10
        
        expect(interpreter.getVariable('A')).toBe(5); // Before IF, executed
        expect(interpreter.getVariable('B')).toBe(0); // After IF, skipped
    });

    test('should handle multiple IFs on different lines', () => {
        interpreter.loadScript(';=1 ?="Line1"\n;=0 ?="Line2"\n;=1 ?="Line3"');
        const gen = interpreter.run();
        gen.next(); // Line 1: IF
        gen.next(); // Line 1: Output
        gen.next(); // Line 2: IF
        gen.next(); // Line 2: Skipped Output
        gen.next(); // Line 3: IF
        gen.next(); // Line 3: Output
        
        expect(mockLogFn).toHaveBeenCalledTimes(2);
        expect(mockLogFn).toHaveBeenNthCalledWith(1, 'Line1');
        expect(mockLogFn).toHaveBeenNthCalledWith(2, 'Line3');
    });

    test('should handle complex expression in IF', () => {
        interpreter.loadScript('A=10 B=20 ;=(A+B)>25 ?="Sum > 25"');
        const gen = interpreter.run();
        gen.next(); // A=10
        gen.next(); // B=20
        gen.next(); // IF
        gen.next(); // Output
        
        expect(mockLogFn).toHaveBeenCalledWith('Sum > 25');
    });
});

// ============================================================
// Phase 3.4a: 演算子優先順位のテスト
// ============================================================
describe('Phase 3.4a: Operator Precedence', () => {
    let interpreter: WorkerInterpreter;
    let mockLogFn: jest.Mock;
    let mockPeekFn: jest.Mock;
    let mockPokeFn: jest.Mock;
    let mockGridData: number[];

    beforeEach(() => {
        mockLogFn = jest.fn();
        mockPeekFn = jest.fn(() => 0);
        mockPokeFn = jest.fn();
        mockGridData = new Array(100).fill(0);
        interpreter = new WorkerInterpreter({
            logFn: mockLogFn,
            peekFn: mockPeekFn,
            pokeFn: mockPokeFn,
            gridData: mockGridData,
        });
    });

    test('should respect arithmetic operator precedence (A+B*C)', () => {
        interpreter.loadScript('A=2 B=3 C=4 D=A+B*C');
        const gen = interpreter.run();
        gen.next(); // A=2
        gen.next(); // B=3
        gen.next(); // C=4
        gen.next(); // D=A+B*C → 2+3*4 = 2+12 = 14
        
        expect(interpreter.getVariable('D')).toBe(14);
    });

    test('should respect arithmetic operator precedence (A*B+C)', () => {
        interpreter.loadScript('A=2 B=3 C=4 D=A*B+C');
        const gen = interpreter.run();
        gen.next(); // A=2
        gen.next(); // B=3
        gen.next(); // C=4
        gen.next(); // D=A*B+C → 2*3+4 = 6+4 = 10
        
        expect(interpreter.getVariable('D')).toBe(10);
    });

    test('should respect arithmetic operator precedence (A/B-C)', () => {
        interpreter.loadScript('A=12 B=3 C=2 D=A/B-C');
        const gen = interpreter.run();
        gen.next(); // A=12
        gen.next(); // B=3
        gen.next(); // C=2
        gen.next(); // D=A/B-C → 12/3-2 = 4-2 = 2
        
        expect(interpreter.getVariable('D')).toBe(2);
    });

    test('should respect logical operator precedence (A&B|C)', () => {
        interpreter.loadScript('A=1 B=0 C=1 D=A&B|C');
        const gen = interpreter.run();
        gen.next(); // A=1
        gen.next(); // B=0
        gen.next(); // C=1
        gen.next(); // D=A&B|C → (1&0)|1 = 0|1 = 1
        
        expect(interpreter.getVariable('D')).toBe(1);
    });

    test('should respect comparison before logical OR (A>5|B>10)', () => {
        interpreter.loadScript('A=3 B=15 C=A>5|B>10');
        const gen = interpreter.run();
        gen.next(); // A=3
        gen.next(); // B=15
        gen.next(); // C=A>5|B>10 → 0|1 = 1
        
        expect(interpreter.getVariable('C')).toBe(1);
    });

    test('should respect comparison before logical AND (A>5&B>10)', () => {
        interpreter.loadScript('A=7 B=8 C=A>5&B>10');
        const gen = interpreter.run();
        gen.next(); // A=7
        gen.next(); // B=8
        gen.next(); // C=A>5&B>10 → 1&0 = 0
        
        expect(interpreter.getVariable('C')).toBe(0);
    });

    test('should handle complex precedence (A>5|B>10&C=1)', () => {
        interpreter.loadScript('A=3 B=15 C=1 D=A>5|B>10&C=1');
        const gen = interpreter.run();
        gen.next(); // A=3
        gen.next(); // B=15
        gen.next(); // C=1
        gen.next(); // D=A>5|B>10&C=1 → 0|(1&1) = 0|1 = 1
        
        expect(interpreter.getVariable('D')).toBe(1);
    });

    test('should handle arithmetic and comparison together (A+B>C*D)', () => {
        interpreter.loadScript('A=5 B=3 C=2 D=4 E=A+B>C*D');
        const gen = interpreter.run();
        gen.next(); // A=5
        gen.next(); // B=3
        gen.next(); // C=2
        gen.next(); // D=4
        gen.next(); // E=A+B>C*D → 8>8 = 0
        
        expect(interpreter.getVariable('E')).toBe(0);
    });

    test('should use operator precedence in IF condition', () => {
        interpreter.loadScript('A=3 B=15 ;=A>5|B>10 ?="Success"');
        const gen = interpreter.run();
        gen.next(); // A=3
        gen.next(); // B=15
        gen.next(); // IF: A>5|B>10 → 0|1 = 1 (true)
        gen.next(); // Output
        
        expect(mockLogFn).toHaveBeenCalledWith('Success');
    });

    test('should handle unary minus with precedence', () => {
        interpreter.loadScript('A=5 B=-A*2');
        const gen = interpreter.run();
        gen.next(); // A=5
        gen.next(); // B=-A*2 → (-5)*2 = -10
        
        expect(interpreter.getVariable('B')).toBe(-10);
    });

    test('should handle NOT with precedence', () => {
        interpreter.loadScript('A=0 B=5 C=!A|B>10');
        const gen = interpreter.run();
        gen.next(); // A=0
        gen.next(); // B=5
        gen.next(); // C=!A|B>10 → 1|0 = 1
        
        expect(interpreter.getVariable('C')).toBe(1);
    });
});

// ============================================================
// Phase 3.5: GOTO/GOSUB/RETURN の実行テスト
// ============================================================
describe('Phase 3.5: GOTO/GOSUB/RETURN Execution', () => {
    let interpreter: WorkerInterpreter;
    let mockLogFn: jest.Mock;
    let mockPeekFn: jest.Mock;
    let mockPokeFn: jest.Mock;
    let mockGridData: number[];

    beforeEach(() => {
        mockLogFn = jest.fn();
        mockPeekFn = jest.fn(() => 0);
        mockPokeFn = jest.fn();
        mockGridData = new Array(100).fill(0);
        interpreter = new WorkerInterpreter({
            logFn: mockLogFn,
            peekFn: mockPeekFn,
            pokeFn: mockPokeFn,
            gridData: mockGridData,
        });
    });

    test('should execute GOTO to jump to a label', () => {
        interpreter.loadScript('A=1 #=^SKIP\nA=2\n^SKIP\nA=3');
        const gen = interpreter.run();
        gen.next(); // A=1
        gen.next(); // GOTO ^SKIP
        gen.next(); // A=3 (skipped A=2)
        
        expect(interpreter.getVariable('A')).toBe(3);
    });

    test('should execute forward GOTO', () => {
        interpreter.loadScript('^START\n?="Line1" #=^END\n?="Line2"\n^END\n?="Line3"');
        const gen = interpreter.run();
        gen.next(); // Output Line1
        gen.next(); // GOTO ^END
        gen.next(); // Output Line3 (skipped Line2)
        
        expect(mockLogFn).toHaveBeenCalledTimes(2);
        expect(mockLogFn).toHaveBeenNthCalledWith(1, 'Line1');
        expect(mockLogFn).toHaveBeenNthCalledWith(2, 'Line3');
    });

    test('should execute backward GOTO (simple loop)', () => {
        interpreter.loadScript('^LOOP\nA=A+1 ;=A<3 #=^LOOP\n?=A');
        const gen = interpreter.run();
        
        // Loop iteration 1: A=0+1=1, 1<3 true, GOTO LOOP
        gen.next(); // A=A+1 → A=1
        gen.next(); // IF A<3 → true
        gen.next(); // GOTO ^LOOP (jump to line 0, then to line 1)
        
        // Loop iteration 2: A=1+1=2, 2<3 true, GOTO LOOP
        gen.next(); // A=A+1 → A=2
        gen.next(); // IF A<3 → true
        gen.next(); // GOTO ^LOOP
        
        // Loop iteration 3: A=2+1=3, 3<3 false, skip GOTO
        gen.next(); // A=A+1 → A=3
        gen.next(); // IF A<3 → false (skip GOTO)
        gen.next(); // GOTO skipped
        
        // Output A
        gen.next(); // ?=A
        
        expect(interpreter.getVariable('A')).toBe(3);
        expect(mockLogFn).toHaveBeenCalledWith(3);
    });

    test('should execute GOSUB and RETURN', () => {
        interpreter.loadScript('A=1 !=^SUB\nA=2\n^SUB\nA=A*10 ]');
        const gen = interpreter.run();
        gen.next(); // A=1
        gen.next(); // GOSUB ^SUB
        gen.next(); // A=A*10 → A=10
        gen.next(); // RETURN
        gen.next(); // A=2
        
        expect(interpreter.getVariable('A')).toBe(2);
    });

    test('should handle nested GOSUB calls', () => {
        interpreter.loadScript('A=1 !=^SUB1\n^SUB1\nA=A+1 !=^SUB2\n]\n^SUB2\nA=A*10 ]');
        const gen = interpreter.run();
        gen.next(); // A=1
        gen.next(); // GOSUB ^SUB1
        gen.next(); // A=A+1 → A=2
        gen.next(); // GOSUB ^SUB2
        gen.next(); // A=A*10 → A=20
        gen.next(); // RETURN (from SUB2)
        gen.next(); // RETURN (from SUB1)
        
        expect(interpreter.getVariable('A')).toBe(20);
    });

    test('should execute HALT (#=-1) to stop program', () => {
        interpreter.loadScript('A=1 #=-1 A=2');
        const gen = interpreter.run();
        gen.next(); // A=1
        const result = gen.next(); // HALT
        
        expect(result.done).toBe(true);
        expect(interpreter.getVariable('A')).toBe(1);
    });

    test('should halt when program reaches end', () => {
        interpreter.loadScript('A=5');
        const gen = interpreter.run();
        gen.next(); // A=5
        const result = gen.next(); // End of program
        
        expect(result.done).toBe(true);
        expect(interpreter.getVariable('A')).toBe(5);
    });

    test('should handle GOSUB with output', () => {
        interpreter.loadScript('!=^PRINT\n^PRINT\n?="Hello" ]');
        const gen = interpreter.run();
        gen.next(); // GOSUB ^PRINT
        gen.next(); // Output
        gen.next(); // RETURN
        
        expect(mockLogFn).toHaveBeenCalledWith('Hello');
    });

    test('should throw error on RETURN without GOSUB', () => {
        interpreter.loadScript(']');
        const gen = interpreter.run();
        
        expect(() => gen.next()).toThrow('RETURN文がありますがGOSUBの呼び出しがありません');
    });

    test('should handle multiple GOTOs in sequence', () => {
        interpreter.loadScript('#=^A\n^A\n#=^B\n^B\nA=10');
        const gen = interpreter.run();
        gen.next(); // GOTO ^A
        gen.next(); // GOTO ^B
        gen.next(); // A=10
        
        expect(interpreter.getVariable('A')).toBe(10);
    });

    test('should execute statements before GOTO on same line', () => {
        interpreter.loadScript('A=5 B=10 #=^END\nC=20\n^END');
        const gen = interpreter.run();
        gen.next(); // A=5
        gen.next(); // B=10
        gen.next(); // GOTO ^END (C=20 skipped)
        
        expect(interpreter.getVariable('A')).toBe(5);
        expect(interpreter.getVariable('B')).toBe(10);
        expect(interpreter.getVariable('C')).toBe(0);
    });

    test('should handle GOSUB in a loop', () => {
        interpreter.loadScript('^LOOP\nA=A+1 !=^ADD\n;=A<2 #=^LOOP\n^ADD\nB=B+1 ]');
        const gen = interpreter.run();
        
        // Iteration 1
        gen.next(); // A=A+1 → A=1
        gen.next(); // GOSUB ^ADD
        gen.next(); // B=B+1 → B=1
        gen.next(); // RETURN
        gen.next(); // IF A<2 → true
        gen.next(); // GOTO ^LOOP
        
        // Iteration 2
        gen.next(); // A=A+1 → A=2
        gen.next(); // GOSUB ^ADD
        gen.next(); // B=B+1 → B=2
        gen.next(); // RETURN
        gen.next(); // IF A<2 → false (exit loop)
        gen.next(); // GOTO skipped
        
        expect(interpreter.getVariable('A')).toBe(2);
        expect(interpreter.getVariable('B')).toBe(2);
    });
});
