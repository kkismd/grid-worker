# パーサー修正規模見積もり

## 📊 概要

配列・スタック機能のパーサー実装に必要な修正箇所と規模を見積もります。

## 🎯 必要な修正箇所

### 1. **式解析の拡張** - `parsePrimaryExpression()` メソッド
**ファイル**: `src/workerInterpreter.ts` (行896-979)  
**修正規模**: **中規模** (約30-40行追加)

#### 現在の処理
```typescript
private parsePrimaryExpression(tokens: Token[], start: number) {
    // 単項演算子: -, +, !
    // 括弧式: (...)
    // 単純な値: 数値、文字列、識別子、システム変数
}
```

#### 追加する処理
```typescript
// 配列アクセス式: [expression]
if (token.type === TokenType.LEFT_BRACKET) {
    // 1. 対応する ] を見つける（ネスト対応）
    // 2. 括弧内の式を解析（再帰的に parseBinaryExpression）
    // 3. isLiteral フラグを判定（インデックスが-1のリテラルか？）
    // 4. ArrayAccessExpression を返す
}
```

**複雑度**: 括弧式の処理と類似しているため、実装は比較的容易。

---

### 2. **ステートメント解析の拡張** - `parseStatementString()` メソッド
**ファイル**: `src/workerInterpreter.ts` (行1152-1315)  
**修正規模**: **中規模** (約50-70行追加)

