# サブコマンド実装 作業見積もり

**作成日**: 2025年10月20日  
**対象ブランチ**: feature/no-grid-option → 新ブランチ feature/subcommands  
**前提条件**: `--no-grid`オプション実装済み

---

## 📋 実装概要

### 目的
現在の16個以上のオプションを整理し、典型的なユースケースに応じたサブコマンドを導入することで、CLIの使いやすさを向上させる。

### 実装範囲
8つのサブコマンドと、それぞれのプリセット設定を実装する：

1. `run` - 通常実行（デフォルト）
2. `exec` - テキスト出力専用 ✨ NEW
3. `debug` - デバッグ実行
4. `watch` - リアルタイム監視
5. `text` - テキストゲーム/対話処理 ✨ NEW
6. `play` - グリッドゲーム
7. `repl` - インタラクティブモード（既存）
8. `bench` - ベンチマークモード ✨ NEW

---

## 📊 作業分解と見積もり

### Phase 1: 基本構造の実装（2-3時間）

#### 1.1 型定義の追加（30分）
**ファイル**: `src/cli.ts`

**作業内容**:
```typescript
// サブコマンドの型定義
type Subcommand = 'run' | 'exec' | 'debug' | 'watch' | 'text' | 'play' | 'repl' | 'bench';

interface SubcommandConfig {
    name: Subcommand;
    description: string;
    runner: 'cli' | 'realtime';
    defaults: Partial<CLIOptions>;
    availableOptions?: string[];  // 許可するオプション（未指定なら全て許可）
}
```

**難易度**: 🟢 容易  
**リスク**: 低

---

#### 1.2 プリセット定義の実装（1-1.5時間）
**ファイル**: `src/cli.ts`

**作業内容**:
```typescript
const SUBCOMMANDS: Record<Subcommand, SubcommandConfig> = {
    run: {
        name: 'run',
        description: '通常実行（デフォルト）',
        runner: 'cli',
        defaults: {
            // 既存のデフォルト値
        }
    },
    exec: {
        name: 'exec',
        description: 'テキスト出力専用（パイプライン向け）',
        runner: 'cli',
        defaults: {
            noGrid: true,
            quiet: false,
            verbose: false,
            maxSteps: 100000
        }
    },
    debug: {
        name: 'debug',
        description: 'デバッグ実行',
        runner: 'cli',
        defaults: {
            debug: true,
            verbose: true,
            maxSteps: 10000
        }
    },
    watch: {
        name: 'watch',
        description: 'リアルタイム監視',
        runner: 'realtime',
        defaults: {
            realtime: true,
            showGrid: true,
            splitScreen: true,
            verbose: true,
            frameRate: 30,
            stepsPerFrame: 1000
        }
    },
    text: {
        name: 'text',
        description: 'テキストゲーム/対話処理',
        runner: 'realtime',
        defaults: {
            realtime: true,
            noGrid: true,
            splitScreen: false,
            verbose: true,
            frameRate: 30,
            stepsPerFrame: 1
        }
    },
    play: {
        name: 'play',
        description: 'グリッドゲームモード',
        runner: 'realtime',
        defaults: {
            realtime: true,
            showGrid: true,
            splitScreen: false,
            verbose: true,
            frameRate: 15,
            stepsPerFrame: 1
        }
    },
    repl: {
        name: 'repl',
        description: 'インタラクティブモード',
        runner: 'cli',
        defaults: {
            interactive: true
        }
    },
    bench: {
        name: 'bench',
        description: 'ベンチマーク実行',
        runner: 'cli',
        defaults: {
            unlimitedSteps: true,
            quiet: true,
            noGrid: true
        }
    }
};
```

**難易度**: 🟢 容易  
**リスク**: 低  
**注意点**: デフォルト値の調整が必要な場合あり

---

#### 1.3 サブコマンドパーサーの実装（1時間）
**ファイル**: `src/cli.ts`

