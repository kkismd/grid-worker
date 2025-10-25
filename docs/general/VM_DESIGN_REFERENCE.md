# WorkerScript仮想マシン設計 - 参考資料

**作成日**: 2025年10月20日  
**目的**: WS言語の実行をサポートするシンプルな仮想マシン（VM）の設計

---

## 📋 現在の実装概要

### 現在のアーキテクチャ
WorkerScriptは現在、**AST（抽象構文木）インタプリタ**として実装されています。

**実行フロー**:
```
ソースコード → Lexer → Parser → AST → Interpreter (Generator)
```

**主要コンポーネント**:
1. **Lexer** (`src/lexer.ts`): トークン化
2. **Parser** (`src/parser.js`): AST構築
3. **WorkerInterpreter** (`src/workerInterpreter.ts`): AST実行

**特徴**:
- Generator関数による協調的マルチタスク実行
- 1ステートメントごとにyieldして制御を返す
- メモリ空間: 配列とスタック（`MemorySpace`クラス）
- 変数: A-Z（16ビット符号あり整数）
- システム変数: `#`（プログラムカウンタ）、`~`（乱数）、`` ` ``（メモリアクセス）

---

## 🎯 仮想マシン設計の選択肢

### 1. スタックベースVM（推奨）

**概念**:
評価スタックを使用して演算を行う。すべての演算はスタックトップの値を使用。

**命令例**:
```
PUSH 5      ; スタックに5をプッシュ
PUSH 3      ; スタックに3をプッシュ
ADD         ; スタックから2つポップ、加算、結果をプッシュ
STORE A     ; スタックトップを変数Aに格納
```

**利点**:
- ✅ 実装がシンプル
- ✅ コンパイラ/トランスパイラが作りやすい
- ✅ 中間表現として適している
- ✅ メモリ効率が良い

**欠点**:
- ❌ 命令数が多くなりがち
- ❌ デバッグがやや難しい

**参考実装**:
- **Java Virtual Machine (JVM)**: 最も有名なスタックベースVM
- **Python bytecode**: `.pyc`ファイルの内部表現
- **WebAssembly**: Webブラウザ向けのスタックベースVM
- **Lua VM (5.0以前)**: シンプルな実装

**WorkerScript向け命令セット案**:
```
# データ操作
PUSH <value>       ; 即値をプッシュ
LOAD <var>         ; 変数の値をプッシュ
STORE <var>        ; スタックトップを変数に格納
POP                ; スタックトップを破棄

# 算術演算
ADD, SUB, MUL, DIV, MOD
NEG                ; 符号反転

# 比較演算
EQ, GT, LT, GE, LE, NE

# 論理演算
AND, OR, NOT

# 制御フロー
JUMP <label>       ; 無条件ジャンプ
JUMP_IF_FALSE <label>  ; 条件ジャンプ
CALL <label>       ; サブルーチン呼び出し
RETURN             ; サブルーチンから復帰

# システム関数
PEEK               ; スタックトップをインデックスとしてpeek
POKE               ; スタックから値とインデックスをポップしてpoke
LOG                ; スタックトップをログ出力
RANDOM             ; 乱数をプッシュ

