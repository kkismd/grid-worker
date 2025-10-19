# パーサーとインタプリタの分離 - 実施計画

**作成日**: 2025年10月19日  
**対象**: `src/workerInterpreter.ts` (2596行)  
**目標**: パーサーとインタプリタを独立したクラスに分離

---

## 📊 現状分析

### 現在のメソッド分類（73個）

#### **パーサー関連メソッド（約30個、約1200行）**
```
buildProgramAST()                   // AST構築のメイン
tryProcessEmptyOrCommentLine()      // 空行/コメント処理
processNormalLine()                 // 通常行処理
tryProcessIfBlock()                 // IFブロック検出
tryProcessForBlock()                // FORブロック検出
tryProcessWhileBlock()              // WHILEブロック検出
isEndIfStatement()                  // #=; 判定
isElseStatement()                   // ; 判定
collectIfBlock()                    // IFブロック収集
isLoopEndStatement()                // #=@ 判定
collectLoopBlock()                  // ループブロック収集
parseStatementFromTokens()          // トークン→Statement変換
parseNewlineStatement()             // 改行文パース
parseAtStatement()                  // @=文パース
parseIdentifierStatement()          // 識別子文パース
parseHashStatement()                // #=文パース
parseArrayStatement()               // 配列文パース
parseExpression()                   // 式パース
parseExpressionFromTokens()         // トークン→Expression変換
getOperatorPrecedence()             // 演算子優先度
parseBinaryExpression()             // 二項演算式パース
parsePrimaryExpression()            // 一次式パース
isBinaryOperator()                  // 二項演算子判定
isExpressionToken()                 // 式トークン判定
getBinaryOperatorTypes()            // 二項演算子タイプ一覧
parseStatementString()              // 文字列→Statement変換（旧API）
isCommaExpression()                 // カンマ式判定
extractCommaExpressionParts()       // カンマ式分解
```

#### **インタプリタ関連メソッド（約35個、約600行）**
```
run()                               // 実行メインループ
executeStatement()                  // ステートメント実行分岐
executeAssignment()                 // 代入実行
executeOutput()                     // 出力実行
executeNewline()                    // 改行実行
executeIf()                         // IF実行
executeIfBlock()                    // IFブロック実行
executeForBlock()                   // FORブロック実行
executeWhileBlock()                 // WHILEブロック実行
executeGoto()                       // GOTO実行
executeGosub()                      // GOSUB実行
executeReturn()                     // RETURN実行
executeHalt()                       // HALT実行
executePoke()                       // POKE実行
executeIoPut()                      // IO PUT実行
executeArrayAssignment()            // 配列代入実行
executeArrayInitialization()        // 配列初期化実行
evaluateExpression()                // 式評価分岐
evaluateNumericLiteral()            // 数値リテラル評価
evaluateStringLiteral()             // 文字列リテラル評価
evaluateIdentifier()                // 識別子評価
evaluateUnaryExpression()           // 単項演算評価
evaluateBinaryExpression()          // 二項演算評価
evaluatePeekExpression()            // PEEK評価
evaluateRandomExpression()          // ランダム評価
evaluateCharLiteralExpression()     // 文字リテラル評価
evaluateIoGetExpression()           // IO GET評価
evaluateArrayAccessExpression()     // 配列アクセス評価
```

#### **共有データ（プロパティ）**
```
// パーサーが必要
private scriptLines: string[]
private labels: Map<string, number>
private tokens: Token[][]
private program: Program | null
private lexer: Lexer

// インタプリタが必要
private variables: Map<string, number>
private currentLineIndex: number
private callStack: number[]
private loopStack: LoopBlockInfo[]
private memorySpace: MemorySpace
private gridData: number[]
private peekFn, pokeFn, logFn, getFn, putFn

// 両方が必要
private program: Program | null
private labels: Map<string, number>
```

---

## 🎯 分離戦略

### アプローチ：**段階的分離（5フェーズ）**

**理由**:
- 一度に全てを分離すると破綻リスクが高い
- 各ステップでテストを実行して安全性を確保
- 既存APIの互換性を維持

---

## 📋 実施計画

### **Phase 0: 事前準備（1-2時間）**

#### 0.1. ドキュメント整備
- [ ] この実施計画書を完成させる
- [ ] 既存テストの棚卸し
- [ ] APIの互換性要件を明確化

#### 0.2. バックアップと環境準備
- [ ] 現在のブランチをバックアップ
- [ ] `parser-interpreter-separation` ブランチ作成
- [ ] ベンチマークテストの準備（パフォーマンス計測）

#### 0.3. コード整理（事前リファクタリング）
- [ ] **parse()メソッドの削除または非推奨化**
  - 現在：`parse(tokens: Token[]): Program`
  - 問題：buildProgramAST()と重複、テストでのみ使用
  - 対応：テストを書き換えて削除
