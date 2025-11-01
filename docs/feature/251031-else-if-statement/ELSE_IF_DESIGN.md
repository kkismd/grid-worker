# ELSE IF文の設計書

## 概要

現在のWorkerScriptはブロックIF文として以下の構造をサポートしています：

```workerscript
;=<条件>
  <THEN部>
;
  <ELSE部>
#=;
```

本設計では、これを拡張して複数の条件分岐（else-if）をサポートする構文を実装します：

```workerscript
;=<条件1>
  <THEN部1>
;=<条件2>
  <THEN部2>
;=<条件3>
  <THEN部3>
;
  <ELSE部>
#=;
```

## 設計の背景と目標

### 現状の問題点

現在のブロックIF文では、多段階の条件分岐を表現する際にネストが必要になり、可読性が低下します：

```workerscript
: 現在の方法（ネスト）
;=A>100
  ?="Very large"
;
  ;=A>50
    ?="Large"
  ;
    ;=A>10
      ?="Medium"
    ;
      ?="Small"
    #=;
  #=;
#=;
```

### 提案する構文

統一文法パターンに従い、`;=<条件>`を連続して記述できるようにします：

```workerscript
: 提案する方法（フラット）
;=A>100
  ?="Very large"
;=A>50
  ?="Large"
;=A>10
  ?="Medium"
;
  ?="Small"
#=;
```

### 設計原則

1. **統一文法との一貫性**: 既存の`;=`記号を再利用
2. **後方互換性**: 既存のIF-ELSE-FI構造は変更なし
3. **シンプルさ**: 新しいトークンや記号を追加しない
4. **可読性**: ネストを減らしてフラットな構造を実現

## 詳細仕様

### 構文定義

```
IF_BLOCK ::= ';=' <condition> <newline>
             <statements>
             (ELSIF_CLAUSE)*
             (ELSE_CLAUSE)?
             '#=;'

ELSIF_CLAUSE ::= ';=' <condition> <newline>
                 <statements>

ELSE_CLAUSE ::= ';' <newline>
                <statements>
```

### セマンティクス

1. 最初の`;=<条件>`から順に条件を評価
2. 最初に真となった条件のブロックを実行
3. どの条件も真でない場合、ELSE部（`;`）があればそれを実行
4. いずれか1つのブロックだけが実行される（排他的）

### 例1: 基本的なelse-if

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

### 例2: ELSEなしのelse-if

```workerscript
B=5
;=B>100
  ?="Very large"
;=B>50
  ?="Large"
;=B>10
  ?="Medium"
#=;
```

**出力**: (何も出力されない)

### 例3: ネストしたブロック内のelse-if

```workerscript
@=I,1,10
  ;=I>7
    ?="High: " ?=I /
  ;=I>3
    ?="Mid: " ?=I /
  ;
    ?="Low: " ?=I /
  #=;
#=@
```

### 例4: else-if内でのステートメント

```workerscript
X=50 Y=50
;=A=1
  `=255          : 白
;=A=2
  `=128          : 灰色
;=A=3
  `=64           : 暗灰色
;
  `=0            : 黒
#=;
```

## AST構造

### 現在のIfBlockStatement

```typescript
interface IfBlockStatement extends ASTNode {
    type: 'IfBlockStatement';
    condition: Expression;
    thenBody: Statement[];
    elseBody?: Statement[];
}
```

### 拡張後のIfBlockStatement

```typescript
interface IfBlockStatement extends ASTNode {
    type: 'IfBlockStatement';
    condition: Expression;
    thenBody: Statement[];
    elseIfClauses?: ElseIfClause[];  // 追加
    elseBody?: Statement[];
}

interface ElseIfClause {
    condition: Expression;
    body: Statement[];
}
```

### AST例

```workerscript
;=A>100
  ?="Big"
;=A>50
  ?="Medium"
;
  ?="Small"
#=;
```

このコードは以下のASTになります：

```typescript
{
  type: 'IfBlockStatement',
  line: 0,
  condition: { /* A>100 */ },
  thenBody: [ /* ?="Big" */ ],
  elseIfClauses: [
    {
      condition: { /* A>50 */ },
      body: [ /* ?="Medium" */ ]
    }
  ],
  elseBody: [ /* ?="Small" */ ]
}
```

## 実装計画

### Phase 1: AST拡張

**ファイル**: `src/ast.ts`

1. `ElseIfClause`インターフェースを追加
2. `IfBlockStatement`に`elseIfClauses`フィールドを追加

**工数**: 15分

### Phase 2: パーサー修正

**ファイル**: `src/parser.ts`

現在の`collectIfBlock`メソッドを拡張：

