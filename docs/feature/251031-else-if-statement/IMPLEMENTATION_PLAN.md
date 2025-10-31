# ELSE IF文 実装プラン

## 実装ステップ

本ドキュメントでは、ELSE IF文の実装を段階的に進めるための具体的な手順を示します。

## 前提条件の確認

### 現在の実装状況

- ✅ ブロックIF文（IF-ELSE-FI）が実装済み
- ✅ `IfBlockStatement`にcondition, thenBody, elseBodyが存在
- ✅ パーサーの`collectIfBlock`メソッドでブロック収集中

### 実装開始前の作業

1. ✅ ブランチ作成: `feature/251031-else-if-statement`
2. ✅ ドキュメントディレクトリ作成: `docs/feature/251031-else-if-statement/`
3. ⬜ 既存テストの実行と確認（ベースライン確立）

```bash
npm test
npm run lint
```

## Step 1: AST拡張 (15分)

### 1.1 ElseIfClauseインターフェースの追加

**ファイル**: `src/ast.ts`

**場所**: `IfBlockStatement`インターフェース定義の直前

```typescript
/**
 * ELSE IF節を表す構造
 * 複数の条件分岐における各ELSE IF部分を表現
 */
export interface ElseIfClause {
    condition: Expression;
    body: Statement[];
}
```

### 1.2 IfBlockStatementの拡張

**ファイル**: `src/ast.ts`

**変更箇所**: `IfBlockStatement`インターフェース

```typescript
export interface IfBlockStatement extends ASTNode {
    type: 'IfBlockStatement';
    condition: Expression;
    thenBody: Statement[];
    elseIfClauses?: ElseIfClause[];  // 追加
    elseBody?: Statement[];
}
```

### 1.3 型エクスポートの確認

ElseIfClauseが他のモジュールで使用できるように、必要に応じてエクスポートを追加。

### 検証

- TypeScriptのコンパイルエラーがないことを確認
- `npm run build`が成功することを確認

## Step 2: パーサー修正 (2-3時間)

### 2.1 ヘルパーメソッドの追加

**ファイル**: `src/parser.ts`

**場所**: `isElseStatement`メソッドの後

```typescript
/**
 * 指定された行が ;=<条件> (ElseIf) かどうかを判定します。
 * @param sourceText 判定対象の行
 * @returns ElseIfステートメントならtrue
 */
private isElseIfStatement(sourceText: string): boolean {
    const trimmed = sourceText.trim();
    // ;= で始まり、その後に条件式がある（空白または式文字が続く）
    return trimmed.startsWith(';=') && trimmed.length > 2;
}

/**
 * ElseIf行から条件式をパースします。
 * @param lineNumber 行番号
 * @returns パースされた条件式
 */
private parseElseIfCondition(lineNumber: number): Expression {
    const lineTokens = this.tokens[lineNumber];
    if (!lineTokens || lineTokens.length < 2) {
        throw new Error(`ELSE IF条件式が見つかりません (行: ${lineNumber + 1})`);
    }
    
    // 最初のトークンは SEMICOLON_EQUALS (;=) なのでスキップ
    // 2番目以降のトークンが条件式
    const conditionTokens = lineTokens.slice(1);
    
    if (conditionTokens.length === 0) {
        throw new Error(`ELSE IF条件式が空です (行: ${lineNumber + 1})`);
    }
    
    const { expression } = this.parseExpression(conditionTokens, 0);
    return expression;
}
```

### 2.2 collectIfBlockメソッドの修正

**ファイル**: `src/parser.ts`

**変更箇所**: `collectIfBlock`メソッド全体