#### 現在の処理
```typescript
private parseStatementString(stmtString: string, lineNumber: number) {
    // 改行: /
    // GOTO: #=^LABEL, #=-1
    // GOSUB: !=^LABEL
    // IF: ;=condition
    // 出力: ?=expression
    // @で始まる: FOR/WHILE
    // POKE: `=expression
    // 1byte出力: $=expression
    // 変数代入: A=expression
}
```

#### 追加する処理
```typescript
// 配列代入・初期化: [expression]=...
if (firstToken.type === TokenType.LEFT_BRACKET && secondToken.type === TokenType.RIGHT_BRACKET) {
    const equalsToken = tokens[2];
    if (equalsToken && equalsToken.type === TokenType.EQUALS) {
        // 1. インデックス式を解析
        // 2. 右辺を解析（カンマがあるか確認）
        // 3. カンマがある場合: ArrayInitializationStatement
        // 4. カンマがない場合: ArrayAssignmentStatement
        // 5. isLiteral フラグを設定
    }
}
```

**複雑度**: 
- 配列代入と初期化の判別が必要
- カンマ区切りの値リストを解析
- インデックス式の解析（既存のロジック流用可能）

---

### 3. **トークンベースの解析** - `parseStatementFromTokens()` メソッド
**ファイル**: `src/workerInterpreter.ts` (行325-547)  
**修正規模**: **小規模** (約40-50行追加)

#### 追加する処理
```typescript
// 配列代入・初期化（トークンベース版）
if (token.type === TokenType.LEFT_BRACKET) {
    return this.parseArrayStatement(tokens, startIndex);
}
```

新しいヘルパーメソッド `parseArrayStatement()` を追加：
```typescript
private parseArrayStatement(tokens: Token[], startIndex: number): { statement: Statement; nextIndex: number } {
    // parseStatementString() と同様のロジック
}
```

**複雑度**: `parseStatementString()` の実装を流用できるため、比較的容易。

---

### 4. **ヘルパーメソッドの追加**
**ファイル**: `src/workerInterpreter.ts`  
**修正規模**: **小規模** (約60-80行追加)

#### 追加するメソッド

##### a. `parseArrayAccessExpression()`
```typescript
private parseArrayAccessExpression(tokens: Token[], start: number): { expr: Expression; nextIndex: number; isLiteral: boolean } {
    // 1. [ の位置を確認
    // 2. 対応する ] を見つける
    // 3. 括弧内の式を解析
    // 4. リテラル判定（-1 かつリテラルか）
    // 5. ArrayAccessExpression を返す
}
```

##### b. `isLiteralMinusOne()`
```typescript
private isLiteralMinusOne(expr: Expression): boolean {
    // expression が -1 のリテラルかどうかを判定
    // UnaryExpression(-) + NumericLiteral(1)
    // または NumericLiteral(-1)
}
```

##### c. `parseArrayInitializationValues()`
```typescript
private parseArrayInitializationValues(tokens: Token[], start: number): { values: Expression[]; nextIndex: number } {
    // カンマ区切りの値リストを解析
    // [1000]=10,20,30 の "10,20,30" 部分
}
```

---

## 📈 修正規模の総括

| カテゴリ | 修正箇所 | 追加行数 | 複雑度 |
|---------|---------|---------|--------|
| 式解析 | `parsePrimaryExpression()` | 30-40行 | 中 |
| ステートメント解析 | `parseStatementString()` | 50-70行 | 中 |
| トークンベース解析 | `parseStatementFromTokens()` | 40-50行 | 小 |
| ヘルパーメソッド | 新規メソッド3つ | 60-80行 | 小-中 |
| **合計** | **4箇所** | **180-240行** | **中** |

---

## 🔍 潜在的な問題点

### 1. **構文の曖昧性**
- `[A+5]` は配列アクセスか、`[A` + `5]` か？
- 解決: `[` は常に配列アクセスの開始として扱う（明確なルール）

### 2. **FOR文との衝突**
- 旧: `I=1,2,3` → FOR文
- 新: `[A]=1,2,3` → 配列初期化
- 解決: 統一構文により `@=I,1,100` となったため衝突なし ✅

### 3. **リテラル判定の精度**
- `[-1]` はスタックアクセス
- `[I]` where `I=-1` は通常のメモリアクセス
- 解決: `isLiteral` フラグをASTに含める

### 4. **ネストした配列アクセス**
- `[[A]]` のような二重ネストは未サポート
- 解決: Phase 1では非対応、エラーを出す

---

## ⏱️ 実装時間の見積もり

| タスク | 時間 | 難易度 |
|-------|------|--------|
| 式解析の拡張 | 1-2時間 | 中 |
| ステートメント解析の拡張 | 2-3時間 | 中 |
| トークンベース解析の拡張 | 1-2時間 | 小 |
| ヘルパーメソッド実装 | 1-2時間 | 小-中 |
| デバッグ・テスト | 1-2時間 | - |
| **合計** | **6-11時間** | **中** |

---

## 🎯 実装戦略

### Phase 1: 式解析（配列アクセス式）
1. `parsePrimaryExpression()` に `[expression]` の処理を追加
2. `parseArrayAccessExpression()` ヘルパーを実装
3. `isLiteralMinusOne()` ヘルパーを実装
4. テスト: `A=[100]`, `B=[A+5]`, `C=[-1]`

### Phase 2: ステートメント解析（配列代入）
1. `parseStatementString()` に `[expression]=value` の処理を追加
2. トークンベース版も同様に実装
3. テスト: `[A]=100`, `[A+5]=B`

### Phase 3: 配列初期化
1. `parseArrayInitializationValues()` を実装
2. `[expression]=value1,value2,value3` の処理を追加
3. テスト: `[1000]=1,2,3,4,5`

### Phase 4: スタック操作の特殊処理
1. リテラル `-1` の判定ロジックを確認
2. `isLiteral` フラグが正しく設定されることを確認
3. テスト: `[-1]=A`, `B=[-1]`

---

## ✅ 成功基準

- [ ] 式解析: `[A]`, `[A+5]`, `[1000]` が正しくパースされる
- [ ] 配列代入: `[A]=100` が ArrayAssignmentStatement として解析される
- [ ] 配列初期化: `[A]=1,2,3` が ArrayInitializationStatement として解析される
- [ ] リテラル判定: `[-1]` が `isLiteral=true` として解析される
- [ ] 変数経由: `[I]` where `I=-1` が `isLiteral=false` として解析される
- [ ] エラー処理: 不正な構文でエラーが出る
- [ ] 既存テスト: すべての既存テストが引き続きパスする

---

## 📝 まとめ

**修正規模**: **中規模** (180-240行の追加)  
**実装時間**: **6-11時間**  
**難易度**: **中** (既存の括弧式処理と類似しているため、実装パターンは明確)

配列機能のパーサー実装は、既存のコードベースとよく統合されており、大きなリファクタリングは不要です。段階的に実装することで、リスクを最小化できます。
