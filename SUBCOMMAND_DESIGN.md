# CLIサブコマンド設計案

## 現状の問題

オプションが16個以上あり、典型的なユースケースで毎回多くのオプションを指定する必要がある：
```bash
# バウンシングボールを実行するために必要なコマンド
npm run cli -- examples/bouncing_ball.ws --realtime --show-grid --fps 15 --steps-per-frame 1 --verbose 2> log.txt
```

## サブコマンド設計

### 1. `run` - 通常実行（デフォルト）
```bash
npm run cli run <script.ws> [options]
npm run cli <script.ws>  # subcommand省略可
```

**デフォルト設定:**
- 最大ステップ数: 100000
- 静粛モード: OFF
- デバッグ: OFF

**オプション:**
- `-v, --verbose`: 詳細ログ
- `-d, --debug`: デバッグ情報
- `-q, --quiet`: 静粛モード
- `-u, --unlimited`: 無制限実行
- `-m, --max-steps N`: 最大ステップ数
- `-o, --output FILE`: 出力ファイル
- `--no-grid`: グリッド表示を抑制（テキスト出力のみ）✅ **実装済み（2025-10-20）**

**例:**
```bash
npm run cli run examples/hello.ws
npm run cli run examples/mandelbrot.ws --debug --verbose
npm run cli run examples/script.ws --no-grid  # グリッド表示なし
```

---

### 2. `exec` - テキスト出力専用実行 ✨ NEW
```bash
npm run cli exec <script.ws> [options]
```

**コンセプト:**  
汎用スクリプトランナーとして、他のツールとのパイプライン処理に最適。グリッド表示を完全に抑制し、テキスト出力のみを提供。

**デフォルト設定:**
- noGrid: ON ✅（グリッド表示なし）
- quiet: OFF（進捗は表示）
- verbose: OFF
- 最大ステップ数: 100000

**オプション:**
- `-v, --verbose`: 詳細ログ
- `-q, --quiet`: 静粛モード
- `-u, --unlimited`: 無制限実行
- `-m, --max-steps N`: 最大ステップ数
- `-o, --output FILE`: 出力ファイル

**ユースケース:**
- Unix/Linuxコマンドとのパイプライン
- 自動化スクリプト
- CI/CDパイプライン
- テキストベースの処理

**例:**
```bash
# 単純実行
npm run cli exec examples/hello.ws

# パイプライン処理
npm run cli exec examples/data_processor.ws | grep "result"

# 出力をファイルに保存
npm run cli exec examples/generator.ws > output.txt

# 他のコマンドと組み合わせ
npm run cli exec examples/json_gen.ws | jq '.data'
```

---

### 3. `debug` - デバッグ実行
```bash
npm run cli debug <script.ws>
```

**デフォルト設定:**
- verbose: ON
- debug: ON
- 最大ステップ数: 10000（少なめ）
- 出力: stderr（自動的に分離）

**追加オプション:**
- `--max-steps N`: デバッグ用ステップ数制限
- `-o, --output FILE`: トランスクリプト保存先

**例:**
```bash
npm run cli debug examples/test.ws
npm run cli debug examples/broken.ws --max-steps 100
```

---

### 4. `watch` - リアルタイム監視モード
```bash
npm run cli watch <script.ws> [options]
```

**デフォルト設定:**
- realtime: ON
- show-grid: ON
- split-screen: ON
- fps: 30
- steps-per-frame: 1000
- verbose: ON（トランスクリプト表示）

**オプション:**
- `--fps N`: フレームレート（デフォルト: 30）
- `--steps N`: 1フレームあたりステップ数（デフォルト: 1000）
- `--grid-size N`: グリッドサイズ（デフォルト: 20）
- `--no-transcript`: トランスクリプト非表示
- `--show-fps`: FPS表示
- `--no-grid`: グリッド表示を抑制 ✅ **実装済み（2025-10-20）**

**例:**
```bash
npm run cli watch examples/mandelbrot.ws
npm run cli watch examples/complex.ws --fps 10 --steps 100
npm run cli watch examples/game.ws --show-fps
npm run cli watch examples/script.ws --no-grid  # トランスクリプトのみ表示
```

---

### 5. `text` - テキストベースゲーム/対話処理モード ✨ NEW
```bash
npm run cli text <script.ws> [options]
```

**コンセプト:**  
テキストベースのインタラクティブゲーム、対話型アプリケーション向け。グリッドなしでテキスト出力をリアルタイム更新。ASCII/ANSIアートゲーム、テキストアドベンチャー、対話型シミュレーションに最適。

**デフォルト設定:**
- realtime: ON
- noGrid: ON ✅（グリッド表示なし）
- split-screen: OFF
- verbose: ON（テキスト出力表示）
- fps: 30（滑らかな更新）
- steps-per-frame: 1（応答性重視）

