# WorkerScript コア言語拡張 設計案

## 📋 概要

WorkerScriptの表現力と実用性を大幅に向上させるためのコア言語拡張機能。メモリ効率、プログラマビリティ、拡張性の3つの軸で言語を進化させる。

> **⚠️ このドキュメントのステータス**  
> このドキュメントは**将来的な拡張案**をまとめたものです。  
> 基本的な制御構造（WHILE/FOR統一構文）は既に実装済みです。  
> 記号リソース（`@`, `#`）の一部は制御構造で使用済みです。

## ✅ 既に実装済みの機能

- **統一制御構造**: `@`（ループ開始）と`#`（制御フロー）による統一構文
  - FOR: `@=I,1,100` → `#=@`
  - WHILE: `@=(condition)` → `#=@`
  - GOSUB/RETURN: `#=!` (RETURN)
- **詳細**: `worker.md`, `IMPLEMENTATION_NOTES.md` を参照

## 🎯 拡張目標（未実装）

- **メモリ管理**: 大容量データ処理・複雑なアルゴリズム対応
- **プログラマビリティ**: より高度なデータ構造（配列・文字列）
- **拡張性**: ユーザー定義コマンド・プラグイン機能
- **後方互換性**: 既存コードへの影響なし

## 🧮 拡張案1: 配列・スタック機能

### 仕様設計（`[address]` 記法採用）
```workerscript
: 配列・スタック統合システム - 共有メモリ空間 (65536要素)

: 1. 変数をアドレスとして使用
A=1000       : 変数 A にアドレス 1000 を設定
[A]=255      : メモリ[1000] に 255 を格納
B=[A]        : メモリ[1000] から値を読み取り → B=255

: 2. 直接アドレス指定
[500]=123    : メモリ[500] に 123 を格納  
C=[500]      : メモリ[500] から読み取り → C=123

: 3. 計算アドレス（真の威力）
[A+5]=255    : メモリ[A+5] に 255 を格納（ポインタ演算）
D=[A+I]      : メモリ[A+I] から読み取り（動的アクセス）
[B*2+10]=C   : メモリ[B*2+10] に C を格納（複雑なアドレス計算）

: 4. 配列初期化（複数値代入）
[A]=1,2,3,4,5    : メモリ[A]～[A+4]に連続値を設定
[1000]=10,20,30  : メモリ[1000]～[1002]に値を設定

: 5. スタック操作（リテラル -1 のみ）
[-1]=A       : A の値をスタックにプッシュ（リテラル-1）
B=[-1]       : スタックからポップして B に格納（リテラル-1）

: 重要: 変数経由では通常メモリアクセス
I=-1         : 変数 I に -1 を代入
[I]=A        : メモリ[65535] に A を格納（スタックプッシュではない！）
B=[I]        : メモリ[65535] から読み取り（スタックポップではない！）

: 5. 既存FOR文との共存（影響なし）
I=1,100,2    : FOR文として正常動作
```

### 実装アーキテクチャ（VTLオリジナル準拠）
```typescript
class ArrayStackManager {
    private memory: Int16Array = new Int16Array(65536)  // 共有メモリ空間
    private stackPointer: number = 65535                // スタックポインタ（内部管理）
    
    // メモリアクセス（リテラル-1のみスタック操作）
    readMemory(index: number, isLiteral: boolean = false): number {
        if (index === -1 && isLiteral) {
            return this.stackPop()    // リテラル[-1]のみスタックポップ
        }
        return this.memory[index] || 0  // 通常のメモリアクセス
    }
    
    writeMemory(index: number, value: number, isLiteral: boolean = false): void {
        if (index === -1 && isLiteral) {
            this.stackPush(value)     // リテラル[-1]のみスタックプッシュ
            return
        }
        this.memory[index] = value & 0xFFFF  // 通常のメモリアクセス
    }
    
    // スタック操作（インタプリタ内部管理）
    private stackPush(value: number): void {
        this.memory[this.stackPointer--] = value & 0xFFFF
        // 注意: スタックオーバーフローも自己責任（チェックなし）
    }
    
    private stackPop(): number {
        return this.memory[++this.stackPointer] || 0
        // 注意: スタックアンダーフローも自己責任（チェックなし）
    }
    
    // システム変数候補: スタックポインタへのアクセス
    getStackPointer(): number {
        return this.stackPointer
    }
    
    setStackPointer(value: number): void {
        this.stackPointer = value & 0xFFFF  // プログラマが直接制御可能
    }
}
        }
        return this.memory[++this.stackPointer] || 0
        // 注意: スタックアンダーフローも自己責任（チェックなし）
    }
    
    // システム変数候補: スタックポインタへのアクセス
    getStackPointer(): number {
        return this.stackPointer
    }
    
    setStackPointer(value: number): void {
        this.stackPointer = value & 0xFFFF  // プログラマが直接制御可能
    }
}

// 使用例とスタック操作の明確化
// A=1000, [A]=100, [A+1]=200  → 通常のメモリアクセス
// [-1]=300, B=[-1]            → リテラル-1のみスタック操作
// I=-1, [I]=400               → 通常のメモリ[65535]への書き込み（スタックではない！）
// [A+I]=B, C=[A+I]            → 動的配列アクセス（ポインタ演算）

// 重要: スタック操作は字面で明確に判断できるリテラル[-1]のみ
```

