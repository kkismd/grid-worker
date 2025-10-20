# WorkerScript汎用スクリプト実行環境 実装プラン

## 📋 概要

Grid機能を持たない汎用のWorkerScriptランナーを実装し、NodeJSでのスクリプト実行環境を提供する。

**策定日**: 2025年10月初旬  
**最終更新**: 2025年10月20日

## 📌 実装状況

### ✅ 完了済み（リアルタイムランナー優先開発）

当初の2本柱構想（汎用ランナー + リアルタイムランナー）のうち、**リアルタイムランナーを先行実装**しました。

**実装済み機能**:
- ✅ リアルタイムモード実行環境（`RealTimeCLIRunner`）
- ✅ 非同期キーボード入力対応（`KeyboardInput`）
- ✅ グリッド差分レンダリング（`GridDiffRenderer`）
- ✅ 分割画面表示（`SplitScreenRenderer`）
- ✅ キャラクターVRAMモード（`CharacterVRAMRenderer`）
- ✅ フレームレート制御、FPS表示、ステップ制御

**現在のディレクトリ構造**:
```
src/
├── workerInterpreter.ts     # 言語コア
├── cliRunner.ts            # CLIRunner（Grid機能付き）
├── cli.ts                  # メインCLIエントリーポイント
├── gridRenderer.ts         # Grid表示機能
├── realtime/               # リアルタイムモード（新規追加）
│   ├── RealTimeCLIRunner.ts
│   ├── KeyboardInput.ts
│   ├── GridDiffRenderer.ts
│   ├── SplitScreenRenderer.ts
│   └── CharacterVRAMRenderer.ts
└── memorySpace.ts          # メモリ空間管理
```

### 🔲 未実装（汎用ランナー）

以下の計画は**まだ実装されていません**：
- ⬜ 汎用ScriptRunner（Grid機能なし、ダミーPOKE/PEEK）
- ⬜ BaseRunner抽象クラス（共通化基盤）
- ⬜ `runners/`ディレクトリ構造への移行
- ⬜ `script-cli.ts`（汎用版CLIエントリーポイント）

## 🎯 目標

- **コア単純性保持**: WorkerInterpreterへの影響を最小限に抑制
- **Web版影響なし**: 既存のブラウザ版実装に一切影響を与えない
- **実装明解性**: 責任分離による分かりやすいアーキテクチャ
- **将来拡張性**: NodeJS固有機能の追加を容易にする

## 🏗️ アーキテクチャ設計

### 当初の構造（計画策定時）
```
src/
├── workerInterpreter.ts     # 言語コア
├── cliRunner.ts            # Grid機能付きRunner（プロトタイプ）
├── cli.ts                  # Grid版CLIエントリーポイント
└── gridRenderer.ts         # Grid表示機能
```

### 現在の構造（2025年10月20日）
```
src/
├── workerInterpreter.ts     # 言語コア
├── cliRunner.ts            # CLIRunner（Grid機能付き）
├── cli.ts                  # メインCLIエントリーポイント
├── gridRenderer.ts         # Grid表示機能
├── memorySpace.ts          # メモリ空間管理
└── realtime/               # リアルタイムモード（✅ 実装済み）
    ├── RealTimeCLIRunner.ts      # リアルタイム実行環境
    ├── KeyboardInput.ts          # キーボード入力
    ├── GridDiffRenderer.ts       # グリッド差分レンダリング
    ├── SplitScreenRenderer.ts    # 分割画面表示
    └── CharacterVRAMRenderer.ts  # キャラクターVRAM
```

### 目標構造（汎用ランナー実装後）
```
src/
├── workerInterpreter.ts     # 言語コア（変更なし）
├── runners/                 # ランナー統合ディレクトリ（🔲 未実装）
│   ├── baseRunner.ts        # 共通Runner基底クラス（🔲 未実装）
│   ├── gridRunner.ts        # Grid機能付きRunner（現cliRunnerをリファクタ）
│   └── scriptRunner.ts      # 汎用ScriptRunner（🔲 未実装）
├── realtime/                # リアルタイムモード（✅ 実装済み）
│   ├── RealTimeCLIRunner.ts
│   ├── KeyboardInput.ts
│   ├── GridDiffRenderer.ts
│   ├── SplitScreenRenderer.ts
│   └── CharacterVRAMRenderer.ts
├── cli.ts                  # Grid版CLI（gridRunner使用に移行予定）
├── script-cli.ts           # 汎用版CLI（🔲 未実装、scriptRunner使用）
├── gridRenderer.ts         # Grid表示機能（変更なし）
└── memorySpace.ts          # メモリ空間管理（変更なし）
```

## 🔧 実装戦略

### 1. POKE/PEEKダミー実装方式

**方針**: WorkerInterpreterコアを変更せず、POKE/PEEK操作をダミーメモリで処理

**利点**:
- ✅ WorkerInterpreterへの影響ゼロ
- ✅ 既存APIとの完全互換性
- ✅ Grid版からの段階的移行が可能
- ✅ POKE/PEEKを使うスクリプトがエラーにならない

**実装詳細**:
```typescript
class ScriptRunner {
    private dummyMemory: number[] = new Array(10000).fill(0);
    
    private peekDummy = (index: number): number => {
        return this.dummyMemory[index % 10000] || 0;
    }
    
    private pokeDummy = (x: number, y: number, value: number): void => {
        const index = ((x % 100) * 100 + (y % 100));
        this.dummyMemory[index] = value & 0xFF;
        
        if (this.config.verbose) {
            console.log(`[POKE] (${x},${y}) = ${value} [汎用版では表示されません]`);
        }
    }
}
```