- [ ] **getProgram()メソッドの追加**
  - `public getProgram(): Program | null`
  - programプロパティへの安全なアクセス
- [ ] **public/privateの整理**
  - 分離後にpublicになるメソッドを特定
  - アクセス修飾子を整理

---

### **Phase 1: Parserクラスの抽出（4-6時間）**

#### 1.1. Parser基本クラスの作成
```typescript
// src/parser.ts
export class Parser {
    private scriptLines: string[] = [];
    private labels: Map<string, number> = new Map();
    private tokens: Token[][] = [];
    private lexer: Lexer;
    
    constructor() {
        this.lexer = new Lexer();
    }
    
    public parse(script: string): { program: Program; labels: Map<string, number> } {
        // buildProgramAST()の内容を移動
    }
}
```

#### 1.2. パース関連メソッドの移動
- [ ] buildProgramAST() → parse()
- [ ] tryProcessEmptyOrCommentLine()
- [ ] processNormalLine()
- [ ] tryProcessIfBlock()
- [ ] tryProcessForBlock()
- [ ] tryProcessWhileBlock()
- [ ] isEndIfStatement()
- [ ] isElseStatement()
- [ ] collectIfBlock()
- [ ] isLoopEndStatement()
- [ ] collectLoopBlock()
- [ ] 全てのparse*メソッド（20個）

#### 1.3. WorkerInterpreterの修正
```typescript
class WorkerInterpreter {
    private parser: Parser;
    private program: Program | null = null;
    private labels: Map<string, number> = new Map();
    
    constructor(...) {
        this.parser = new Parser();
    }
    
    loadScript(script: string): void {
        const result = this.parser.parse(script);
        this.program = result.program;
        this.labels = result.labels;
    }
}
```

#### 1.4. テストと検証
- [ ] 全266テストがPASS
- [ ] 型エラーがない
- [ ] パフォーマンスが低下していない

#### 1.5. コミット
```
git commit -m "Phase 1: Parserクラスを抽出（パーサー機能を独立）"
```

---

### **Phase 2: Interpreterクラスの抽出（4-6時間）**

#### 2.1. Interpreter基本クラスの作成
```typescript
// src/interpreter.ts
export class Interpreter {
    private variables: Map<string, number> = new Map();
    private currentLineIndex: number = 0;
    private callStack: number[] = [];
    private loopStack: LoopBlockInfo[] = [];
    private memorySpace: MemorySpace;
    
    // コールバック関数
    private peekFn: (index: number) => number;
    private pokeFn: (x: number, y: number, value: number) => void;
    private logFn: (...args: any[]) => void;
    private getFn?: () => number;
    private putFn?: (value: number) => void;
    
    constructor(callbacks: InterpreterCallbacks) {
        this.memorySpace = new MemorySpace();
        this.peekFn = callbacks.peekFn;
        // ...
    }
    
    public *run(program: Program, labels: Map<string, number>): Generator<void, void, void> {
        // run()の内容を移動
    }
}
```

#### 2.2. 実行関連メソッドの移動
- [ ] run()
- [ ] executeStatement()
- [ ] 全てのexecute*メソッド（15個）
- [ ] 全てのevaluate*メソッド（10個）

#### 2.3. WorkerInterpreterの修正
```typescript
class WorkerInterpreter {
    private parser: Parser;
    private interpreter: Interpreter;
    private program: Program | null = null;
    private labels: Map<string, number> = new Map();
    
    constructor(...) {
        this.parser = new Parser();
        this.interpreter = new Interpreter({
            peekFn: this.peekFn,
            pokeFn: this.pokeFn,
            logFn: this.logFn,
            getFn: this.getFn,
            putFn: this.putFn,
        });
    }
    
    *run(): Generator<void, void, void> {
        if (!this.program) throw new Error('...');
        yield* this.interpreter.run(this.program, this.labels);
    }
}
```

#### 2.4. テストと検証
- [ ] 全266テストがPASS
- [ ] 型エラーがない
- [ ] パフォーマンスが低下していない

#### 2.5. コミット
```
git commit -m "Phase 2: Interpreterクラスを抽出（実行機能を独立）"
```

---

### **Phase 3: インターフェースの整理（2-3時間）**

#### 3.1. 型定義の整理
```typescript
// src/interpreter.ts
export interface InterpreterCallbacks {
    peekFn: (index: number) => number;
    pokeFn: (x: number, y: number, value: number) => void;
    logFn: (...args: any[]) => void;
    getFn?: () => number;
    putFn?: (value: number) => void;
}

export interface InterpreterState {
    variables: Map<string, number>;
    currentLineIndex: number;
    callStack: number[];
    loopStack: LoopBlockInfo[];
}
```