### システム変数設計の選択肢

**📋 記号リソース分析** → 詳細は `SYMBOL_RESOURCES.md` 参照

#### 重要な発見: 記号衝突問題と対策

> **⚠️ 記号使用状況の更新**  
> 以下の記号は既に実装済みの機能で使用中です：
> - `@`: ループ開始（FOR/WHILE統一構文）
> - `#`: 制御フロー（NEXT/WEND/GOTO/GOSUB）
> - `]`: RETURN文（既存）
>
> **将来の拡張では以下の記号を検討**：
> - `{` `}`: 配列アクセス（未使用）
> - `\`: 拡張コマンド（未使用）
> - その他: 詳細は `SYMBOL_RESOURCES.md` 参照

1. **配列アクセス**: `[address]` の `]` が RETURN文と衝突 → `{address}` に変更予定
2. **拡張コマンド**: `&COMMAND` の `&` が論理ANDと衝突 → `\COMMAND` に変更予定
3. **システム変数**: 予約変数方式を継続（例: 変数`S`をスタックポインタ用に予約）

#### 修正された設計: 利用可能記号の活用

**配列アクセス**: `{address}` 記法に変更
```workerscript
A=1000       : 変数 A にアドレス 1000 を設定
{A}=255      : メモリ[1000] に 255 を格納
B={A}        : メモリ[1000] から読み取り → B=255
{A+5}=100    : ポインタ演算（メモリ[A+5] への書き込み）
{-1}=A       : スタックプッシュ（リテラル-1のみ）
B={-1}       : スタックポップ（リテラル-1のみ）
```

**拡張コマンド**: `\COMMAND` 記法に変更  
```workerscript
\MAX=A,B     : 最大値計算コマンド
\SQRT=A      : 平方根計算コマンド
C=\MIN=A,B   : 最小値計算して結果をCに格納
```

**システム変数**: 予約変数方式を継続
```workerscript
S = スタックポインタ（変数Sをシステム用に予約）
```

**利点**: 
- 記号衝突を完全回避
- `{` `}` `\` は未使用記号で安全に利用可能
- VTLの設計思想を維持
```

### 構文解析との統合
```typescript
// 既存の構文解析システムとの整合性
class ExtendedInterpreter extends WorkerInterpreter {
    private arrayManager: ArrayStackManager = new ArrayStackManager()
    
    // 配列アクセス式の評価
    private evaluateArrayAccess(indexExpr: Expression): number {
        const index = this.evaluateExpression(indexExpr)
        return this.arrayManager.readArray(index)
    }
    
    // 配列代入の実行
    private executeArrayAssignment(indexExpr: Expression, valueExpr: Expression): void {
        const index = this.evaluateExpression(indexExpr)
        const value = this.evaluateExpression(valueExpr)
        this.arrayManager.writeArray(index, value)
    }
    
    // 複数値初期化の実行
    private executeArrayInitialization(indexExpr: Expression, values: Expression[]): void {
        const startIndex = this.evaluateExpression(indexExpr)
        const evaluatedValues = values.map(expr => this.evaluateExpression(expr))
        this.arrayManager.initializeArray(startIndex, evaluatedValues)
    }
}
```