# 特殊命令
HALT               ; プログラム停止
NOP                ; 何もしない
```

---

### 2. レジスタベースVM

**概念**:
複数のレジスタを持ち、演算はレジスタ間で行う。

**命令例**:
```
LOAD R1, 5      ; レジスタR1に5をロード
LOAD R2, 3      ; レジスタR2に3をロード
ADD R3, R1, R2  ; R1とR2を加算してR3に格納
STORE A, R3     ; レジスタR3を変数Aに格納
```

**利点**:
- ✅ 命令数が少ない
- ✅ 実行効率が高い
- ✅ 現代のCPUに近い
- ✅ デバッグしやすい

**欠点**:
- ❌ 実装が複雑
- ❌ レジスタ割り当てが必要
- ❌ コンパイラの実装が難しい

**参考実装**:
- **Lua VM (5.1以降)**: レジスタベースに移行して高速化
- **Dalvik VM**: Android向けレジスタベースVM
- **RISC-V**: シンプルなRISC命令セット

**WorkerScript向けには過剰**：
WorkerScriptは変数がA-Zの26個しかなく、レジスタベースの利点が活かせない。

---

### 3. バイトコードインタプリタ（最もシンプル）

**概念**:
ASTを中間バイトコード表現に変換し、バイトコードを直接実行。

**利点**:
- ✅ 現在の実装から移行しやすい
- ✅ ASTインタプリタより高速
- ✅ デバッグ情報を保持しやすい

**欠点**:
- ❌ 完全なVMほど最適化されない

---

## 🔍 参考になる既存の仕様・実装

### 1. シンプルなスタックVM実装

#### **CHIP-8** (最もシンプル)
- 1970年代のゲーム用仮想マシン
- 16個の8ビットレジスタ
- 4KBメモリ
- 35命令のみ
- **参考**: https://github.com/mattmikolay/chip-8/wiki/CHIP%E2%80%908-Instruction-Set

**WorkerScriptとの類似性**:
- シンプルなメモリモデル
- グリッド表示（64x32ピクセル）
- 限定的な命令セット

---

#### **BASIC インタプリタ**
- 変数名がシンプル（A-Z、A1-Z9など）
- 行番号ベースの実行
- GOTO/GOSUBによる制御フロー

**参考実装**:
- **Tiny BASIC**: https://en.wikipedia.org/wiki/Tiny_BASIC
- **BBC BASIC**: https://www.bbcbasic.co.uk/

**WorkerScriptとの類似性**:
- A-Z変数
- ラベルベースのジャンプ
- シンプルな型システム（整数のみ）

---

#### **Forth** (スタック指向言語)
- スタックベースの実行モデル
- 非常にシンプルなVM
- 組み込みシステムで広く使用

**参考**:
- https://www.forth.com/starting-forth/
- https://github.com/larsbrinkhoff/lbForth

**WorkerScriptへの応用**:
- スタック操作の参考
- RPN（逆ポーランド記法）による式評価

---

#### **Python bytecode**
- スタックベースVM
- `dis`モジュールでバイトコードを確認可能
- 実践的なスタックVMの良い例

**確認方法**:
```python
import dis

def add(a, b):
    return a + b

dis.dis(add)
```

出力例:
```
  2           0 LOAD_FAST                0 (a)
              2 LOAD_FAST                1 (b)
              4 BINARY_ADD
              6 RETURN_VALUE
```

---

### 2. 教育用VM実装

#### **Simple Virtual Machine (SVM)**
- 教育目的のシンプルなスタックVM
- C言語実装、200行程度
- https://github.com/skx/simple.vm

**特徴**:
- スタック、ヒープ、レジスタを持つ
- 簡潔な命令セット
- 理解しやすいコード

---

#### **LC-3** (Little Computer 3)
- 教育用の仮想マシン
- コンピュータアーキテクチャの学習に使用
- https://en.wikipedia.org/wiki/Little_Computer_3

**特徴**:
- 16ビットアーキテクチャ
- 8個の汎用レジスタ
- メモリマップドI/O

---

### 3. WebAssembly

**参考価値**:
- スタックベースVM
- テキスト形式（WAT）とバイナリ形式（WASM）
- ブラウザ環境での実行

**WorkerScriptからWASMへのコンパイル**も将来的に可能：
```wat
(module
  (func $add (param $a i32) (param $b i32) (result i32)
    local.get $a
    local.get $b
    i32.add)
  (export "add" (func $add)))
```

---

## 🎨 WorkerScript VM設計提案

### 推奨アーキテクチャ: **シンプルなスタックベースVM**

#### 1. 基本設計

**構成要素**:
```typescript
class WorkerScriptVM {
    // 実行スタック（式評価用）
    private stack: number[] = [];
    
    // 変数（A-Z）
    private variables: Map<string, number> = new Map();
    
    // メモリ（配列、スタック）
    private memory: MemorySpace;
    
    // バイトコード
    private bytecode: Instruction[] = [];
    
    // プログラムカウンタ
    private pc: number = 0;
    
    // コールスタック（サブルーチン用）
    private callStack: number[] = [];
    
    // ループスタック
    private loopStack: LoopInfo[] = [];
}
```

#### 2. 命令セット（最小限）

```typescript
enum OpCode {
    // データ操作
    PUSH_IMM,      // 即値をプッシュ
    PUSH_VAR,      // 変数の値をプッシュ
    PUSH_SYS,      // システム変数（#, ~, `）をプッシュ
    STORE_VAR,     // スタックトップを変数に格納
    POP,           // スタックトップを破棄
    
    // 算術演算
    ADD, SUB, MUL, DIV, MOD,
    NEG,           // 符号反転
    
