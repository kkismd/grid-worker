# CLI Runnerデバッグ機能 - 使用方法

## 概要

CLI Runnerのインタラクティブデバッグ機能により、WorkerScriptプログラムをステップ実行しながら、変数の状態やグリッドの内容を確認できます。

## 基本的な使い方

### デバッグセッションの開始

```bash
# 基本的なデバッグ実行
npm run cli breakpoint examples/test.ws

# 特定の行にブレークポイントを設定
npm run cli breakpoint examples/test.ws --break-at 2,5,10

# プログラム開始時に即座にブレーク
npm run cli breakpoint examples/test.ws --break-on-start

# ステップモードで開始（各ステートメントで自動停止）
npm run cli breakpoint examples/test.ws --step-mode
```

### オプション

| オプション | 短縮形 | 説明 | デフォルト |
|-----------|--------|------|-----------|
| `--break-at <lines>` | `-b <lines>` | カンマ区切りの行番号リスト | なし |
| `--break-on-start` | - | 最初のステートメント前にブレーク | false |
| `--step-mode` | - | ステップモードで開始 | false |
| `--context <n>` | - | 現在行の前後n行を表示 | 2 |
| `--unlimited` | `-u` | ステップ数無制限 | true（自動設定）|

## デバッグコマンド

デバッグセッション中に`debug>`プロンプトで以下のコマンドが使用できます。

### 実行制御コマンド

#### continue (c)
次のブレークポイントまで実行を続けます。

```
debug> continue
debug> c
```

**使用例:**
```
debug> c
🟢 Continuing...
🔴 Breakpoint at line 5
```

#### step (s, stepIn)
次のステートメントを実行します（サブルーチン内にも入ります）。

```
debug> step
debug> s
debug> stepIn
```

**使用例:**
```
debug> s
  3 │ A=A+1
▶ 4 │ !(A)
Variables: A=2
```

#### next (n, stepOver)
次のステートメントを実行します（サブルーチン呼び出しは一気に実行）。

```
debug> next
debug> n
debug> stepOver
```

**使用例:**
```
debug> n
  4 │ !=^MYSUB
▶ 5 │ A=A+1
Variables: A=10    (サブルーチン実行後)
```

#### out (o, stepOut)
現在のサブルーチンから抜けるまで実行します。

```
debug> out
debug> o
debug> stepOut
```

**使用例:**
```
debug> o
🟢 Stepping out...
  5 │ #=!
▶ 6 │ ?="Done" /
Call Stack: [] (depth: 0)
```

### ブレークポイント管理コマンド

#### break <line> (b <line>)
指定した行にブレークポイントを追加します。

```
debug> break 10
debug> b 10
```

**使用例:**
```
debug> b 10
✅ Breakpoint added at line 10
Breakpoints: [2, 5, 10]
```

#### delete <line> (d <line>)
指定した行のブレークポイントを削除します。

```
debug> delete 5
debug> d 5
```

**使用例:**
```
debug> d 5
✅ Breakpoint removed from line 5
Breakpoints: [2, 10]
```

#### breakpoints (bl, list-breaks)
設定されているすべてのブレークポイントを表示します。

```
debug> breakpoints
debug> bl
debug> list-breaks
```

**使用例:**
```
debug> bl
Breakpoints (3):
  Line 2
  Line 5
  Line 10
```

#### clear-breaks (bc)
すべてのブレークポイントをクリアします。

```
debug> clear-breaks
debug> bc
```

**使用例:**
```
debug> bc
✅ All breakpoints cleared
```

### 情報表示コマンド

#### print <var> (p <var>)
指定した変数の値を表示します。

```
debug> print A
debug> p A
```

**使用例:**
```
debug> p A
A = 5

debug> p X
X = 10

debug> p Z
Z = 0  (未初期化)
```

#### variables (vars, v)
すべての変数の現在値を表示します。

```
debug> variables
debug> vars
debug> v
```