### FOR文との共存戦略
```typescript
// 構文解析での判定ロジック
private parseAssignmentOrArrayOrFor(tokens: Token[]): Statement {
    const leftTokens = this.extractLeftSide(tokens)
    
    if (this.isArrayAccess(leftTokens)) {
        // [A]=... または [A]=1,2,3 → 配列への代入
        const rightTokens = this.extractRightSide(tokens)
        if (this.hasMultipleValues(rightTokens)) {
            return this.parseArrayInitialization(tokens)  // 複数値初期化
        } else {
            return this.parseArrayAssignment(tokens)       // 単一値代入
        }
    } else if (tokens.some(t => t.type === TokenType.COMMA)) {
        // A=1,2,3 → FOR文
        return this.parseForStatement(tokens)
    } else {
        // A=123 → 通常の代入
        return this.parseAssignment(tokens)
    }
}

// 配列アクセス判定
private isArrayAccess(tokens: Token[]): boolean {
    return tokens.length >= 3 && 
           tokens[0].type === TokenType.LEFT_BRACKET &&
           tokens[tokens.length - 1].type === TokenType.RIGHT_BRACKET
}

// 複数値判定
private hasMultipleValues(tokens: Token[]): boolean {
    return tokens.some(token => token.type === TokenType.COMMA)
}
```

### 新規トークンの追加
```typescript
// lexer.ts への追加
export enum TokenType {
    // ... 既存のトークン
    LEFT_BRACKET = 'LEFT_BRACKET',    // [
    // RIGHT_BRACKET は既存（RETURN用）を流用
}

// Lexer拡張
if (char === '[') {
    tokens.push({ type: TokenType.LEFT_BRACKET, value: char, line: lineNumber, column: cursor });
    cursor++;
    continue;
}
```

## ⚡ 拡張案2: 拡張コマンド機能

### 仕様設計
```workerscript
: 拡張コマンドシステム

: 1. 基本的な拡張コマンド（&記号使用）
&1=100       : 拡張コマンド1に引数100を渡して実行
&2=A,B       : 拡張コマンド2に引数A,Bを渡して実行
C=&3         : 拡張コマンド3を実行して結果をCに格納

: 2. プリセット拡張コマンド例
&10=A,B      : Math.max(A,B) → 最大値計算
&11=A,B      : Math.min(A,B) → 最小値計算  
&20=A        : Math.sqrt(A) → 平方根
&21=A        : Math.abs(A) → 絶対値
&30=A,B,C    : 三角関数計算
&40=A        : 文字列長計算
&50=A,B      : ファイル操作

: 3. ユーザー定義コマンド（将来拡張）
&100="custom_command.js"  : 外部JSファイルのロード
&101=A,B     : カスタムコマンド101の実行
```

### 🔄 TODO: 拡張コマンド名前改善
**課題**: 数字によるコマンド管理は認知負荷が高い
- `&1=A,B` より `&MAX=A,B` の方が直感的
- `&20=A` より `&SQRT=A` の方が読みやすい

**改善案**:
- 未使用記号（`@`, `#`, `%`など）+ アルファベットで命名
- 例: `@MAX=A,B`, `#SQRT=A`, `%FILE=A,B`
- または: `&MAX=A,B`, `&SQRT=A`, `&FILE=A,B`（&記号維持）

**実装方針**:
1. レキサーでアルファベット識別子を追加
2. ExtensionManagerで名前→ID変換テーブル
3. 下位互換のため数字ID併用可能

**優先度**: 中（配列実装後に検討）