1. ELSE判定ロジックを修正
   - 単独の`;`はELSE
   - `;=<条件>`はELSE IF
2. ELSE IF節の収集ロジックを追加
3. 各節のステートメントを適切なbodyに振り分け

**主要な変更点**:

```typescript
private collectIfBlock(blockStmt: any, startLine: number): number {
    const thenBody: Statement[] = [];
    const elseIfClauses: Array<{ condition: Expression; body: Statement[] }> = [];
    const elseBody: Statement[] = [];
    let currentBody = thenBody;
    let currentPhase: 'then' | 'elsif' | 'else' = 'then';
    
    for (let i = startLine; i < this.scriptLines.length; i++) {
        const sourceText = this.scriptLines[i];
        
        // #=; で終了
        if (this.isEndIfStatement(sourceText)) {
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
        if (this.isElseIfStatement(sourceText, i)) {
            const condition = this.parseElseIfCondition(sourceText, i);
            const newClause = { condition, body: [] as Statement[] };
            elseIfClauses.push(newClause);
            currentBody = newClause.body;
            currentPhase = 'elsif';
            continue;
        }
        
        // ; を検出（ELSE）
        if (this.isElseStatement(sourceText)) {
            currentBody = elseBody;
            currentPhase = 'else';
            continue;
        }
        
        // ステートメントを現在のbodyに追加
        // ...
    }
}

private isElseIfStatement(sourceText: string, lineNumber: number): boolean {
    const trimmed = sourceText.trim();
    return trimmed.startsWith(';=') && trimmed.length > 2;
}

private parseElseIfCondition(sourceText: string, lineNumber: number): Expression {
    // `;=`を除去して条件式をパース
    const conditionText = sourceText.trim().substring(2);
    const tokens = this.lexer.tokenizeLine(conditionText, lineNumber);
    return this.parseExpression(tokens, 0).expression;
}
```

**工数**: 2-3時間

### Phase 3: インタープリター修正

**ファイル**: `src/workerInterpreter.ts`

`IfBlockStatement`の実行ロジックを修正：

```typescript
case 'IfBlockStatement': {
    const condition = this.evaluateExpression(statement.condition);
    
    if (condition !== 0) {
        // THEN部を実行
        for (const stmt of statement.thenBody) {
            const result = this.executeStatement(stmt);
            if (result.jump || result.halt) return result;
        }
    } else if (statement.elseIfClauses) {
        // ELSE IF節を順に評価
        for (const elseIfClause of statement.elseIfClauses) {
            const elseIfCondition = this.evaluateExpression(elseIfClause.condition);
            if (elseIfCondition !== 0) {
                for (const stmt of elseIfClause.body) {
                    const result = this.executeStatement(stmt);
                    if (result.jump || result.halt) return result;
                }
                break; // 最初に真になった節だけ実行
            }
        }
        // どのELSE IF も真でない場合、ELSEへ
        if (elseIfCondition === 0 && statement.elseBody) {
            for (const stmt of statement.elseBody) {
                const result = this.executeStatement(stmt);
                if (result.jump || result.halt) return result;
            }
        }
    } else if (statement.elseBody) {
        // ELSE部を実行
        for (const stmt of statement.elseBody) {
            const result = this.executeStatement(stmt);
            if (result.jump || result.halt) return result;
        }
    }
    break;
}
```

**工数**: 1時間

### Phase 4: テスト作成

**ファイル**: 
- `src/__tests__/parser-else-if.test.ts`
- `examples/else-if-test.ws`

**テストケース**:

1. 基本的なelse-if（3条件）
2. else-ifのみ（ELSEなし）
3. 複数のelse-if（5条件以上）
4. else-if内の複雑なステートメント
5. ネストしたループ内のelse-if
6. else-if内のネストしたIF
7. 後方互換性確認（既存のIF-ELSE-FI）

**工数**: 2時間

### Phase 5: ドキュメント更新

**ファイル**:
- `README.md`
- `worker.md`（言語仕様書）

**更新内容**:
- ELSE IF構文の説明を追加
- 使用例を追加
- 既存のIF-ELSE-FI説明と並べて記載

**工数**: 30分

## 実装上の注意点

### 1. パーサーの状態管理

`;=<条件>`が現れた際、それが：
- ブロックIFの開始なのか
- ELSE IFなのか
- インラインIFなのか

を正確に判定する必要があります。

**判定基準**:
- IF収集中でない + 単独行 → ブロックIF開始
- IF収集中 + 行が`;=`で始まる → ELSE IF
- IF収集中でない + 同じ行に他のステートメント → インラインIF

### 2. 条件式のパース

ELSE IF行（`;=<条件>`）の条件式をパースする際：
- 既存の字句解析を再利用
- `;=`プレフィックスを除去してから条件をパース
- エラー処理を適切に行う

