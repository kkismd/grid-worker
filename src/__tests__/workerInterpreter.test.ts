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
        // VTL系言語は左から右へ評価するため: ((10*5)-2)
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
        
        // ラベルの行番号を取得
        const labelLine = interpreter.getLabelLine('^LOOP');
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