### 実装アーキテクチャ
```typescript
interface ExtensionCommand {
    id: number
    name: string
    description: string
    execute(args: number[]): number | void
    minArgs: number
    maxArgs: number
}

class ExtensionManager {
    private commands: Map<number, ExtensionCommand> = new Map()
    
    // プリセットコマンドの登録
    constructor() {
        this.registerBuiltinCommands()
    }
    
    private registerBuiltinCommands(): void {
        // 数学関数
        this.register({
            id: 10, name: 'max', description: '最大値計算',
            execute: (args) => Math.max(...args),
            minArgs: 2, maxArgs: 10
        })
        
        this.register({
            id: 11, name: 'min', description: '最小値計算', 
            execute: (args) => Math.min(...args),
            minArgs: 2, maxArgs: 10
        })
        
        this.register({
            id: 20, name: 'sqrt', description: '平方根',
            execute: (args) => Math.floor(Math.sqrt(args[0])),
            minArgs: 1, maxArgs: 1
        })
        
        // 配列操作
        this.register({
            id: 100, name: 'array_sum', description: '配列合計',
            execute: (args) => {
                let sum = 0
                for (let i = args[0]; i <= args[1]; i++) {
                    sum += this.arrayManager.readArray(i)
                }
                return sum & 0xFFFF
            },
            minArgs: 2, maxArgs: 2
        })
        
        // I/O操作（将来拡張）
        this.register({
            id: 200, name: 'file_read', description: 'ファイル読み込み',
            execute: (args) => {
                // ファイル操作の実装
                return 0
            },
            minArgs: 1, maxArgs: 1
        })
    }
    
    register(command: ExtensionCommand): void {
        this.commands.set(command.id, command)
    }
    
    execute(commandId: number, args: number[]): number {
        const command = this.commands.get(commandId)
        if (!command) {
            throw new Error(`Unknown extension command: &${commandId}`)
        }
        
        if (args.length < command.minArgs || args.length > command.maxArgs) {
            throw new Error(`Command &${commandId} requires ${command.minArgs}-${command.maxArgs} arguments`)
        }
        
        const result = command.execute(args)
        return typeof result === 'number' ? result : 0
    }
    
    listCommands(): ExtensionCommand[] {
        return Array.from(this.commands.values())
    }
}
```

### 構文解析の拡張
```typescript
class ExtendedInterpreter extends WorkerInterpreter {
    private extensionManager: ExtensionManager = new ExtensionManager()
    
    private executeExtensionCommand(statement: ExtensionStatement): number {
        const commandId = statement.commandId
        const args = statement.arguments.map(expr => this.evaluateExpression(expr))
        
        return this.extensionManager.execute(commandId, args)
    }
}
```

## 💡 追加提案: その他のコア拡張

### 拡張案3: 文字列処理機能
```workerscript
: 文字列システム（配列ベース実装）

: 1. 文字列定義・操作
$A="Hello"      : 文字列を配列に格納、Aにポインタ設定
$B="World"      : 同様にBにポインタ設定  
$C=$A+$B        : 文字列連結（新しい配列領域に格納）

: 2. 文字列関数（拡張コマンド活用）
L=&40=$A        : 文字列長取得
P=&41=$A,$B     : 文字列検索（位置を返す）
&42=$A,5,3      : 部分文字列抽出

: 3. 文字列比較
;=$A=$B #=^EQUAL    : 文字列比較
```

### 拡張案4: サブルーチン引数・戻り値
```workerscript
: 拡張サブルーチンシステム

: 1. 引数付きサブルーチン呼び出し
!=^ADD_FUNC,10,20   : ADD_FUNC(10, 20)を呼び出し

: 2. サブルーチン内での引数アクセス  
^ADD_FUNC
    A=#1            : 第1引数を取得
    B=#2            : 第2引数を取得
    C=A+B           : 計算
    #0=C            : 戻り値を設定
    ]               : リターン

: 3. 戻り値の取得
R=!=^ADD_FUNC,10,20 : 戻り値をRに格納
```

### 拡張案5: 構造化データ
```workerscript
: 構造体ライクなデータ構造

: 1. 構造体定義（拡張コマンド）
&300=3          : 3要素の構造体テンプレート定義
P=&301          : 新しい構造体インスタンス作成（ポインタ取得）

: 2. フィールドアクセス
[P+0]=100       : 構造体.field0 = 100
[P+1]=200       : 構造体.field1 = 200  
[P+2]=300       : 構造体.field2 = 300

A=[P+1]         : 構造体.field1 を読み取り → A=200
```

### 拡張案6: イベント・割り込み機能
```workerscript
: イベントドリブンプログラミング

: 1. イベントハンドラ登録
&500=^KEY_HANDLER    : キーボードイベントハンドラ
&501=^TIMER_HANDLER  : タイマーイベントハンドラ

: 2. イベント待機
&510                 : イベント待機（ノンブロッキング）

^KEY_HANDLER
    K=#EVENT_DATA    : イベントデータ取得
    ?="Key pressed: " ?=K
    ]

^TIMER_HANDLER  
    ?="Timer tick"
    ]
```