### 3. 実行順序の保証

インタープリターは以下の順序を厳守：
1. IF条件評価
2. 真ならTHEN部実行して終了
3. 偽なら最初のELSE IF評価
4. 順にELSE IFを評価し、最初に真になったものを実行
5. すべて偽ならELSE部を実行

### 4. 後方互換性

既存の2分岐IF-ELSE-FI構造は完全に動作し続ける必要があります：

```workerscript
;=A>5
  ?="Big"
;
  ?="Small"
#=;
```

## エッジケース

### ケース1: ELSE IFの後にELSE

```workerscript
;=A>100
  ?="Very large"
;=A>50
  ?="Large"
;
  ?="Small"
#=;
```

**期待動作**: 正常に動作

### ケース2: ELSEの後にELSE IF（構文エラー）

```workerscript
;=A>100
  ?="Very large"
;
  ?="Default"
;=A>50          : これはエラー
  ?="Large"
#=;
```

**期待動作**: パースエラーを発生させる

**実装方法**: `currentPhase`で状態を管理し、'else'状態でELSE IFが来たらエラー

### ケース3: 空のブロック

```workerscript
;=A>100
;=A>50
  ?="Large"
#=;
```

**期待動作**: A>100が真の場合、何も実行せずに終了

### ケース4: ネストしたelse-if

```workerscript
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
```

**期待動作**: 正常にネスト動作

## テスト計画

### 単体テスト（Jest）

**ファイル**: `src/__tests__/parser-else-if.test.ts`

```typescript
describe('Parser - ELSE IF Statement', () => {
  test('基本的なelse-if構造', () => {
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
    const stmt = program.body[0]?.statements[0];
    
    expect(stmt?.type).toBe('IfBlockStatement');
    expect(stmt.elseIfClauses).toHaveLength(1);
    expect(stmt.elseBody).toBeDefined();
  });
  
  test('複数のelse-if', () => { /* ... */ });
  test('else-ifのみ（ELSEなし）', () => { /* ... */ });
  test('ELSEの後のELSE IFはエラー', () => { /* ... */ });
});
```

**ファイル**: `src/__tests__/interpreter-else-if.test.ts`

```typescript
describe('Interpreter - ELSE IF Statement', () => {
  test('最初の条件が真', () => { /* ... */ });
  test('2番目のELSE IFが真', () => { /* ... */ });
  test('すべて偽でELSE実行', () => { /* ... */ });
  test('ネストしたelse-if', () => { /* ... */ });
});
```

### 統合テスト（実行例）

**ファイル**: `examples/else-if-test.ws`

```workerscript
: ELSE IF文のテスト

: テスト1: 基本的なelse-if
A=75
;=A>100
  ?="Test 1: Very large" /
;=A>50
  ?="Test 1: Large" /
;=A>10
  ?="Test 1: Medium" /
;
  ?="Test 1: Small" /
#=;

: テスト2: ELSEなし
B=5
;=B>100
  ?="Test 2: Very large" /
;=B>50
  ?="Test 2: Large" /
;=B>10
  ?="Test 2: Medium" /
#=;
?="Test 2: No output above" /

: テスト3: 複数の条件
C=85
;=C>90
  ?="Test 3: A" /
;=C>80
  ?="Test 3: B" /
;=C>70
  ?="Test 3: C" /
;=C>60
  ?="Test 3: D" /
;
  ?="Test 3: E" /
#=;

: テスト4: ループ内のelse-if
@=I,1,5
  ;=I>3
    ?="High: " ?=I /
  ;=I>1
    ?="Mid: " ?=I /
  ;
    ?="Low: " ?=I /
  #=;
#=@
```

**期待出力**:
```
Test 1: Large
Test 2: No output above
Test 3: B
High: 4
High: 5
Mid: 2
Mid: 3
Low: 1
```

## 工数見積もり

| フェーズ | 作業内容 | 工数 |
|---------|---------|------|
| Phase 1 | AST拡張 | 15分 |
| Phase 2 | パーサー修正 | 2-3時間 |
| Phase 3 | インタープリター修正 | 1時間 |
| Phase 4 | テスト作成 | 2時間 |
| Phase 5 | ドキュメント更新 | 30分 |
| **合計** | | **6-7時間** |

## まとめ

この設計により、WorkerScriptに多段階条件分岐（else-if）が追加され、可読性の高いコードが書けるようになります。統一文法パターンに従い、既存の`;=`記号を再利用することで、言語の一貫性を保ちながら機能を拡張します。

実装は段階的に進め、各フェーズで動作確認とテストを行うことで、安全かつ確実に機能を追加できます。
