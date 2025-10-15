// src/__tests__/workerInterpreter.test.ts

import WorkerInterpreter from '../workerInterpreter';
import { Lexer, TokenType, Token } from '../lexer';

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
});