**作業内容**:
```typescript
function parseSubcommand(args: string[]): {
    subcommand: Subcommand;
    remainingArgs: string[];
} {
    // 第1引数がサブコマンドかチェック
    const firstArg = args[0];
    
    if (firstArg && !firstArg.startsWith('-') && !firstArg.endsWith('.ws')) {
        // サブコマンドの可能性
        const subcommand = firstArg as Subcommand;
        if (SUBCOMMANDS[subcommand]) {
            return {
                subcommand,
                remainingArgs: args.slice(1)
            };
        }
    }
    
    // デフォルトは 'run'
    return {
        subcommand: 'run',
        remainingArgs: args
    };
}

function mergeOptions(
    subcommandDefaults: Partial<CLIOptions>,
    parsedOptions: CLIOptions
): CLIOptions {
    // サブコマンドのデフォルト値と、コマンドラインオプションをマージ
    // コマンドラインオプションが優先
    return {
        ...subcommandDefaults,
        ...parsedOptions
    };
}
```

**難易度**: 🟡 中程度  
**リスク**: 中  
**注意点**: 
- スクリプトファイル（`.ws`）とサブコマンドの区別
- オプションの優先順位（サブコマンドデフォルト < コマンドラインオプション）

---

### Phase 2: ヘルプシステムの改善（1.5-2時間）

#### 2.1 メインヘルプの更新（30分）
**ファイル**: `src/cli.ts`

**作業内容**:
```typescript
function showHelp() {
    console.log(`
WorkerScript CLI - Grid Worker スクリプト実行環境

使用方法:
  npm run cli <subcommand> <script.ws> [options]
  npm run cli <script.ws> [options]  # runサブコマンド省略可

サブコマンド:
  run       通常実行（デフォルト）
  exec      テキスト出力専用（パイプライン向け）
  debug     デバッグ実行（詳細ログ + デバッグ情報）
  watch     リアルタイム監視（分割画面 + グリッド + トランスクリプト）
  text      テキストゲーム/対話処理（グリッドなしリアルタイム）
  play      グリッドゲームモード（高応答性 + グリッド表示）
  repl      インタラクティブモード（REPL）
  bench     ベンチマーク実行（統計情報表示）

詳細: npm run cli <subcommand> --help

オプション:
  -h, --help              このヘルプを表示
  ...（共通オプション一覧）

例:
  npm run cli run examples/hello.ws
  npm run cli exec examples/data.ws | jq
  npm run cli debug examples/test.ws
  npm run cli watch examples/mandelbrot.ws
  npm run cli text examples/adventure.ws
  npm run cli play examples/bouncing_ball.ws
`);
}
```

**難易度**: 🟢 容易  
**リスク**: 低

---

#### 2.2 サブコマンド別ヘルプの実装（1-1.5時間）
**ファイル**: `src/cli.ts`

**作業内容**:
```typescript
function showSubcommandHelp(subcommand: Subcommand) {
    const config = SUBCOMMANDS[subcommand];
    console.log(`
WorkerScript CLI - ${config.description}

使用方法:
  npm run cli ${subcommand} <script.ws> [options]

デフォルト設定:
  ${formatDefaults(config.defaults)}

利用可能なオプション:
  ${formatAvailableOptions(subcommand)}

例:
  ${getExamples(subcommand)}
`);
}

function formatDefaults(defaults: Partial<CLIOptions>): string {
    // デフォルト値を見やすく整形
}

function formatAvailableOptions(subcommand: Subcommand): string {
    // サブコマンドで利用可能なオプションを表示
}

function getExamples(subcommand: Subcommand): string {
    // サブコマンド別の使用例を返す
}
```

**難易度**: 🟡 中程度  
**リスク**: 低  
**注意点**: 各サブコマンドの使用例を適切に準備する必要あり

---

### Phase 3: 統合とテスト（2-3時間）

#### 3.1 main関数の修正（30分）
**ファイル**: `src/cli.ts`