## 🏗️ 実装アーキテクチャ統合

### 拡張されたインタープリター
```typescript
class ExtendedWorkerInterpreter extends WorkerInterpreter {
    private arrayManager: ArrayStackManager
    private extensionManager: ExtensionManager
    private stringManager: StringManager
    private eventManager: EventManager
    
    constructor(config: InterpreterConfig) {
        super(config)
        this.initializeExtensions()
    }
    
    private initializeExtensions(): void {
        this.arrayManager = new ArrayStackManager()
        this.extensionManager = new ExtensionManager()
        this.stringManager = new StringManager(this.arrayManager)
        this.eventManager = new EventManager()
        
        // 拡張システム変数の登録
        this.registerExtendedSystemVariables()
    }
    
    private registerExtendedSystemVariables(): void {
        // 配列アクセス
        this.systemVariables.set('[', (index) => this.arrayManager.readArray(index))
        
        // スタック操作  
        this.systemVariables.set('<', (value) => this.arrayManager.push(value))
        this.systemVariables.set('>', () => this.arrayManager.pop())
        
        // 拡張コマンド
        this.systemVariables.set('&', (id, ...args) => this.extensionManager.execute(id, args))
    }
}
```

## 📊 拡張の優先度・実装順序

### Phase 1: 基本配列機能（高優先）
- **期間**: 3-4日  
- **内容**: 配列読み書き、基本的なインデックスアクセス
- **理由**: データ処理能力の大幅向上、多くの応用が可能

### Phase 2: 拡張コマンドフレームワーク（高優先）
- **期間**: 2-3日
- **内容**: &記号による拡張コマンド、数学関数プリセット
- **理由**: 言語の拡張性確保、将来の機能追加基盤

### Phase 3: スタック機能（中優先）  
- **期間**: 2日
- **内容**: push/pop操作、スタックベースアルゴリズム支援
- **理由**: アルゴリズム学習・実装の高度化

### Phase 4: 文字列処理（中優先）
- **期間**: 3-4日
- **内容**: 配列ベース文字列、基本的な文字列操作
- **理由**: テキスト処理・ユーザーインターフェース向上

### Phase 5: 高度な機能（低優先）
- **期間**: 各2-3日
- **内容**: サブルーチン引数、構造体、イベント機能
- **理由**: 専門的用途、上級ユーザー向け

## 🎯 各拡張の期待効果

### 配列・スタック機能
- **アルゴリズム**: ソート、探索、グラフ理論
- **データ処理**: 大量データの処理・分析
- **ゲーム開発**: 複雑な状態管理・AI実装

### 拡張コマンド機能  
- **数学計算**: 高度な数値計算・統計処理
- **I/O操作**: ファイル読み書き・ネットワーク通信
- **ユーザー拡張**: カスタムライブラリ・プラグイン

### 文字列処理機能
- **テキスト処理**: ログ解析・データパース
- **ユーザーIF**: 対話的プログラム・メニューシステム  
- **教育用途**: 文字列アルゴリズムの学習

## 💻 使用例: 高度なプログラム

### ソートアルゴリズム実装
```workerscript
: バブルソート（配列使用）
?="Bubble Sort Demo"

: データ初期化
[0]=64 [1]=34 [2]=25 [3]=12 [4]=22 [5]=11 [6]=90
N=7

: バブルソート実装
I=0,N-2
    J=0,N-I-2  
        : 比較・交換
        ;=[J]>[J+1] !=^SWAP,J,J+1
    @=J
@=I

: 結果表示
?="Sorted array:"
I=0,N-1
    ?=[I] ?=" "
@=I

^SWAP
    : 引数取得（将来拡張で実装予定）
    A=#1  B=#2
    
    : 値交換
    T=[A]
    [A]=[B] 
    [B]=T
    ]

#=-1
```

### 文字列処理例
```workerscript
: 文字列処理デモ
$A="Hello"
$B="World" 
$C=$A+" "+$B     : "Hello World"

L=&40=$C         : 文字列長
?="Length: " ?=L

P=&41=$C,"World" : "World"の位置検索
?="Position: " ?=P

#=-1
```

この拡張により、WorkerScriptは**教育用シンプル言語**から**実用的なプログラミング言語**へと大きく進化し、より複雑で実用的なアプリケーション開発が可能になります。