**オプション:**
- `--fps N`: フレームレート（デフォルト: 30）
- `--steps N`: 1フレームあたりステップ数（デフォルト: 1）
- `--show-fps`: FPS表示
- `--no-transcript`: トランスクリプト非表示

**ユースケース:**
- テキストベースのゲーム（ローグライク、テキストアドベンチャー）
- 対話型ストーリー
- ASCII/ANSIアートアニメーション
- テキストUIのプロトタイプ開発
- チャットボット風のインタラクション

**例:**
```bash
# テキストアドベンチャーゲーム
npm run cli text examples/adventure.ws

# ASCIIアニメーション
npm run cli text examples/ascii_art.ws --fps 60

# 対話型シミュレーション
npm run cli text examples/dialogue.ws --steps 10

# ローグライクゲーム
npm run cli text examples/roguelike.ws --fps 15
```

---

### 6. `play` - インタラクティブゲームモード
```bash
npm run cli play <script.ws> [options]
```

**デフォルト設定:**
- realtime: ON
- show-grid: ON
- split-screen: OFF（ゲーム画面のみ）
- fps: 15（ゲーム向け）
- steps-per-frame: 1（応答性重視）
- verbose: ON（終了時トランスクリプト表示）

**オプション:**
- `--fps N`: フレームレート（デフォルト: 15）
- `--steps N`: 1フレームあたりステップ数（デフォルト: 1）
- `--char-mode`: カラーテキスト表示
- `--grid-size N`: ゲームフィールドサイズ
- `--show-fps`: FPS表示

**例:**
```bash
npm run cli play examples/bouncing_ball.ws
npm run cli play examples/snake.ws --fps 10
npm run cli play examples/game80.ws --char-mode --grid-size 40
```

---

### 7. `repl` - インタラクティブモード
```bash
npm run cli repl
npm run cli -i  # 短縮形
```

**設定:**
- interactive: ON
- 即座に実行
- デバッグ情報表示

**例:**
```bash
npm run cli repl
npm run cli -i
```

---

### 8. `bench` - ベンチマークモード（新規）
```bash
npm run cli bench <script.ws> [options]
```

**デフォルト設定:**
- unlimited: ON
- quiet: ON（進捗表示なし）
- 実行時間計測
- 統計情報表示

**オプション:**
- `--iterations N`: 実行回数（デフォルト: 1）
- `--max-steps N`: 最大ステップ数制限
- `-v, --verbose`: 詳細統計

**例:**
```bash
npm run cli bench examples/mandelbrot.ws
npm run cli bench examples/sort.ws --iterations 10
```

---

## 実装方針

### CLI構造
```typescript
// サブコマンドの型定義
type Subcommand = 'run' | 'exec' | 'debug' | 'watch' | 'text' | 'play' | 'repl' | 'bench';

interface SubcommandConfig {
    name: Subcommand;
    description: string;
    defaults: Partial<CLIOptions>;
    availableOptions: string[];
}

// プリセット定義
const SUBCOMMANDS: Record<Subcommand, SubcommandConfig> = {
    run: { /* ... */ },
    exec: { /* ... */ },  // ✨ NEW: テキスト出力専用
    debug: { /* ... */ },
    watch: { /* ... */ },
    text: { /* ... */ },  // ✨ NEW: テキストゲーム/対話処理
    play: { /* ... */ },
    repl: { /* ... */ },
    bench: { /* ... */ },
};
```

### ヘルプ表示の改善
```bash
$ npm run cli --help

WorkerScript CLI - Grid Worker スクリプト実行環境

使用方法:
  npm run cli <subcommand> <script.ws> [options]
  npm run cli <script.ws> [options]  # runサブコマンド省略可

サブコマンド:
  run       通常実行（デフォルト）
  exec      テキスト出力専用（パイプライン向け）✨ NEW
  debug     デバッグ実行（詳細ログ + デバッグ情報）
  watch     リアルタイム監視（分割画面 + グリッド + トランスクリプト）
  text      テキストゲーム/対話処理（グリッドなしリアルタイム）✨ NEW
  play      グリッドゲームモード（高応答性 + グリッド表示）
  repl      インタラクティブモード（REPL）
  bench     ベンチマーク実行（統計情報表示）

詳細: npm run cli <subcommand> --help
```

### 後方互換性

既存のコマンドは引き続き動作：
```bash
# 従来の方法（引き続き動作）
npm run cli examples/hello.ws --debug --verbose

# 新しい方法（同等）
npm run cli debug examples/hello.ws
```

---

## 移行計画

### Phase 1: サブコマンド実装
1. `parseSubcommand()` 関数追加
2. プリセット定義追加
3. オプションマージロジック実装

### Phase 2: ヘルプ改善
1. サブコマンド別ヘルプ
2. 使用例の追加
3. README更新

### Phase 3: テスト
1. 各サブコマンドの動作確認
2. オプション上書きテスト
3. 後方互換性テスト

---

## 実装後の使用例比較

