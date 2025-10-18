# IF-FIブロック構造の設計案

## 背景

現在のWorkerScriptは統一文法パターンを採用：
- ループ開始: `@=...` 、ループ終端: `#=@`
- サブルーチン: `!=^LABEL`、復帰: `#=!`
- IF文: `;=<条件> <stmt> <stmt>...` （インライン条件実行のみ）

複数行にわたるブロック構造のIF文を統一文法に従って実現する。

## 設計案

### 1. 基本IF-FIブロック

**構文：**
```workerscript
;=<条件>           : IF開始
    <ステートメント>  : THEN部
    <ステートメント>
#=;                : FI終端
```

**例：**
```workerscript
;=A>100
    ?="Big number"
    X=X+1
    Y=Y*2
#=;
```

**統一パターンとの整合性：**
- `@=<条件/範囲>` → `#=@` （ループ）
- `;=<条件>` → `#=;` （IF文）

### 2. ELSE付きIF-ELSE-FI

**構文案A：記号のみのELSE**
```workerscript
;=<条件>
    : THEN部
    <ステートメント>
;                  : ELSE（記号のみの行、新しいStatement type）
    : ELSE部
    <ステートメント>
#=;
```

**構文案B：否定条件のELSE**
```workerscript
;=<条件>
    : THEN部
    <ステートメント>
;=!                : ELSE（;=<not>の意）
    : ELSE部
    <ステートメント>
#=;
```

**例：**
```workerscript
;=A>100
    ?="Big"
;
    ?="Small or equal"
#=;
```

### 3. インラインIF文との互換性

**既存のインラインIF：**
```workerscript
;=A>100 ?="Big" X=X+1
```

**互換性の保ち方：**
- `;=<条件> <stmt>`：従来通りインライン実行（行末まで）
- `;=<条件>` 単独行：ブロックIF開始（`#=;`で終端）
- パーサーで判定：同じ行に他のステートメントがあるかチェック

## 実装要件

### AST拡張

```typescript
// 新しいStatement type
interface IfBlockStatement {
    type: 'IfBlockStatement';
    condition: Expression;
    thenBody: Statement[];      // THEN部のステートメント
    elseBody?: Statement[];     // ELSE部のステートメント（オプション）
}

interface ElseStatement {
    type: 'ElseStatement';      // ELSE境界マーカー
}

interface EndIfStatement {
    type: 'EndIfStatement';     // FI (#=;)
}
```

### パーサー修正

1. **`;=<条件>`の判定：**
   - 同じ行に他のステートメントがある → 既存のInlineIfStatement
   - 単独行 → 新しいIfBlockStatement

2. **ブロック収集：**
   - IfBlockStatement発見 → thenBody収集開始
   - ElseStatement発見 → elseBody収集開始
   - EndIfStatement発見 → ブロック終了

3. **ネスト対応：**
   - ループと同様のスタック管理
   - IF-FIのネストをサポート

### インタープリター修正

```typescript
case 'IfBlockStatement':
    const condition = this.evaluateExpression(statement.condition);
    if (condition !== 0) {
        // THEN部を実行
        for (const stmt of statement.thenBody) {
            const result = this.executeStatement(stmt);
            if (result.jump || result.halt) return result;
        }
    } else if (statement.elseBody) {
        // ELSE部を実行
        for (const stmt of statement.elseBody) {
            const result = this.executeStatement(stmt);
            if (result.jump || result.halt) return result;
        }
    }
    break;
```

### レクサー修正

新しいトークン不要（既存記号の組み合わせで実現）

## 実装難易度見積もり

### 難易度：中

**理由：**
- ✅ AST拡張は比較的シンプル（3つの新しいStatement type）
- ✅ レクサー修正不要
- ⚠️ パーサー修正：ブロック収集ロジックが必要（ループと類似）
- ⚠️ インラインIFとの互換性判定が必要
- ✅ インタープリター修正は単純（条件分岐のみ）

**工数見積もり：**
- AST定義：30分
- パーサー修正：2-3時間
  - インライン/ブロック判定：30分
  - ブロック収集ロジック：1-1.5時間
  - ネスト対応：1時間
- インタープリター修正：30分
- テスト作成：1-2時間
- ドキュメント更新：30分
- **合計：5-7時間**

## テストケース

### 1. 基本IF-FI
```workerscript
A=150
;=A>100
    ?="Big"
#=;
: 出力: Big
```

### 2. IF-ELSE-FI
```workerscript
A=50
;=A>100
    ?="Big"
;
    ?="Small"
#=;
: 出力: Small
```

### 3. ネストしたIF
```workerscript
A=150
B=200
;=A>100
    ?="A is big"
    ;=B>100
        ?="B is also big"
    #=;
#=;
```

### 4. インラインIFとの混在
```workerscript
;=A>100 ?="Quick check"   : インライン

;=B>100                    : ブロック
    ?="Detailed check"
    X=X+1
#=;
```

### 5. ループ内のIF-FI
```workerscript
@=I,1,10
    ;=I%2=0
        ?="Even: " ?=I /
    ;
        ?="Odd: " ?=I /
    #=;
#=@
```

## 代替案

### 代替案1：GOTOベースの実装

```workerscript
;=A>100 #=^ELSE_1
    : THEN部
    ?="Big"
    #=^END_IF_1
^ELSE_1
    : ELSE部
    ?="Small"
^END_IF_1
```

**評価：**
- ❌ 読みにくい
- ❌ ラベル名の管理が煩雑
- ✅ 既存機能だけで実現可能

### 代替案2：サブルーチンベース

```workerscript
;=A>100 !=^THEN_BLOCK #=^END_IF
^THEN_BLOCK
    ?="Big"
    #=!
^END_IF
```

**評価：**
- ❌ サブルーチンスタックを消費
- ❌ 意図が分かりにくい
- ✅ 既存機能だけで実現可能

## 結論

**推奨：IF-FIブロック構造の実装**

**理由：**
1. 統一文法パターンとの一貫性が高い
2. 可読性が大幅に向上（特にネストした条件）
3. 実装難易度は中程度（5-7時間）
4. 既存のインラインIF文との互換性を保てる

**実装の優先度：**
- 🔴 高優先：基本IF-FI（ELSE無し）
- 🟡 中優先：IF-ELSE-FI
- 🟢 低優先：ELSIF（多分岐）

**次のステップ：**
1. 基本IF-FIの実装（ELSE無し）
2. テストケース作成と動作確認
3. ELSE機能の追加
4. ドキュメント更新