**作業内容**:
```typescript
async function main() {
    const args = process.argv.slice(2);
    
    // サブコマンドをパース
    const { subcommand, remainingArgs } = parseSubcommand(args);
    
    // オプションをパース
    const { options: parsedOptions, scriptFile } = parseArgs(remainingArgs);
    
    // ヘルプ表示（サブコマンド別）
    if (parsedOptions.help) {
        if (subcommand === 'run' && remainingArgs.length === 0) {
            showHelp();  // メインヘルプ
        } else {
            showSubcommandHelp(subcommand);  // サブコマンド別ヘルプ
        }
        process.exit(0);
    }
    
    // サブコマンドのデフォルト値とマージ
    const subcommandConfig = SUBCOMMANDS[subcommand];
    const options = mergeOptions(subcommandConfig.defaults, parsedOptions);
    
    // 既存の実行ロジック
    // ...
}
```

**難易度**: 🟡 中程度  
**リスク**: 中  
**注意点**: 既存の動作に影響を与えないよう注意

---

#### 3.2 手動テスト（1-1.5時間）

**テストケース**:

1. **基本動作テスト**（各サブコマンド x 1例 = 8例）
   ```bash
   npm run cli run examples/hello.ws
   npm run cli exec examples/hello.ws
   npm run cli debug examples/test.ws
   npm run cli watch examples/mandelbrot.ws
   npm run cli text examples/adventure.ws  # 新しいサンプルが必要
   npm run cli play examples/bouncing_ball.ws
   npm run cli repl
   npm run cli bench examples/mandelbrot.ws
   ```

2. **オプション上書きテスト**（3-5例）
   ```bash
   npm run cli exec examples/hello.ws --verbose  # デフォルトはverbose: false
   npm run cli watch examples/mandelbrot.ws --no-grid  # デフォルトはshowGrid: true
   npm run cli text examples/adventure.ws --fps 60  # デフォルトはfps: 30
   ```

3. **後方互換性テスト**（5例）
   ```bash
   # サブコマンドなしの従来の方法
   npm run cli examples/hello.ws
   npm run cli -- examples/hello.ws --debug --verbose
   npm run cli -- examples/mandelbrot.ws --realtime --show-grid
   npm run cli --interactive
   npm run cli -- examples/script.ws --no-grid
   ```

4. **ヘルプ表示テスト**（9例）
   ```bash
   npm run cli --help
   npm run cli run --help
   npm run cli exec --help
   npm run cli debug --help
   npm run cli watch --help
   npm run cli text --help
   npm run cli play --help
   npm run cli repl --help
   npm run cli bench --help
   ```

**難易度**: 🟡 中程度  
**リスク**: 中  
**注意点**: 既存の動作が壊れていないか確認

---

#### 3.3 自動テストの追加（30-60分）

**ファイル**: `src/__tests__/cli.test.ts`（新規作成）

**作業内容**:
```typescript
describe('Subcommand parsing', () => {
    test('should parse run subcommand', () => {
        // ...
    });
    
    test('should default to run when no subcommand', () => {
        // ...
    });
    
    test('should parse exec subcommand', () => {
        // ...
    });
    
    // 各サブコマンドのテスト
});

describe('Options merging', () => {
    test('should merge subcommand defaults with parsed options', () => {
        // ...
    });
    
    test('should prioritize command-line options over defaults', () => {
        // ...
    });
});

describe('Backward compatibility', () => {
    test('should work without subcommand', () => {
        // ...
    });
    
    test('should handle --interactive flag', () => {
        // ...
    });
});
```

**難易度**: 🟡 中程度  
**リスク**: 低  
**注意点**: parseSubcommand, mergeOptions 関数をエクスポートする必要あり

---

### Phase 4: ドキュメント更新（1時間）

#### 4.1 README.md更新（30分）

**作業内容**:
- サブコマンドの使用方法を追加
- 使用例を更新
- 従来の方法も残す（後方互換性）

**難易度**: 🟢 容易  
**リスク**: 低

---

#### 4.2 SUBCOMMAND_DESIGN.md更新（30分）

**作業内容**:
- 実装状況セクションを追加
- 実装完了マーク（✅）を追加
- 実装時の変更点や注意事項を記録

**難易度**: 🟢 容易  
**リスク**: 低

---

## 📈 総合見積もり

