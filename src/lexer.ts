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
    PERCENT = 'PERCENT', // %
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
    LEFT_BRACKET = 'LEFT_BRACKET', // [
    RIGHT_BRACKET = 'RIGHT_BRACKET', // ]
    AT = 'AT', // @
    COMMA = 'COMMA', // ,
    LEFT_PAREN = 'LEFT_PAREN', // (
    RIGHT_PAREN = 'RIGHT_PAREN', // )
    DOLLAR = 'DOLLAR', // $ (VTL 1byte data I/O)
    APOSTROPHE = 'APOSTROPHE', // ' (Character literal delimiter)
    CHAR_LITERAL = 'CHAR_LITERAL', // 'a' (Character literal value)
    TILDE = 'TILDE', // ~ (Random number)
    BACKTICK = 'BACKTICK', // ` (Grid access PEEK/POKE)

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
            
            // charがundefinedの場合は終了
            if (!char) {
                break;
            }

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
                let isHex = false;
                
                // 0xまたは0Xで始まる場合は16進数
                if (char === '0' && cursor + 1 < lineText.length) {
                    const nextChar = lineText[cursor + 1];
                    if (nextChar === 'x' || nextChar === 'X') {
                        isHex = true;
                        cursor += 2; // '0x'をスキップ
                        
                        // 16進数の読み取り
                        while (cursor < lineText.length) {
                            const currentChar = lineText[cursor];
                            if (currentChar && /[0-9A-Fa-f]/.test(currentChar)) {
                                value += currentChar;
                                cursor++;
                            } else {
                                break;
                            }
                        }
                        
                        if (value.length === 0) {
                            throw new Error(`Invalid hexadecimal literal at line ${lineNumber + 1}`);
                        }
                        
                        // 16進数を10進数に変換して格納
                        const decimalValue = parseInt(value, 16).toString();
                        tokens.push({ type: TokenType.NUMBER, value: decimalValue, line: lineNumber, column: cursor - value.length - 2 });
                        continue;
                    }
                }
                
                // 通常の10進数
                value = char;
                cursor++;
                while (cursor < lineText.length) {
                    const currentChar = lineText[cursor];
                    if (currentChar && /[0-9]/.test(currentChar)) {
                        value += currentChar;
                        cursor++;
                    } else {
                        break;
                    }
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
                const startColumn = cursor;
                cursor++; // 開始の " をスキップ
                
                while (cursor < lineText.length) {
                    const currentChar = lineText[cursor];
                    
                    if (currentChar === '"') {
                        // ダブルクォートを発見
                        if (lineText[cursor + 1] === '"') {
                            // "" はエスケープされたダブルクォート
                            value += '"';  // 1つのダブルクォートとして値に追加
                            cursor += 2;   // "" の2文字分進める
                        } else {
                            // 文字列の終了
                            cursor++; // 終了の " をスキップ
                            tokens.push({ type: TokenType.STRING, value, line: lineNumber, column: startColumn });
                            break;
                        }
                    } else {
                        value += currentChar;
                        cursor++;
                    }
                }
                
                if (cursor > lineText.length || (cursor === lineText.length && lineText[cursor - 1] !== '"')) {
                    // 文字列が閉じていない
                    throw new Error(`Unterminated string literal at line ${lineNumber + 1}`);
                }
                continue;
            }

            // ラベル定義
            if (char === '^') {
                let value = char;
                cursor++;
                while (cursor < lineText.length) {
                    const currentChar = lineText[cursor];
                    if (currentChar && /[a-zA-Z0-9_]/.test(currentChar)) {
                        value += currentChar;
                        cursor++;
                    } else {
                        break;
                    }
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
            if (char === '%') {
                tokens.push({ type: TokenType.PERCENT, value: char, line: lineNumber, column: cursor });
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
            if (char === '$') {
                tokens.push({ type: TokenType.DOLLAR, value: char, line: lineNumber, column: cursor });
                cursor++;
                continue;
            }
            if (char === "'") {
                // Character literal parsing: 'a', 'Z', '1', ''' (for single quote)
                const startColumn = cursor;
                cursor++; // Skip opening quote
                
                if (cursor >= lineText.length) {
                    throw new Error(`字句解析エラー: 文字リテラルが終了していません (行: ${lineNumber + 1}, 列: ${startColumn + 1})`);
                }
                
                const charValue = lineText[cursor];
                
                if (!charValue) {
                    throw new Error(`字句解析エラー: 文字リテラルが終了していません (行: ${lineNumber + 1}, 列: ${startColumn + 1})`);
                }
                
                cursor++; // Skip the character
                
                if (cursor >= lineText.length || lineText[cursor] !== "'") {
                    throw new Error(`字句解析エラー: 文字リテラルが閉じられていません (行: ${lineNumber + 1}, 列: ${startColumn + 1})`);
                }
                
                cursor++; // Skip closing quote
                tokens.push({ 
                    type: TokenType.CHAR_LITERAL, 
                    value: charValue, 
                    line: lineNumber, 
                    column: startColumn 
                });
                continue;
            }
            if (char === '~') {
                tokens.push({ type: TokenType.TILDE, value: char, line: lineNumber, column: cursor });
                cursor++;
                continue;
            }
            if (char === '`') {
                tokens.push({ type: TokenType.BACKTICK, value: char, line: lineNumber, column: cursor });
                cursor++;
                continue;
            }
            if (char === ',') {
                tokens.push({ type: TokenType.COMMA, value: char, line: lineNumber, column: cursor });
                cursor++;
                continue;
            }
            if (char === '(') {
                tokens.push({ type: TokenType.LEFT_PAREN, value: char, line: lineNumber, column: cursor });
                cursor++;
                continue;
            }
            if (char === ')') {
                tokens.push({ type: TokenType.RIGHT_PAREN, value: char, line: lineNumber, column: cursor });
                cursor++;
                continue;
            }
            if (char === '@') {
                tokens.push({ type: TokenType.AT, value: char, line: lineNumber, column: cursor });
                cursor++;
                continue;
            }
            if (char === '[') {
                tokens.push({ type: TokenType.LEFT_BRACKET, value: char, line: lineNumber, column: cursor });
                cursor++;
                continue;
            }
            if (char === ']') {
                tokens.push({ type: TokenType.RIGHT_BRACKET, value: char, line: lineNumber, column: cursor });
                cursor++;
                continue;
            }

            // TODO: その他のトークンタイプをここに追加

            throw new Error(`未知の文字 '${char}'`);
        }

        return tokens;
    }
}