    // 比較演算
    EQ, GT, LT, GE, LE, NE,
    
    // 論理演算
    AND, OR, NOT,
    
    // 制御フロー
    JUMP,          // 無条件ジャンプ
    JUMP_FALSE,    // 条件ジャンプ（偽の場合）
    JUMP_TRUE,     // 条件ジャンプ（真の場合）
    CALL,          // サブルーチン呼び出し
    RETURN,        // サブルーチンから復帰
    
    // ループ
    FOR_INIT,      // FORループ初期化
    FOR_CHECK,     // FORループ条件チェック
    FOR_STEP,      // FORループステップ
    WHILE_CHECK,   // WHILEループ条件チェック
    
    // システム関数
    PEEK,          // peek(index)
    POKE,          // poke(index, value)
    LOG,           // log()
    NEWLINE,       // 改行
    GET,           // 1byte入力
    PUT,           // 1byte出力
    
    // 特殊
    HALT,          // プログラム停止
    YIELD,         // 協調的マルチタスク用yield
    NOP,           // 何もしない
}
```

#### 3. 命令フォーマット

```typescript
interface Instruction {
    opcode: OpCode;
    operand?: number | string; // オペランド（即値、変数名、ジャンプ先など）
}
```

#### 4. コンパイルフロー

```
ソースコード → Lexer → Parser → AST → Compiler → バイトコード → VM
```

**新しいコンパイラ追加**:
```typescript
class WorkerScriptCompiler {
    compile(ast: Program): Instruction[] {
        const bytecode: Instruction[] = [];
        
        for (const line of ast.lines) {
            for (const statement of line.statements) {
                this.compileStatement(statement, bytecode);
            }
            // 各行の終わりでYIELD（協調的マルチタスク用）
            bytecode.push({ opcode: OpCode.YIELD });
        }
        
        return bytecode;
    }
    
    private compileStatement(stmt: Statement, bytecode: Instruction[]): void {
        switch (stmt.type) {
            case 'AssignmentStatement':
                this.compileExpression(stmt.value, bytecode);
                bytecode.push({ 
                    opcode: OpCode.STORE_VAR, 
                    operand: stmt.variable 
                });
                break;
            // ... 他のステートメント
        }
    }
    