```typescript
private collectIfBlock(blockStmt: any, startLine: number): number {
    const thenBody: Statement[] = [];
    const elseIfClauses: Array<{ condition: Expression; body: Statement[] }> = [];
    const elseBody: Statement[] = [];
    let currentBody = thenBody;
    let currentPhase: 'then' | 'elsif' | 'else' = 'then';
    let foundEndIf = false;

    for (let i = startLine; i < this.scriptLines.length; i++) {
        const sourceText = this.scriptLines[i];
        if (!sourceText) continue;

        // #=; を見つけたら終了
        if (this.isEndIfStatement(sourceText)) {
            foundEndIf = true;
            // 各部分を設定
            blockStmt.thenBody = thenBody;
            if (elseIfClauses.length > 0) {
                blockStmt.elseIfClauses = elseIfClauses;
            }
            if (elseBody.length > 0) {
                blockStmt.elseBody = elseBody;
            }
            return i;
        }

        // ;=<条件> を検出（ELSE IF）
        if (this.isElseIfStatement(sourceText)) {
            // ELSEフェーズの後にELSE IFが来るのはエラー
            if (currentPhase === 'else') {
                throw new Error(
                    `ELSE節の後にELSE IF節を配置できません (行: ${i + 1})`
                );
            }
            
            // 条件式をパース
            const condition = this.parseElseIfCondition(i);
            const newClause = { condition, body: [] as Statement[] };
            elseIfClauses.push(newClause);
            currentBody = newClause.body;
            currentPhase = 'elsif';
            continue;
        }

        // ; を検出（ELSE）
        if (this.isElseStatement(sourceText)) {
            // ELSEは一度だけ
            if (currentPhase === 'else') {
                throw new Error(
                    `ELSE節は複数定義できません (行: ${i + 1})`
                );
            }
            currentBody = elseBody;
            currentPhase = 'else';
            continue;
        }

        // 行をパースしてステートメント配列を取得
        const parsedStatements = this.parseLineStatements(sourceText, i);
        
        // ブロック構造を検出（IFブロックは検出しない - 無限再帰を防ぐ）
        const blockInfo = this.detectAndConvertBlockStructure(parsedStatements, i, true);
        if (blockInfo) {
            currentBody.push(blockInfo.blockStmt);
            // ブロックの終端までスキップ
            i = blockInfo.endLine;
            continue;
        }
        
        // インラインIF文を IfBlockStatement に変換
        if (parsedStatements.length > 0 && parsedStatements[0]?.type === 'IfStatement') {
            const inlineIf = parsedStatements[0] as any;
            const blockIf: any = {
                type: 'IfBlockStatement',
                line: i,
                condition: inlineIf.condition,
                thenBody: parsedStatements.slice(1),
                elseBody: undefined,
            };
            currentBody.push(blockIf);
            continue;
        }
        
        // 通常のステートメントを追加
        for (const stmt of parsedStatements) {
            currentBody.push(stmt);
        }
    }

    if (!foundEndIf) {
        throw new Error(`ブロックIF構造が #=; で終了していません (開始行: ${startLine})`);
    }

    return -1; // 到達しない
}
```

### 検証

```bash
npm run build
npm test
```

- 既存のテストがすべて通ることを確認
- TypeScriptのコンパイルエラーがないことを確認

## Step 3: インタープリター修正 (1時間)

### 3.1 IfBlockStatementの実行ロジック修正

**ファイル**: `src/workerInterpreter.ts`

**変更箇所**: `executeStatement`メソッド内の`IfBlockStatement`ケース

```typescript
case 'IfBlockStatement': {
    const condition = this.evaluateExpression(statement.condition);
    
    if (condition !== 0) {
        // 条件が真：THEN部を実行
        for (const stmt of statement.thenBody) {
            const result = this.executeStatement(stmt);
            if (result.jump || result.halt) return result;
        }
    } else if (statement.elseIfClauses && statement.elseIfClauses.length > 0) {
        // 条件が偽：ELSE IF節を順に評価
        let elseIfExecuted = false;
        for (const elseIfClause of statement.elseIfClauses) {
            const elseIfCondition = this.evaluateExpression(elseIfClause.condition);
            if (elseIfCondition !== 0) {
                // 最初に真になったELSE IF節を実行
                for (const stmt of elseIfClause.body) {
                    const result = this.executeStatement(stmt);
                    if (result.jump || result.halt) return result;
                }
                elseIfExecuted = true;
                break; // 最初に真になった節だけ実行して終了
            }
        }
        
        // どのELSE IFも真でない場合、ELSE部を実行
        if (!elseIfExecuted && statement.elseBody) {
            for (const stmt of statement.elseBody) {
                const result = this.executeStatement(stmt);
                if (result.jump || result.halt) return result;
            }
        }
    } else if (statement.elseBody) {
        // ELSE IF節がない場合、直接ELSE部を実行
        for (const stmt of statement.elseBody) {
            const result = this.executeStatement(stmt);
            if (result.jump || result.halt) return result;
        }
    }
    break;
}
```

### 検証

```bash
npm run build
npm test
```

## Step 4: テスト作成 (2時間)

### 4.1 パーサーテストの作成

**ファイル**: `src/__tests__/parser-else-if.test.ts`

```typescript
import { Parser } from '../parser.js';
import type { Program, IfBlockStatement } from '../ast.js';