**使用例:**
```
debug> vars
Variables (5):
  A = 5
  B = 10
  I = 3
  X = 0
  Y = 0
```

#### line (l, where)
現在実行中の行を表示します。

```
debug> line
debug> l
debug> where
```

**使用例:**
```
debug> l
Current line: 3
  2 │ ^LOOP
▶ 3 │ A=A+1
  4 │ !(A)
```

#### list [n] (ls [n])
現在行の前後n行を表示します（nを省略した場合はデフォルト値）。

```
debug> list
debug> list 5
debug> ls 3
```

**使用例:**
```
debug> list 3
  0 │ A=0
  1 │ B=0
  2 │ ^LOOP
▶ 3 │ A=A+1
  4 │ !(A)
  5 │ IF A<10 GOTO ^LOOP
  6 │ HALT
```

#### stack (bt, backtrace)
現在のコールスタックを表示します。

```
debug> stack
debug> bt
debug> backtrace
```

**使用例:**
```
debug> stack
Call Stack (depth: 2):
  #0: line 15 (current)
  #1: line 8  (GOSUB from here)
  #2: line 2  (GOSUB from here)
```

#### grid [size] (g [size])
グリッドの一部を表示します（sizeは表示サイズ、デフォルト: 10）。

```
debug> grid
debug> grid 5
debug> g 20
```

**使用例:**
```
debug> grid 5
Grid (top-left 5x5):
   0 1 2 3 4
  ┌─────────┐
0 │░ . . . .│
1 │. ░ . . .│
2 │. . ░ . .│
3 │. . . ░ .│
4 │. . . . ░│
  └─────────┘

Grid Legend:
  . = 0 (empty)
  ░ = 1-32
  ▒ = 33-96
  ▓ = 97-160
  █ = 161-255
```

### その他のコマンド

#### help (h, ?)
ヘルプメッセージを表示します。

```
debug> help
debug> h
debug> ?
```

#### quit (q, exit)
デバッグセッションを終了します。

```
debug> quit
debug> q
debug> exit
```

**使用例:**
```
debug> q
🛑 Debug session terminated
Final state saved.
```

## 実用例

### 例1: シンプルなループのデバッグ

**スクリプト (examples/loop-debug.ws):**
```workerscript
0 A=0
1 ^LOOP
2 A=A+1
3 !(A)
4 IF A<5 GOTO ^LOOP
5 HALT
```

**デバッグセッション:**
```bash
$ npm run cli breakpoint examples/loop-debug.ws --break-at 2

🔴 Breakpoint at line 2
════════════════════════════════════════
  0 │ A=0
  1 │ ^LOOP
▶ 2 │ A=A+1
  3 │ !(A)
  4 │ IF A<5 GOTO ^LOOP
════════════════════════════════════════
Variables: A=0
Call Stack: [] (depth: 0)
Mode: break

debug> p A
A = 0

debug> s
  2 │ A=A+1
▶ 3 │ !(A)
Variables: A=1

debug> c
1
🔴 Breakpoint at line 2
▶ 2 │ A=A+1
Variables: A=1

debug> c
2
🔴 Breakpoint at line 2
▶ 2 │ A=A+1
Variables: A=2

debug> d 2
✅ Breakpoint removed from line 2

debug> c
3
4
🟢 Program completed
```

### 例2: サブルーチンのデバッグ

**スクリプト (examples/gosub-debug.ws):**
```workerscript
0 A=1
1 B=2
2 !=^ADD
3 !(A)
4 HALT
5 ^ADD
6 A=A+B
7 #=!
```

