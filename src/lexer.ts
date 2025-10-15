/**
 * 字句解析で識別されるトークンの種類を定義します。
 */
export enum TokenType {
    // リテラル
    NUMBER = 'NUMBER',
    STRING = 'STRING',
    IDENTIFIER = 'IDENTIFIER', // 変数名 (A-Z) やラベル名
    LABEL_DEFINITION = 'LABEL_DEFINITION', // ^MY_LABEL
    COMMENT = 'COMMENT',

    // 演算子
    PLUS = 'PLUS', // +
    MINUS = 'MINUS', // -
    ASTERISK = 'ASTERISK', // *
    SLASH = 'SLASH', // /
    EQUALS = 'EQUALS', // =
    GREATER_THAN = 'GREATER_THAN', // >
    LESS_THAN = 'LESS_THAN', // <
    GREATER_THAN_OR_EQUAL = 'GREATER_THAN_OR_EQUAL', // >=
    LESS_THAN_OR_EQUAL = 'LESS_THAN_OR_EQUAL', // <=
    NOT_EQUAL = 'NOT_EQUAL', // <>
    AMPERSAND = 'AMPERSAND', // &
    PIPE = 'PIPE', // |
    BANG = 'BANG', // !

    // 特殊記号
    QUESTION = 'QUESTION', // ?
    SEMICOLON = 'SEMICOLON', // ;
    HASH = 'HASH', // #
    RIGHT_BRACKET = 'RIGHT_BRACKET', // ]
    AT = 'AT', // @
    COMMA = 'COMMA', // ,
    LEFT_PAREN = 'LEFT_PAREN', // (
    RIGHT_PAREN = 'RIGHT_PAREN', // )

    // 予約語 (現時点ではなし、将来的に追加される可能性)

    EOF = 'EOF', // End Of File (または行の終わり)
}

/**
 * 字句解析によって生成されるトークンを表すインターフェースです。
 */
export interface Token {
    type: TokenType; // トークンの種類
    value: string;   // トークンの元の文字列値
    line: number;    // トークンが存在する行番号
    column: number;  // トークンが存在する列番号
}

export class Lexer {
    /**
     * 単一の行をトークンに分割します。
     * @param lineText 字句解析する行のテキスト。
     * @param lineNumber 行番号 (0-indexed)。
     * @returns Token[] トークンの配列。
     * @throws {Error} 未知のトークンが見つかった場合。
     */
    tokenizeLine(lineText: string, lineNumber: number): Token[] {
        const tokens: Token[] = [];
        let cursor = 0;

        while (cursor < lineText.length) {
            const char = lineText[cursor];

            // コメント行
            if (char === ':') {
                const value = lineText.substring(cursor);
                tokens.push({ type: TokenType.COMMENT, value, line: lineNumber, column: cursor });
                cursor = lineText.length; // コメント行の残りをスキップ
                continue;
            }

            // 空白をスキップ
            if (/\s/.test(char)) {
                cursor++;
                continue;
            }

            // 数値リテラル
            if (/[0-9]/.test(char)) {
                let value = '';
                while (cursor < lineText.length && /[0-9]/.test(lineText[cursor])) {
                    value += lineText[cursor];
                    cursor++;
                }
                tokens.push({ type: TokenType.NUMBER, value, line: lineNumber, column: cursor - value.length });
                continue;
            }

            // 変数名 (A-Z)
            if (/[A-Z]/.test(char)) {
                tokens.push({ type: TokenType.IDENTIFIER, value: char, line: lineNumber, column: cursor });
                cursor++;
                continue;
            }

            // 文字列リテラル
            if (char === '"') {
                let value = '';
                cursor++; // 開始の " をスキップ
                while (cursor < lineText.length && lineText[cursor] !== '"') {
                    value += lineText[cursor];
                    cursor++;
                }
                if (cursor === lineText.length) {
                    // 文字列が閉じていない
                    throw new Error(`Unterminated string literal at line ${lineNumber + 1}`);
                }
                cursor++; // 終了の " をスキップ
                tokens.push({ type: TokenType.STRING, value, line: lineNumber, column: cursor - value.length - 2 });
                continue;
            }

            // ラベル定義
            if (char === '^') {
                let value = char;
                cursor++;
                while (cursor < lineText.length && /[a-zA-Z0-9_]/.test(lineText[cursor])) {
                    value += lineText[cursor];
                    cursor++;
                }
                tokens.push({ type: TokenType.LABEL_DEFINITION, value, line: lineNumber, column: cursor - value.length });
                continue;
            }

            // 演算子
            if (char === '+') {
                tokens.push({ type: TokenType.PLUS, value: char, line: lineNumber, column: cursor });
                cursor++;
                continue;
            }
            if (char === '-') {
                tokens.push({ type: TokenType.MINUS, value: char, line: lineNumber, column: cursor });
                cursor++;
                continue;
            }
            if (char === '*') {
                tokens.push({ type: TokenType.ASTERISK, value: char, line: lineNumber, column: cursor });
                cursor++;
                continue;
            }
            if (char === '/') {
                tokens.push({ type: TokenType.SLASH, value: char, line: lineNumber, column: cursor });
                cursor++;
                continue;
            }
            if (char === '=') {
                tokens.push({ type: TokenType.EQUALS, value: char, line: lineNumber, column: cursor });
                cursor++;
                continue;
            }
            // 比較演算子
            if (char === '>') {
                if (lineText[cursor + 1] === '=') {
                    tokens.push({ type: TokenType.GREATER_THAN_OR_EQUAL, value: '>=', line: lineNumber, column: cursor });
                    cursor += 2;
                } else {
                    tokens.push({ type: TokenType.GREATER_THAN, value: '>', line: lineNumber, column: cursor });
                    cursor++;
                }
                continue;
            }
            if (char === '<') {
                if (lineText[cursor + 1] === '=') {
                    tokens.push({ type: TokenType.LESS_THAN_OR_EQUAL, value: '<=', line: lineNumber, column: cursor });
                    cursor += 2;
                } else if (lineText[cursor + 1] === '>') {
                    tokens.push({ type: TokenType.NOT_EQUAL, value: '<>', line: lineNumber, column: cursor });
                    cursor += 2;
                } else {
                    tokens.push({ type: TokenType.LESS_THAN, value: '<', line: lineNumber, column: cursor });
                    cursor++;
                }
                continue;
            }

            // 論理演算子
            if (char === '&') {
                tokens.push({ type: TokenType.AMPERSAND, value: char, line: lineNumber, column: cursor });
                cursor++;
                continue;
            }
            if (char === '|') {
                tokens.push({ type: TokenType.PIPE, value: char, line: lineNumber, column: cursor });
                cursor++;
                continue;
            }
            if (char === '!') {
                tokens.push({ type: TokenType.BANG, value: char, line: lineNumber, column: cursor });
                cursor++;
                continue;
            }

            // 特殊記号
            if (char === ';') {
                tokens.push({ type: TokenType.SEMICOLON, value: char, line: lineNumber, column: cursor });
                cursor++;
                continue;
            }
            if (char === '?') {
                tokens.push({ type: TokenType.QUESTION, value: char, line: lineNumber, column: cursor });
                cursor++;
                continue;
            }
            if (char === '#') {
                tokens.push({ type: TokenType.HASH, value: char, line: lineNumber, column: cursor });
                cursor++;
                continue;
            }

            // TODO: その他のトークンタイプをここに追加

            throw new Error(`未知の文字 '${char}'`);
        }

        return tokens;
    }
}