describe('Parser - ELSE IF Statement', () => {
    let parser: Parser;

    beforeEach(() => {
        parser = new Parser();
    });

    test('基本的なelse-if構造をパース', () => {
        const script = `
;=A>100
  ?="Big"
;=A>50
  ?="Medium"
;
  ?="Small"
#=;
        `.trim();

        const { program } = parser.parse(script);
        expect(program.body).toHaveLength(1);
        
        const stmt = program.body[0]?.statements[0] as IfBlockStatement;
        expect(stmt?.type).toBe('IfBlockStatement');
        expect(stmt.thenBody).toHaveLength(1);
        expect(stmt.elseIfClauses).toHaveLength(1);
        expect(stmt.elseIfClauses?.[0]?.body).toHaveLength(1);
        expect(stmt.elseBody).toHaveLength(1);
    });

    test('複数のelse-if節をパース', () => {
        const script = `
;=A>100
  ?="Very large"
;=A>50
  ?="Large"
;=A>10
  ?="Medium"
;
  ?="Small"
#=;
        `.trim();

        const { program } = parser.parse(script);
        const stmt = program.body[0]?.statements[0] as IfBlockStatement;
        
        expect(stmt.elseIfClauses).toHaveLength(2);
    });

    test('else-ifのみ（ELSEなし）', () => {
        const script = `
;=A>100
  ?="Big"
;=A>50
  ?="Medium"
#=;
        `.trim();

        const { program } = parser.parse(script);
        const stmt = program.body[0]?.statements[0] as IfBlockStatement;
        
        expect(stmt.elseIfClauses).toHaveLength(1);
        expect(stmt.elseBody).toBeUndefined();
    });

    test('ELSEの後のELSE IFはエラー', () => {
        const script = `
;=A>100
  ?="Big"
;
  ?="Default"
;=A>50
  ?="Medium"
#=;
        `.trim();

        expect(() => parser.parse(script)).toThrow(/ELSE節の後にELSE IF節を配置できません/);
    });

    test('後方互換性: 従来のIF-ELSE-FI', () => {
        const script = `
;=A>100
  ?="Big"
;
  ?="Small"
#=;
        `.trim();

        const { program } = parser.parse(script);
        const stmt = program.body[0]?.statements[0] as IfBlockStatement;
        
        expect(stmt.elseIfClauses).toBeUndefined();
        expect(stmt.thenBody).toHaveLength(1);
        expect(stmt.elseBody).toHaveLength(1);
    });
});
```

### 4.2 インタープリターテストの作成

**ファイル**: `src/__tests__/interpreter-else-if.test.ts`

```typescript
import { WorkerInterpreter } from '../workerInterpreter.js';

