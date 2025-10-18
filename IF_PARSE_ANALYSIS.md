# インラインIFとブロックIFのパース可能性分析

## 質問
インラインIFとブロックIFは同じ見た目（`;=<条件>`）でパースできるか？

## 結論
**YES - パース可能です！** ✅

現在のパーサー実装により、以下の方法で区別できます。

## 現在のパーサーの仕組み

### 行のパース処理
```typescript
// 1. 行を空白で分割
const stmtStrings = this.splitLineByWhitespace(sourceText);

// 2. 各ステートメントを個別にパース
for (const stmtString of stmtStrings) {
    const stmt = this.parseStatementString(stmtString, i);
    if (stmt) {
        parsedStatements.push(stmt);
    }
}
```

### IF文のパース
```typescript
// IFステートメント (;=)
if (token.type === TokenType.SEMICOLON) {
    const exprTokens = tokens.slice(startIndex + 2);
    const exprResult = this.parseExpressionFromTokens(exprTokens);
    
    return {
        statement: {
            type: 'IfStatement',
            condition: exprResult.expr,
        },
        nextIndex: startIndex + 2 + exprResult.consumed
    };
}
```

## 区別方法

### 方法1: 同じ行のステートメント数で判定

**インラインIF（既存）:**
```workerscript
;=A>100 ?="Big" X=X+1
```
→ パース結果: `Line.statements = [IfStatement, OutputStatement, AssignmentStatement]`
→ **IfStatementの後にステートメントあり** → インラインIF

**ブロックIF（新規）:**
```workerscript
;=A>100
    ?="Big"
    X=X+1
#=;
```
→ 1行目パース結果: `Line.statements = [IfStatement]`
→ **IfStatementのみ** → ブロックIF

### 判定ロジック

```typescript
// buildProgramAST()内で、行のパース後に判定
if (statement.type === 'IfStatement') {
    const statementsOnSameLine = parsedStatements.length;
    
    if (statementsOnSameLine === 1) {
        // IfStatementのみ → ブロックIF
        // 次の行からブロック収集を開始
        statement.type = 'IfBlockStatement';
        statement.thenBody = [];
        // ... ブロック収集ロジック
    } else {
        // IfStatementの後に他のステートメント → インラインIF
        // 既存の動作: 条件が真なら同じ行の残りを実行
    }
}
```

## 実装詳細

### AST定義

```typescript
// 既存（インラインIF）
export interface IfStatement extends ASTNode {
    type: 'IfStatement';
    condition: Expression;
}

// 新規（ブロックIF）
export interface IfBlockStatement extends ASTNode {
    type: 'IfBlockStatement';
    condition: Expression;
    thenBody: Statement[];
    elseBody?: Statement[];
}

export interface ElseStatement extends ASTNode {
    type: 'ElseStatement';
}

export interface EndIfStatement extends ASTNode {
    type: 'EndIfStatement';  // #=;
}
```

### パーサー修正箇所

**1. buildProgramAST()修正:**
```typescript
for (const stmtString of stmtStrings) {
    const stmt = this.parseStatementString(stmtString, i);
    if (stmt) {
        parsedStatements.push(stmt);
    }
}

// IfStatementのブロック判定を追加
if (parsedStatements.length === 1 && 
    parsedStatements[0]?.type === 'IfStatement') {
    // ブロックIFとして変換
    const ifStmt = parsedStatements[0];
    const blockStmt: IfBlockStatement = {
        type: 'IfBlockStatement',
        condition: ifStmt.condition,
        thenBody: [],
        line: ifStmt.line,
        column: ifStmt.column,
    };
    
    // 次の行からブロック収集
    i = this.collectIfBlock(blockStmt, i + 1);
    parsedStatements[0] = blockStmt;
}
```