### Before（現在）
```bash
# デバッグ実行
npm run cli -- examples/test.ws --debug --verbose

# リアルタイム監視
npm run cli -- examples/mandelbrot.ws --realtime --show-grid --split-screen --verbose

# ゲーム実行
npm run cli -- examples/bouncing_ball.ws --realtime --show-grid --fps 15 --steps-per-frame 1 --verbose 2> transcript.log

# ベンチマーク
npm run cli -- examples/sort.ws --unlimited --quiet

# ✅ 新機能（2025-10-20実装済み）: グリッド表示なし
npm run cli -- examples/script.ws --no-grid
npm run cli -- examples/script.ws --realtime --no-grid  # リアルタイムでもグリッド非表示
```

### After（サブコマンド導入後）
```bash
# デバッグ実行
npm run cli debug examples/test.ws

# リアルタイム監視
npm run cli watch examples/mandelbrot.ws

# グリッドゲーム実行
npm run cli play examples/bouncing_ball.ws 2> transcript.log

# ベンチマーク
npm run cli bench examples/sort.ws

# ✨ NEW: テキスト出力専用（パイプライン処理）
npm run cli exec examples/data_processor.ws | grep "result"
npm run cli exec examples/generator.ws > output.txt

# ✨ NEW: テキストゲーム/対話処理
npm run cli text examples/adventure.ws
npm run cli text examples/ascii_art.ws --fps 60

# ✅ 実装済み: グリッド表示なし（既存サブコマンドでも利用可能）
npm run cli run examples/script.ws --no-grid
npm run cli watch examples/script.ws --no-grid
```

**大幅に簡潔になり、意図が明確に！**

---

## 📊 サブコマンド比較表

| サブコマンド | ランナー | Grid表示 | リアルタイム | FPS | Steps/Frame | 主な用途 |
|----------|---------|---------|------------|-----|-------------|---------|
| `run` | CLI | ✅ 表示 | ❌ | - | - | 通常実行・確認用 |
| `exec` ✨ | CLI | ❌ 非表示 | ❌ | - | - | **汎用処理・パイプライン** |
| `debug` | CLI | ✅ 表示 | ❌ | - | - | デバッグ・問題解析 |
| `watch` | RealTime | ✅ 表示 | ✅ | 30 | 1000 | グリッドのリアルタイム監視 |
| `text` ✨ | RealTime | ❌ 非表示 | ✅ | 30 | 1 | **テキストゲーム・対話処理** |
| `play` | RealTime | ✅ 表示 | ✅ | 15 | 1 | グリッドベースゲーム |
| `repl` | CLI | - | ❌ | - | - | インタラクティブ開発 |
| `bench` | CLI | ❌ 非表示 | ❌ | - | - | パフォーマンス測定 |

### 🎯 用途別の選択ガイド

**グリッド表示が必要な場合:**
- 通常実行 → `run`
- デバッグ → `debug`
- リアルタイム監視 → `watch`
- グリッドゲーム → `play`

**グリッド表示が不要な場合:**
- パイプライン処理 → `exec` ✨
- テキストゲーム/対話処理 → `text` ✨
- ベンチマーク → `bench`

**または既存サブコマンドに `--no-grid` オプションを追加:**
```bash
npm run cli run examples/script.ws --no-grid
npm run cli watch examples/script.ws --no-grid
```

---

## 📝 実装済み機能（2025-10-20）

### `--no-grid` オプション ✅

**説明:**  
グリッド表示を抑制し、テキスト出力（トランスクリプト）のみを表示します。汎用ランナーとして使用する際に便利です。

**対応状況:**
- ✅ `run` サブコマンド（通常実行）
- ✅ `watch` サブコマンド（リアルタイム監視）

**実装詳細:**
- `src/cli.ts`: `CLIOptions.noGrid` 追加
- `src/cliRunner.ts`: `CLIRunnerConfig.noGrid` 追加
- `src/realtime/RealTimeCLIRunner.ts`: `RealTimeCLIRunnerConfig.noGrid` 追加

**優先順位:**
```
--no-grid > --show-grid > デフォルト
```

**使用例:**
```bash
# 通常実行でグリッドを非表示
npm run cli -- examples/hello.ws --no-grid

# リアルタイムモードでグリッドを非表示（トランスクリプトのみ）
npm run cli -- examples/mandelbrot.ws --realtime --no-grid

# サブコマンド導入後（将来）
npm run cli run examples/hello.ws --no-grid
npm run cli watch examples/mandelbrot.ws --no-grid
```

**テスト結果:**
- ✅ 全252テストパス
- ✅ ESLint警告76件（変化なし）
- ✅ 通常モード・リアルタイムモード両方で動作確認

**関連ドキュメント:**
- `GENERIC_RUNNER_COVERAGE.md`: 汎用ランナー構想とカバレッジ分析（95%達成）
- `GENERIC_RUNNER_PLAN.md`: 汎用ランナー実装計画