describe('Interpreter - ELSE IF Statement', () => {
    let interpreter: WorkerInterpreter;
    let outputBuffer: string[];

    beforeEach(() => {
        interpreter = new WorkerInterpreter({
            onOutput: (text: string) => outputBuffer.push(text),
        });
        outputBuffer = [];
    });

    test('最初の条件が真', () => {
        const script = `
A=150
;=A>100
  ?="Very large"
;=A>50
  ?="Large"
;
  ?="Small"
#=;
        `.trim();

        interpreter.load(script);
        interpreter.run();
        
        expect(outputBuffer.join('')).toBe('Very large');
    });

    test('2番目のELSE IFが真', () => {
        const script = `
A=75
;=A>100
  ?="Very large"
;=A>50
  ?="Large"
;=A>10
  ?="Medium"
;
  ?="Small"
#=;
        `.trim();

        interpreter.load(script);
        interpreter.run();
        
        expect(outputBuffer.join('')).toBe('Large');
    });

    test('すべて偽でELSE実行', () => {
        const script = `
A=5
;=A>100
  ?="Very large"
;=A>50
  ?="Large"
;
  ?="Small"
#=;
        `.trim();

        interpreter.load(script);
        interpreter.run();
        
        expect(outputBuffer.join('')).toBe('Small');
    });

    test('ELSEなしですべて偽', () => {
        const script = `
A=5
;=A>100
  ?="Very large"
;=A>50
  ?="Large"
#=;
?="After IF"
        `.trim();

        interpreter.load(script);
        interpreter.run();
        
        expect(outputBuffer.join('')).toBe('After IF');
    });

    test('ネストしたelse-if', () => {
        const script = `
A=150
B=75
;=A>100
  ;=B>50
    ?="A big, B big"
  ;=B>10
    ?="A big, B medium"
  ;
    ?="A big, B small"
  #=;
;=A>50
  ?="A medium"
#=;
        `.trim();

        interpreter.load(script);
        interpreter.run();
        
        expect(outputBuffer.join('')).toBe('A big, B big');
    });
});
```

### 4.3 統合テスト用サンプルファイルの作成

**ファイル**: `examples/else-if-test.ws`

```workerscript
: ELSE IF文のテスト

?="=== Test 1: Basic else-if ===" /
A=75
;=A>100
  ?="Very large" /
;=A>50
  ?="Large" /
;=A>10
  ?="Medium" /
;
  ?="Small" /
#=;

?="=== Test 2: No ELSE ===" /
B=5
;=B>100
  ?="Very large" /
;=B>50
  ?="Large" /
;=B>10
  ?="Medium" /
#=;
?="(No output expected above)" /

?="=== Test 3: Multiple conditions ===" /
C=85
;=C>90
  ?="Grade A" /
;=C>80
  ?="Grade B" /
;=C>70
  ?="Grade C" /
;=C>60
  ?="Grade D" /
;
  ?="Grade F" /
#=;

?="=== Test 4: In loop ===" /
@=I,1,5
  ;=I>3
    ?="High: " ?=I /
  ;=I>1
    ?="Mid: " ?=I /
  ;
    ?="Low: " ?=I /
  #=;
#=@

?="=== Test 5: Nested else-if ===" /
X=120
Y=60
;=X>100
  ;=Y>50
    ?="X big, Y big" /
  ;=Y>20
    ?="X big, Y medium" /
  ;
    ?="X big, Y small" /
  #=;
;=X>50
  ?="X medium" /
;
  ?="X small" /
#=;