**2. collectIfBlock()新規追加:**
```typescript
private collectIfBlock(
    blockStmt: IfBlockStatement, 
    startLine: number
): number {
    let currentLine = startLine;
    let inElseBlock = false;
    
    while (currentLine < this.tokens.length) {
        const lineTokens = this.tokens[currentLine];
        if (!lineTokens) break;
        
        // #=; を検出（EndIf）
        if (this.isEndIfStatement(lineTokens)) {
            return currentLine;
        }
        
        // ; 単独行を検出（Else）
        if (this.isElseStatement(lineTokens)) {
            inElseBlock = true;
            blockStmt.elseBody = [];
            currentLine++;
            continue;
        }
        
        // 通常のステートメントをパース
        const sourceText = this.scriptLines[currentLine];
        if (sourceText) {
            const stmtStrings = this.splitLineByWhitespace(sourceText);
            for (const stmtString of stmtStrings) {
                const stmt = this.parseStatementString(stmtString, currentLine);
                if (stmt) {
                    if (inElseBlock) {
                        blockStmt.elseBody!.push(stmt);
                    } else {
                        blockStmt.thenBody.push(stmt);
                    }
                }
            }
        }
        
        currentLine++;
    }
    
    throw new Error(`IFブロックが #=; で終了していません`);
}
```

**3. ヘルパーメソッド:**
```typescript
private isEndIfStatement(tokens: Token[]): boolean {
    // #=; パターンをチェック
    return tokens.length === 3 &&
           tokens[0]?.type === TokenType.HASH &&
           tokens[1]?.type === TokenType.EQUALS &&
           tokens[2]?.type === TokenType.SEMICOLON;
}

private isElseStatement(tokens: Token[]): boolean {
    // ; 単独行をチェック
    return tokens.length === 1 &&
           tokens[0]?.type === TokenType.SEMICOLON;
}
```

## 例：パース結果の比較

### インラインIF
```workerscript
;=A>100 ?="Big" X=X+1
```

**パース結果:**
```typescript
Line {
    lineNumber: 0,
    statements: [
        { type: 'IfStatement', condition: ... },
        { type: 'OutputStatement', ... },
        { type: 'AssignmentStatement', ... }
    ]
}
```

**実行:** 条件が真なら同じ行の`?="Big"`と`X=X+1`を実行

### ブロックIF
```workerscript
;=A>100
    ?="Big"
    X=X+1
#=;
```

**パース結果:**
```typescript
Line {
    lineNumber: 0,
    statements: [
        { 
            type: 'IfBlockStatement', 
            condition: ...,
            thenBody: [
                { type: 'OutputStatement', ... },
                { type: 'AssignmentStatement', ... }
            ]
        }
    ]
}
```

**実行:** 条件が真ならthenBody内のステートメントを順次実行

## 利点

1. ✅ **構文的一貫性**: 同じ`;=<条件>`記法
2. ✅ **自然な区別**: 改行の有無で自動判定
3. ✅ **後方互換性**: 既存のインラインIF完全互換
4. ✅ **ユーザー直感性**: 
   - 短い条件 → 1行で書く（インライン）
   - 複雑な処理 → 複数行で書く（ブロック）

## 実装難易度

**評価: 中（5-7時間）**

**内訳:**
- AST定義追加: 30分
- buildProgramAST()修正: 1時間
- collectIfBlock()実装: 2時間
- isEndIfStatement/isElseStatement実装: 30分
- インタープリター修正: 30分
- テスト: 1.5時間
- ドキュメント: 30分

## 注意事項

### エッジケース

**1. IfStatement後の空行:**
```workerscript
;=A>100

    ?="Big"
#=;
```
→ 空行はスキップされるので問題なし

**2. ネストしたIF:**
```workerscript
;=A>100
    ;=B>50
        ?="Both big"
    #=;
#=;
```
→ collectIfBlock()で再帰的に処理

**3. インライン + ブロック混在:**
```workerscript
;=A>100 ?="Quick"    : インライン

;=B>100              : ブロック
    ?="Detailed"
#=;
```
→ 同じ行のステートメント数で自動判定

## まとめ

**質問への回答: YES - 同じ見た目でパース可能** ✅

**理由:**
1. 現在のパーサーは行を空白で分割してステートメントをパース
2. `;=<条件>`が単独か、他のステートメントと同じ行かで判定可能
3. 自然な区別で、ユーザーは意識せず使い分けられる
4. 実装は中難易度で現実的

**推奨実装順序:**
1. まず基本ブロックIF（ELSE無し）を実装
2. 動作確認とテスト
3. ELSE機能を追加
4. ネスト対応を完全にする