### 2. 共通基底クラス設計

**BaseRunner抽象クラス**:
- 共通設定管理（CLIRunnerConfig）
- エラーハンドリング
- ログ出力機能
- スクリプト実行制御

**GridRunner（既存CLIRunnerをリファクタ）**:
- Grid表示機能
- 実際のPOKE/PEEK操作
- ASCII Grid レンダリング

**ScriptRunner（新規実装）**:
- ダミーPOKE/PEEK実装
- 汎用スクリプト実行
- NodeJS固有機能の拡張ポイント

## 📝 実装手順

### ✅ 完了: リアルタイムランナー先行実装（2025年10月）

当初の計画では汎用ランナーを先に実装する予定でしたが、**リアルタイムランナーを優先実装**しました。

**実装内容**:
1. **リアルタイム実行環境**（`realtime/RealTimeCLIRunner.ts`）
   - フレームレート制御（デフォルト30fps）
   - ステップ制御（1フレームあたりのステップ数設定可能）
   - FPS表示機能

2. **キーボード入力対応**（`realtime/KeyboardInput.ts`）
   - 非同期キー入力処理
   - rawモード対応
   - 1文字入力（`$`演算子）のノンブロッキング実装

3. **グリッド表示機能**（`realtime/`）
   - 差分レンダリング（`GridDiffRenderer.ts`）
   - 分割画面表示（`SplitScreenRenderer.ts`）
   - キャラクターVRAMモード（`CharacterVRAMRenderer.ts`）

4. **CLIオプション拡張**
   - `--realtime`, `--fps`, `--steps-per-frame`
   - `--show-grid`, `--split-screen`, `--char-mode`
   - `--show-fps`, `--grid-size`

### 🔲 未実装: 汎用ランナー実装（今後の計画）

以下の手順で汎用ランナーを実装予定：

#### Phase 1: リファクタリング準備
1. **共通インターフェース抽出**
   - `RunnerConfig` インターフェース定義
   - `BaseRunner` 抽象クラス作成

2. **ディレクトリ構造整備**
   - `src/runners/` ディレクトリ作成
   - 既存ファイルの移動準備

#### Phase 2: GridRunner分離
1. **既存CLIRunnerの移動**
   - `cliRunner.ts` → `runners/gridRunner.ts`
   - BaseRunnerを継承する形にリファクタ

2. **既存CLIの更新**
   - `cli.ts`でGridRunnerを使用するよう修正
   - インポートパスの更新

#### Phase 3: ScriptRunner実装
1. **ScriptRunnerクラス作成**
   - BaseRunnerを継承
   - ダミーPOKE/PEEK実装
   - 汎用スクリプト実行機能

2. **新CLIエントリーポイント作成**
   - `script-cli.ts` 実装
   - コマンドライン引数解析
   - ScriptRunnerとの連携

#### Phase 4: パッケージ統合
1. **package.json更新**
   - 新しいCLIコマンド追加: `"script": "tsx src/script-cli.ts"`
   - スクリプトエントリーポイント定義

2. **ドキュメント更新**
   - CLI.mdに汎用版の説明追加
   - 使用例とサンプル提供

## 🎯 新CLIコマンド仕様

### 現在のコマンド（2025年10月20日）
```bash
# メインCLI（Grid機能付き + リアルタイムモード対応）
npm run cli -- script.ws

# 汎用版CLI（🔲 未実装）
npm run script -- script.ws
```

### 現在実装済みのオプション
```bash
# 共通オプション
--debug, -d      : デバッグモード
--verbose, -v    : 詳細出力
--quiet, -q      : 静寂モード（進捗表示無効化）
--unlimited, -u  : 無制限実行
--max-steps N    : 最大ステップ数指定
--output, -o     : 結果をファイルに出力
--interactive, -i: インタラクティブ（REPL）モード

# リアルタイムモード専用（✅ 実装済み）
--realtime, -r        : リアルタイムモード
--fps N               : フレームレート指定（デフォルト: 30）
--steps-per-frame N   : 1フレームあたりの実行ステップ数（デフォルト: 1000）
--show-fps            : FPS表示を有効化
--show-grid, -g       : グリッド表示を有効化
--split-screen, -s    : 上下分割画面表示
--char-mode, -c       : キャラクターVRAMモード
--grid-size N         : グリッド表示サイズ指定

# 汎用版専用（🔲 未実装）
--memory-dump    : 実行後にダミーメモリの状態を表示
--node-features  : NodeJS固有機能の有効化（将来拡張用）
```

### 計画中のコマンド構成（汎用ランナー実装後）
```bash
# Grid版（既存）
npm run cli -- script.ws

# 汎用版（新規）
npm run script -- script.ws
```

## 📊 入出力仕様


### 汎用版出力
```
TinyBasicマンデルブロ開始
222222222222222333333333333344444567D9F 544433...
```
※テキスト出力のみ、グリッド表示なし
すべてstdoutに出力される想定

文字列出力
```
?="aaa"
```

数値出力
```
?=A
```

改行出力
```
/
```

1文字出力
```
$='x'
```

### 汎用版入力

すべて標準入力から入力される想定

数値入力（入力待ちあり、エコーバックあり、リターンで確定）
入力された値がparseInt()で解釈できない場合の返り値は -1 （要検討）
```
A=?
```

1文字入力（ノンブロッキング、エコーバックなし、カーソル表示なし）
キー入力がない場合の返り値は 0
```
A=$
```