**デバッグセッション:**
```bash
$ npm run cli breakpoint examples/gosub-debug.ws --break-on-start

🔴 Break at start
▶ 0 │ A=1
  1 │ B=2
  2 │ !=^ADD

debug> s
▶ 1 │ B=2
Variables: A=1

debug> s
▶ 2 │ !=^ADD
Variables: A=1, B=2

debug> s
  (entering subroutine)
▶ 6 │ A=A+B
Call Stack: [2] (depth: 1)

debug> vars
Variables (2):
  A = 1
  B = 2

debug> s
▶ 7 │ #=!
Variables: A=3, B=2

debug> stack
Call Stack (depth: 1):
  #0: line 7 (current)
  #1: line 2 (GOSUB from here)

debug> o
  (stepping out of subroutine)
▶ 3 │ !(A)
Call Stack: [] (depth: 0)

debug> p A
A = 3

debug> c
3
🟢 Program completed
```

### 例3: グリッド操作のデバッグ

**スクリプト (examples/grid-debug.ws):**
```workerscript
0 X=0 Y=0
1 ^LOOP
2 `=255
3 X=X+1 Y=Y+1
4 IF X<5 GOTO ^LOOP
5 HALT
```

**デバッグセッション:**
```bash
$ npm run cli breakpoint examples/grid-debug.ws --break-at 2

🔴 Breakpoint at line 2
▶ 2 │ `=255
Variables: X=0, Y=0

debug> grid 3
Grid (top-left 3x3):
   0 1 2
  ┌─────┐
0 │. . .│
1 │. . .│
2 │. . .│
  └─────┘

debug> s
▶ 3 │ X=X+1 Y=Y+1
Variables: X=0, Y=0

debug> grid 3
Grid (top-left 3x3):
   0 1 2
  ┌─────┐
0 │█ . .│
1 │. . .│
2 │. . .│
  └─────┘

debug> c
🔴 Breakpoint at line 2
▶ 2 │ `=255
Variables: X=1, Y=1

debug> grid 3
Grid (top-left 3x3):
   0 1 2
  ┌─────┐
0 │█ . .│
1 │. █ .│
2 │. . .│
  └─────┘

debug> bc
✅ All breakpoints cleared

debug> c
🟢 Program completed

debug> grid 5
Grid (top-left 5x5):
   0 1 2 3 4
  ┌─────────┐
0 │█ . . . .│
1 │. █ . . .│
2 │. . █ . .│
3 │. . . █ .│
4 │. . . . █│
  └─────────┘

debug> q
```

## トラブルシューティング

### よくある質問

**Q: ブレークポイントが機能しない**
A: 行番号が0-indexedであることを確認してください。スクリプトの最初の行は行0です。

**Q: ステップオーバーとステップインの違いは？**
A: ステップオーバー（`next`）はサブルーチン呼び出しを一気に実行しますが、ステップイン（`step`）はサブルーチン内に入ります。

**Q: 実行中にブレークポイントを追加できますか？**
A: はい、`break <line>`コマンドでいつでも追加できます。

**Q: グリッド表示がおかしい**
A: `--char-mode`と併用している場合、グリッド値が16ビットエンコーディングになっている可能性があります。

### エラーメッセージ

| エラー | 原因 | 解決方法 |
|--------|------|----------|
| `Invalid line number` | 存在しない行番号を指定 | スクリプトの行数を確認 |
| `Variable not found` | 未初期化の変数を参照 | 変数は初回代入時に初期化されます |
| `Unknown command` | 無効なコマンド入力 | `help`でコマンド一覧を確認 |

## 制限事項

1. **リアルタイムモードとの非互換**: `--realtime`オプションとは併用できません
2. **行ベースのブレークポイント**: 同じ行内の複数ステートメントを個別にブレークできません
3. **条件付きブレークポイント**: 現在は未サポート（Phase 3で実装予定）

## 関連ドキュメント

- [cli-debug-design.md](cli-debug-design.md) - 設計ドキュメント
- [CLI.md](../../CLI.md) - CLI全般の使用方法
- [251026-breakpoint-step-execution/](../251026-breakpoint-step-execution/) - WorkerInterpreterのデバッグAPI仕様