?="=== All tests completed ===" /
```

### 検証

```bash
npm test
npm run cli examples/else-if-test.ws
```

期待される出力:
```
=== Test 1: Basic else-if ===
Large
=== Test 2: No ELSE ===
(No output expected above)
=== Test 3: Multiple conditions ===
Grade B
=== Test 4: In loop ===
Low: 1
Mid: 2
Mid: 3
High: 4
High: 5
=== Test 5: Nested else-if ===
X big, Y big
=== All tests completed ===
```

## Step 5: ドキュメント更新 (30分)

### 5.1 README.mdの更新

**ファイル**: `README.md`

**場所**: "ブロックIF構造" のセクション

```markdown
### ブロックIF構造

#### 基本的なIF-ELSE-FI

;=<条件>
  ?="Greater than 5"
  /
;
  ?="5 or less"
  /
#=;
```

**追加**:

```markdown
#### ELSE IF による多段階条件分岐

複数の条件を順に評価し、最初に真になった条件のブロックを実行します：

```workerscript
A=75
;=A>100
  ?="Very large"
  /
;=A>50
  ?="Large"
  /
;=A>10
  ?="Medium"
  /
;
  ?="Small"
  /
#=;
```

**出力**: `Large`

**特徴**:
- `;=<条件>`を複数記述してelse-if節を作成
- 最初に真になった条件のブロックだけが実行される
- ELSE部（`;`）は省略可能
- ネストも可能
```

### 5.2 worker.md（言語仕様書）の更新

該当セクションに詳細な構文定義と例を追加。

### 検証

- ドキュメントの内容を確認
- リンクが正しく動作することを確認
- コード例が正確であることを確認

## Step 6: 最終確認とコミット

### 6.1 すべてのテストを実行

```bash
npm run lint
npm test
npm run build
```

### 6.2 手動テストの実行

```bash
npm run cli examples/else-if-test.ws
npm run cli examples/block-if-test.ws  # 後方互換性確認
```

### 6.3 変更をコミット

```bash
git add src/ast.ts
git add src/parser.ts
git add src/workerInterpreter.ts
git add src/__tests__/parser-else-if.test.ts
git add src/__tests__/interpreter-else-if.test.ts
git add examples/else-if-test.ws
git add README.md
git add docs/feature/251031-else-if-statement/

git commit -m "ELSE IF文の実装

- AST拡張: ElseIfClause追加、IfBlockStatementにelseIfClauses追加
- パーサー修正: collectIfBlockでELSE IF節を処理
- インタープリター修正: ELSE IF節の順次評価と実行
- テスト追加: パーサーテスト、インタープリターテスト
- 統合テスト追加: examples/else-if-test.ws
- ドキュメント更新: README.md、設計書"
```

## トラブルシューティング

### 問題1: パースエラーが頻発する

**対処法**:
- `isElseIfStatement`の判定ロジックを見直す
- トークン列を正しく処理できているか確認
- デバッグログを追加して、どの行でエラーが発生しているか特定

### 問題2: ELSE IFが実行されない

**対処法**:
- インタープリターのロジックを確認
- `elseIfExecuted`フラグが正しく設定されているか確認
- 条件式の評価結果をログ出力

### 問題3: 既存テストが失敗する

**対処法**:
- `elseIfClauses`が`undefined`の場合の処理を確認
- 後方互換性が保たれているか確認
- 既存のIF-ELSE-FI構造のテストを実行

## 完了チェックリスト

- [ ] AST拡張完了（ElseIfClause、elseIfClauses）
- [ ] パーサー修正完了（collectIfBlock、isElseIfStatement、parseElseIfCondition）
- [ ] インタープリター修正完了（ELSE IF節の順次評価）
- [ ] パーサーテスト作成完了
- [ ] インタープリターテスト作成完了
- [ ] 統合テストファイル作成完了
- [ ] すべてのテストがパスする
- [ ] README.md更新完了
- [ ] 設計書・実装プラン作成完了
- [ ] コミットとプッシュ完了

## 次のステップ

実装が完了したら：

1. PRを作成してコードレビューを依頼
2. 必要に応じて修正
3. mainブランチにマージ
4. ドキュメントサイトを更新
5. リリースノートに記載