    private compileExpression(expr: Expression, bytecode: Instruction[]): void {
        switch (expr.type) {
            case 'NumericLiteral':
                bytecode.push({ 
                    opcode: OpCode.PUSH_IMM, 
                    operand: expr.value 
                });
                break;
            case 'BinaryExpression':
                this.compileExpression(expr.left, bytecode);
                this.compileExpression(expr.right, bytecode);
                bytecode.push({ opcode: this.getOpCodeForOperator(expr.operator) });
                break;
            // ... 他の式
        }
    }
}
```

#### 5. VM実行ループ

```typescript
class WorkerScriptVM {
    *run(): Generator<void, void, unknown> {
        while (this.pc < this.bytecode.length) {
            const instruction = this.bytecode[this.pc];
            
            switch (instruction.opcode) {
                case OpCode.PUSH_IMM:
                    this.stack.push(instruction.operand as number);
                    break;
                
                case OpCode.ADD:
                    const b = this.stack.pop()!;
                    const a = this.stack.pop()!;
                    this.stack.push(a + b);
                    break;
                
                case OpCode.STORE_VAR:
                    const value = this.stack.pop()!;
                    this.variables.set(instruction.operand as string, value);
                    break;
                
                case OpCode.YIELD:
                    yield; // 制御を返す（協調的マルチタスク）
                    break;
                
                case OpCode.HALT:
                    return; // プログラム終了
                
                // ... 他の命令
            }
            
            this.pc++;
        }
    }
}
```

---

## 📊 現在の実装 vs VM実装の比較

| 項目 | 現在（ASTインタプリタ） | VM実装 |
|------|------------------------|---------|
| **実行速度** | 🟡 中程度 | ✅ 高速 |
| **メモリ使用量** | 🟡 AST保持が必要 | ✅ バイトコードは軽量 |
| **デバッグ** | ✅ ASTで直感的 | 🟡 バイトコード解読必要 |
| **拡張性** | 🟡 AST変更が必要 | ✅ 命令追加が容易 |
| **最適化** | ❌ 限定的 | ✅ 最適化パス追加可能 |
| **実装複雑度** | ✅ シンプル | 🟡 コンパイラ追加が必要 |

---

## 🚀 実装ロードマップ

### Phase 1: プロトタイプ実装（2-3日）
1. 基本的な命令セット定義（20命令程度）
2. シンプルなコンパイラ実装（式と代入のみ）
3. VM実行ループ実装
4. 既存テストで動作確認

### Phase 2: 機能完全実装（1週間）
1. すべてのステートメントをサポート
2. 制御フロー（GOTO、GOSUB、IF、FOR、WHILE）
3. システム関数（PEEK、POKE、LOG）
4. エラーハンドリング

### Phase 3: 最適化（1週間）
1. 定数畳み込み
2. デッドコード除去
3. ジャンプ最適化
4. パフォーマンステスト

### Phase 4: 拡張機能（オプション）
1. バイトコードのシリアライズ/デシリアライズ
2. デバッガサポート
3. プロファイラ
4. JITコンパイル（将来）

---

## 📚 推奨リソース

### 書籍
1. **"Crafting Interpreters"** by Robert Nystrom
   - https://craftinginterpreters.com/
   - 第2部: バイトコードインタプリタ実装
   - 完全無料、オンラインで読める

2. **"Virtual Machine Design and Implementation in C/C++"** by Bill Blunden
   - スタックベースVMの詳細な解説

3. **"Game Scripting Mastery"** by Alex Varanese
   - ゲーム用スクリプトVMの実装

### オンラインリソース
1. **Write your Own Virtual Machine**
   - https://justinmeiners.github.io/lc3-vm/
   - C言語でLC-3 VMを実装するチュートリアル

2. **Simple Virtual Machine in TypeScript**
   - https://github.com/JoshuaWise/varstruct
   - TypeScriptでのVM実装例

3. **Python's Bytecode**
   - https://docs.python.org/3/library/dis.html
   - Pythonバイトコードの仕組み

---

## 💡 推奨事項

### 短期（現在の実装改善）
1. ✅ 現在のASTインタプリタを維持
2. ✅ パフォーマンスボトルネックを特定
3. ✅ Map-basedディスパッチの活用（既に実装済み）

### 中期（VM実装）
1. 🎯 シンプルなスタックベースVMを実装
2. 🎯 ASTからバイトコードへのコンパイラを追加
3. 🎯 既存の協調的マルチタスク機能を維持
4. 🎯 後方互換性を保つ

### 長期（拡張機能）
1. 🚀 最適化パスの追加
2. 🚀 デバッガサポート
3. 🚀 WASMへのコンパイル検討
4. 🚀 JITコンパイルの調査

---

## 📝 サンプル実装

### 簡単な例: `A = 5 + 3`

**ソースコード**:
```
A = 5 + 3
```

**AST** (現在):
```javascript
{
  type: 'AssignmentStatement',
  variable: 'A',
  value: {
    type: 'BinaryExpression',
    operator: '+',
    left: { type: 'NumericLiteral', value: 5 },
    right: { type: 'NumericLiteral', value: 3 }
  }
}
```

**バイトコード** (VM実装):
```
PUSH_IMM 5      ; スタックに5をプッシュ
PUSH_IMM 3      ; スタックに3をプッシュ
ADD             ; 5 + 3 = 8をスタックにプッシュ
STORE_VAR A     ; スタックトップ(8)を変数Aに格納
YIELD           ; 制御を返す
```

**実行トレース**:
```
命令           | スタック | 変数
--------------|---------|-----
PUSH_IMM 5    | [5]     | {}
PUSH_IMM 3    | [5,3]   | {}
ADD           | [8]     | {}
STORE_VAR A   | []      | {A:8}
YIELD         | []      | {A:8}
```

---

## 🎯 結論

**推奨**: **シンプルなスタックベースVM**を実装する

**理由**:
1. WorkerScriptの言語仕様（シンプル、変数26個、整数のみ）に最適
2. 実装が直感的で保守しやすい
3. 将来の拡張（最適化、デバッガ）に対応しやすい
4. 教育的価値が高い（スタックVMの仕組みを学べる）
5. CHIP-8、Forth、Pythonなど多くの参考実装がある

**次のステップ**:
1. "Crafting Interpreters" 第2部を読む（無料）
2. 基本的な命令セット（20命令）を定義
3. プロトタイプを実装（2-3日）
4. 既存テストで動作確認

このVMを実装すれば、WorkerScriptの実行速度が向上し、将来的なWASMコンパイルなどの拡張も容易になります。