| Phase | 作業内容 | 見積もり時間 | 難易度 | リスク |
|-------|---------|------------|--------|--------|
| Phase 1.1 | 型定義の追加 | 30分 | 🟢 容易 | 低 |
| Phase 1.2 | プリセット定義 | 1-1.5時間 | 🟢 容易 | 低 |
| Phase 1.3 | サブコマンドパーサー | 1時間 | 🟡 中程度 | 中 |
| Phase 2.1 | メインヘルプ更新 | 30分 | 🟢 容易 | 低 |
| Phase 2.2 | サブコマンド別ヘルプ | 1-1.5時間 | 🟡 中程度 | 低 |
| Phase 3.1 | main関数修正 | 30分 | 🟡 中程度 | 中 |
| Phase 3.2 | 手動テスト | 1-1.5時間 | 🟡 中程度 | 中 |
| Phase 3.3 | 自動テスト追加 | 30-60分 | 🟡 中程度 | 低 |
| Phase 4.1 | README.md更新 | 30分 | 🟢 容易 | 低 |
| Phase 4.2 | SUBCOMMAND_DESIGN.md更新 | 30分 | 🟢 容易 | 低 |
| **合計** | **全体** | **7-10時間** | **🟡 中程度** | **中** |

---

## 🎯 推奨実装スケジュール

### 1日目（3-4時間）
- Phase 1: 基本構造の実装（2-3時間）
- 動作確認（1時間）

### 2日目（3-4時間）
- Phase 2: ヘルプシステムの改善（1.5-2時間）
- Phase 3.1: main関数の修正（30分）
- Phase 3.2: 手動テスト（1-1.5時間）

### 3日目（1-2時間）
- Phase 3.3: 自動テスト追加（30-60分）
- Phase 4: ドキュメント更新（1時間）
- 最終確認とコミット（30分）

---

## ⚠️ リスクと対策

### リスク1: 後方互換性の破壊
**影響度**: 高  
**対策**:
- サブコマンドなしでも動作するようにする
- 既存のコマンド例を全てテストする
- README.mdに移行ガイドを記載

### リスク2: オプションの優先順位の混乱
**影響度**: 中  
**対策**:
- 優先順位を明確に文書化（サブコマンドデフォルト < コマンドラインオプション）
- テストケースで確認
- ヘルプにも記載

### リスク3: スクリプトファイルとサブコマンドの誤認識
**影響度**: 中  
**対策**:
- `.ws`拡張子で判定
- サブコマンドリストに明示的に登録されているもののみ認識
- エラーメッセージを分かりやすく

### リスク4: テストカバレッジの低下
**影響度**: 中  
**対策**:
- 自動テストを追加
- 手動テストを網羅的に実施
- CI/CDでの回帰テスト

---

## 📦 必要な追加リソース

### 1. サンプルスクリプト
- `examples/adventure.ws`: テキストアドベンチャーゲーム（textサブコマンド用）
- `examples/data_processor.ws`: データ処理スクリプト（execサブコマンド用）

**作成時間**: 1-2時間（見積もり外）

### 2. 依存関係
なし（既存の依存関係のみで実装可能）

---

## ✅ 完了条件

1. ✅ 8つのサブコマンドが全て動作する
2. ✅ サブコマンドなしの従来の方法も動作する（後方互換性）
3. ✅ オプションの優先順位が正しく動作する
4. ✅ ヘルプシステムが各サブコマンドで機能する
5. ✅ 全ての既存テストがパスする
6. ✅ 新しい自動テストがパスする
7. ✅ 手動テストケースが全て成功する
8. ✅ ESLint警告が増加していない
9. ✅ README.mdとSUBCOMMAND_DESIGN.mdが更新されている
10. ✅ コミットメッセージが適切

---

## 🚀 次のステップ

1. **このブランチをマージ**: feature/no-grid-option → main
2. **新しいブランチを作成**: feature/subcommands
3. **Phase 1から実装開始**: 型定義とプリセット定義

---

## 📝 メモ

- `--no-grid`オプション実装の経験から、実装時間は予定の1/4程度で済む可能性あり
- サブコマンドのプリセット値は、実際に使ってみてから調整が必要かもしれない
- `text`サブコマンド用のサンプルスクリプトは後から追加でもOK（既存スクリプトで代用可能）
- TDD方式で進めれば、品質を保ちながら効率的に実装可能