#### 3.2. パブリックAPIの整理
- [ ] Parser.parse() の戻り値を型安全に
- [ ] Interpreter.run() のシグネチャ確定
- [ ] Interpreter.getVariable() などの公開メソッド追加

#### 3.3. WorkerInterpreterの簡素化
```typescript
class WorkerInterpreter {
    private parser: Parser;
    private interpreter: Interpreter;
    
    // 既存APIの互換性を維持
    loadScript(script: string): void { ... }
    *run(): Generator<void, void, void> { ... }
    getVariable(name: string): number { ... }
    getProgram(): Program | null { ... }
}
```

#### 3.4. テストと検証
- [ ] 全266テストがPASS
- [ ] 既存APIの互換性確認

#### 3.5. コミット
```
git commit -m "Phase 3: インターフェースの整理と型安全性の向上"
```

---

### **Phase 4: ドキュメントとテストの整備（2-3時間）**

#### 4.1. クラスごとのドキュメント作成
- [ ] `src/parser.ts` のJSDoc
- [ ] `src/interpreter.ts` のJSDoc
- [ ] `src/workerInterpreter.ts` の更新

#### 4.2. ユニットテストの追加
- [ ] Parser単体のテスト
- [ ] Interpreter単体のテスト
- [ ] 統合テストの確認

#### 4.3. README.mdの更新
```markdown
## アーキテクチャ

WorkerScriptインタプリタは3つの主要コンポーネントで構成されます：

1. **Parser** (`src/parser.ts`)
   - スクリプトの字句解析と構文解析
   - ASTの構築
   
2. **Interpreter** (`src/interpreter.ts`)
   - ASTの実行
   - 変数・スタック管理
   
3. **WorkerInterpreter** (`src/workerInterpreter.ts`)
   - ParserとInterpreterの統合
   - 既存APIの互換性維持
```

#### 4.4. コミット
```
git commit -m "Phase 4: ドキュメントとテストの整備"
```

---

### **Phase 5: 最終確認とマージ（1-2時間）**

#### 5.1. 最終チェックリスト
- [ ] 全266テスト（1 skipped）がPASS
- [ ] 型エラーなし
- [ ] パフォーマンス低下なし（±5%以内）
- [ ] コードカバレッジ維持
- [ ] メモリリークなし

#### 5.2. ファイル構成確認
```
src/
  ├── parser.ts          (~800-1000行) NEW
  ├── interpreter.ts     (~600-800行)  NEW
  ├── workerInterpreter.ts (~200-300行) REDUCED
  ├── memorySpace.ts     (92行)
  ├── ast.ts             (466行)
  └── lexer.ts           (既存)
```

#### 5.3. PRとマージ
- [ ] `loop-block-refactor` から `parser-interpreter-separation` ブランチ作成
- [ ] 各フェーズごとにコミット
- [ ] 最終的に `loop-block-refactor` にマージ

---

## ⚠️ リスクと対策

### リスク1: テストが壊れる
**対策**: 各フェーズでテストを実行、問題があれば即座にロールバック

### リスク2: パフォーマンス低下
**対策**: ベンチマークテストを実施、±5%以内を維持

### リスク3: 循環依存
**対策**: Parser→Interpreter の依存は禁止、共通の型はast.tsに

### リスク4: 既存APIの破壊
**対策**: WorkerInterpreterで互換性レイヤーを維持

---

## 📊 期待される効果

### 短期的効果
- コードの責任が明確化
- 各クラスの独立したテストが可能
- 将来の拡張が容易

### 長期的効果
- Parserの再利用（LSP、静的解析、最適化）
- Interpreterの再利用（別の実行エンジン）
- メンテナンスコスト削減

---

## 📅 実施スケジュール

| フェーズ | 所要時間 | 累計 |
|---------|---------|------|
| Phase 0: 事前準備 | 1-2時間 | 1-2時間 |
| Phase 1: Parser抽出 | 4-6時間 | 5-8時間 |
| Phase 2: Interpreter抽出 | 4-6時間 | 9-14時間 |
| Phase 3: インターフェース整理 | 2-3時間 | 11-17時間 |
| Phase 4: ドキュメント整備 | 2-3時間 | 13-20時間 |
| Phase 5: 最終確認 | 1-2時間 | 14-22時間 |

**推定合計**: 14-22時間（2-3日）

---

## ✅ 成功基準

- [ ] 全266テスト（1 skipped）がPASS
- [ ] 型エラーなし
- [ ] パフォーマンス低下なし（±5%以内）
- [ ] workerInterpreter.ts が300行以下
- [ ] parser.ts と interpreter.ts が独立して再利用可能
- [ ] 既存APIの完全な互換性維持

---

**次のアクション**: Phase 0の事前準備から開始
